import { useRef, useEffect, useLayoutEffect, useState } from "preact/hooks";
import {
  timelineModel,
  sources,
  selectedFrameIds,
  selectFrameRange,
  clearFrameSelection,
  toggleFrameSelection,
  selectClip,
  clipsWithSelection,
  planClipMove,
  moveClips,
  frameDropTarget,
  moveFrames,
} from "../../stores/projectStore";
import { currentTimeMs, seekToFrame } from "../../stores/playbackStore";
import {
  pxPerSec,
  effectiveTrackCount,
  marqueeRect,
  dragState,
  clampPxPerSec,
} from "../../stores/timelineViewStore";
import {
  clipsInRange,
  frameRangeInClip,
  MS_PER_CS,
  type ClipModel,
} from "../../lib/timelineModel";
import {
  CLIP_PADDING_Y,
  RULER_HEIGHT,
  SNAP_PX,
  TRACK_HEIGHT,
  TRACK_LABEL_WIDTH,
  pxPerCs,
  timeToX,
  trackAtY,
  trackTop,
  xToTime,
} from "../../lib/timelineGeometry";
import { perfDev } from "../../lib/perfDev";
import { ClipView } from "./ClipView";
import { TimeRuler } from "./TimeRuler";
import { Playhead } from "./Playhead";
import { TimelineToolbar } from "./TimelineToolbar";
import { FrameDurationEditor } from "./FrameDurationEditor";

/** Pointer gesture started on the timeline, before it becomes a drag (5 px threshold). */
type Pending =
  | { kind: "marquee"; x: number; y: number }
  | { kind: "clips"; x: number; y: number; primary: ClipModel }
  | { kind: "frames"; x: number; y: number };

/**
 * Time-based multi-track timeline: clips sit at `startCs` on a shared time axis, higher
 * tracks drawn on top. Everything per render / pointer move is a binary search over the
 * timeline model, so cost depends on what is visible, not on the timeline length.
 */
