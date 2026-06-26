import { useEffect } from "preact/hooks";
import { isPlaying, currentFrameIndex } from "../stores/playbackStore";
import { timeline } from "../stores/projectStore";

/**
 * Drift-corrected playback using a single rAF loop (no per-frame effect restart).
 */
export function usePlayback(): void {
  const playing = isPlaying.value;
  const frames = timeline.value;

  useEffect(() => {
    if (!playing || frames.length === 0) return;

    let rafId: number;
    let lastTs: number | null = null;
    let debtMs = 0;
    let localIndex = currentFrameIndex.value % frames.length;
    const frameCount = frames.length;

    const durationMs = (i: number) =>
      Math.max(20, (frames[i]?.durationCs ?? 10) * 10);

    const tick = (timestamp: number) => {
      if (lastTs === null) lastTs = timestamp;
      debtMs += timestamp - lastTs;
      lastTs = timestamp;

      while (frameCount > 0 && debtMs >= durationMs(localIndex)) {
        debtMs -= durationMs(localIndex);
        localIndex = (localIndex + 1) % frameCount;
        currentFrameIndex.value = localIndex;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, frames]);
}
