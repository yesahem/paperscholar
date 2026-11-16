import { describe, expect, test } from "bun:test";
import {
  createIngestionSchema,
  dashboardQuerySchema,
  putTracksSchema,
  startEvalSchema,
} from "../../src";

const track = { id: "basics", title: "Basics", summary: "Start.", paperIds: ["adam"] };

describe("dashboardQuerySchema", () => {
  test("defaults to 30 days and keeps 1 to 90", () => {
    expect(dashboardQuerySchema.parse({}).days).toBe(30);
    expect(dashboardQuerySchema.parse({ days: "90" }).days).toBe(90);
    expect(dashboardQuerySchema.safeParse({ days: "0" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ days: "91" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ days: "1.5" }).success).toBe(false);
  });
});

describe("putTracksSchema", () => {
  test("accepts a valid list and refuses duplicates, empties and extras", () => {
    expect(putTracksSchema.safeParse({ revision: 0, tracks: [track] }).success).toBe(
      true,
    );
    expect(
      putTracksSchema.safeParse({ revision: 0, tracks: [track, track] }).success,
    ).toBe(false);
    expect(
      putTracksSchema.safeParse({ revision: 0, tracks: [{ ...track, paperIds: [] }] })
        .success,
    ).toBe(false);
    expect(
      putTracksSchema.safeParse({
        revision: 0,
        tracks: [{ ...track, paperIds: ["adam", "adam"] }],
      }).success,
    ).toBe(false);
    expect(
      putTracksSchema.safeParse({
        revision: 0,
        tracks: [{ ...track, origin: "library" }],
      }).success,
    ).toBe(false);
    expect(putTracksSchema.safeParse({ revision: -1, tracks: [] }).success).toBe(false);
  });
});

describe("startEvalSchema", () => {
  test("the cost must be confirmed", () => {
    expect(startEvalSchema.parse({ confirmCost: true })).toEqual({
      fresh: false,
      confirmCost: true,
    });
    expect(startEvalSchema.safeParse({}).success).toBe(false);
    expect(startEvalSchema.safeParse({ confirmCost: false }).success).toBe(false);
  });
});

describe("createIngestionSchema", () => {
  test("arxivId may be a link of up to 300 characters", () => {
    const base = { rightsConfirmed: true };
    expect(
      createIngestionSchema.safeParse({
        ...base,
        arxivId: "https://arxiv.org/abs/1706.03762v7",
      }).success,
    ).toBe(true);
    expect(
      createIngestionSchema.safeParse({ ...base, arxivId: "x".repeat(301) }).success,
    ).toBe(false);
  });
});
