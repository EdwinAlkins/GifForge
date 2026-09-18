import type { RefObject } from "preact";
import { seek } from "../../stores/playbackStore";
import { MS_PER_CS } from "../../lib/timelineModel";
import {
  RULER_HEIGHT,
  TRACK_LABEL_WIDTH,
  pxPerCs,
  rulerLabel,
  rulerStepCs,
  timeToX,
  xToTime,
} from "../../lib/timelineGeometry";

/**
 * Pointer handler that seeks to the pointer and keeps seeking while dragged (scrub).
 * `contentRef` is the scrolled timeline content, whose x origin is time 0 minus labels.
 */
export function scrubHandler(contentRef: RefObject<HTMLDivElement>, pxPerSec: number) {
  return (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const seekAt = (clientX: number) => {
      const el = contentRef.current;
      if (!el) return;
      const x = clientX - el.getBoundingClientRect().left;
      seek(Math.max(0, xToTime(x, pxPerSec)) * MS_PER_CS);
    };
    seekAt(e.clientX);
    const move = (ev: PointerEvent) => seekAt(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

interface Props {
  contentRef: RefObject<HTMLDivElement>;
  pxPerSec: number;
  scrollLeft: number;
  viewportWidth: number;
}

/** Time ruler with a graduation adapted to the zoom; only visible ticks are rendered. */
export function TimeRuler({ contentRef, pxPerSec, scrollLeft, viewportWidth }: Props) {
  const ppc = pxPerCs(pxPerSec);
  const step = rulerStepCs(pxPerSec);
  const minorDiv = step % 5 === 0 ? 5 : 2;
  const minor = step / minorDiv;
  const showMinor = minor * ppc >= 6;

  const from = Math.max(0, Math.floor(xToTime(scrollLeft, pxPerSec) / step) * step);
  const to = xToTime(scrollLeft + viewportWidth, pxPerSec) + step;
  const ticks: { t: number; major: boolean }[] = [];
  const unit = showMinor ? minor : step;
  for (let t = from; t <= to; t += unit) {
    const tr = Math.round(t * 100) / 100;
    ticks.push({ t: tr, major: Math.abs(tr / step - Math.round(tr / step)) < 1e-6 });
  }

  return (
    <div
      class="sticky top-0 z-20 cursor-col-resize select-none border-b border-edge bg-panel text-[9px] text-neutral-500"
      style={{ height: `${RULER_HEIGHT}px` }}
      onPointerDown={scrubHandler(contentRef, pxPerSec)}
    >
      {ticks.map(({ t, major }) => (
        <div
          key={t}
          class={`absolute bottom-0 w-px ${major ? "h-2.5 bg-neutral-500" : "h-1.5 bg-neutral-700"}`}
          style={{ left: `${timeToX(t, pxPerSec)}px` }}
        >
          {major && (
            <span class="absolute bottom-2.5 left-1 whitespace-nowrap tabular-nums">
              {rulerLabel(t, step)}
            </span>
          )}
        </div>
      ))}
      <div
        class="absolute left-0 top-0 h-full border-r border-edge bg-panel"
        style={{ width: `${TRACK_LABEL_WIDTH}px`, transform: `translateX(${scrollLeft}px)` }}
      />
    </div>
  );
}
