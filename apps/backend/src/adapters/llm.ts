import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaTextBlockParam,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  createScriptedLlm,
  demoPaperAnswers,
  LlmError,
  type LlmClient,
  type LlmRequest,
  type LlmUsage,
} from "@repo/pipeline";
import type { Logger } from "@repo/shared/logger";
import { z } from "zod";
import type { LlmConfig } from "../env";

/**
 * The pipeline's model (docs/specs/09-paper-pipeline.md §14), over the
 * official SDK. The only file that imports it.
 *
 * - The PDF is uploaded once through the Files API and referenced by id.
 * - The system prompt, the PDF and the run-stable context come first, each
 *   marked cacheable for an hour; the varying prompt comes last.
 * - Answers are constrained to a JSON schema and validated again with zod.
 * - Every call streams and takes the final message, so long answers never
 *   hit a request timeout.
 * - Adaptive thinking stays on; effort is set per call.
 * - A policy decline is retried server-side on the default fallback model.
 */

/** Beta that enables `fallbacks` (server-side retry after a policy decline). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const CACHE_1H = { type: "ephemeral", ttl: "1h" } as const;
/** A write call can stream for many minutes; the SDK's own default is ten. */
const REQUEST_TIMEOUT_MS = 20 * 60 * 1000;

/** JSON Schema keywords structured outputs do not accept; zod checks them on receipt instead. */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "pattern",
  "default",
]);
const SUPPORTED_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function strictNode(node: JsonValue): JsonValue {
  if (Array.isArray(node)) return node.map(strictNode);
  if (node === null || typeof node !== "object") return node;
  const out: { [key: string]: JsonValue } = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "format" && typeof value === "string" && !SUPPORTED_FORMATS.has(value))
      continue;
    // `properties` maps names to schemas: keep every name, whatever it is.
    out[key] =
      key === "properties" &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).map(([name, schema]) => [name, strictNode(schema)]),
          )
        : strictNode(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

/**
 * A zod schema as the JSON schema structured outputs accept: every object
 * closed and fully required, unsupported constraints left to zod.
 */
export function toStrictJsonSchema(schema: z.ZodType): { [key: string]: JsonValue } {
  const json = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  }) as JsonValue;
  const strict = strictNode(json);
  if (strict === null || typeof strict !== "object" || Array.isArray(strict)) {
    throw new Error("a structured-output schema must be an object");
  }
  return strict;
}

/** The request body for one call. Exported for tests. */
export function buildMessageParams(
  model: string,
  request: LlmRequest<z.ZodType>,
): MessageCreateParamsNonStreaming {
  const content: BetaContentBlockParam[] = [];
  const lastCached = request.context.length - 1;
  if (request.document) {
    content.push({
      type: "document",
      source: { type: "file", file_id: request.document.fileId },
      cache_control: CACHE_1H,
    });
  }
  request.context.forEach((text, index) => {
    const block: BetaTextBlockParam = { type: "text", text };
    content.push(index === lastCached ? { ...block, cache_control: CACHE_1H } : block);
  });
  content.push({ type: "text", text: request.prompt });

  return {
    model,
    max_tokens: request.maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: request.effort,
      format: { type: "json_schema", schema: toStrictJsonSchema(request.schema) },
    },
    system: [{ type: "text", text: request.system, cache_control: CACHE_1H }],
    messages: [{ role: "user", content }],
  };
}

export function usageOf(message: Pick<BetaMessage, "usage">): LlmUsage {
  return {
    calls: 1,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * The validated answer of a finished message. Stop reasons are checked before
 * any content is read (§14).
 */
export function readAnswer<Schema extends z.ZodType>(
  message: Pick<BetaMessage, "stop_reason" | "stop_details" | "content" | "usage">,
  request: Pick<LlmRequest<Schema>, "schema" | "schemaName">,
): z.output<Schema> {
  const usage = usageOf(message);
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unspecified";
    throw new LlmError("refusal", `the model declined (category: ${category})`, {
      usage,
    });
  }
  if (message.stop_reason === "max_tokens") {
    throw new LlmError("max_tokens", "the answer was cut off at the output limit", {
      usage,
    });
  }
  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new LlmError(
      "invalid_output",
      `the answer is not JSON for ${request.schemaName}`,
      {
        usage,
        cause: error,
      },
    );
  }
  const parsed = request.schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new LlmError(
      "invalid_output",
      `the answer does not match ${request.schemaName}: ${issues}`,
      {
        usage,
      },
    );
  }
  return parsed.data;
}

/** The SDK's typed errors, as the pipeline's error kinds (retryable or not). */
export function translateError(error: unknown): unknown {
  if (error instanceof LlmError) return error;
  if (error instanceof Anthropic.APIUserAbortError) {
    return new LlmError("connection", "the call was aborted", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmError("connection", "could not reach the model", { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmError("rate_limited", "rate limited by the model provider", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new LlmError(
      "overloaded",
      `the model provider is unavailable (${error.status})`,
      {
        cause: error,
      },
    );
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new LlmError("authentication", "the model provider rejected the API key", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmError(
      "bad_request",
      `the model provider rejected the request (${error.status}): ${error.message}`,
      {
        cause: error,
      },
    );
  }
  return error;
}

export function createAnthropicLlm(
  config: { apiKey: string; model: string },
  logger: Logger,
  options: { fetch?: typeof fetch } = {},
): LlmClient {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return {
    model: config.model,

    async uploadPdf({ bytes, filename }) {
      try {
        const file = await client.files.upload({
          file: await toFile(bytes, filename, { type: "application/pdf" }),
        });
        return { fileId: file.id };
      } catch (error) {
        throw translateError(error);
      }
    },

    async deleteFile(fileId) {
      try {
        await client.files.delete(fileId);
      } catch (error) {
        if (error instanceof Anthropic.NotFoundError) return;
        throw translateError(error);
      }
    },

    async generate(request) {
      const started = performance.now();
      try {
        const stream = client.beta.messages.stream(
          buildMessageParams(config.model, request),
          {
            signal: request.signal,
          },
        );
        const message = await stream.finalMessage();
        const usage = usageOf(message);
        logger.debug("model call finished", {
          purpose: request.purpose,
          subject: request.subject,
          stopReason: message.stop_reason,
          servedBy: message.model,
          durationMs: Math.round(performance.now() - started),
          ...usage,
        });
        return { value: readAnswer(message, request), usage };
      } catch (error) {
        const translated = translateError(error);
        logger.warn("model call failed", {
          purpose: request.purpose,
          subject: request.subject,
          kind: translated instanceof LlmError ? translated.kind : "unknown",
          durationMs: Math.round(performance.now() - started),
        });
        throw translated;
      }
    },
  };
}

/** The configured model: Anthropic, or the fake that writes the demo paper (development). */
export function createLlmClient(config: LlmConfig, logger: Logger): LlmClient {
  if (config.driver === "fake") {
    return createScriptedLlm({
      model: config.model,
      answers: demoPaperAnswers(),
      latencyMs: 200,
    });
  }
  return createAnthropicLlm(config, logger);
}
