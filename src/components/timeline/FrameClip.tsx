import type { TimelineFrame } from "../../lib/types";
import { selectedFrameIds } from "../../stores/projectStore";

interface Props {
  frame: TimelineFrame;
  index: number;
}

/** A single frame on the timeline: thumbnail + duration label. */
export function FrameClip({ frame, index }: Props) {
  const selected = selectedFrameIds.value.has(frame.id);

  return (
    <div
      class={`flex h-full w-20 shrink-0 flex-col overflow-hidden rounded border ${
        selected ? "border-accent" : "border-edge"
      } bg-panel-2`}
      title={`Frame ${index + 1} — ${frame.durationCs} cs`}
    >
      <div class="flex flex-1 items-center justify-center bg-black">
        {frame.thumbnail ? (
          <img src={frame.thumbnail} alt={`Frame ${index + 1}`} class="max-h-full max-w-full" />
        ) : (
          <span class="text-[10px] text-neutral-600">{index + 1}</span>
        )}
      </div>
      <div class="bg-panel px-1 py-0.5 text-center text-[10px] tabular-nums text-neutral-400">
        {frame.durationCs} cs
      </div>
    </div>
  );
}
