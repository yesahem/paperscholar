import { describe, expect, test } from "bun:test";
import { generateUsername, usernameBase } from "../../src/services/usernames";

describe("usernameBase", () => {
  test("cleans an email's local part", () => {
    expect(usernameBase("Ada.Lovelace+papers@example.com")).toBe("ada_lovelace_pa");
    expect(usernameBase("grace@example.com")).toBe("grace");
    expect(usernameBase("--__--@example.com")).toBe("learner");
    expect(usernameBase("al@example.com")).toBe("al_learner");
  });
});

describe("generateUsername", () => {
  test("uses the base when it is free", async () => {
    expect(await generateUsername("grace@example.com", async () => false)).toBe("grace");
  });

  test("adds a number on collision", async () => {
    const taken = new Set(["grace", "grace2"]);
    expect(
      await generateUsername("grace@example.com", async (name) => taken.has(name)),
    ).toBe("grace3");
  });

  test("never returns a reserved name", async () => {
    expect(await generateUsername("admin@example.com", async () => false)).toBe("admin2");
  });

  test("keeps within 20 characters when a suffix is added", async () => {
    const name = await generateUsername(
      "abcdefghijklmnopqrstuvwxyz@example.com",
      async (candidate) => candidate === "abcdefghijklmno",
    );
    expect(name).toBe("abcdefghijklmno2");
    expect(name.length).toBeLessThanOrEqual(20);
  });

  test("falls back to random digits when every numbered name is taken", async () => {
    const name = await generateUsername(
      "grace@example.com",
      async (candidate) => !/^grace\d{6}$/.test(candidate) || candidate === "grace000000",
      () => 0.123456,
    );
    expect(name).toBe("grace123456");
  });
});
