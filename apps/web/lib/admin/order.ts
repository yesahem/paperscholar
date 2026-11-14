/** Moves the item at `index` by `offset` within `list`; out-of-range moves change nothing. */
export function moved<T>(list: readonly T[], index: number, offset: number): T[] {
  const target = index + offset;
  if (target < 0 || target >= list.length || index < 0 || index >= list.length)
    return [...list];
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}
