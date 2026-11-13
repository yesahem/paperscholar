/**
 * Second step of `bun run auth:schema`. Better Auth's generator declares
 * `timestamp without time zone` columns, which Bun.sql reads as local time:
 * on a host outside UTC every session and token expiry would come back
 * shifted. This turns each one into `timestamptz`, as every table in this
 * project uses (docs/specs/04-database.md §2).
 *
 *   bun scripts/auth-schema-timestamptz.ts <generated schema file>
 */
const path = process.argv[2];
if (!path) {
  console.error("Usage: bun scripts/auth-schema-timestamptz.ts <schema file>");
  process.exit(2);
}

const source = await Bun.file(path).text();
const converted = source.replace(
  /timestamp\("([a-z_]+)"\)/g,
  'timestamp("$1", { withTimezone: true })',
);
if (/timestamp\("[a-z_]+"\)/.test(converted)) {
  console.error("auth:schema: a timestamp column was left without a time zone.");
  process.exit(1);
}
await Bun.write(path, converted);
