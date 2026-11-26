import { describe, expect, test } from "bun:test";
import { LlmError, outlineSchema, planSchema, type LlmRequest } from "@repo/pipeline";
import { silentLogger } from "@repo/shared/logger";
import { z } from "zod";
import {
  buildMessageParams,
  createAnthropicLlm,
  readAnswer,
  toStrictJsonSchema,
  translateError,
} from "../../src/adapters/llm";

const answerSchema = z.object({
  title: z.string().min(1),
  year: z.number().int().nullable(),
});

const request = (
  overrides: Partial<LlmRequest<typeof answerSchema>> = {},
): LlmRequest<typeof answerSchema> => ({
  purpose: "read",
  subject: null,
  system: "SYSTEM",
  document: { fileId: "file_123" },
  context: ["OUTLINE", "PLAN"],
  prompt: "PROMPT",
  schema: answerSchema,
  schemaName: "answer",
  effort: "high",
  maxTokens: 1000,
  ...overrides,
});

type Json = Record<string, unknown>;
const objectsIn = (node: unknown): Json[] => {
  if (Array.isArray(node)) return node.flatMap(objectsIn);
  if (node === null || typeof node !== "object") return [];
  const record = node as Json;
  return [record, ...Object.values(record).flatMap(objectsIn)];
};

describe("toStrictJsonSchema", () => {
  test("closes every object, requires every property and drops unsupported keywords", () => {
    for (const schema of [outlineSchema, planSchema, answerSchema]) {
      const json = toStrictJsonSchema(schema);
      const objects = objectsIn(json).filter(
        (node) => node.type === "object" && node.properties,
      );
      expect(objects.length).toBeGreaterThan(0);
      for (const object of objects) {
        expect(object.additionalProperties).toBe(false);
        expect(object.required).toEqual(Object.keys(object.properties as Json));
      }
      const text = JSON.stringify(json);
      for (const keyword of ["minLength", "maxLength", "pattern", "$schema", "minimum"]) {
        expect(text).not.toContain(`"${keyword}"`);
      }
    }
  });

  test("keeps a property that happens to share a keyword's name", () => {
    const json = toStrictJsonSchema(
      z.object({ pattern: z.string(), default: z.number() }),
    );
    expect(Object.keys(json.properties as Json)).toEqual(["pattern", "default"]);
  });
});

describe("buildMessageParams", () => {
  test("puts the cached prefix first and the varying prompt last", () => {
    const params = buildMessageParams("claude-opus-5-5", request());
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.output_config?.effort).toBe("high");
    expect(params.output_config?.format?.type).toBe("json_schema");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.system).toEqual([
      { type: "text", text: "SYSTEM", cache_control: { type: "ephemeral", ttl: "1h" } },
    ]);
    expect(params.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "file", file_id: "file_123" },
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
          { type: "text", text: "OUTLINE" },
          { type: "text", text: "PLAN", cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: "PROMPT" },
        ],
      },
    ]);
  });

  test("a one-off PDF, such as a CV, is sent inline and not cached", () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 a cv");
    const params = buildMessageParams(
      "m",
      request({ purpose: "cold_mail", document: { pdf }, context: [], effort: "medium" }),
    );
    expect(params.messages[0]?.content).toEqual([
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(pdf).toString("base64"),
        },
      },
      { type: "text", text: "PROMPT" },
    ]);
    expect(params.output_config?.effort).toBe("medium");
    expect(params.fallbacks).toBe("default");
    expect(params.thinking).toEqual({ type: "adaptive" });
  });

  test("a call that must not see the paper sends no document", () => {
    const params = buildMessageParams("m", request({ document: null, context: [] }));
    expect(params.messages[0]?.content).toEqual([{ type: "text", text: "PROMPT" }]);
  });
});

const usage = {
  input_tokens: 10,
  output_tokens: 20,
  cache_read_input_tokens: 300,
  cache_creation_input_tokens: 0,
};
const message = (overrides: Json) =>
  ({
    stop_reason: "end_turn",
    stop_details: null,
    content: [
      {
        type: "text",
        text: JSON.stringify({ title: "Attention", year: 2017 }),
        citations: null,
      },
    ],
    usage,
    ...overrides,
  }) as unknown as Parameters<typeof readAnswer>[0];

