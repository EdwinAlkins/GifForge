import { useRef, useEffect, useState } from "preact/hooks";
import {
  timeline,
  selectedFrameIds,
  selectedSourceId,
  selectFrameRange,
  clearFrameSelection,
  moveSelectedFrames,
  toggleFrameSelection,
} from "../../stores/projectStore";
import { currentFrameIndex } from "../../stores/playbackStore";
import {
  timelineZoom,
  effectiveTrackCount,
  marqueeRect,
  dragState,
} from "../../stores/timelineViewStore";
import {
  contentHeight,
  normalizeRect,
  framesInMarquee,
  dropTargetAt,
  TRACK_LABEL_WIDTH,
  TRACK_HEIGHT,
  RULER_HEIGHT,
  clipWidth,
  CLIP_GAP,
  type ClipLayout,
} from "../../lib/timelineLayout";
import { memoClipLayouts, memoContentWidth } from "../../lib/timelineLayoutMemo";
import { visibleLayouts, visibleRulerTicks } from "../../lib/timelineVirtual";
import { perfDev } from "../../lib/perfDev";
import { FrameClip } from "./FrameClip";
import { TimelineToolbar } from "./TimelineToolbar";
import { FrameDurationEditor } from "./FrameDurationEditor";
import { PlayheadIndicator } from "./PlayheadIndicator";

