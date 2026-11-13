import "server-only";

import {
  paperDetailSchema,
  paperListSchema,
  problemDetailSchema,
  trackListSchema,
  type PaperDetail,
  type PaperSummary,
  type ProblemDetail,
  type Track,
} from "@repo/shared";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { z } from "zod";
import { loadWebEnv } from "@/lib/env";
import { ApiError } from "./errors";
import { fetchJson } from "./fetch-json";

/**
 * How long a rendered content page and its API responses are reused before
 * being refreshed in the background. Part of the freshness budget in
 * docs/specs/05-api.md §4: a change to content shows within a minute.
 */
export const CONTENT_REVALIDATE_SECONDS = 30;

/**
 * Public content from the API, fetched by Server Components without cookies
 * (docs/specs/08-web.md §1), so every content page is cacheable for everyone.
 */
async function getContent<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema> | null> {
  const { API_ORIGIN } = loadWebEnv();
  return fetchJson(`${API_ORIGIN}/api/v1${path}`, schema, {
    init: { next: { revalidate: CONTENT_REVALIDATE_SECONDS } },
  });
}

export async function getPapers(): Promise<PaperSummary[]> {
  return (await getContent("/papers", paperListSchema))?.items ?? [];
}

/** Null when the paper does not exist or is not published. */
export function getPaper(paperId: string): Promise<PaperDetail | null> {
  return getContent(`/papers/${encodeURIComponent(paperId)}`, paperDetailSchema);
}

/** Null when the paper or problem does not exist or is not published. */
export function getProblem(
  paperId: string,
  problemId: string,
): Promise<ProblemDetail | null> {
  return getContent(
    `/papers/${encodeURIComponent(paperId)}/problems/${encodeURIComponent(problemId)}`,
    problemDetailSchema,
  );
}

export async function getTracks(): Promise<Track[]> {
  return (await getContent("/tracks", trackListSchema))?.items ?? [];
}

/** Returned by `loadAtBuild` when the API could not be reached during `next build`. */
export const UNAVAILABLE_AT_BUILD = Symbol("unavailable-at-build");

/**
 * For pages prerendered at build time (the catalogue, the roadmap). The build
 * must not depend on the API (docs/specs/08-web.md §1): when it cannot be
 * reached during `next build`, the page renders an "unavailable" state that
 * the first revalidation after deployment replaces. At run time errors are
 * thrown, so a failed refresh keeps serving the last good page.
 */
export async function loadAtBuild<T>(
  load: () => Promise<T>,
): Promise<T | typeof UNAVAILABLE_AT_BUILD> {
  try {
    return await load();
  } catch (error) {
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD && error instanceof ApiError) {
      console.warn(`Prerendering without content: ${error.message}`);
      return UNAVAILABLE_AT_BUILD;
    }
    throw error;
  }
}
