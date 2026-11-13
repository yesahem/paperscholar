import type { ErrorBody } from "@repo/shared";
import { ERROR_CODES, ERROR_MESSAGES } from "@repo/shared/errors";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { ApiError, retryAfterSeconds } from "./errors";

/** Mirrors `errorBodySchema` in @repo/shared; the annotation keeps them in step. */
const errorBodySchema: z.ZodMiniType<ErrorBody> = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.optional(z.unknown()),
    requestId: z.string(),
  }),
});

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  fetch?: FetchLike;
}

/**
 * Calls the API from the browser, through the same-origin /api proxy, with
 * the session cookie. The response is validated against `schema`; pass null
 * for an endpoint that answers `204 No Content`. Any non-2xx answer throws an
 * ApiError whose message is safe to show (docs/specs/05-api.md §3).
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodMiniType<T>,
  options?: ApiRequestOptions,
): Promise<T>;
export async function apiRequest(
  path: string,
  schema: null,
  options?: ApiRequestOptions,
): Promise<void>;
export async function apiRequest<T>(
  path: string,
  schema: z.ZodMiniType<T> | null,
  { method = "GET", body, signal, fetch: fetchImpl = fetch }: ApiRequestOptions = {},
): Promise<T | void> {
  let response: Response;
  try {
    response = await fetchImpl(`/api${path}`, {
      method,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError("Could not reach the server. Check your connection.", null, null, {
      cause: error,
    });
  }

  if (!response.ok) {
    const envelope = errorBodySchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      envelope.success ? envelope.data.error.message : ERROR_MESSAGES.internal_error,
      response.status,
      envelope.success ? envelope.data.error.code : null,
      {
        retryAfterSeconds: retryAfterSeconds(response),
        details: envelope.success ? envelope.data.error.details : undefined,
      },
    );
  }

  if (schema === null) return;
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError(ERROR_MESSAGES.internal_error, response.status, null, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}
