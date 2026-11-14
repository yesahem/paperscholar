import { describe, expect, test } from "bun:test";
import { formatDay, formatMonthYear, formatRecentDay } from "@/lib/profile/format";

describe("profile dates", () => {
  test("joined dates read as month and year, in UTC", () => {
    expect(formatMonthYear("2026-11-30T23:30:00.000Z")).toBe("November 2026");
  });

  test("days read the same for timestamps and calendar days", () => {
    expect(formatDay("2026-11-14")).toBe("Nov 14, 2026");
    expect(formatDay("2026-11-14T08:00:00.000Z")).toBe("Nov 14, 2026");
  });

  test("recent days are relative, older ones dated", () => {
    const now = new Date("2026-11-14T00:30:00.000Z");
    expect(formatRecentDay("2026-11-14T00:01:00.000Z", now)).toBe("today");
    expect(formatRecentDay("2026-11-13T23:59:00.000Z", now)).toBe("yesterday");
    expect(formatRecentDay("2026-11-10T12:00:00.000Z", now)).toBe("4 days ago");
    expect(formatRecentDay("2026-10-01T12:00:00.000Z", now)).toBe("Oct 1, 2026");
  });
});
