import { describe, expect, test } from "bun:test";
import { activityLevel, buildHeatmap, HEATMAP_WEEKS } from "@/lib/profile/heatmap";

describe("activityLevel", () => {
  test("groups counts into five steps", () => {
    expect([0, 1, 2, 3, 4, 6, 7, 40].map(activityLevel)).toEqual([
      0, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

describe("buildHeatmap", () => {
  // A Saturday: the last column is a full week.
  const saturday = new Date("2026-11-14T22:00:00.000Z");

  test("has 53 Sunday-first weeks ending today, with later days empty", () => {
    const map = buildHeatmap([], new Date("2026-11-11T08:00:00.000Z")); // a Wednesday
    expect(map.weeks).toHaveLength(HEATMAP_WEEKS);
    expect(map.weeks[0]?.[0]?.day).toBe("2025-11-09"); // a Sunday
    const last = map.weeks.at(-1) ?? [];
    expect(last.map((cell) => cell?.day ?? null)).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      null,
      null,
      null,
    ]);
  });

  test("places each day's solves, counts the total and ignores days outside the grid", () => {
    const map = buildHeatmap(
      [
        { day: "2026-11-14", solves: 2 },
        { day: "2026-01-01", solves: 7 },
        { day: "2020-01-01", solves: 99 },
      ],
      saturday,
    );
    expect(map.weeks.at(-1)?.[6]).toEqual({ day: "2026-11-14", solves: 2, level: 2 });
    const newYear = map.weeks.flat().find((cell) => cell?.day === "2026-01-01");
    expect(newYear).toEqual({ day: "2026-01-01", solves: 7, level: 4 });
    expect(map.total).toBe(9);
  });

  test("labels each month once, in order, without crowding the first", () => {
    const map = buildHeatmap([], saturday);
    const labels = map.months.map((month) => month.label);
    expect(labels.at(-1)).toBe("Nov");
    expect(new Set(labels).size).toBeGreaterThanOrEqual(11);
    const gaps = map.months
      .slice(1)
      .map((month, i) => month.week - (map.months[i]?.week ?? 0));
    expect(gaps.every((gap) => gap >= 3)).toBe(true);
  });

  test("uses UTC days whatever the local zone", () => {
    const late = buildHeatmap([], new Date("2026-11-14T23:59:00.000Z"));
    expect(late.weeks.at(-1)?.[6]?.day).toBe("2026-11-14");
  });
});
