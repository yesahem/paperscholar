import { and, desc, eq, gte, inArray, schema, sql, type Database } from "@repo/db";
import {
  ACTIVE_INGESTION_STATUSES,
  INGESTION_STATUSES,
  type Dashboard,
  type IngestionStatus,
} from "@repo/shared";

const DAY_MS = 24 * 60 * 60 * 1000;
const IN_FLIGHT_LIMIT = 20;
const FAILURE_LIMIT = 10;
const TOP_LIMIT = 10;

/** What the dashboard needs to know about this instance's pipeline. */
export interface DashboardPipeline {
  enabled: boolean;
  model: string | null;
  promptVersion: string;
  limits: {
    ingestionsPerDay: number;
    concurrentIngestions: number;
    outputTokenBudget: number;
  };
}

/** A usage counter of an ingestion's `usage` document, zero when it has none yet. */
const usageField = (name: string) =>
  sql<number>`coalesce((${schema.ingestions.usage}->>${name})::float8, 0)`;

/** The UTC day, `YYYY-MM-DD`. */
const utcDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The operations dashboard of docs/specs/14-cms.md §8.1: read straight from
 * `ingestions`, so every figure can be checked against the table.
 */
export function createDashboard({
  db,
  pipeline,
  now = () => new Date(),
}: {
  db: Database;
  pipeline: DashboardPipeline;
  now?: () => Date;
}) {
  return {
    /** `userId` is the maintainer looking: the daily limit is per maintainer. */
    async read(days: number, userId: string): Promise<Dashboard> {
      const generatedAt = now();
      const windowStart = new Date(
        `${utcDay(new Date(generatedAt.getTime() - (days - 1) * DAY_MS))}T00:00:00.000Z`,
      );
      const since24h = new Date(generatedAt.getTime() - DAY_MS);

      const [statusRows, inFlight, failures, dailyRows, top, started, running] =
        await Promise.all([
          db
            .select({
              status: schema.ingestions.status,
              count: sql<number>`count(*)::int`,
            })
            .from(schema.ingestions)
            .groupBy(schema.ingestions.status),
          db
            .select({
              id: schema.ingestions.id,
              title: schema.ingestions.title,
              status: schema.ingestions.status,
              updatedAt: schema.ingestions.updatedAt,
            })
            .from(schema.ingestions)
            .where(inArray(schema.ingestions.status, [...ACTIVE_INGESTION_STATUSES]))
            .orderBy(desc(schema.ingestions.updatedAt))
            .limit(IN_FLIGHT_LIMIT),
          db
            .select({
              id: schema.ingestions.id,
              title: schema.ingestions.title,
              error: schema.ingestions.error,
              failedStage: schema.ingestions.failedStage,
              updatedAt: schema.ingestions.updatedAt,
            })
            .from(schema.ingestions)
            .where(eq(schema.ingestions.status, "failed"))
            .orderBy(desc(schema.ingestions.updatedAt))
            .limit(FAILURE_LIMIT),
          db
            .select({
              date: sql<string>`to_char(${schema.ingestions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
              ingestions: sql<number>`count(*)::int`,
              calls: sql<number>`sum(${usageField("calls")})::float8`,
              inputTokens: sql<number>`sum(${usageField("inputTokens")})::float8`,
              outputTokens: sql<number>`sum(${usageField("outputTokens")})::float8`,
              cacheReadTokens: sql<number>`sum(${usageField("cacheReadTokens")})::float8`,
              sandboxRuns: sql<number>`sum(${usageField("sandboxRuns")})::float8`,
            })
            .from(schema.ingestions)
            .where(gte(schema.ingestions.createdAt, windowStart))
            .groupBy(sql`1`),
          db
            .select({
              id: schema.ingestions.id,
              title: schema.ingestions.title,
              outputTokens: usageField("outputTokens"),
              inputTokens: usageField("inputTokens"),
              sandboxRuns: usageField("sandboxRuns"),
              steps: sql<number>`(select count(*)::int from ${schema.ingestionSteps} where ${schema.ingestionSteps.ingestionId} = ${schema.ingestions.id})`,
            })
            .from(schema.ingestions)
            .where(gte(schema.ingestions.createdAt, windowStart))
            .orderBy(desc(usageField("outputTokens")))
            .limit(TOP_LIMIT),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.ingestions)
            .where(
              and(
                eq(schema.ingestions.createdBy, userId),
                gte(schema.ingestions.createdAt, since24h),
              ),
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(schema.ingestions)
            .where(inArray(schema.ingestions.status, ["reading", "planning", "writing"])),
        ]);

      const byStatus = Object.fromEntries(
        INGESTION_STATUSES.map((status) => [status, 0]),
      ) as Record<IngestionStatus, number>;
      for (const row of statusRows) byStatus[row.status] = row.count;

      const byDate = new Map(dailyRows.map((row) => [row.date, row]));
      const daily: Dashboard["daily"] = [];
      for (let offset = 0; offset < days; offset += 1) {
        const date = utcDay(new Date(windowStart.getTime() + offset * DAY_MS));
        const row = byDate.get(date);
        daily.push({
          date,
          ingestions: row?.ingestions ?? 0,
          calls: Math.round(row?.calls ?? 0),
          inputTokens: Math.round(row?.inputTokens ?? 0),
          outputTokens: Math.round(row?.outputTokens ?? 0),
          cacheReadTokens: Math.round(row?.cacheReadTokens ?? 0),
          sandboxRuns: Math.round(row?.sandboxRuns ?? 0),
        });
      }

      return {
        generatedAt: generatedAt.toISOString(),
        days,
        pipeline: {
          enabled: pipeline.enabled,
          model: pipeline.model,
          promptVersion: pipeline.promptVersion,
        },
        byStatus,
        inFlight: inFlight.map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
        })),
        recentFailures: failures.map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
        })),
        daily,
        topPapers: top.map((row) => ({
          id: row.id,
          title: row.title,
          outputTokens: Math.round(row.outputTokens),
          inputTokens: Math.round(row.inputTokens),
          sandboxRuns: Math.round(row.sandboxRuns),
          steps: row.steps,
        })),
        limits: {
          ingestionsToday: {
            used: started[0]?.count ?? 0,
            max: pipeline.limits.ingestionsPerDay,
          },
          concurrent: {
            used: running[0]?.count ?? 0,
            max: pipeline.limits.concurrentIngestions,
          },
          outputTokenBudget: pipeline.limits.outputTokenBudget,
        },
      };
    },
  };
}

export type AdminDashboard = ReturnType<typeof createDashboard>;
