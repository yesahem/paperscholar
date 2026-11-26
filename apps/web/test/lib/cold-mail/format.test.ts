import { describe, expect, test } from "bun:test";
import { mailtoHref } from "@/lib/cold-mail/format";

describe("mailtoHref", () => {
  test("opens a draft with subject and body, and no recipient", () => {
    const href = mailtoHref("Research internship", "Dear Dr. Lovelace,\n\nI am…");
    expect(href).toStartWith("mailto:?");
    const params = new URLSearchParams(href.slice("mailto:?".length));
    expect(params.get("subject")).toBe("Research internship");
    expect(params.get("body")).toBe("Dear Dr. Lovelace,\n\nI am…");
  });

  test("encodes spaces as %20, which every mail program reads, never as +", () => {
    expect(mailtoHref("a b", "c+d")).toBe("mailto:?subject=a%20b&body=c%2Bd");
  });
});
