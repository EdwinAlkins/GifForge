import { signal, computed } from "@preact/signals";
import { timelineModel, type FrameDropTarget } from "./projectStore";
import { PX_PER_SEC_DEFAULT, PX_PER_SEC_MAX, PX_PER_SEC_MIN } from "../lib/timelineGeometry";

/** Horizontal zoom: pixels per second of timeline. */
export const pxPerSec = signal(PX_PER_SEC_DEFAULT);

/** Number of track rows the user asked for (at least the tracks in use are shown). */
export const trackCount = signal(2);

export const effectiveTrackCount = computed(() =>
  Math.max(trackCount.value, timelineModel.value.tracks.length),
);

/** Active marquee selection rectangle in content coordinates, or null. */
export const marqueeRect = signal<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);

/** In-progress drag: whole clips along time/tracks, or frames to a drop point. */
export type DragState =
  | { kind: "clips"; clipIds: Set<string>; deltaCs: number; deltaTrack: number; valid: boolean }
  | { kind: "frames"; frameIds: Set<string>; target: FrameDropTarget | null };

export const dragState = signal<DragState | null>(null);

export function clampPxPerSec(value: number): number {
  return Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, value));
}

export function zoomIn(): void {
  pxPerSec.value = clampPxPerSec(pxPerSec.value * 1.5);
}

export function zoomOut(): void {
  pxPerSec.value = clampPxPerSec(pxPerSec.value / 1.5);
}

export function resetZoom(): void {
  pxPerSec.value = PX_PER_SEC_DEFAULT;
}

export function addTrack(): void {
  trackCount.value = effectiveTrackCount.value + 1;
}
