import type { ContentStore } from "@repo/content";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  schema,
  sql,
  type Database,
  type StoredSubmissionResult,
} from "@repo/db";
import {
  buildRunRequest,
  toVerdict,
  type RunnableProblem,
  type SandboxProvider,
} from "@repo/runner";
import {
  IN_FLIGHT_STATUSES,
  STALE_SUBMISSION_SECONDS,
  type CreateSubmission,
  type ListSubmissionsQuery,
  type Submission,
  type SubmissionList,
  type SubmissionSummary,
} from "@repo/shared";
import type { Logger } from "@repo/shared/logger";
import type { LimitsConfig } from "../env";
import { AppError } from "../lib/errors";
import { isUniqueViolation } from "./accounts";
import type { RateLimiter } from "./rate-limiter";

/** The API gives up on a run after this, past the harness's 60 s and the provider's 75 s. */
export const RUN_ABORT_MS = 90_000;
const DAY_SECONDS = 86_400;
const GLOBAL_COUNTER_KEY = "submissions:global";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SubmissionRow = typeof schema.submissions.$inferSelect;

export interface SubmissionsDependencies {
  db: Database;
  content: ContentStore;
  provider: SandboxProvider;
  limiter: RateLimiter;
  limits: LimitsConfig;
  logger: Logger;
  /** Starts `execute(id)` without delaying the response (docs/specs/07-runner.md §3). */
  dispatch: (submissionId: string) => void;
  now?: () => Date;
}

export interface Submissions {
  /** Checks the problem and the limits, records the submission and dispatches it. */
  create(userId: string, input: CreateSubmission): Promise<{ id: string }>;
  /** Runs a queued submission. Idempotent: a second call for the same id does nothing. */
  execute(submissionId: string): Promise<void>;
  /** The caller's own submission; anyone else's is `not_found`. */
  get(userId: string, submissionId: string): Promise<Submission>;
  list(userId: string, query: ListSubmissionsQuery): Promise<SubmissionList>;
  /** Marks stale in-flight submissions as `internal_error`; all users when `userId` is null. */
  reap(userId: string | null): Promise<number>;
}

/** Midnight UTC at the start of `now`'s day, and of the next. */
export function utcDay(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return { start, end: new Date(start.getTime() + DAY_SECONDS * 1000) };
}

/** Cursors are opaque to clients: the last item's creation time and id. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string" &&
      UUID.test(value[1]) &&
      !Number.isNaN(Date.parse(value[0]))
    ) {
      return { createdAt: new Date(value[0]), id: value[1] };
    }
  } catch {
    // Falls through to the validation error below.
  }
  throw new AppError("validation_error", {
    details: { issues: [{ path: "cursor", message: "is not a cursor from this API" }] },
  });
}

function toSummary(row: SubmissionRow): SubmissionSummary {
  return {
    id: row.id,
    paperId: row.paperId,
    problemId: row.problemId,
    mode: row.mode,
    status: row.status,
    verdict: row.verdict,
    testsPassed: row.testsPassed,
    testsTotal: row.testsTotal,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** The full submission. Hidden tests never carry a traceback or output, whatever was stored. */
export function toSubmission(row: SubmissionRow): Submission {
  const result = row.result;
  return {
    ...toSummary(row),
    tests:
      result?.tests.map((test) => ({
        name: test.name,
        group: test.group,
        status: test.status,
        durationMs: test.durationMs,
        message: test.message,
        traceback: test.group === "public" ? test.traceback : null,
        stdout: test.group === "public" ? test.stdout : null,
      })) ?? null,
    violations: result?.violations ?? null,
    errorOutput: result?.errorOutput ?? null,
    code: row.code,
  };
}

