import { errorBodySchema } from "@repo/shared";
import type { z } from "zod";
import { ApiError } from "./errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchJsonOptions {
  init?: RequestInit;
  fetch?: FetchLike;
}

/**
 * GETs `url` and validates the body against `schema` (AGENTS.md §1: responses
 * read by the web app are validated). Returns null on 404, so callers can
 * render the not-found page; throws ApiError for anything else that is not 2xx
 * and when the API cannot be reached.
 */
export async function fetchJson<Schema extends z.ZodType>(
  url: string,
  schema: Schema,
  { init, fetch: fetchImpl = fetch }: FetchJsonOptions = {},
): Promise<z.output<Schema> | null> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new ApiError(`Could not reach the API for ${url}`, null, null, {
      cause: error,
    });
  }

  if (response.status === 404) return null;

  const raw: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const envelope = errorBodySchema.safeParse(raw);
    throw new ApiError(
      `The API answered ${response.status} for ${url}`,
      response.status,
      envelope.success ? envelope.data.error.code : null,
    );
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      `The API response for ${url} does not match its contract: ${parsed.error.message}`,
      response.status,
    );
  }
  return parsed.data;
}
