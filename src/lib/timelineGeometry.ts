/** Pixel geometry of the time-based timeline. Time is in centiseconds (GIF units). */

export const TRACK_LABEL_WIDTH = 56;
export const TRACK_HEIGHT = 72;
export const RULER_HEIGHT = 24;
export const CLIP_HEADER_HEIGHT = 16;
export const CLIP_PADDING_Y = 4;

/** Zoom range in pixels per second. */
export const PX_PER_SEC_MIN = 4;
export const PX_PER_SEC_MAX = 6000;
export const PX_PER_SEC_DEFAULT = 200;

/** Individual frame cells are drawn when a clip's average frame is at least this wide. */
export const FRAME_MODE_MIN_PX = 28;

/** Snap distance for clip edges / playhead while dragging. */
export const SNAP_PX = 8;

export function pxPerCs(pxPerSec: number): number {
  return pxPerSec / 100;
}

/** Content x of time `tCs`. */
export function timeToX(tCs: number, pxPerSec: number): number {
  return TRACK_LABEL_WIDTH + tCs * pxPerCs(pxPerSec);
}

/** Time (cs) at content x. */
export function xToTime(x: number, pxPerSec: number): number {
  return (x - TRACK_LABEL_WIDTH) / pxPerCs(pxPerSec);
}

/** Tracks are drawn highest on top (V1 at the bottom), like in video editors. */
export function trackTop(trackIndex: number, trackCount: number): number {
  return RULER_HEIGHT + (trackCount - 1 - trackIndex) * TRACK_HEIGHT;
}

/** Track under content y, clamped to existing tracks. */
export function trackAtY(y: number, trackCount: number): number {
  const row = Math.floor((y - RULER_HEIGHT) / TRACK_HEIGHT);
  return Math.max(0, Math.min(trackCount - 1, trackCount - 1 - row));
}

/** Ruler step (cs) so that labels are at least `minPx` apart. */
const RULER_STEPS_CS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 6000, 12000, 30000, 60000];

export function rulerStepCs(pxPerSec: number, minPx = 80): number {
  const ppc = pxPerCs(pxPerSec);
  return RULER_STEPS_CS.find((s) => s * ppc >= minPx) ?? RULER_STEPS_CS[RULER_STEPS_CS.length - 1];
}

/** Ruler label: seconds with the precision the step needs. */
export function rulerLabel(tCs: number, stepCs: number): string {
  const totalS = tCs / 100;
  const m = Math.floor(totalS / 60);
  const s = totalS - m * 60;
  const decimals = stepCs < 10 ? 2 : stepCs < 100 ? 1 : 0;
  const sText = s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, "0");
  return `${String(m).padStart(2, "0")}:${sText}`;
}
