import { describe, expect, test } from "bun:test";
import {
  draftKey,
  hashStarter,
  initialCode,
  readDraft,
  removeDraft,
  writeDraft,
  type DraftStorage,
} from "@/lib/content/drafts";

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwing: DraftStorage = {
  getItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("denied", "SecurityError");
  },
};

const starter = "def relu(x):\n    raise NotImplementedError\n";

describe("drafts", () => {
  test("keys are scoped to the paper and problem", () => {
    expect(draftKey("adam", "adam-step")).toBe("draft:v1:adam/adam-step");
  });

  test("round-trips a draft", () => {
    const storage = memoryStorage();
    const draft = { code: "x = 1\n", starterHash: hashStarter(starter), updatedAt: "t" };
    expect(writeDraft(storage, "k", draft)).toBe(true);
    expect(readDraft(storage, "k")).toEqual(draft);
    removeDraft(storage, "k");
    expect(readDraft(storage, "k")).toBeNull();
  });

  test("ignores corrupt or foreign values", () => {
    const storage = memoryStorage();
    storage.data.set("a", "{not json");
    storage.data.set("b", JSON.stringify({ code: 1 }));
    expect(readDraft(storage, "a")).toBeNull();
    expect(readDraft(storage, "b")).toBeNull();
  });

  test("works without storage, and when storage throws", () => {
    const draft = { code: "", starterHash: "", updatedAt: "" };
    expect(readDraft(null, "k")).toBeNull();
    expect(writeDraft(null, "k", draft)).toBe(false);
    expect(readDraft(throwing, "k")).toBeNull();
    expect(writeDraft(throwing, "k", draft)).toBe(false);
    expect(() => removeDraft(throwing, "k")).not.toThrow();
  });

  test("the starter hash is stable and changes with the starter", () => {
    expect(hashStarter(starter)).toBe(hashStarter(starter));
    expect(hashStarter(starter)).toMatch(/^[0-9a-f]{8}$/);
    expect(hashStarter(`${starter}\n`)).not.toBe(hashStarter(starter));
  });
});

describe("initialCode", () => {
  test("uses the starter when there is no draft", () => {
    expect(initialCode(null, starter)).toEqual({ code: starter, starterChanged: false });
  });

  test("restores a draft written against the current starter", () => {
    const draft = { code: "mine", starterHash: hashStarter(starter), updatedAt: "t" };
    expect(initialCode(draft, starter)).toEqual({ code: "mine", starterChanged: false });
  });

  test("flags a draft written against an older starter", () => {
    const draft = { code: "mine", starterHash: hashStarter("old"), updatedAt: "t" };
    expect(initialCode(draft, starter)).toEqual({ code: "mine", starterChanged: true });
  });
});
