/**
 * video:put: adds a lecture video to content storage, at `video/<video_key>`,
 * where a course's `video_key` points (docs/specs/10-secondary-features.md §5).
 * The repository ships no videos; each instance adds its own.
 *
 *   bun run video:put <file.mp4> <video_key>
 *
 * The command runs in apps/backend, so give the file as an absolute path.
 *
 * Exit code 0 on success, 1 on failure, 2 on bad arguments or a file that is
 * not an MP4.
 */
import { videoKeySchema, videoObjectKey } from "@repo/content";
import { createStorage } from "@repo/storage";
import { parseArgs } from "node:util";
import { describeStorage } from "../adapters/content";
import { looksLikeMp4 } from "../lib/mp4";
import { loadConfigOrExit } from "../load-config";

const { positionals } = parseArgs({ allowPositionals: true, strict: true });
const [file, videoKey] = positionals;
const key = videoKeySchema.safeParse(videoKey);
if (positionals.length !== 2 || !file || !key.success) {
  console.error("Usage: bun run video:put </absolute/path/to/file.mp4> <video_key>");
  if (!key.success && videoKey !== undefined) {
    console.error(`video_key ${key.error.issues[0]?.message ?? "is invalid"}`);
  }
  process.exit(2);
}

const source = Bun.file(file);
if (!(await source.exists())) {
  console.error(`video:put: ${file} does not exist`);
  process.exit(2);
}
const body = new Uint8Array(await source.arrayBuffer());
if (!looksLikeMp4(body)) {
  console.error(`video:put: ${file} is not an MP4 file`);
  process.exit(2);
}

const config = loadConfigOrExit();
const target = videoObjectKey(key.data);
await createStorage(config.storage).put(target, body, { contentType: "video/mp4" });
console.log(
  `video:put: ${target} (${(body.byteLength / 1024 / 1024).toFixed(1)} MB) → ${describeStorage(config)}`,
);