export function TimelinePanel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const dragging = useRef(false);
  /** Time kept under the same screen x across a zoom change. */
  const zoomAnchor = useRef<{ tCs: number; px: number } | null>(null);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);

  const t0 = performance.now();
  const model = timelineModel.value;
  const pps = pxPerSec.value;
  const tracks = effectiveTrackCount.value;
  const marquee = marqueeRect.value;
  const drag = dragState.value;
  const selectedClips = clipsWithSelection();
  const filenames = new Map(sources.value.map((s) => [s.id, s.filename]));

  const contentWidth = Math.max(timeToX(model.endCs, pps) + viewportWidth / 2, viewportWidth);
  const contentHeight = RULER_HEIGHT + tracks * TRACK_HEIGHT;
  const bufferPx = 200;
  const visFrom = xToTime(scrollLeft - bufferPx, pps);
  const visTo = xToTime(scrollLeft + viewportWidth + bufferPx, pps);
  const draggedClips = drag?.kind === "clips" ? drag.clipIds : null;

  const clipViews = [];
  for (let t = 0; t < tracks; t++) {
    for (const cm of clipsInRange(model.tracks[t], visFrom, visTo)) {
      clipViews.push(
        <ClipView
          key={cm.clip.id}
          cm={cm}
          top={trackTop(t, tracks)}
          pxPerSec={pps}
          visFromCs={visFrom}
          visToCs={visTo}
          label={filenames.get(cm.clip.frames[0]?.sourceId) ?? "clip"}
          hasSelection={selectedClips.has(cm.clip.id)}
          dimmed={!!draggedClips?.has(cm.clip.id)}
          onPointerDownClip={onClipPointerDown}
          onPointerDownFrame={onFramePointerDown}
        />,
      );
    }
  }
  perfDev.recordLayoutMs(performance.now() - t0);
  perfDev.bumpTimelineRender();

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

  // Keep the anchored time (pointer for Ctrl+wheel, view centre otherwise) in place.
  const lastPps = useRef(pps);
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || lastPps.current === pps) return;
    const anchor = zoomAnchor.current ?? {
      tCs: xToTime(vp.scrollLeft + vp.clientWidth / 2, lastPps.current),
      px: vp.clientWidth / 2,
    };
    vp.scrollLeft = Math.max(0, timeToX(anchor.tCs, pps) - anchor.px);
    zoomAnchor.current = null;
    lastPps.current = pps;
  }, [pps]);

  /** Content coordinates of a pointer event. */
  function contentPoint(e: PointerEvent): { x: number; y: number } {
    const rect = contentRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const p = pending.current;
      if (!p || !contentRef.current) return;
      const { x, y } = contentPoint(e);
      const pps = pxPerSec.peek();

      if (p.kind === "marquee") {
        marqueeRect.value = {
          x: Math.min(p.x, x),
          y: Math.min(p.y, y),
          width: Math.abs(x - p.x),
          height: Math.abs(y - p.y),
        };
        return;
      }
      if (!dragging.current) {
        if (Math.hypot(x - p.x, y - p.y) < 5) return;
        dragging.current = true;
      }

      const trackCount = effectiveTrackCount.peek();
      if (p.kind === "clips") {
        const clipIds = clipsWithSelection();
        const deltaCs = snapDelta(p.primary, Math.round((x - p.x) / pxPerCs(pps)), clipIds, pps);
        const deltaTrack = trackAtY(y, trackCount) - trackAtY(p.y, trackCount);
        dragState.value = {
          kind: "clips",
          clipIds,
          deltaCs,
          deltaTrack,
          valid: planClipMove(clipIds, deltaCs, deltaTrack) !== null,
        };
      } else {
        dragState.value = {
          kind: "frames",
          frameIds: selectedFrameIds.peek(),
          target: frameDropTarget(trackAtY(y, trackCount), Math.max(0, xToTime(x, pps))),
        };
      }
    }

    function onPointerUp(e: PointerEvent) {
      const p = pending.current;
      pending.current = null;
      const wasDragging = dragging.current;
      dragging.current = false;

      if (p?.kind === "marquee") {
        const m = marqueeRect.value;
        marqueeRect.value = null;
        if (m && (m.width > 4 || m.height > 4)) selectFrameRange(framesInRect(m), e.shiftKey);
        return;
      }

      const d = dragState.value;
      dragState.value = null;
      if (!wasDragging || !d) return;
      if (d.kind === "clips" && d.valid) moveClips(d.clipIds, d.deltaCs, d.deltaTrack);
      if (d.kind === "frames" && d.target) moveFrames(d.frameIds, d.target);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  function onViewportPointerDown(e: PointerEvent) {
    if (e.button !== 0 || !contentRef.current) return;
    pending.current = { kind: "marquee", ...contentPoint(e) };
    if (!e.shiftKey) clearFrameSelection();
  }

  function onClipPointerDown(e: PointerEvent, cm: ClipModel) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (e.shiftKey) selectClip(cm.clip.id, true);
    else if (!clipsWithSelection().has(cm.clip.id)) selectClip(cm.clip.id, false);
    pending.current = { kind: "clips", ...contentPoint(e), primary: cm };
  }

  function onFramePointerDown(e: PointerEvent, cm: ClipModel, index: number) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const id = cm.clip.frames[index].id;
    if (e.shiftKey) toggleFrameSelection(id, true);
    else if (!selectedFrameIds.value.has(id)) selectFrameRange([id], false);
    seekToFrame(id);
    pending.current = { kind: "frames", ...contentPoint(e) };
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const px = e.clientX - vp.getBoundingClientRect().left;
    zoomAnchor.current = { tCs: xToTime(vp.scrollLeft + px, pxPerSec.value), px };
    pxPerSec.value = clampPxPerSec(pxPerSec.value * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
  }

  return (
    <div class="flex h-full flex-col">
      <TimelineToolbar viewportWidth={viewportWidth - TRACK_LABEL_WIDTH} />

      <div
        ref={viewportRef}
        class="relative min-h-0 flex-1 select-none overflow-auto bg-[#141414]"
        onPointerDown={onViewportPointerDown}
        onWheel={onWheel}
      >
        <div
          ref={contentRef}
          class="relative"
          style={{ width: `${contentWidth}px`, height: `${contentHeight}px`, minWidth: "100%" }}
        >
          <TimeRuler
            contentRef={contentRef}
            pxPerSec={pps}
            scrollLeft={scrollLeft}
            viewportWidth={viewportWidth}
          />

          {Array.from({ length: tracks }, (_, t) => (
            <div
              key={t}
              class="absolute left-0 w-full border-b border-edge/50"
              style={{
                top: `${trackTop(t, tracks)}px`,
                height: `${TRACK_HEIGHT}px`,
                background: t % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
              }}
            />
          ))}

          {model.frameCount === 0 && (
            <p class="absolute p-4 text-xs text-neutral-500" style={{ left: `${TRACK_LABEL_WIDTH}px`, top: `${RULER_HEIGHT}px` }}>
              Importez un GIF — il devient un clip sur V1. Les pistes supérieures se superposent.
            </p>
          )}

          {clipViews}

          {drag && <DragFeedback />}

          <Playhead
            contentRef={contentRef}
            viewportRef={viewportRef}
            pxPerSec={pps}
            height={contentHeight}
          />

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

          {/* Track labels stay pinned to the left edge while scrolling. */}
          {Array.from({ length: tracks }, (_, t) => (
            <div
              key={`label-${t}`}
              class="absolute z-20 flex items-center justify-center border-r border-edge bg-panel text-[10px] font-medium text-neutral-500"
              style={{
                left: `${scrollLeft}px`,
                top: `${trackTop(t, tracks)}px`,
                width: `${TRACK_LABEL_WIDTH}px`,
                height: `${TRACK_HEIGHT}px`,
              }}
            >
              V{t + 1}
            </div>
          ))}
        </div>
      </div>

      <FrameDurationEditor />
    </div>
  );
}

