/// <reference path="./text-modules.d.ts" />
import conftestSource from "../harness/conftest.py" with { type: "text" };
import harnessSource from "../harness/harness.py" with { type: "text" };
import type { RunFile } from "./types";

/**
 * The harness, bundled as text so every provider can upload it into a sandbox
 * without reading the file system at run time.
 */
export const HARNESS_FILES: readonly RunFile[] = [
  { path: "harness.py", content: harnessSource },
  { path: "conftest.py", content: conftestSource },
];
