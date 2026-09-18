import { signal, computed } from "@preact/signals";
import { renderPlan, timelineModel, splitClipsAt, clipsWithSelection } from "./projectStore";
import { MS_PER_CS, segmentIndexAt } from "../lib/timelineModel";

/** Playhead position — the single source of truth for playback and seeking. */
export const currentTimeMs = signal<number>(0);

export const isPlaying = signal<boolean>(false);

/** Segment under the playhead (-1 if the timeline is empty). */
export const currentSegmentIndex = computed(() =>
  segmentIndexAt(renderPlan.value, currentTimeMs.value / MS_PER_CS),
);

/**
 * Frames visible at the playhead, bottom track first. Changes once per segment, not on
 * every playback tick.
 */
export const currentLayers = computed(
  () => renderPlan.value.segments[currentSegmentIndex.value]?.layers ?? [],
);

export function togglePlay(): void {
  isPlaying.value = !isPlaying.value;
}

export function stop(): void {
  isPlaying.value = false;
  currentTimeMs.value = 0;
}

/** Move the playhead, clamped to [0, end of timeline). */
export function seek(timeMs: number): void {
  const totalMs = renderPlan.value.totalCs * MS_PER_CS;
  currentTimeMs.value = totalMs > 0 ? Math.min(Math.max(0, timeMs), totalMs - 1) : 0;
}

/** Move the playhead to the start of a frame. */
export function seekToFrame(frameId: string): void {
  const loc = timelineModel.value.frameById.get(frameId);
  if (loc) currentTimeMs.value = loc.clip.frameStarts[loc.index] * MS_PER_CS;
}

/** Step `delta` segments (visible-frame changes) forward/backward, wrapping around. */
export function stepFrame(delta: number): void {
  const plan = renderPlan.value;
  const n = plan.segments.length;
  if (n === 0) return;
  const k = (((currentSegmentIndex.value + delta) % n) + n) % n;
  currentTimeMs.value = plan.starts[k] * MS_PER_CS;
}

/** Split the selected clips at the playhead, or every clip under it if none is selected. */
export function splitAtPlayhead(): void {
  splitClipsAt(currentTimeMs.value / MS_PER_CS, clipsWithSelection());
}
