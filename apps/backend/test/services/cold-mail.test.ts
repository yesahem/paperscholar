import { describe, expect, test } from "bun:test";
import { cleanFilename, cvKey } from "../../src/services/cold-mail";

/** Behaviour over HTTP is covered in test/routes/cold-mail.test.ts. */
describe("cleanFilename", () => {
  test("keeps the base name, without paths or control characters", () => {
    expect(cleanFilename("C:\\Users\\ada\\My CV.pdf")).toBe("My CV.pdf");
    expect(cleanFilename("../../etc/cv.pdf")).toBe("cv.pdf");
    expect(cleanFilename("cv\u0000\u001f\u007f.pdf")).toBe("cv.pdf");
    expect(cleanFilename("   ")).toBe("cv.pdf");
    expect(cleanFilename(`${"x".repeat(200)}.pdf`)).toHaveLength(120);
  });
});

describe("cvKey", () => {
  test("files every CV under its owner, in the private bucket", () => {
    expect(cvKey("user-1", "cv-1")).toBe("uploads/cv/user-1/cv-1.pdf");
  });
});
