import { isPlaying, togglePlay, stop, currentFrameIndex } from "../../stores/playbackStore";
import { timeline } from "../../stores/projectStore";

/** Transport controls under the preview. The actual rAF playback loop arrives
 *  in Jalon 1 (usePlayback); here the buttons drive the shared signals. */
export function PlaybackControls() {
  const total = timeline.value.length;
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
      <span class="text-xs tabular-nums text-neutral-500">
        {total === 0 ? "—" : `${currentFrameIndex.value + 1} / ${total}`}
      </span>
    </div>
  );
}
