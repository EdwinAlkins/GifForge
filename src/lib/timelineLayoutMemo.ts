import type { TimelineFrame } from "./types";
import { buildClipLayouts, contentWidth, type ClipLayout } from "./timelineLayout";

let cached: {
  key: string;
  layouts: ClipLayout[];
  width: number;
} | null = null;

function layoutKey(frames: TimelineFrame[], trackCount: number, zoom: number): string {
  return `${frames.length}:${frames.map((f) => f.id).join(",")}|${trackCount}|${zoom}`;
}

export function memoClipLayouts(
  frames: TimelineFrame[],
  trackCount: number,
  zoom: number,
): ClipLayout[] {
  const key = layoutKey(frames, trackCount, zoom);
  if (cached?.key === key) return cached.layouts;
  const layouts = buildClipLayouts(frames, trackCount, zoom);
  cached = { key, layouts, width: contentWidth(frames, trackCount, zoom) };
  return layouts;
}

export function memoContentWidth(
  frames: TimelineFrame[],
  trackCount: number,
  zoom: number,
): number {
  const key = layoutKey(frames, trackCount, zoom);
  if (cached?.key === key) return cached.width;
  memoClipLayouts(frames, trackCount, zoom);
  return cached!.width;
}

export function invalidateLayoutMemo(): void {
  cached = null;
}
