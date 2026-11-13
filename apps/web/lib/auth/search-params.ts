/** Page `searchParams` as Next.js passes them. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The first value of a query parameter, or null. */
export function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
