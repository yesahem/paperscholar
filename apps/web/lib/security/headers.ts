/**
 * HTTP security headers for every page (docs/specs/11-security-ops.md §2).
 *
 * The Content-Security-Policy is sent in report-only mode until violations
 * have been reviewed. It allows inline scripts instead of using per-request
 * nonces: nonces require rendering every page per request, which would stop
 * content pages from being cached (docs/specs/08-web.md §1). Reports go to
 * POST /api/csp-report.
 */

export const CSP_REPORT_PATH = "/api/csp-report";

export interface PolicyOptions {
  development: boolean;
  /** Where avatars are served from when not this site (the R2 public bucket). */
  avatarOrigin?: string;
}

export function contentSecurityPolicy({
  development,
  avatarOrigin,
}: PolicyOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js streams its payload in inline scripts; the dev server also evaluates code.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // The editor sets inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    // blob: shows an avatar chosen for upload before it is sent.
    "img-src": ["'self'", "data:", "blob:", ...(avatarOrigin ? [avatarOrigin] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(development ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": ["csp"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(
  options: PolicyOptions,
): { key: string; value: string }[] {
  return [
    {
      key: "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy(options),
    },
    { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
