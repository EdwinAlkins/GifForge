import { useState } from "preact/hooks";
import {
  selectedFrameIds,
  setFrameDuration,
  setSelectedFramesDuration,
} from "../../stores/projectStore";
import { MAX_DURATION_CS } from "../../lib/timelineModel";

/** Edit duration (centiseconds) for selected timeline frames. */
export function FrameDurationEditor() {
  const ids = selectedFrameIds.value;
  const singleId = ids.size === 1 ? [...ids][0] : null;
  const [value, setValue] = useState("10");

  if (ids.size === 0) return null;

  function apply() {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    if (singleId) {
      setFrameDuration(singleId, n);
    } else {
      setSelectedFramesDuration(n);
    }
  }

  return (
    <div class="flex items-center gap-2 border-t border-edge px-3 py-2 text-xs">
      <span class="text-neutral-400">
        Durée ({ids.size} frame{ids.size > 1 ? "s" : ""}) :
      </span>
      <input
        type="number"
        min={1}
        max={MAX_DURATION_CS}
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        class="w-16 rounded border border-edge bg-panel-2 px-2 py-0.5 text-neutral-200"
      />
      <span class="text-neutral-500">cs</span>
      <button
        type="button"
        onClick={apply}
        class="rounded bg-accent px-2 py-0.5 font-medium text-white hover:brightness-110"
      >
        Appliquer
      </button>
    </div>
  );
}
