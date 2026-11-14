import { and, eq, lt, schema, type Database } from "@repo/db";
import type { Logger } from "@repo/shared/logger";
import type { Submissions } from "./submissions";

const DAY_MS = 86_400_000;
/** Retention (docs/specs/04-database.md §8). */
export const RUN_SUBMISSION_RETENTION_DAYS = 30;
export const RATE_LIMIT_RETENTION_DAYS = 1;

export interface CleanupReport {
  reapedSubmissions: number;
  deletedRunSubmissions: number;
  deletedRateLimitCounters: number;
  deletedSessions: number;
  deletedVerifications: number;
}

/**
 * The daily job (docs/specs/05-api.md §10): reaps submissions whose worker
 * died and deletes what retention says to. Safe to run at any time, and twice.
 */
export async function runCleanup({
  db,
  submissions,
  logger,
  now = new Date(),
}: {
  db: Database;
  submissions: Submissions;
  logger: Logger;
  now?: Date;
}): Promise<CleanupReport> {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);

  const reapedSubmissions = await submissions.reap(null);
  const runs = await db
    .delete(schema.submissions)
    .where(
      and(
        eq(schema.submissions.mode, "run"),
        lt(schema.submissions.createdAt, before(RUN_SUBMISSION_RETENTION_DAYS)),
      ),
    )
    .returning({ id: schema.submissions.id });
  const counters = await db
    .delete(schema.rateLimitCounters)
    .where(lt(schema.rateLimitCounters.windowStart, before(RATE_LIMIT_RETENTION_DAYS)))
    .returning({ key: schema.rateLimitCounters.key });
  const sessions = await db
    .delete(schema.session)
    .where(lt(schema.session.expiresAt, now))
    .returning({ id: schema.session.id });
  const verifications = await db
    .delete(schema.verification)
    .where(lt(schema.verification.expiresAt, now))
    .returning({ id: schema.verification.id });

  const report: CleanupReport = {
    reapedSubmissions,
    deletedRunSubmissions: runs.length,
    deletedRateLimitCounters: counters.length,
    deletedSessions: sessions.length,
    deletedVerifications: verifications.length,
  };
  logger.info("cleanup finished", { ...report });
  return report;
}
