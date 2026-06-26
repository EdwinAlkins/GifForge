import {
  timelineZoom,
  effectiveTrackCount,
  zoomIn,
  zoomOut,
  resetZoom,
  setZoom,
  addTrack,
} from "../../stores/timelineViewStore";
import { selectedFrameIds, deleteSelectedFrames, selectAllFrames } from "../../stores/projectStore";
import { timeline } from "../../stores/projectStore";

export function TimelineToolbar() {
  const sel = selectedFrameIds.value.size;
  const zoom = timelineZoom.value;
  const tracks = effectiveTrackCount.value;

  return (
    <div class="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-1.5">
      <h2 class="font-medium text-neutral-300">Timeline</h2>

      <span class="text-xs text-neutral-500">
        {timeline.value.length} frame{timeline.value.length !== 1 ? "s" : ""}
        {sel > 0 ? ` · ${sel} sélectionnée${sel > 1 ? "s" : ""}` : ""}
      </span>

      <span class="mx-1 h-4 w-px bg-edge" />

      <div class="flex items-center gap-1" title="Zoom">
        <button
          type="button"
          onClick={zoomOut}
          class="rounded bg-panel-2 px-2 py-0.5 text-xs text-neutral-300 hover:bg-edge"
        >
          −
        </button>
        <input
          type="range"
          min={35}
          max={250}
          value={Math.round(zoom * 100)}
          onInput={(e) => setZoom(Number(e.currentTarget.value) / 100)}
          class="w-24 accent-accent"
        />
        <button
          type="button"
          onClick={zoomIn}
          class="rounded bg-panel-2 px-2 py-0.5 text-xs text-neutral-300 hover:bg-edge"
        >
          +
        </button>
        <button
          type="button"
          onClick={resetZoom}
          class="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:text-neutral-200"
        >
          100%
        </button>
        <span class="w-10 text-right text-[10px] tabular-nums text-neutral-500">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <span class="mx-1 h-4 w-px bg-edge" />

      <button
        type="button"
        onClick={addTrack}
        class="rounded bg-panel-2 px-2 py-0.5 text-xs text-neutral-300 hover:bg-edge"
        title="Ajouter une piste"
      >
        + Piste ({tracks})
      </button>

      <button
        type="button"
        onClick={selectAllFrames}
        disabled={timeline.value.length === 0}
        class="rounded bg-panel-2 px-2 py-0.5 text-xs text-neutral-300 hover:bg-edge disabled:opacity-40"
      >
        Tout sélectionner
      </button>

      {sel > 0 && (
        <button
          type="button"
          onClick={deleteSelectedFrames}
          class="rounded bg-red-900/60 px-2 py-0.5 text-xs text-red-200 hover:bg-red-900"
        >
          Supprimer ({sel})
        </button>
      )}

      <span class="ml-auto hidden text-[10px] text-neutral-600 lg:inline">
        Lasso · Shift+clic · Glisser la sélection · Ctrl+A · Suppr
      </span>
    </div>
  );
}
