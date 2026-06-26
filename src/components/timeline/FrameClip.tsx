import type { TimelineFrame } from "../../lib/types";
import type { ClipLayout } from "../../lib/timelineLayout";
import { selectedFrameIds } from "../../stores/projectStore";
import { dragState } from "../../stores/timelineViewStore";
import { resolveThumbUrl } from "../../lib/assetCache";

interface Props {
  layout: ClipLayout;
  frame: TimelineFrame;
  zoom: number;
  isPlayhead: boolean;
  onPointerDownClip: (e: PointerEvent, layout: ClipLayout) => void;
}

export function FrameClip({
  layout,
  frame,
  zoom,
  isPlayhead,
  onPointerDownClip,
}: Props) {
  const selected = selectedFrameIds.value.has(frame.id);
  const dragging = dragState.value?.frameIds.includes(frame.id);
  const thumbSrc = resolveThumbUrl(frame.thumbnailPath, frame.thumbnail);

  return (
    <div
      role="button"
      tabIndex={0}
      data-frame-id={frame.id}
      onPointerDown={(e) => onPointerDownClip(e, layout)}
      style={{
        position: "absolute",
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
      }}
      class={`flex cursor-grab flex-col overflow-hidden rounded border active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      } ${
        selected
          ? "border-accent ring-2 ring-accent/80 z-10"
          : isPlayhead
            ? "border-accent/60 z-[5]"
            : "border-edge z-0"
      } bg-panel-2 shadow-sm`}
      title={`#${layout.globalIndex + 1} · piste ${layout.trackIndex + 1} · ${frame.durationCs} cs`}
    >
      <div class="flex flex-1 items-center justify-center overflow-hidden bg-black">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            class="max-h-full max-w-full object-contain pointer-events-none"
            draggable={false}
          />
        ) : (
          <span class="text-[10px] text-neutral-600">{layout.globalIndex + 1}</span>
        )}
      </div>
      <div
        class="flex shrink-0 items-center justify-between bg-panel px-1 py-px text-[9px] tabular-nums text-neutral-400"
        style={{ fontSize: zoom < 0.6 ? "8px" : "9px" }}
      >
        <span>{layout.globalIndex + 1}</span>
        <span>{frame.durationCs}cs</span>
      </div>
    </div>
  );
}
