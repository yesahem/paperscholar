import { describe, expect, test } from "bun:test";
import { avatarInitial } from "../../src/lib/avatar";

describe("avatarInitial", () => {
  test("is the first letter or digit, uppercased", () => {
    expect(avatarInitial("ada_lovelace")).toBe("A");
    expect(avatarInitial("_42")).toBe("4");
    expect(avatarInitial("émile")).toBe("É");
  });

  test("is a question mark without one", () => {
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial("___")).toBe("?");
  });
});
