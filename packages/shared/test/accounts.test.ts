import { describe, expect, test } from "bun:test";
import { hasRole, normaliseUsername, ROLES, usernameProblem } from "../src/accounts";

describe("hasRole", () => {
  test("orders user < maintainer < admin", () => {
    expect(hasRole("admin", "maintainer")).toBe(true);
    expect(hasRole("maintainer", "maintainer")).toBe(true);
    expect(hasRole("user", "maintainer")).toBe(false);
    expect(hasRole("maintainer", "admin")).toBe(false);
    for (const role of ROLES) expect(hasRole(role, "user")).toBe(true);
  });
});

describe("usernameProblem", () => {
  test("accepts 3–20 lowercase letters, digits and underscores", () => {
    expect(usernameProblem("ada")).toBeNull();
    expect(usernameProblem("grace_hopper_1906")).toBeNull();
    expect(usernameProblem("a".repeat(20))).toBeNull();
  });

  test("names the broken rule", () => {
    expect(usernameProblem("ab")).toBe("Use at least 3 characters.");
    expect(usernameProblem("a".repeat(21))).toBe("Use at most 20 characters.");
    expect(usernameProblem("ada.l")).toBe("Use only letters, digits and underscores.");
    expect(usernameProblem("Ada")).toBe("Use only letters, digits and underscores.");
    expect(usernameProblem("admin")).toBe("That username is reserved.");
    expect(usernameProblem("settings")).toBe("That username is reserved.");
  });

  test("normalising lowercases and trims", () => {
    expect(normaliseUsername("  Ada_L ")).toBe("ada_l");
  });
});
