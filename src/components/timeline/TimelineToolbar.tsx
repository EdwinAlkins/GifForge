import {
  pxPerSec,
  effectiveTrackCount,
  zoomIn,
  zoomOut,
  resetZoom,
  clampPxPerSec,
  addTrack,
} from "../../stores/timelineViewStore";
import {
  selectedFrameIds,
  deleteSelectedFrames,
  selectAllFrames,
  timelineModel,
} from "../../stores/projectStore";
import { splitAtPlayhead } from "../../stores/playbackStore";
import { PX_PER_SEC_MAX, PX_PER_SEC_MIN } from "../../lib/timelineGeometry";

/** Log-scale slider position (0–1000) ↔ pixels per second. */
const LOG_MIN = Math.log(PX_PER_SEC_MIN);
const LOG_SPAN = Math.log(PX_PER_SEC_MAX) - LOG_MIN;
const toSlider = (pps: number) => Math.round(((Math.log(pps) - LOG_MIN) / LOG_SPAN) * 1000);
const fromSlider = (v: number) => Math.exp(LOG_MIN + (v / 1000) * LOG_SPAN);

const btn = "rounded bg-panel-2 px-2 py-0.5 text-xs text-neutral-300 hover:bg-edge disabled:opacity-40";

export function TimelineToolbar({ viewportWidth }: { viewportWidth: number }) {
  const sel = selectedFrameIds.value.size;
  const pps = pxPerSec.value;
  const tracks = effectiveTrackCount.value;
  const model = timelineModel.value;
  const empty = model.frameCount === 0;

  function fit() {
    if (model.endCs > 0) pxPerSec.value = clampPxPerSec((viewportWidth - 24) / (model.endCs / 100));
  }

  return (
    <div class="flex flex-wrap items-center gap-2 border-b border-edge px-3 py-1.5">
      <h2 class="font-medium text-neutral-300">Timeline</h2>

      <span class="text-xs text-neutral-500">
        {model.frameCount} frame{model.frameCount !== 1 ? "s" : ""}
        {sel > 0 ? ` · ${sel} sélectionnée${sel > 1 ? "s" : ""}` : ""}
      </span>

      <span class="mx-1 h-4 w-px bg-edge" />

      <div class="flex items-center gap-1" title="Zoom (Ctrl + molette)">
        <button type="button" onClick={zoomOut} class={btn}>
          −
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={toSlider(pps)}
          onInput={(e) => (pxPerSec.value = clampPxPerSec(fromSlider(Number(e.currentTarget.value))))}
          class="w-28 accent-accent"
        />
        <button type="button" onClick={zoomIn} class={btn}>
          +
        </button>
        <button type="button" onClick={fit} disabled={empty} class={btn} title="Afficher toute la timeline">
          Ajuster
        </button>
        <button type="button" onClick={resetZoom} class={btn}>
          1:1
        </button>
        <span class="w-16 text-right text-[10px] tabular-nums text-neutral-500">
          {pps >= 100 ? Math.round(pps) : pps.toFixed(1)} px/s
        </span>
      </div>

      <span class="mx-1 h-4 w-px bg-edge" />

      <button type="button" onClick={addTrack} class={btn} title="Ajouter une piste">
        + Piste ({tracks})
      </button>
      <button type="button" onClick={splitAtPlayhead} disabled={empty} class={btn} title="Scinder au playhead (S)">
        Scinder
      </button>
      <button type="button" onClick={selectAllFrames} disabled={empty} class={btn}>
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

      <span class="ml-auto hidden text-[10px] text-neutral-600 xl:inline">
        Glisser l'en-tête : déplacer le clip · Glisser des frames : les insérer · S : scinder · Lasso · Ctrl+molette : zoom
      </span>
    </div>
  );
}
