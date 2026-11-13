import { defineConfig } from "drizzle-kit";

/**
 * Generating migrations needs no database. Studio does, and uses a direct
 * connection when one is configured.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "",
  },
});
