import type { ClipLayout } from "./timelineLayout";

/** Return clip layouts intersecting the horizontal viewport (plus buffer). */
export function visibleLayouts(
  layouts: ClipLayout[],
  scrollLeft: number,
  viewportWidth: number,
  bufferPx: number,
): ClipLayout[] {
  const minX = scrollLeft - bufferPx;
  const maxX = scrollLeft + viewportWidth + bufferPx;
  return layouts.filter((l) => l.x + l.width >= minX && l.x <= maxX);
}

/** Visible ruler tick indices for lazy ruler rendering. */
export function visibleRulerTicks(
  scrollLeft: number,
  viewportWidth: number,
  labelWidth: number,
  slotWidth: number,
  totalSlots: number,
): number[] {
  if (totalSlots <= 0) return [];
  const relStart = Math.max(0, scrollLeft - labelWidth);
  const relEnd = relStart + viewportWidth + slotWidth;
  const first = Math.max(0, Math.floor(relStart / slotWidth));
  const last = Math.min(totalSlots - 1, Math.ceil(relEnd / slotWidth));
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(i);
  return ticks;
}
