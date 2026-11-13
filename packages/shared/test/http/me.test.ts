import { describe, expect, test } from "bun:test";
import {
  deleteMeSchema,
  meSchema,
  updateMeSchema,
  usernameSchema,
  type Me,
} from "../../src";

describe("usernameSchema", () => {
  test("lowercases before checking", () => {
    expect(usernameSchema.parse(" Ada_Lovelace ")).toBe("ada_lovelace");
  });

  test("rejects reserved and malformed names", () => {
    expect(usernameSchema.safeParse("Admin").success).toBe(false);
    expect(usernameSchema.safeParse("no spaces").success).toBe(false);
  });
});

describe("updateMeSchema", () => {
  test("accepts a username, a bio, or both", () => {
    expect(updateMeSchema.parse({ username: "Ada" })).toEqual({ username: "ada" });
    expect(updateMeSchema.parse({ bio: "  Hello  " })).toEqual({ bio: "Hello" });
  });

  test("an empty bio clears it", () => {
    expect(updateMeSchema.parse({ bio: "   " })).toEqual({ bio: null });
    expect(updateMeSchema.parse({ bio: null })).toEqual({ bio: null });
  });

  test("rejects an empty body, unknown fields and a long bio", () => {
    expect(updateMeSchema.safeParse({}).success).toBe(false);
    expect(updateMeSchema.safeParse({ role: "admin" }).success).toBe(false);
    expect(updateMeSchema.safeParse({ bio: "x".repeat(281) }).success).toBe(false);
  });
});

describe("deleteMeSchema", () => {
  test("needs a confirmation and nothing else", () => {
    expect(deleteMeSchema.parse({ confirm: "ada" })).toEqual({ confirm: "ada" });
    expect(deleteMeSchema.safeParse({}).success).toBe(false);
    expect(deleteMeSchema.safeParse({ confirm: "ada", force: true }).success).toBe(false);
  });
});

describe("meSchema", () => {
  test("parses the documented shape", () => {
    const me: Me = {
      id: "0190f0b8-0000-7000-8000-000000000000",
      username: "ada",
      email: "ada@example.com",
      emailVerified: false,
      avatarUrl: null,
      bio: null,
      role: "user",
      createdAt: "2026-11-14T00:00:00.000Z",
    };
    expect(meSchema.parse(me)).toEqual(me);
    expect(meSchema.safeParse({ ...me, role: "owner" }).success).toBe(false);
  });
});
