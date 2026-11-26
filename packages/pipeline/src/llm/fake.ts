import type { z } from "zod";
import {
  LlmError,
  type LlmClient,
  type LlmPurpose,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from "./types";

/** Answers one call; may throw an `LlmError` to simulate a failure. */
export type ScriptedAnswer = (request: LlmRequest<z.ZodType>, call: number) => unknown;

export interface ScriptedLlmOptions {
  model?: string;
  answers: Partial<Record<LlmPurpose, ScriptedAnswer>>;
  /** Milliseconds each call takes, to make interleavings observable. @default 0 */
  latencyMs?: number;
}

export interface RecordedCall {
  purpose: LlmPurpose;
  subject: string | null;
  prompt: string;
  hasDocument: boolean;
  context: number;
}

export interface ScriptedLlm extends LlmClient {
  readonly calls: RecordedCall[];
  readonly uploads: string[];
  readonly deleted: string[];
}

/** A rough token count for fake accounting: four characters per token. */
const tokens = (text: string) => Math.ceil(text.length / 4);

/**
 * The fake model of docs/specs/02-monorepo.md §4: canned structured answers by
 * purpose, validated with the request's schema exactly as the real client
 * validates the model's output. Usage is estimated, and later calls of a run
 * report their shared prefix as cache reads, as the real API would.
 */
export function createScriptedLlm(options: ScriptedLlmOptions): ScriptedLlm {
  const calls: RecordedCall[] = [];
  const uploads: string[] = [];
  const deleted: string[] = [];
  const counts = new Map<LlmPurpose, number>();
  const warmed = new Set<string>();

  return {
    model: options.model ?? "fake-model",
    calls,
    uploads,
    deleted,

    async uploadPdf({ bytes }) {
      const fileId = `file_fake_${new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 16)}`;
      uploads.push(fileId);
      return { fileId };
    },

    async deleteFile(fileId) {
      deleted.push(fileId);
    },

    async generate<Schema extends z.ZodType>(
      request: LlmRequest<Schema>,
    ): Promise<LlmResult<z.output<Schema>>> {
      const answer = options.answers[request.purpose];
      if (!answer)
        throw new LlmError(
          "bad_request",
          `the fake has no answer for ${request.purpose}`,
        );
      if (options.latencyMs) await Bun.sleep(options.latencyMs);
      request.signal?.throwIfAborted();

      const call = (counts.get(request.purpose) ?? 0) + 1;
      counts.set(request.purpose, call);
      calls.push({
        purpose: request.purpose,
        subject: request.subject,
        prompt: request.prompt,
        hasDocument: request.document !== null,
        context: request.context.length,
      });

      const raw = await answer(request, call);
      const parsed = request.schema.safeParse(raw);
      const documentId =
        request.document === null
          ? ""
          : "fileId" in request.document
            ? request.document.fileId
            : new Bun.CryptoHasher("sha256").update(request.document.pdf).digest("hex");
      const prefix = `${request.system}${documentId}${request.context.join("")}`;
      const prefixTokens = tokens(prefix) + (request.document ? 2000 : 0);
      const cached = warmed.has(prefix);
      warmed.add(prefix);
      const usage: LlmUsage = {
        calls: 1,
        inputTokens: tokens(request.prompt) + (cached ? 0 : prefixTokens),
        outputTokens: tokens(JSON.stringify(raw) ?? ""),
        cacheReadTokens: cached ? prefixTokens : 0,
        cacheWriteTokens: cached ? 0 : prefixTokens,
      };
      if (!parsed.success) {
        throw new LlmError(
          "invalid_output",
          `answer does not match ${request.schemaName}`,
          { usage },
        );
      }
      return { value: parsed.data, usage };
    },
  };
}