/** Lifecycle: docs/specs/07-runner.md §3. Limits: docs/specs/07-runner.md §9. */
export function createSubmissions({
  db,
  content,
  provider,
  limiter,
  limits,
  logger,
  dispatch,
  now = () => new Date(),
}: SubmissionsDependencies): Submissions {
  const table = schema.submissions;
  const inFlight = inArray(table.status, [...IN_FLIGHT_STATUSES]);
  const stale = () =>
    lt(table.createdAt, new Date(now().getTime() - STALE_SUBMISSION_SECONDS * 1000));

  async function reap(userId: string | null): Promise<number> {
    const reaped = await db
      .update(table)
      .set({ status: "error", verdict: "internal_error", finishedAt: now() })
      .where(
        and(inFlight, stale(), userId === null ? undefined : eq(table.userId, userId)),
      )
      .returning({ id: table.id });
    for (const { id } of reaped)
      logger.warn("submission reaped as stale", { submissionId: id });
    return reaped.length;
  }

  /** The live version of a published problem, or `not_found`. */
  async function publishedVersion(paperId: string, problemId: string): Promise<number> {
    const entry = await content.getEntry(paperId);
    const problem = entry?.problems.find((candidate) => candidate.id === problemId);
    if (!entry || entry.status !== "published" || problem?.status !== "published") {
      throw new AppError("not_found");
    }
    return entry.version;
  }

  async function runnable(row: SubmissionRow): Promise<RunnableProblem> {
    const version = Number(row.contentVersion);
    const [publicDoc, privateDoc] = await Promise.all([
      content.getPublicDoc(row.paperId, version),
      content.getPrivateDoc(row.paperId, version),
    ]);
    const problem = publicDoc.problems.find(
      (candidate) => candidate.id === row.problemId,
    );
    const hidden = privateDoc.problems.find(
      (candidate) => candidate.id === row.problemId,
    );
    if (!problem || !hidden) {
      throw new Error(
        `Problem ${row.paperId}/${row.problemId} is missing from version ${version}.`,
      );
    }
    return {
      entryPoint: problem.entryPoint,
      environment: problem.environment,
      allowedPackages: problem.allowedPackages,
      prohibitedImports: problem.prohibitedImports,
      timeLimitSeconds: problem.timeLimitSeconds,
      memoryLimitMb: problem.memoryLimitMb,
      testsPublic: hidden.testsPublic,
      testsHidden: hidden.testsHidden,
      helpers: hidden.helpers,
    };
  }

  async function inFlightId(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId), inFlight))
      .limit(1);
    return row?.id ?? null;
  }

  return {
    reap,

    async create(userId, { paperId, problemId, code, mode }) {
      const contentVersion = await publishedVersion(paperId, problemId);

      const perMinute = await limiter.consume(`submissions:user:${userId}`, {
        windowSeconds: 60,
        max: limits.runsPerMinute,
      });
      if (!perMinute.allowed) {
        const retryAfterSeconds = perMinute.retryAfterSeconds ?? 60;
        throw new AppError("rate_limited", {
          message: "You are running code too often. Wait a moment and try again.",
          details: { retryAfterSeconds },
          retryAfterSeconds,
        });
      }

      await reap(userId);
      const id = Bun.randomUUIDv7();
      const day = utcDay(now());
      try {
        await db.transaction(async (tx) => {
          // Runs that failed on our side do not count against the learner.
          const [today] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(table)
            .where(
              and(
                eq(table.userId, userId),
                gte(table.createdAt, day.start),
                or(isNull(table.verdict), ne(table.verdict, "internal_error")),
              ),
            );
          if ((today?.count ?? 0) >= limits.runsPerDay) {
            throw new AppError("quota_exceeded", {
              message: `You have used today's ${limits.runsPerDay} runs. They reset at midnight UTC.`,
              details: { resetsAt: day.end.toISOString() },
              retryAfterSeconds: (day.end.getTime() - now().getTime()) / 1000,
            });
          }

          await tx.insert(table).values({
            id,
            userId,
            paperId,
            problemId,
            mode,
            code,
            contentVersion: String(contentVersion),
            createdAt: now(),
          });

          // Counted in the same transaction, so a refused run is not counted.
          const counters = schema.rateLimitCounters;
          const [global] = await tx
            .insert(counters)
            .values({ key: GLOBAL_COUNTER_KEY, windowStart: day.start, count: 1 })
            .onConflictDoUpdate({
              target: [counters.key, counters.windowStart],
              set: { count: sql`${counters.count} + 1` },
            })
            .returning({ count: counters.count });
          if ((global?.count ?? 1) > limits.globalRunsPerDay) {
            logger.error("global submission ceiling reached", {
              ceiling: limits.globalRunsPerDay,
            });
            throw new AppError("upstream_unavailable", {
              message:
                "Running code is paused on this site for today. Try again tomorrow.",
            });
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const submissionId = await inFlightId(userId);
          throw new AppError("submission_in_progress", {
            details: { submissionId },
            cause: error,
          });
        }
        throw error;
      }

      logger.info("submission created", {
        submissionId: id,
        userId,
        paperId,
        problemId,
        mode,
      });
      dispatch(id);
      return { id };
    },

    async execute(submissionId) {
      const [row] = await db
        .update(table)
        .set({ status: "running", startedAt: now() })
        .where(and(eq(table.id, submissionId), eq(table.status, "queued")))
        .returning();
      // Someone else claimed it, or it was reaped.
      if (!row) return;

      const log = logger.child({ submissionId, provider: provider.name });
      try {
        const request = buildRunRequest(await runnable(row), {
          runId: row.id,
          code: row.code,
          mode: row.mode,
        });
        const result = await provider.run(request, AbortSignal.timeout(RUN_ABORT_MS));
        const verdict = toVerdict(result);
        const stored: StoredSubmissionResult = {
          tests: result.tests,
          violations: result.violations,
          errorOutput: result.errorOutput,
        };
        const finishedAt = now();
        await db
          .update(table)
          .set({
            status: verdict.status,
            verdict: verdict.verdict,
            testsPassed: verdict.testsPassed,
            testsTotal: verdict.testsTotal,
            result: stored,
            durationMs: Math.round(result.durationMs),
            finishedAt,
          })
          .where(and(eq(table.id, submissionId), eq(table.status, "running")));
        const fields = {
          verdict: verdict.verdict,
          outcome: result.outcome,
          sandboxMs: Math.round(result.durationMs),
          totalMs: finishedAt.getTime() - row.createdAt.getTime(),
        };
        if (verdict.status === "error")
          log.error("submission failed on our side", fields);
        else log.info("submission finished", fields);
      } catch (error) {
        await db
          .update(table)
          .set({ status: "error", verdict: "internal_error", finishedAt: now() })
          .where(and(eq(table.id, submissionId), eq(table.status, "running")));
        log.error("submission failed on our side", { verdict: "internal_error", error });
      }
    },

    async get(userId, submissionId) {
      const select = () =>
        db
          .select()
          .from(table)
          .where(and(eq(table.id, submissionId), eq(table.userId, userId)))
          .limit(1);
      let [row] = await select();
      if (!row) throw new AppError("not_found");
      if (row.status === "queued" || row.status === "running") {
        if ((await reap(userId)) > 0) [row] = await select();
      }
      if (!row) throw new AppError("not_found");
      return toSubmission(row);
    },

    async list(userId, { paperId, problemId, mode, limit, cursor }) {
      const after = cursor === undefined ? null : decodeCursor(cursor);
      const rows = await db
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, userId),
            paperId === undefined ? undefined : eq(table.paperId, paperId),
            problemId === undefined ? undefined : eq(table.problemId, problemId),
            mode === undefined ? undefined : eq(table.mode, mode),
            after === null
              ? undefined
              : or(
                  lt(table.createdAt, after.createdAt),
                  and(eq(table.createdAt, after.createdAt), lt(table.id, after.id)),
                ),
          ),
        )
        .orderBy(desc(table.createdAt), desc(table.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toSummary),
        nextCursor:
          rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
      };
    },
  };
}
