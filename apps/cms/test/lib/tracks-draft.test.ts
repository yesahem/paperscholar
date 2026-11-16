import { describe, expect, test } from "bun:test";
import {
  isDirty,
  newDraft,
  slugFromTitle,
  toDrafts,
  toRequest,
  trackProblems,
  type TrackDraft,
} from "@/lib/tracks/draft";

const track = {
  id: "basics",
  title: "Basics",
  summary: "Start here.",
  paperIds: ["adam", "svm"],
  origin: "library" as const,
};
const saved = [track];

const draft = (overrides: Partial<TrackDraft> = {}): TrackDraft => ({
  ...track,
  key: "basics",
  ...overrides,
});

describe("slugFromTitle", () => {
  test("makes lowercase words joined by hyphens", () => {
    expect(slugFromTitle("  Attention & Transformers! ")).toBe("attention-transformers");
    expect(slugFromTitle("Café à la carte")).toBe("cafe-a-la-carte");
    expect(slugFromTitle("???")).toBe("");
  });
});

describe("toRequest", () => {
  test("trims text and leaves out the editor's own fields", () => {
    expect(
      toRequest([draft({ id: " basics ", title: " Basics ", summary: " S " })]),
    ).toEqual([
      { id: "basics", title: "Basics", summary: "S", paperIds: ["adam", "svm"] },
    ]);
  });
});

describe("isDirty", () => {
  test("is false until something changes, and again when it is changed back", () => {
    expect(isDirty(toDrafts(saved), saved)).toBe(false);
    expect(isDirty([draft({ title: "Other" })], saved)).toBe(true);
    expect(isDirty([draft({ paperIds: ["svm", "adam"] })], saved)).toBe(true);
    expect(isDirty([draft({ title: "Other" }), draft({ title: "Basics" })], saved)).toBe(
      true,
    );
    expect(isDirty([draft({ title: "Basics " })], saved)).toBe(false);
  });
});

describe("trackProblems", () => {
  test("a valid list has none", () => {
    expect(trackProblems(toDrafts(saved)).size).toBe(0);
  });

  test("names each problem in words, per track", () => {
    const problems = trackProblems([
      draft({ id: "Bad Id", title: "", summary: "", paperIds: [] }),
      draft({ key: "second", id: "ok", paperIds: ["adam", "adam"] }),
    ]);
    expect(problems.get("basics")).toEqual([
      "Use a short id of lowercase letters, digits and hyphens.",
      "Give the track a title of up to 120 characters.",
      "Add a summary of up to 300 characters.",
      "Add between 1 and 30 papers.",
    ]);
    expect(problems.get("second")).toEqual(["List each paper once."]);
  });

  test("flags a repeated id on the later track", () => {
    const problems = trackProblems([draft(), draft({ key: "copy" })]);
    expect(problems.has("basics")).toBe(false);
    expect(problems.get("copy")).toEqual(["Another track already has this id."]);
  });

  test("a new, empty track is not ready", () => {
    expect(trackProblems([newDraft("new-1")]).get("new-1")?.length).toBeGreaterThan(0);
  });
});
