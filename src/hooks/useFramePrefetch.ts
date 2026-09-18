import { useEffect } from "preact/hooks";
import { isPlaying, currentSegmentIndex } from "../stores/playbackStore";
import { renderPlan, sources } from "../stores/projectStore";
import { prefetchFrame } from "../lib/assetCache";
import { PREFETCH_AHEAD, PREFETCH_BEHIND } from "../lib/settings";

/**
 * Decode the layers of the segments around the playhead: next 8 / previous 4 while
 * playing, ±2 when paused (scrubbing / stepping). Nearest segments first.
 */
export function useFramePrefetch(): void {
  const playing = isPlaying.value;
  const position = currentSegmentIndex.value;
  const plan = renderPlan.value;
  const srcList = sources.value;

  useEffect(() => {
    const n = plan.segments.length;
    if (n === 0 || position < 0) return;

    const ahead = playing ? PREFETCH_AHEAD : 2;
    const behind = playing ? PREFETCH_BEHIND : 2;
    const seen = new Set<number>();
    for (let d = 0; d <= Math.max(ahead, behind); d++) {
      for (const offset of d === 0 ? [0] : [d, -d]) {
        if (offset > ahead || -offset > behind) continue;
        const k = (((position + offset) % n) + n) % n;
        if (seen.has(k)) continue;
        seen.add(k);
        for (const frame of plan.segments[k].layers) {
          const crop = srcList.find((s) => s.id === frame.sourceId)?.crop ?? null;
          prefetchFrame(frame.framePath, crop).catch(() => {});
        }
      }
    }
  }, [playing, position, plan, srcList]);
}
