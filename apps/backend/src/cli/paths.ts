import { resolve } from "node:path";

/** The repository's content library: <repo>/content. */
export const DEFAULT_CONTENT_ROOT = resolve(import.meta.dir, "../../../../content");