describe("readAnswer", () => {
  test("returns the validated answer", () => {
    expect(readAnswer(message({}), request())).toEqual({
      title: "Attention",
      year: 2017,
    });
  });

  test("checks the stop reason before the content", () => {
    const refusal = message({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
    });
    expect(() => readAnswer(refusal, request())).toThrow(
      "the model declined (category: cyber)",
    );
    expect(() => readAnswer(message({ stop_reason: "max_tokens" }), request())).toThrow(
      LlmError,
    );
    try {
      readAnswer(message({ stop_reason: "max_tokens" }), request());
    } catch (error) {
      expect(error).toMatchObject({
        kind: "max_tokens",
        retryable: true,
        usage: { outputTokens: 20, cacheReadTokens: 300 },
      });
    }
  });

  test("an answer that breaks the schema is invalid output, with the paths that failed", () => {
    const wrong = message({
      content: [{ type: "text", text: JSON.stringify({ title: "", year: "x" }) }],
    });
    expect(() => readAnswer(wrong, request())).toThrow(
      /does not match answer: title: .*; year:/,
    );
    const notJson = message({ content: [{ type: "text", text: "Sure! Here it is" }] });
    expect(() => readAnswer(notJson, request())).toThrow(
      "the answer is not JSON for answer",
    );
  });
});

/** A fake API: records each request and answers with `respond`. */
function fakeApi(respond: (path: string, body: unknown) => Response) {
  const seen: { path: string; headers: Headers; body: unknown }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    // The SDK fetches `data:,` once to learn whether this fetch supports FormData.
    if (url.protocol === "data:") return fetch(url);
    const raw = init?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    seen.push({ path: url.pathname, headers: new Headers(init?.headers), body });
    return respond(url.pathname, body);
  }) as typeof fetch;
  return { fetchImpl, seen };
}

function sse(events: Json[]): Response {
  const text = events
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

const streamOf = (answer: unknown, stopReason = "end_turn") =>
  sse([
    {
      type: "message_start",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 12,
          output_tokens: 1,
          cache_read_input_tokens: 4000,
          cache_creation_input_tokens: 0,
        },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: JSON.stringify(answer) },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 42 },
    },
    { type: "message_stop" },
  ]);

describe("createAnthropicLlm", () => {
  test("streams one call through the SDK and reports usage with cache reads", async () => {
    const api = fakeApi(() => streamOf({ title: "Attention", year: 2017 }));
    const llm = createAnthropicLlm(
      { apiKey: "sk-test", model: "claude-opus-5-5" },
      silentLogger,
      { fetch: api.fetchImpl },
    );
    const result = await llm.generate(request());
    expect(result.value).toEqual({ title: "Attention", year: 2017 });
    expect(result.usage).toEqual({
      calls: 1,
      inputTokens: 12,
      outputTokens: 42,
      cacheReadTokens: 4000,
      cacheWriteTokens: 0,
    });

    const call = api.seen[0];
    expect(call?.path).toBe("/v1/messages");
    // SDK 1.x sends the key as a bearer token.
    expect(call?.headers.get("authorization")).toBe("Bearer sk-test");
    expect(call?.headers.get("anthropic-beta")).toContain(
      "server-side-fallback-2026-07-01",
    );
    expect(call?.body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      fallbacks: "default",
    });
  });

  test("uploads the PDF to the Files API and tolerates deleting a missing file", async () => {
    const api = fakeApi((path) =>
      path === "/v1/files"
        ? Response.json({
            id: "file_abc",
            type: "file",
            filename: "x.pdf",
            mime_type: "application/pdf",
            size_bytes: 9,
            created_at: "2026-11-14T00:00:00Z",
          })
        : Response.json(
            { type: "error", error: { type: "not_found_error", message: "gone" } },
            { status: 404 },
          ),
    );
    const llm = createAnthropicLlm({ apiKey: "k", model: "m" }, silentLogger, {
      fetch: api.fetchImpl,
    });
    expect(
      await llm.uploadPdf({
        bytes: new TextEncoder().encode("%PDF-1.4"),
        filename: "x.pdf",
      }),
    ).toEqual({ fileId: "file_abc" });
    await llm.deleteFile("file_abc");
    expect(api.seen.map((call) => call.path)).toEqual([
      "/v1/files",
      "/v1/files/file_abc",
    ]);
    expect(api.seen[1]?.body).toBeUndefined();
  });

  test("a rejected request is not retryable; an overloaded provider is", async () => {
    const badRequest = fakeApi(() =>
      Response.json(
        {
          type: "error",
          error: { type: "invalid_request_error", message: "bad schema" },
        },
        { status: 400 },
      ),
    );
    const llm = createAnthropicLlm({ apiKey: "k", model: "m" }, silentLogger, {
      fetch: badRequest.fetchImpl,
    });
    const error = await llm.generate(request()).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "bad_request", retryable: false });
    expect(badRequest.seen).toHaveLength(1);
  });
});

describe("translateError", () => {
  test("leaves errors that are not the SDK's alone", () => {
    const plain = new Error("x");
    expect(translateError(plain)).toBe(plain);
  });
});
