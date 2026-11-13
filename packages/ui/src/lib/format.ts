const UNITS = ["B", "KB", "MB", "GB"] as const;

/**
 * Formats a byte count for people: 0 B, 512 B, 1.5 KB, 30 MB.
 * Uses binary multiples (1 KB = 1024 B), matching how browsers report file sizes.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`formatBytes: expected a non-negative number, got ${bytes}`);
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}
