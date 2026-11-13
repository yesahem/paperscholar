import { describe, expect, test } from "bun:test";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

describe("security headers", () => {
  test("the production policy loads only from this origin and reports violations", () => {
    const policy = contentSecurityPolicy({ development: false });
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("report-uri /api/csp-report");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toMatch(/https?:\/\//);
  });

  test("only development allows eval and the reload socket", () => {
    const policy = contentSecurityPolicy({ development: true });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws:");
  });

  test("the policy is report-only, alongside the other headers of spec 11 §2", () => {
    const keys = securityHeaders({ development: false }).map((header) => header.key);
    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
    for (const key of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]) {
      expect(keys).toContain(key);
    }
  });
});
