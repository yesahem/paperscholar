/** How far one arrow key moves a divider, in percent of the container. */
export const RESIZE_STEP = 5;

export interface SplitBounds {
  min: number;
  max: number;
}

/** `value` kept within the bounds, rounded to a tenth of a percent. */
export function clampSplit(value: number, { min, max }: SplitBounds): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

/**
 * The split after a key press on the divider, following the WAI-ARIA window
 * splitter pattern: arrows move it, Home and End jump to the bounds. Null for
 * any other key.
 */
export function nextSplit(
  current: number,
  key: string,
  bounds: SplitBounds,
): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowUp":
      return clampSplit(current - RESIZE_STEP, bounds);
    case "ArrowRight":
    case "ArrowDown":
      return clampSplit(current + RESIZE_STEP, bounds);
    case "Home":
      return bounds.min;
    case "End":
      return bounds.max;
    default:
      return null;
  }
}

/** The split for a pointer at `clientX` over a container spanning `left` to `left + width`. */
export function splitAtPointer(
  clientX: number,
  left: number,
  width: number,
  bounds: SplitBounds,
): number {
  if (width <= 0) return bounds.min;
  return clampSplit(((clientX - left) / width) * 100, bounds);
}
