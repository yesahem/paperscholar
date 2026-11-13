import { errorBodySchema } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { parseCspReport } from "../../src/routes/csp-reports";
import { createTestApp } from "../helpers";

function post(body: string, contentType: string) {
  const { app, logs } = createTestApp();
  const response = app.request("/api/csp-report", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  return { response, logs };
}

describe("POST /api/csp-report", () => {
  test("logs a report-uri report without query strings or full URLs", async () => {
    const { response, logs } = post(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://paperscholar.dev/papers/adam?token=secret",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?session=abc",
          disposition: "report",
          "source-file": "https://paperscholar.dev/_next/static/chunk.js",
          "line-number": 12,
        },
      }),
      "application/csp-report",
    );
    const res = await response;

    expect(res.status).toBe(204);
    const line = logs.find((log) => log.entry.msg === "csp violation");
    expect(line?.level).toBe("warn");
    expect(line?.entry).toMatchObject({
      directive: "script-src-elem",
      blocked: "https://evil.example",
      page: "/papers/adam",
      source: "/_next/static/chunk.js:12",
      disposition: "report",
    });
    expect(JSON.stringify(line?.entry)).not.toContain("secret");
    expect(JSON.stringify(line?.entry)).not.toContain("session");
  });

  test("accepts the Reporting API format and ignores other report types", async () => {
    const { response, logs } = post(
      JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://paperscholar.dev/",
            effectiveDirective: "script-src",
            blockedURL: "inline",
            disposition: "report",
          },
        },
        { type: "deprecation", body: {} },
      ]),
      "application/reports+json",
    );

    expect((await response).status).toBe(204);
    const lines = logs.filter((log) => log.entry.msg === "csp violation");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry).toMatchObject({ blocked: "inline", page: "/" });
  });

  test("rejects a body that is not JSON or not a report", async () => {
    for (const body of ["not json", JSON.stringify({ hello: "world" })]) {
      const res = await post(body, "application/csp-report").response;
      expect(res.status).toBe(400);
      expect(errorBodySchema.parse(await res.json()).error.code).toBe("validation_error");
    }
  });

  test("rejects an oversized report", async () => {
    const res = await post("x".repeat(20 * 1024), "application/csp-report").response;
    expect(res.status).toBe(413);
  });
});

describe("parseCspReport", () => {
  test("keeps keywords and reduces data: and blob: URLs to their scheme", () => {
    const [violation] = parseCspReport({
      "csp-report": { "blocked-uri": "data:text/javascript,alert(1)" },
    });
    expect(violation?.blocked).toBe("data:");
    expect(violation?.directive).toBe("unknown");
  });
});
