import {
  isPlaying,
  togglePlay,
  stop,
  currentTimeMs,
  currentSegmentIndex,
} from "../../stores/playbackStore";
import { renderPlan } from "../../stores/projectStore";
import { formatTimecode, MS_PER_CS } from "../../lib/timelineModel";

/** Transport controls under the preview. */
export function PlaybackControls() {
  const plan = renderPlan.value;
  const total = plan.segments.length;
  const disabled = total === 0;

  return (
    <div class="flex items-center justify-center gap-3 border-t border-edge px-4 py-2">
      <button
        type="button"
        disabled={disabled}
        onClick={togglePlay}
        class="rounded bg-panel-2 px-3 py-1 text-xs text-neutral-200 hover:bg-edge disabled:opacity-40"
      >
        {isPlaying.value ? "⏸ Pause" : "▶ Lecture"}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={stop}
        class="rounded bg-panel-2 px-3 py-1 text-xs text-neutral-200 hover:bg-edge disabled:opacity-40"
      >
        ⏹ Stop
      </button>
      <span class="text-xs tabular-nums text-neutral-500" title="Image affichée / images du GIF exporté">
        {total === 0 ? "—" : `${currentSegmentIndex.value + 1} / ${total}`}
      </span>
      {total > 0 && <Timecode totalMs={plan.totalCs * MS_PER_CS} />}
    </div>
  );
}

/** Isolated so that only this text re-renders on every playback tick. */
function Timecode({ totalMs }: { totalMs: number }) {
  return (
    <span class="text-xs tabular-nums text-neutral-400">
      {formatTimecode(currentTimeMs.value)} / {formatTimecode(totalMs)}
    </span>
  );
}
