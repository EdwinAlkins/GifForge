import type { TimelineFrame } from "./types";

/** Base clip width in px at zoom 1. */
export const BASE_CLIP_WIDTH = 72;
export const CLIP_GAP = 4;
export const TRACK_LABEL_WIDTH = 56;
export const TRACK_HEIGHT = 88;
export const RULER_HEIGHT = 22;

export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 0.15;

export function clipWidth(zoom: number): number {
  return Math.round(BASE_CLIP_WIDTH * zoom);
}

export function clipHeight(zoom: number): number {
  return Math.round((TRACK_HEIGHT - 8) * Math.min(1.2, zoom));
}

export interface ClipLayout {
  frameId: string;
  trackIndex: number;
  indexInTrack: number;
  globalIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function frameTrack(f: TimelineFrame): number {
  return f.trackIndex ?? 0;
}

/** Build clip layouts for all frames grouped by track. */
export function buildClipLayouts(
  frames: TimelineFrame[],
  trackCount: number,
  zoom: number,
): ClipLayout[] {
  const w = clipWidth(zoom);
  const h = clipHeight(zoom);
  const layouts: ClipLayout[] = [];
  const trackIndices = new Array(trackCount).fill(0);

  for (let globalIndex = 0; globalIndex < frames.length; globalIndex++) {
    const f = frames[globalIndex];
    const t = frameTrack(f);
    if (t >= trackCount) continue;

    const indexInTrack = trackIndices[t]++;
    layouts.push({
      frameId: f.id,
      trackIndex: t,
      indexInTrack,
      globalIndex,
      x: TRACK_LABEL_WIDTH + indexInTrack * (w + CLIP_GAP),
      y: RULER_HEIGHT + t * TRACK_HEIGHT,
      width: w,
      height: h,
    });
  }
  return layouts;
}

export function contentWidth(frames: TimelineFrame[], trackCount: number, zoom: number): number {
  const w = clipWidth(zoom);
  const counts = new Array(trackCount).fill(0);

  for (const f of frames) {
    const t = frameTrack(f);
    if (t < trackCount) counts[t]++;
  }

  const maxCols = Math.max(0, ...counts);
  return TRACK_LABEL_WIDTH + maxCols * (w + CLIP_GAP) + 48;
}

export function contentHeight(trackCount: number): number {
  return RULER_HEIGHT + trackCount * TRACK_HEIGHT + 8;
}

/** Normalized marquee rect (positive w/h). */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): MarqueeRect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export function rectsIntersect(a: MarqueeRect, b: MarqueeRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function framesInMarquee(
  layouts: ClipLayout[],
  marquee: MarqueeRect,
): string[] {
  return layouts
    .filter((l) =>
      rectsIntersect(marquee, {
        x: l.x,
        y: l.y,
        width: l.width,
        height: l.height,
      }),
    )
    .map((l) => l.frameId);
}

/** Find drop target from content coordinates. */
export function dropTargetAt(
  frames: TimelineFrame[],
  trackCount: number,
  zoom: number,
  contentX: number,
  contentY: number,
): { trackIndex: number; insertBeforeGlobalIndex: number } {
  const trackIndex = Math.max(
    0,
    Math.min(trackCount - 1, Math.floor((contentY - RULER_HEIGHT) / TRACK_HEIGHT)),
  );

  const w = clipWidth(zoom);
  const relX = contentX - TRACK_LABEL_WIDTH;

  const onTrack: { globalIndex: number }[] = [];
  for (let i = 0; i < frames.length; i++) {
    if (frameTrack(frames[i]) === trackIndex) {
      onTrack.push({ globalIndex: i });
    }
  }

  if (onTrack.length === 0 || relX < 0) {
    return { trackIndex, insertBeforeGlobalIndex: frames.length };
  }

  const slot = Math.round(relX / (w + CLIP_GAP));
  if (slot >= onTrack.length) {
    const last = onTrack[onTrack.length - 1];
    return { trackIndex, insertBeforeGlobalIndex: last.globalIndex + 1 };
  }

  return { trackIndex, insertBeforeGlobalIndex: onTrack[slot].globalIndex };
}

/** Export order: track 0 → 1 → …, preserving order within each track. */
export function sortFramesForExport(frames: TimelineFrame[]): TimelineFrame[] {
  return frames
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const ta = frameTrack(a.f);
      const tb = frameTrack(b.f);
      return ta !== tb ? ta - tb : a.i - b.i;
    })
    .map(({ f }) => f);
}

export function maxTrackIndex(frames: TimelineFrame[]): number {
  if (frames.length === 0) return 0;
  return Math.max(...frames.map(frameTrack));
}
