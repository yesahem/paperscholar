const DAY_MS = 86_400_000;

const MONTH_YEAR = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "November 2026". */
export function formatMonthYear(iso: string): string {
  return MONTH_YEAR.format(new Date(iso));
}

/** "Nov 14, 2026" for a timestamp or a `YYYY-MM-DD` day. */
export function formatDay(isoOrDay: string): string {
  const value = isoOrDay.length === 10 ? `${isoOrDay}T00:00:00Z` : isoOrDay;
  return DAY_MONTH_YEAR.format(new Date(value));
}

/** "today", "yesterday", "3 days ago", then the date; in UTC days, like streaks. */
export function formatRecentDay(iso: string, now: Date): string {
  const day = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const days = Math.round((day(now) - day(new Date(iso))) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDay(iso);
}
