/**
 * Copies the Monaco editor's files into public/monaco/, so the editor loads
 * from this origin and the Content-Security-Policy needs no third-party
 * source (docs/specs/08-web.md §5.2). Runs before `dev` and `build`; skips the
 * copy when the installed version is already there.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("monaco-editor/package.json");
const { version } = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
  version: string;
};

const source = join(dirname(packageJsonPath), "min", "vs");
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "monaco");
const marker = join(target, "VERSION");

const installed = await readFile(marker, "utf8").catch(() => null);
if (installed?.trim() === version) {
  console.log(`monaco-editor ${version} already in public/monaco`);
} else {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(source, join(target, "vs"), { recursive: true });
  await writeFile(marker, `${version}\n`);
  console.log(`copied monaco-editor ${version} to public/monaco`);
}
