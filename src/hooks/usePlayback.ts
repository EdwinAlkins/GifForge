import { useEffect } from "preact/hooks";
import { isPlaying, currentTimeMs } from "../stores/playbackStore";
import { renderPlan } from "../stores/projectStore";
import { MS_PER_CS } from "../lib/timelineModel";

/**
 * Time-based playback: a single rAF loop advances `currentTimeMs` by the real elapsed
 * time; the displayed frame is derived from it, so timing matches the exported GIF.
 */
export function usePlayback(): void {
  const playing = isPlaying.value;

  useEffect(() => {
    if (!playing) return;

    let rafId: number;
    let lastTs: number | null = null;

    const tick = (timestamp: number) => {
      const total = renderPlan.peek().totalCs * MS_PER_CS;
      if (lastTs !== null && total > 0) {
        currentTimeMs.value = (currentTimeMs.peek() + timestamp - lastTs) % total;
      }
      lastTs = timestamp;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);
}
