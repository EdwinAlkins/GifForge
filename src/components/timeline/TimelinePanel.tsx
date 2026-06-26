import { timeline } from "../../stores/projectStore";
import { FrameClip } from "./FrameClip";

/** Horizontal, scrollable track of timeline frames. Drag & drop reordering and
 *  multi-select editing arrive in Jalon 2. */
export function TimelinePanel() {
  return (
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <h2 class="font-medium text-neutral-300">Timeline</h2>
        <span class="text-xs text-neutral-500">
          {timeline.value.length} frame{timeline.value.length > 1 ? "s" : ""}
        </span>
      </header>

      <div class="flex-1 overflow-x-auto overflow-y-hidden p-3">
        {timeline.value.length === 0 ? (
          <p class="text-xs text-neutral-500">
            Les frames importées apparaîtront ici.
          </p>
        ) : (
          <div class="flex h-full items-stretch gap-1">
            {timeline.value.map((frame, index) => (
              <FrameClip key={frame.id} frame={frame} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
