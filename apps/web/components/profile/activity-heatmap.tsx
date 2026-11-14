import type { ActivityDay } from "@repo/shared";
import { cn } from "@repo/ui/lib/cn";
import { formatDay } from "@/lib/profile/format";
import { buildHeatmap, type HeatmapCell } from "@/lib/profile/heatmap";
import { pluralise } from "@/lib/content/format";

const LEVEL_CLASSES: Record<HeatmapCell["level"], string> = {
  0: "bg-muted",
  1: "bg-primary/30",
  2: "bg-primary/55",
  3: "bg-primary/80",
  4: "bg-primary",
};

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * 52 weeks of passing submits, one square per UTC day (docs/specs/08-web.md
 * §6). The total is also given in text, so colour is never the only signal.
 */
export function ActivityHeatmap({
  activity,
  today,
}: {
  activity: ActivityDay[];
  today: Date;
}) {
  const map = buildHeatmap(activity, today);
  const summary = `${pluralise(map.total, "passing submit")} in the last year`;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm text-muted-foreground">{summary}</figcaption>
      <div className="overflow-x-auto pb-1">
        <div role="img" aria-label={summary} className="inline-flex flex-col gap-1">
          <div
            aria-hidden="true"
            className="relative ml-8 h-4 text-[0.65rem] text-muted-foreground"
          >
            {map.months.map((month) => (
              <span
                key={`${month.week}-${month.label}`}
                className="absolute"
                style={{ left: `${month.week * 0.875}rem` }}
              >
                {month.label}
              </span>
            ))}
          </div>
          <div aria-hidden="true" className="flex gap-0.5">
            <div className="mr-1 flex w-7 flex-col gap-0.5 text-[0.65rem] leading-3 text-muted-foreground">
              {WEEKDAY_LABELS.map((label, index) => (
                <span key={index} className="h-3">
                  {label}
                </span>
              ))}
            </div>
            {map.weeks.map((week, index) => (
              <div key={index} className="flex flex-col gap-0.5">
                {week.map((cell, weekday) =>
                  cell ? (
                    <span
                      key={cell.day}
                      title={`${formatDay(cell.day)}: ${pluralise(cell.solves, "passing submit")}`}
                      className={cn("size-3 rounded-[2px]", LEVEL_CLASSES[cell.level])}
                    />
                  ) : (
                    <span key={`empty-${weekday}`} className="size-3" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex items-center gap-1 self-end text-[0.65rem] text-muted-foreground"
      >
        Less
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span
            key={level}
            className={cn("size-3 rounded-[2px]", LEVEL_CLASSES[level])}
          />
        ))}
        More
      </div>
    </figure>
  );
}
