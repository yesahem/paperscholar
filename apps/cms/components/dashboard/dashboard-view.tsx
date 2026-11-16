"use client";

import { DASHBOARD_DAYS, type Dashboard } from "@repo/shared";
import { INGESTION_STATUSES } from "@repo/shared/pipeline";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Meter } from "@repo/ui/components/meter";
import { Select } from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { LoadError } from "@repo/web-core/states/load-error";
import Link from "next/link";
import { useState } from "react";
import {
  formatDateTime,
  formatTokens,
  INGESTION_STATUS_LABEL,
  ingestionTone,
  percent,
} from "@/lib/admin/format";
import { useDashboard } from "@/lib/admin/queries";
import { cacheHitShare, totalUsage } from "@/lib/dashboard/totals";

const WINDOWS = [7, 30, DASHBOARD_DAYS.max] as const;

/** `/`: what the pipeline is doing, what it cost, and what failed (docs/specs/14-cms.md §8.1). */
export function DashboardView() {
  const [days, setDays] = useState<number>(DASHBOARD_DAYS.default);
  const dashboard = useDashboard(days);

  if (dashboard.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (dashboard.isError) {
    return (
      <LoadError
        what="the dashboard"
        message={dashboard.error.message}
        onRetry={() => void dashboard.refetch()}
        retrying={dashboard.isFetching}
      />
    );
  }
  const data = dashboard.data;
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-3">
        {data.pipeline.enabled ? (
          <Badge variant="success">Pipeline on</Badge>
        ) : (
          <Badge variant="warning">Pipeline off</Badge>
        )}
        {data.pipeline.model ? (
          <span className="font-mono text-xs text-muted-foreground">
            {data.pipeline.model} · prompts {data.pipeline.promptVersion}
          </span>
        ) : null}
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Window
          <Select
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
            className="w-auto"
          >
            {WINDOWS.map((window) => (
              <option key={window} value={window}>
                Last {window} days
              </option>
            ))}
          </Select>
        </label>
      </div>

      {data.pipeline.enabled ? null : (
        <Alert variant="warning" title="The paper pipeline is off on this instance">
          Uploading papers needs a model. Set ANTHROPIC_API_KEY in the backend&apos;s
          environment and restart it. Tracks and roles still work.
        </Alert>
      )}

      <StatusCounts data={data} />
      <Limits data={data} />
      <div className="grid gap-6 lg:grid-cols-2">
        <InFlight data={data} />
        <Failures data={data} />
      </div>
      <Usage data={data} />
      <TopPapers data={data} />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatusCounts({ data }: { data: Dashboard }) {
  return (
    <Section title="Ingestions now" description="Every ingestion, by where it stands.">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {INGESTION_STATUSES.map((status) => (
          <li
            key={status}
            className="rounded-lg border border-border p-3"
            aria-label={`${INGESTION_STATUS_LABEL[status]}: ${data.byStatus[status]}`}
          >
            <p className="text-2xl font-semibold tabular-nums">{data.byStatus[status]}</p>
            <p className="text-xs text-muted-foreground">
              {INGESTION_STATUS_LABEL[status]}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Limits({ data }: { data: Dashboard }) {
  const { ingestionsToday, concurrent, outputTokenBudget } = data.limits;
  return (
    <Section
      title="Limits"
      description="Your uploads in the last 24 hours, and the pipeline's concurrency."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <p className="text-sm">
            Started by you in 24 hours: {ingestionsToday.used} of {ingestionsToday.max}
          </p>
          <Meter
            label="Ingestions you started in the last 24 hours"
            value={ingestionsToday.used}
            max={ingestionsToday.max}
            tone={ingestionsToday.used >= ingestionsToday.max ? "destructive" : "primary"}
          />
        </div>
        <div className="grid gap-1.5">
          <p className="text-sm">
            Running at once: {concurrent.used} of {concurrent.max}
          </p>
          <Meter
            label="Ingestions running at once"
            value={concurrent.used}
            max={concurrent.max}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Each ingestion may write up to {formatTokens(outputTokenBudget)} output tokens
        before it is stopped.
      </p>
    </Section>
  );
}

function InFlight({ data }: { data: Dashboard }) {
  return (
    <Section title="In flight" description="Reading, planning or writing now.">
      {data.inFlight.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is running.</p>
      ) : (
        <ul className="grid gap-2">
          {data.inFlight.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
            >
              <Link
                href={`/ingestions/${row.id}`}
                className="min-w-0 flex-1 font-medium hover:underline"
              >
                {row.title ?? "Untitled paper"}
              </Link>
              <Badge variant={ingestionTone(row.status)}>
                {INGESTION_STATUS_LABEL[row.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Failures({ data }: { data: Dashboard }) {
  return (
    <Section title="Recent failures" description="The reason a maintainer sees on each.">
      {data.recentFailures.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has failed.</p>
      ) : (
        <ul className="grid gap-2">
          {data.recentFailures.map((row) => (
            <li key={row.id} className="grid gap-1 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/ingestions/${row.id}`}
                  className="min-w-0 flex-1 font-medium hover:underline"
                >
                  {row.title ?? "Untitled paper"}
                </Link>
                {row.failedStage ? (
                  <Badge variant="destructive">stopped at {row.failedStage}</Badge>
                ) : null}
              </div>
              <p className="text-sm text-destructive">
                {row.error ?? "No reason was recorded."}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(row.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Usage({ data }: { data: Dashboard }) {
  const totals = totalUsage(data.daily);
  const busiest = Math.max(1, ...data.daily.map((day) => day.outputTokens));
  const cached = cacheHitShare(totals);
  return (
    <Section
      title="Model and sandbox usage"
      description={`By the day each ingestion was created, over the last ${data.days} days (UTC).`}
    >
      <p className="text-sm text-muted-foreground">
        {formatTokens(totals.outputTokens)} output and {formatTokens(totals.inputTokens)}{" "}
        input tokens, {formatTokens(totals.cacheReadTokens)} read from the cache (
        {percent(cached)} of input), {formatTokens(totals.calls)} model calls and{" "}
        {formatTokens(totals.sandboxRuns)} sandbox runs, for {totals.ingestions}{" "}
        ingestions.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-xl text-sm">
          <caption className="sr-only">Usage per day</caption>
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Day
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Ingestions
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Calls
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Input
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Output
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cache reads
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Sandbox runs
              </th>
            </tr>
          </thead>
          <tbody>
            {[...data.daily].reverse().map((day) => (
              <tr key={day.date} className="border-t border-border">
                <th
                  scope="row"
                  className="px-3 py-1.5 text-left font-mono text-xs font-normal"
                >
                  {day.date}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">{day.ingestions}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatTokens(day.calls)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatTokens(day.inputTokens)}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center justify-end gap-2">
                    <Meter
                      label={`Output tokens on ${day.date}`}
                      value={day.outputTokens}
                      max={busiest}
                      className="hidden w-16 sm:block"
                    />
                    <span className="tabular-nums">{formatTokens(day.outputTokens)}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatTokens(day.cacheReadTokens)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatTokens(day.sandboxRuns)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/50 font-medium">
              <th scope="row" className="px-3 py-2 text-left">
                Total
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{totals.ingestions}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatTokens(totals.calls)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatTokens(totals.inputTokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatTokens(totals.outputTokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatTokens(totals.cacheReadTokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatTokens(totals.sandboxRuns)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

function TopPapers({ data }: { data: Dashboard }) {
  return (
    <Section
      title="Most expensive papers"
      description="The ingestions with the most output tokens in the window."
    >
      {data.topPapers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ingestions in this window.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-lg text-sm">
            <caption className="sr-only">Ingestions by output tokens</caption>
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Paper
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Steps
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Output
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Input
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Sandbox runs
                </th>
              </tr>
            </thead>
            <tbody>
              {data.topPapers.map((paper) => (
                <tr key={paper.id} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/ingestions/${paper.id}`}
                      className="font-medium hover:underline"
                    >
                      {paper.title ?? "Untitled paper"}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{paper.steps}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatTokens(paper.outputTokens)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatTokens(paper.inputTokens)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatTokens(paper.sandboxRuns)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
