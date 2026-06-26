import { selectedSourceId, sources, timeline } from "../../stores/projectStore";
import { PlaybackControls } from "./PlaybackControls";

/** Center stage. Two modes:
 *   - crop-edit: a source is selected in the library → show it with CropOverlay (Jalon 3)
 *   - playback: no source selected → show the current timeline frame (already cropped)
 */
export function PreviewPanel() {
  const inCropMode = selectedSourceId.value !== null;
  const activeSource = inCropMode
    ? sources.value.find((s) => s.id === selectedSourceId.value)
    : null;

  return (
    <div class="flex h-full flex-col">
      <div class="flex flex-1 items-center justify-center overflow-hidden p-4">
        {timeline.value.length === 0 && !activeSource ? (
          <p class="text-sm text-neutral-500">
            Importez un GIF pour commencer.
          </p>
        ) : (
          <div class="flex h-full w-full items-center justify-center">
            {/* Frame / source rendering wired in Jalon 1; CropOverlay in Jalon 3. */}
            <div class="flex aspect-video max-h-full max-w-full items-center justify-center rounded border border-edge bg-black text-xs text-neutral-600">
              {activeSource ? `Recadrage : ${activeSource.filename}` : "Aperçu"}
            </div>
          </div>
        )}
      </div>
      <PlaybackControls />
    </div>
  );
}
