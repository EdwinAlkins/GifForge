import { useEffect } from "preact/hooks";
import { isPlaying, currentFrameIndex } from "../stores/playbackStore";
import { timeline, sources } from "../stores/projectStore";
import { loadFrameUrl } from "../lib/assetCache";

import { PREFETCH_RADIUS } from "../lib/settings";

/**
 * Prefetch ±8 frames around the playhead while playing (or on seek).
 * Cancels naturally when indices leave the window via LRU eviction.
 */
export function useFramePrefetch(): void {
  const playing = isPlaying.value;
  const index = currentFrameIndex.value;
  const frames = timeline.value;
  const srcList = sources.value;

  useEffect(() => {
    if (frames.length === 0) return;

    const indices = new Set<number>();
    const radius = playing ? PREFETCH_RADIUS : 2;
    for (let d = -radius; d <= radius; d++) {
      const i = (index + d + frames.length * 2) % frames.length;
      indices.add(i);
    }

    for (const i of indices) {
      const frame = frames[i];
      if (!frame) continue;
      const src = srcList.find((s) => s.id === frame.sourceId);
      const crop = src?.crop ?? null;
      loadFrameUrl(frame.framePath, crop).catch(() => {});
    }
  }, [playing, index, frames, srcList]);
}
