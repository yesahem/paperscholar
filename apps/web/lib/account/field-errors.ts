import { ApiError } from "@/lib/api/errors";

/**
 * Per-field messages from a `validation_error`'s `details.issues`, and the
 * username's `conflict` (docs/specs/05-api.md §3). Keys are field names.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  if (error.code === "conflict") return { username: error.message };
  if (error.code !== "validation_error") return {};
  const details = error.details;
  if (typeof details !== "object" || details === null || !("issues" in details))
    return {};
  const issues = details.issues;
  if (!Array.isArray(issues)) return {};
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (typeof path === "string" && typeof message === "string" && !(path in errors)) {
      errors[path] = message;
    }
  }
  return errors;
}
