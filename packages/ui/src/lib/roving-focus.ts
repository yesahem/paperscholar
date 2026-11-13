/**
 * Index of the item to focus after a key press in a one-dimensional list of
 * `count` items, following the WAI-ARIA tabs pattern: arrow keys move and
 * wrap, Home and End jump to the ends. Returns null for any other key.
 */
export function nextRovingIndex(
  current: number,
  key: string,
  count: number,
  orientation: "horizontal" | "vertical" = "horizontal",
): number | null {
  if (count <= 0) return null;
  const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  switch (key) {
    case previousKey:
      return (current - 1 + count) % count;
    case nextKey:
      return (current + 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
