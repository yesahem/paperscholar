import type { ActivityDay } from "@repo/shared";

const DAY_MS = 86_400_000;
/** 52 full weeks and the current one (docs/specs/08-web.md §6). */
export const HEATMAP_WEEKS = 53;

export interface HeatmapCell {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  solves: number;
  /** 0 for none, then 1–4 by how many. */
  level: 0 | 1 | 2 | 3 | 4;
}

export interface Heatmap {
  /** One column per week, Sunday first; days after today are null. */
  weeks: (HeatmapCell | null)[][];
  /** Where a month's label goes: the first week whose Sunday falls in it. */
  months: { week: number; label: string }[];
  total: number;
}

export function activityLevel(solves: number): HeatmapCell["level"] {
  if (solves <= 0) return 0;
  if (solves === 1) return 1;
  if (solves <= 3) return 2;
  if (solves <= 6) return 3;
  return 4;
}

const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const MONTHS = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

/**
 * Lays out the last 53 weeks of activity as a grid of UTC days, the way
 * streaks count them (docs/specs/04-database.md §5.2).
 */
export function buildHeatmap(activity: readonly ActivityDay[], today: Date): Heatmap {
  const solvesByDay = new Map(activity.map((entry) => [entry.day, entry.solves]));
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const firstSunday =
    todayMs - today.getUTCDay() * DAY_MS - (HEATMAP_WEEKS - 1) * 7 * DAY_MS;

  const weeks: (HeatmapCell | null)[][] = [];
  const months: Heatmap["months"] = [];
  let total = 0;
  for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
    const column: (HeatmapCell | null)[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const ms = firstSunday + (week * 7 + weekday) * DAY_MS;
      if (ms > todayMs) {
        column.push(null);
        continue;
      }
      const day = dayString(ms);
      const solves = solvesByDay.get(day) ?? 0;
      total += solves;
      column.push({ day, solves, level: activityLevel(solves) });
    }
    weeks.push(column);
    const sunday = new Date(firstSunday + week * 7 * DAY_MS);
    const previous = new Date(firstSunday + (week - 1) * 7 * DAY_MS);
    if (week === 0 || sunday.getUTCMonth() !== previous.getUTCMonth()) {
      months.push({ week, label: MONTHS.format(sunday) });
    }
  }
  // A label for a month that starts in the last two columns would overlap the next one.
  if (months.length > 1 && (months[1]?.week ?? 0) - (months[0]?.week ?? 0) < 3)
    months.shift();
  return { weeks, months, total };
}
