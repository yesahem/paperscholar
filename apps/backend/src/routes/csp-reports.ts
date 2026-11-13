import { Hono } from "hono";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { toValidationIssues } from "../lib/validation";
import { limitBody } from "../middleware/body-limit";
import type { AppEnv } from "../types";

/** Browsers send one violation per report; anything bigger is not a report. */
export const MAX_CSP_REPORT_BYTES = 16 * 1024;

/** `report-uri` format, sent as application/csp-report. */
const legacyReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": z.string().optional(),
    "effective-directive": z.string().optional(),
    "violated-directive": z.string().optional(),
    "blocked-uri": z.string().optional(),
    disposition: z.string().optional(),
    "source-file": z.string().optional(),
    "line-number": z.number().optional(),
  }),
});

/** Reporting API format (`report-to`), sent as application/reports+json. */
const reportingApiSchema = z.array(
  z.object({
    type: z.string(),
    body: z
      .object({
        documentURL: z.string().optional(),
        effectiveDirective: z.string().optional(),
        blockedURL: z.string().optional(),
        disposition: z.string().optional(),
        sourceFile: z.string().optional(),
        lineNumber: z.number().optional(),
      })
      .optional(),
  }),
);

export interface CspViolation {
  directive: string;
  /** An origin, or a keyword such as `inline` or `eval`; never a full URL. */
  blocked: string;
  /** Path of the page, without its query. */
  page: string | null;
  /** Path of the script that triggered it, with its line. */
  source: string | null;
  disposition: string;
}

/** Keeps only an origin or keyword: URLs can carry tokens in their path or query. */
function originOrKeyword(value: string | undefined): string {
  if (!value) return "unknown";
  if (!URL.canParse(value)) return value.slice(0, 64);
  const url = new URL(value);
  return url.origin === "null" ? url.protocol : url.origin;
}

function pathOnly(value: string | undefined): string | null {
  if (!value || !URL.canParse(value)) return null;
  return new URL(value).pathname.slice(0, 256);
}

function withLine(path: string | null, line: number | undefined): string | null {
  return path && line !== undefined ? `${path}:${line}` : path;
}

/** Reduces a report in either format to fields that are safe to log. */
export function parseCspReport(raw: unknown): CspViolation[] {
  const legacy = legacyReportSchema.safeParse(raw);
  if (legacy.success) {
    const report = legacy.data["csp-report"];
    return [
      {
        directive:
          report["effective-directive"] ?? report["violated-directive"] ?? "unknown",
        blocked: originOrKeyword(report["blocked-uri"]),
        page: pathOnly(report["document-uri"]),
        source: withLine(pathOnly(report["source-file"]), report["line-number"]),
        disposition: report.disposition ?? "unknown",
      },
    ];
  }

  const modern = reportingApiSchema.safeParse(raw);
  if (modern.success) {
    return modern.data
      .filter((report) => report.type === "csp-violation" && report.body)
      .map(({ body = {} }) => ({
        directive: body.effectiveDirective ?? "unknown",
        blocked: originOrKeyword(body.blockedURL),
        page: pathOnly(body.documentURL),
        source: withLine(pathOnly(body.sourceFile), body.lineNumber),
        disposition: body.disposition ?? "unknown",
      }));
  }

  throw new AppError("validation_error", {
    details: { issues: toValidationIssues(legacy.error.issues) },
  });
}

/**
 * POST /api/csp-report: receives Content-Security-Policy violation reports
 * from browsers (docs/specs/11-security-ops.md §2) and logs a reduced form.
 * Browsers send `application/csp-report` or `application/reports+json`, which
 * the JSON validator does not accept, so the body is parsed here, still
 * through a schema.
 */
export function cspReportRoutes() {
  return new Hono<AppEnv>().post("/", limitBody(MAX_CSP_REPORT_BYTES), async (c) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await c.req.text());
    } catch (error) {
      throw new AppError("validation_error", {
        message: "The report is not valid JSON.",
        details: { issues: [{ path: "", message: "must be JSON" }] },
        cause: error,
      });
    }
    const logger = c.get("logger");
    for (const violation of parseCspReport(raw)) {
      logger.warn("csp violation", { ...violation });
    }
    return c.body(null, 204);
  });
}
