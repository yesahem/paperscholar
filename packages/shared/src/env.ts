import { z } from "zod";

/**
 * Error message builder for required string variables: "is required" when
 * absent, otherwise `invalid`.
 */
export const requiredOr =
  (invalid: string) =>
  (issue: { input?: unknown }): string =>
    issue.input === undefined ? "is required" : invalid;

/**
 * An http(s) origin with no path, query or fragment, such as
 * `https://example.com`. A trailing slash is accepted and removed.
 */
export const httpOriginSchema = z
  .string({ error: requiredOr("must be a string") })
  .trim()
  .pipe(z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }))
  .refine(
    (value) => {
      // Zod 4 runs refinements even after z.url() fails; that failure is already reported.
      if (!URL.canParse(value)) return true;
      const url = new URL(value);
      return url.pathname === "/" && !url.search && !url.hash;
    },
    { error: "must be an origin such as https://example.com, without a path" },
  )
  .transform((value) => new URL(value).origin);

/** Thrown when an app's environment is missing or has invalid variables. */
export class EnvError extends Error {
  constructor(
    readonly problems: string[],
    readonly app: string,
    readonly exampleFile: string,
  ) {
    super(
      `Invalid ${app} environment configuration:\n${problems
        .map((problem) => `  - ${problem}`)
        .join("\n")}\nSee ${exampleFile}.`,
    );
    this.name = "EnvError";
  }
}

export interface ParseEnvOptions {
  /** App name used in the error message, e.g. "backend". */
  app: string;
  /** Where the documented variables live, e.g. "apps/backend/.env.example". */
  exampleFile: string;
}

/**
 * Validates environment variables against `schema`. Only the schema's keys are
 * read, and blank values count as unset so defaults apply. Every problem is
 * reported at once, each naming its variable.
 */
export function parseEnv<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  source: Record<string, string | undefined>,
  { app, exampleFile }: ParseEnvOptions,
): z.output<z.ZodObject<Shape>> {
  const cleaned: Record<string, string | undefined> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = source[key];
    cleaned[key] = value === undefined || value.trim() === "" ? undefined : value;
  }

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`),
      app,
      exampleFile,
    );
  }
  return result.data;
}
