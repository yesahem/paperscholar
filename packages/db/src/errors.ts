/** Postgres reports a unique-constraint violation with SQLSTATE 23505. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const fields = current as Error & { errno?: unknown; code?: unknown };
    if (fields.errno === "23505" || fields.code === "23505") return true;
  }
  return false;
}
