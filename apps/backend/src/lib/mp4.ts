/**
 * Whether `bytes` start like an MP4 (ISO base media) file: a box size, then
 * the `ftyp` box type. Checked by signature, not by extension
 * (docs/specs/11-security-ops.md §4).
 */
export function looksLikeMp4(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const type = String.fromCharCode(...bytes.subarray(4, 8));
  return type === "ftyp";
}
