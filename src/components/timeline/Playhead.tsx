import { useLayoutEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { currentTimeMs, isPlaying } from "../../stores/playbackStore";
import { MS_PER_CS } from "../../lib/timelineModel";
import { RULER_HEIGHT, TRACK_LABEL_WIDTH, timeToX } from "../../lib/timelineGeometry";
import { scrubHandler } from "./TimeRuler";

interface Props {
  contentRef: RefObject<HTMLDivElement>;
  viewportRef: RefObject<HTMLDivElement>;
  pxPerSec: number;
  height: number;
}

/**
 * Vertical playhead across all tracks, draggable by its handle in the ruler. It is the
 * only timeline component subscribed to `currentTimeMs`, so playback re-renders just it.
 */
export function Playhead({ contentRef, viewportRef, pxPerSec, height }: Props) {
  const x = timeToX(currentTimeMs.value / MS_PER_CS, pxPerSec);
  const playing = isPlaying.value;

  // Page-flip autoscroll while playing, so the playhead stays in view.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !playing) return;
    const left = vp.scrollLeft + TRACK_LABEL_WIDTH;
    const right = vp.scrollLeft + vp.clientWidth - 24;
    if (x < left || x > right) vp.scrollLeft = x - TRACK_LABEL_WIDTH - 24;
  }, [x, playing]);

  return (
    <div
      class="pointer-events-none absolute top-0 z-30"
      style={{ left: `${x}px`, height: `${height}px` }}
    >
      <div class="absolute top-0 h-full w-px -translate-x-1/2 bg-red-500" />
      <div
        class="pointer-events-auto absolute top-0 h-0 w-0 -translate-x-1/2 cursor-col-resize border-x-[6px] border-t-[9px] border-x-transparent border-t-red-500"
        style={{ marginTop: `${RULER_HEIGHT - 10}px` }}
        onPointerDown={scrubHandler(contentRef, pxPerSec)}
      />
    </div>
  );
}
