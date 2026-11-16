import { z } from "zod";
import { slugSchema } from "../content";
import { INGESTION_STATUSES, PIPELINE_STAGES } from "../pipeline";

/**
 * Request and response bodies of the CMS endpoints under /v1/admin
 * (docs/specs/14-cms.md §7–§9).
 */

const isoTimestamp = z.iso.datetime({ offset: true });
const count = z.number().int().min(0);

// ── Dashboard (§8.1) ─────────────────────────────────────────────────────────────

export const DASHBOARD_DAYS = { min: 1, max: 90, default: 30 } as const;

export const dashboardQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(DASHBOARD_DAYS.min)
    .max(DASHBOARD_DAYS.max)
    .default(DASHBOARD_DAYS.default),
});

export const dashboardSchema = z.object({
  generatedAt: isoTimestamp,
  days: z.number().int(),
  pipeline: z.object({
    enabled: z.boolean(),
    model: z.string().nullable(),
    promptVersion: z.string(),
  }),
  byStatus: z.record(z.enum(INGESTION_STATUSES), count),
  inFlight: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().nullable(),
      status: z.enum(INGESTION_STATUSES),
      updatedAt: isoTimestamp,
    }),
  ),
  recentFailures: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().nullable(),
      error: z.string().nullable(),
      failedStage: z.enum(PIPELINE_STAGES).nullable(),
      updatedAt: isoTimestamp,
    }),
  ),
  daily: z.array(
    z.object({
      date: z.string(),
      ingestions: count,
      calls: count,
      inputTokens: count,
      outputTokens: count,
      cacheReadTokens: count,
      sandboxRuns: count,
    }),
  ),
  topPapers: z.array(
    z.object({
      id: z.uuid(),
      title: z.string().nullable(),
      outputTokens: count,
      inputTokens: count,
      sandboxRuns: count,
      steps: count,
    }),
  ),
  limits: z.object({
    ingestionsToday: z.object({ used: count, max: count }),
    concurrent: z.object({ used: count, max: count }),
    outputTokenBudget: count,
  }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

// ── Tracks (§7) ──────────────────────────────────────────────────────────────────

export const TRACK_LIMITS = {
  maxTracks: 50,
  maxPapersPerTrack: 30,
  titleMax: 120,
  summaryMax: 300,
} as const;

export const trackOriginSchema = z.enum(["library", "cms"]);
export type TrackOrigin = z.infer<typeof trackOriginSchema>;

/** One track as a maintainer edits it. */
export const trackInputSchema = z.strictObject({
  id: slugSchema,
  title: z.string().trim().min(1).max(TRACK_LIMITS.titleMax),
  summary: z.string().trim().min(1).max(TRACK_LIMITS.summaryMax),
  paperIds: z
    .array(slugSchema)
    .min(1)
    .max(TRACK_LIMITS.maxPapersPerTrack)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "list each paper once",
    }),
});
export type TrackInput = z.infer<typeof trackInputSchema>;

export const adminTrackSchema = trackInputSchema.extend({ origin: trackOriginSchema });
export type AdminTrack = z.infer<typeof adminTrackSchema>;

export const adminTracksSchema = z.object({
  revision: count,
  tracks: z.array(adminTrackSchema),
});
export type AdminTracks = z.infer<typeof adminTracksSchema>;

export const putTracksSchema = z.strictObject({
  /** The revision this edit started from; a different current one is a conflict. */
  revision: count,
  tracks: z
    .array(trackInputSchema)
    .max(TRACK_LIMITS.maxTracks)
    .refine((tracks) => new Set(tracks.map((track) => track.id)).size === tracks.length, {
      message: "track ids must be unique",
    }),
});
export type PutTracks = z.infer<typeof putTracksSchema>;

// ── Eval (§8.3) ──────────────────────────────────────────────────────────────────

const rate = z.number().nullable();

export const evalMeasuresSchema = z.object({
  steps: count,
  firstAttemptVerificationRate: rate,
  needsAttentionRate: rate,
  mutationKillRate: rate,
  independentSolveRate: rate,
  reviewerEdits: count,
  outputTokensPerStep: rate,
  inputTokensPerStep: rate,
  calls: count,
  sandboxRuns: count,
});
export type EvalMeasures = z.infer<typeof evalMeasuresSchema>;

export const evalPaperSchema = z.object({
  name: z.string(),
  source: z.string(),
  ingestionId: z.uuid().nullable(),
  status: z.enum(INGESTION_STATUSES).nullable(),
  /** The ingestion still has work to do, so its measures are not final. */
  running: z.boolean(),
  /** Why this paper could not be started, when it could not. */
  error: z.string().nullable(),
  measures: evalMeasuresSchema.nullable(),
});

export const evalSummarySchema = z.object({
  papers: count,
  steps: count,
  firstAttemptVerificationRate: rate,
  needsAttentionRate: rate,
  mutationKillRate: rate,
  independentSolveRate: rate,
  reviewerEdits: count,
  outputTokensPerStep: rate,
  inputTokensPerStep: rate,
});

export const evalRunSchema = z.object({
  id: z.uuid(),
  startedAt: isoTimestamp,
  startedBy: z.string().nullable(),
  fresh: z.boolean(),
  model: z.string(),
  promptVersion: z.string(),
  /** Every paper's ingestion has stopped, or could not start. */
  finished: z.boolean(),
  papers: z.array(evalPaperSchema),
  summary: evalSummarySchema.nullable(),
});
export type EvalRun = z.infer<typeof evalRunSchema>;

export const latestEvalSchema = z.object({ run: evalRunSchema.nullable() });
export type LatestEval = z.infer<typeof latestEvalSchema>;

export const startEvalSchema = z.strictObject({
  /** Cancel and redo a reference paper's unpublished ingestion instead of measuring it as it stands. */
  fresh: z.boolean().default(false),
  /** The admin has seen that this spends real model credit. */
  confirmCost: z.literal(true, { error: "confirm that this spends model credit" }),
});
export type StartEval = z.input<typeof startEvalSchema>;
