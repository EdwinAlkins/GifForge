import { signal, computed } from "@preact/signals";
import { timeline } from "./projectStore";
import { maxTrackIndex, ZOOM_MIN, ZOOM_MAX } from "../lib/timelineLayout";

/** Horizontal zoom factor for timeline clips. */
export const timelineZoom = signal(1);

/** Number of visible track rows (lanes). */
export const trackCount = signal(1);

/** Active marquee selection rectangle in content coordinates, or null. */
export const marqueeRect = signal<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null>(null);

/** Group drag: ids being moved + drop indicator. */
export const dragState = signal<{
  frameIds: string[];
  dropTrack: number | null;
  dropBeforeGlobalIndex: number | null;
} | null>(null);

export const effectiveTrackCount = computed(() =>
  Math.max(trackCount.value, maxTrackIndex(timeline.value) + 1),
);

export function zoomIn(): void {
  timelineZoom.value = Math.min(ZOOM_MAX, +(timelineZoom.value + 0.15).toFixed(2));
}

export function zoomOut(): void {
  timelineZoom.value = Math.max(ZOOM_MIN, +(timelineZoom.value - 0.15).toFixed(2));
}

export function setZoom(value: number): void {
  timelineZoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

export function resetZoom(): void {
  timelineZoom.value = 1;
}

export function addTrack(): void {
  trackCount.value += 1;
}

export function removeEmptyTrack(): void {
  if (trackCount.value <= 1) return;
  trackCount.value -= 1;
}