/** Multi-track NLE timeline with zoom, lasso selection, virtualized clips, and group drag. */
export function TimelinePanel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const isMarquee = useRef(false);
  const clipDragStart = useRef<{
    startX: number;
    startY: number;
    layout: ClipLayout;
    ids: string[];
  } | null>(null);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);

  const frames = timeline.value;
  const zoom = timelineZoom.value;
  const tracks = effectiveTrackCount.value;
  const t0 = performance.now();
  const layouts = memoClipLayouts(frames, tracks, zoom);
  perfDev.recordLayoutMs(performance.now() - t0);
  perfDev.bumpTimelineRender();

  const cw = memoContentWidth(frames, tracks, zoom);
  const ch = contentHeight(tracks);
  const marquee = marqueeRect.value;
  const drag = dragState.value;
  const w = clipWidth(zoom);
  const slotWidth = w + CLIP_GAP;
  const bufferPx = slotWidth * 10;

  const visible =
    frames.length > 0
      ? visibleLayouts(layouts, scrollLeft, viewportWidth, bufferPx)
      : [];

  const playheadIndex = currentFrameIndex.value;
  const showPlayhead = selectedSourceId.value === null && frames.length > 0;
  const playheadLayout =
    showPlayhead ? layouts.find((l) => l.globalIndex === playheadIndex) ?? null : null;

  const totalRulerSlots = Math.ceil((cw - TRACK_LABEL_WIDTH) / slotWidth);
  const rulerTicks = visibleRulerTicks(
    scrollLeft,
    viewportWidth,
    TRACK_LABEL_WIDTH,
    slotWidth,
    totalRulerSlots,
  );

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onScroll = () => setScrollLeft(vp.scrollLeft);
    const ro = new ResizeObserver(() => setViewportWidth(vp.clientWidth));
    onScroll();
    ro.observe(vp);
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      vp.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (isMarquee.current && marqueeStart.current && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const sl = viewportRef.current?.scrollLeft ?? 0;
        const st = viewportRef.current?.scrollTop ?? 0;
        const x1 = e.clientX - rect.left + sl;
        const y1 = e.clientY - rect.top + st;
        marqueeRect.value = normalizeRect(
          marqueeStart.current.x,
          marqueeStart.current.y,
          x1,
          y1,
        );
        return;
      }

      const d = dragState.value;
      if (d && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const sl = viewportRef.current?.scrollLeft ?? 0;
        const st = viewportRef.current?.scrollTop ?? 0;
        const cx = e.clientX - rect.left + sl;
        const cy = e.clientY - rect.top + st;
        const target = dropTargetAt(
          timeline.value,
          effectiveTrackCount.value,
          timelineZoom.value,
          cx,
          cy,
        );
        dragState.value = {
          ...d,
          dropTrack: target.trackIndex,
          dropBeforeGlobalIndex: target.insertBeforeGlobalIndex,
        };
        return;
      }

      const cds = clipDragStart.current;
      if (cds && !dragState.value) {
        if (Math.hypot(e.clientX - cds.startX, e.clientY - cds.startY) >= 5) {
          dragState.value = {
            frameIds: cds.ids,
            dropTrack: cds.layout.trackIndex,
            dropBeforeGlobalIndex: cds.layout.globalIndex,
          };
        }
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (isMarquee.current && marqueeStart.current) {
        const m = marqueeRect.value;
        const currentLayouts = memoClipLayouts(
          timeline.value,
          effectiveTrackCount.value,
          timelineZoom.value,
        );
        if (m && (m.width > 4 || m.height > 4)) {
          selectFrameRange(framesInMarquee(currentLayouts, m), e.shiftKey);
        } else if (!e.shiftKey) {
          clearFrameSelection();
        }
        isMarquee.current = false;
        marqueeStart.current = null;
        marqueeRect.value = null;
      }

      const d = dragState.value;
      if (d) {
        if (
          d.dropTrack !== null &&
          d.dropBeforeGlobalIndex !== null &&
          d.frameIds.length > 0
        ) {
          selectedFrameIds.value = new Set(d.frameIds);
          moveSelectedFrames(d.dropTrack, d.dropBeforeGlobalIndex);
        }
        dragState.value = null;
      }

      clipDragStart.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  function onViewportPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-frame-id]")) return;

    const content = contentRef.current;
    if (!content) return;

    const rect = content.getBoundingClientRect();
    const sl = viewportRef.current?.scrollLeft ?? 0;
    const st = viewportRef.current?.scrollTop ?? 0;
    marqueeStart.current = {
      x: e.clientX - rect.left + sl,
      y: e.clientY - rect.top + st,
    };
    isMarquee.current = true;
    marqueeRect.value = {
      x: marqueeStart.current.x,
      y: marqueeStart.current.y,
      width: 0,
      height: 0,
    };
    if (!e.shiftKey) clearFrameSelection();
  }

  function onClipPointerDown(e: PointerEvent, layout: ClipLayout) {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (!selectedFrameIds.value.has(layout.frameId) && !e.shiftKey) {
      selectedFrameIds.value = new Set([layout.frameId]);
    } else if (e.shiftKey) {
      toggleFrameSelection(layout.frameId, true);
    }

    currentFrameIndex.value = layout.globalIndex;

    clipDragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      layout,
      ids: [...selectedFrameIds.value],
    };
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(0.35, Math.min(2.5, timelineZoom.value + delta));
    timelineZoom.value = +next.toFixed(2);
  }

  return (
    <div class="flex h-full flex-col">
      <TimelineToolbar />

      <div
        ref={viewportRef}
        class="relative min-h-0 flex-1 overflow-auto bg-[#141414]"
        onPointerDown={onViewportPointerDown}
        onWheel={onWheel}
      >
        {frames.length === 0 ? (
          <p class="p-4 text-xs text-neutral-500">
            Importez un GIF — dessinez un lasso pour sélectionner plusieurs frames.
          </p>
        ) : (
          <div
            ref={contentRef}
            class="relative"
            style={{ width: `${cw}px`, height: `${ch}px`, minWidth: "100%" }}
          >
            <div
              class="sticky top-0 z-20 border-b border-edge bg-panel/95 text-[9px] text-neutral-500"
              style={{ height: `${RULER_HEIGHT}px`, paddingLeft: `${TRACK_LABEL_WIDTH}px` }}
            >
              <div class="relative h-full">
                {rulerTicks.map((i) => (
                  <span
                    key={i}
                    class="absolute top-1 tabular-nums"
                    style={{ left: `${i * slotWidth}px` }}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>

            {Array.from({ length: tracks }).map((_, t) => (
              <div
                key={t}
                class="absolute border-b border-edge/50"
                style={{
                  top: `${RULER_HEIGHT + t * TRACK_HEIGHT}px`,
                  left: 0,
                  width: "100%",
                  height: `${TRACK_HEIGHT}px`,
                  background: t % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                }}
              >
                <div
                  class="absolute left-0 top-0 flex h-full items-center justify-center border-r border-edge bg-panel/80 text-[10px] font-medium text-neutral-500"
                  style={{ width: `${TRACK_LABEL_WIDTH}px` }}
                >
                  V{t + 1}
                </div>
              </div>
            ))}

            {drag && drag.dropTrack !== null && drag.dropBeforeGlobalIndex !== null && (
              <DropIndicator
                frames={frames}
                zoom={zoom}
                trackIndex={drag.dropTrack}
                beforeGlobalIndex={drag.dropBeforeGlobalIndex}
              />
            )}

            <PlayheadIndicator layout={playheadLayout} />

            {visible.map((layout) => {
              const frame = frames[layout.globalIndex];
              if (!frame) return null;
              return (
                <FrameClip
                  key={frame.id}
                  layout={layout}
                  frame={frame}
                  zoom={zoom}
                  isPlayhead={showPlayhead && layout.globalIndex === playheadIndex}
                  onPointerDownClip={onClipPointerDown}
                />
              );
            })}

            {marquee && marquee.width + marquee.height > 0 && (
              <div
                class="pointer-events-none absolute z-30 border border-accent bg-accent/15"
                style={{
                  left: `${marquee.x}px`,
                  top: `${marquee.y}px`,
                  width: `${marquee.width}px`,
                  height: `${marquee.height}px`,
                }}
              />
            )}
          </div>
        )}
      </div>

      <FrameDurationEditor />
    </div>
  );
}

function DropIndicator({
  frames,
  zoom,
  trackIndex,
  beforeGlobalIndex,
}: {
  frames: typeof timeline.value;
  zoom: number;
  trackIndex: number;
  beforeGlobalIndex: number;
}) {
  const w = clipWidth(zoom);
  const onTrack: { globalIndex: number }[] = [];
  for (let i = 0; i < frames.length; i++) {
    if ((frames[i].trackIndex ?? 0) === trackIndex) {
      onTrack.push({ globalIndex: i });
    }
  }

  let x: number;
  const idxInTrack = onTrack.findIndex(({ globalIndex }) => globalIndex >= beforeGlobalIndex);
  if (idxInTrack < 0) {
    x = TRACK_LABEL_WIDTH + onTrack.length * (w + CLIP_GAP);
  } else {
    x = TRACK_LABEL_WIDTH + idxInTrack * (w + CLIP_GAP) - CLIP_GAP / 2;
  }

  return (
    <div
      class="pointer-events-none absolute z-20 w-0.5 bg-accent shadow-[0_0_8px_#3b82f6]"
      style={{
        left: `${x}px`,
        top: `${RULER_HEIGHT + trackIndex * TRACK_HEIGHT + 4}px`,
        height: `${TRACK_HEIGHT - 8}px`,
      }}
    />
  );
}