/**
 * Snap the primary clip's start or end to nearby edges (other clips, 0, playhead)
 * within `SNAP_PX`. Candidates come from the viewport-sized neighbourhood only.
 */
function snapDelta(primary: ClipModel, deltaCs: number, moving: Set<string>, pps: number): number {
  const threshold = SNAP_PX / pxPerCs(pps);
  const start = primary.startCs + deltaCs;
  const end = primary.endCs + deltaCs;
  const candidates = [0, Math.round(currentTimeMs.peek() / MS_PER_CS)];
  const range = 4 * threshold;
  for (const track of timelineModel.peek().tracks) {
    for (const lo of [start, end]) {
      for (const cm of clipsInRange(track, lo - range, lo + range)) {
        if (!moving.has(cm.clip.id)) candidates.push(cm.startCs, cm.endCs);
      }
    }
  }
  let best = deltaCs;
  let bestDist = threshold;
  for (const c of candidates) {
    for (const edge of [start, end]) {
      const dist = Math.abs(c - edge);
      if (dist < bestDist) {
        bestDist = dist;
        best = deltaCs + (c - edge);
      }
    }
  }
  return best;
}

/** Frames whose time span intersects the marquee, on the tracks it covers. */
function framesInRect(m: { x: number; y: number; width: number; height: number }): string[] {
  const pps = pxPerSec.peek();
  const trackCount = effectiveTrackCount.peek();
  const from = xToTime(m.x, pps);
  const to = xToTime(m.x + m.width, pps);
  const ids: string[] = [];
  for (let t = 0; t < trackCount; t++) {
    const top = trackTop(t, trackCount) + CLIP_PADDING_Y;
    if (m.y > top + TRACK_HEIGHT - 2 * CLIP_PADDING_Y || m.y + m.height < top) continue;
    for (const cm of clipsInRange(timelineModel.peek().tracks[t], from, to)) {
      const [first, last] = frameRangeInClip(cm, from, to);
      for (let i = first; i < last; i++) ids.push(cm.clip.frames[i].id);
    }
  }
  return ids;
}

/** Ghosts of dragged clips (red when the drop would overlap) or the frame drop marker. */
function DragFeedback() {
  const d = dragState.value;
  const model = timelineModel.value;
  const pps = pxPerSec.value;
  const tracks = effectiveTrackCount.value;
  const ppc = pxPerCs(pps);
  if (!d) return null;

  if (d.kind === "clips") {
    return (
      <>
        {[...d.clipIds].map((id) => {
          const cm = model.clipById.get(id);
          if (!cm) return null;
          const track = cm.clip.trackIndex + d.deltaTrack;
          if (track < 0 || track >= tracks) return null;
          return (
            <div
              key={id}
              class={`pointer-events-none absolute z-20 rounded border-2 ${
                d.valid ? "border-accent bg-accent/20" : "border-red-500 bg-red-500/20"
              }`}
              style={{
                left: `${timeToX(cm.startCs + d.deltaCs, pps)}px`,
                top: `${trackTop(track, tracks) + CLIP_PADDING_Y}px`,
                width: `${(cm.endCs - cm.startCs) * ppc}px`,
                height: `${TRACK_HEIGHT - 2 * CLIP_PADDING_Y}px`,
              }}
            />
          );
        })}
      </>
    );
  }

  const target = d.target;
  if (!target) return null;
  if (target.kind === "insert") {
    const cm = model.clipById.get(target.clipId);
    if (!cm) return null;
    return (
      <div
        class="pointer-events-none absolute z-20 w-0.5 bg-accent shadow-[0_0_8px_#3b82f6]"
        style={{
          left: `${timeToX(cm.frameStarts[target.index], pps) - 1}px`,
          top: `${trackTop(cm.clip.trackIndex, tracks) + 2}px`,
          height: `${TRACK_HEIGHT - 4}px`,
        }}
      />
    );
  }
  let lengthCs = 0;
  for (const id of d.frameIds) {
    const loc = model.frameById.get(id);
    if (loc) lengthCs += loc.clip.clip.frames[loc.index].durationCs;
  }
  return (
    <div
      class="pointer-events-none absolute z-20 rounded border-2 border-dashed border-accent bg-accent/15"
      style={{
        left: `${timeToX(target.startCs, pps)}px`,
        top: `${trackTop(target.trackIndex, tracks) + CLIP_PADDING_Y}px`,
        width: `${Math.max(4, lengthCs * ppc)}px`,
        height: `${TRACK_HEIGHT - 2 * CLIP_PADDING_Y}px`,
      }}
    />
  );
}
