import { useEffect, useState } from "preact/hooks";
import { selectedSourceId, sources, timeline } from "../../stores/projectStore";
import { currentFrameIndex } from "../../stores/playbackStore";
import { loadFrameUrl, peekFrameUrl } from "../../lib/assetCache";
import { usePlayback } from "../../hooks/usePlayback";
import { useFramePrefetch } from "../../hooks/useFramePrefetch";
import { PlaybackControls } from "./PlaybackControls";
import { CropOverlay } from "./CropOverlay";

export function PreviewPanel() {
  usePlayback();
  useFramePrefetch();

  const inCropMode = selectedSourceId.value !== null;
  const frames = timeline.value;
  const src = inCropMode
    ? sources.value.find((s) => s.id === selectedSourceId.value)
    : null;

  let framePath: string | undefined;
  let crop = null;
  let badge: string | null = null;

  if (inCropMode && src) {
    framePath = frames.find((f) => f.sourceId === src.id)?.framePath;
    crop = src.crop;
    badge = `Recadrage : ${src.filename}`;
  } else if (frames.length > 0) {
    const frame = frames[currentFrameIndex.value % frames.length];
    framePath = frame?.framePath;
    const frameSrc = frame ? sources.value.find((s) => s.id === frame.sourceId) : null;
    crop = frameSrc?.crop ?? null;
  }

  const [imgUrl, setImgUrl] = useState<string | undefined>(
    framePath ? peekFrameUrl(framePath, inCropMode ? null : crop) : undefined,
  );

  useEffect(() => {
    let active = true;
    if (!framePath) {
      setImgUrl(undefined);
      return;
    }
    const cached = peekFrameUrl(framePath, inCropMode ? null : crop);
    if (cached) {
      setImgUrl(cached);
      return;
    }
    loadFrameUrl(framePath, inCropMode ? null : crop)
      .then((url) => active && setImgUrl(url))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [framePath, crop, inCropMode]);

  return (
    <div class="flex h-full flex-col">
      <div class="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {imgUrl && inCropMode && src ? (
          <CropOverlay
            imageUrl={imgUrl}
            sourceId={src.id}
            imageWidth={src.width}
            imageHeight={src.height}
            crop={src.crop}
          />
        ) : imgUrl ? (
          <img
            src={imgUrl}
            alt="Aperçu"
            class="max-h-full max-w-full object-contain"
          />
        ) : (
          <p class="text-sm text-neutral-500">
            {frames.length === 0
              ? "Importez un GIF pour commencer."
              : "Chargement de l'aperçu…"}
          </p>
        )}
        {badge && (
          <span class="absolute left-4 top-4 rounded bg-accent-soft px-2 py-1 text-xs text-white">
            {badge}
          </span>
        )}
      </div>
      <PlaybackControls />
    </div>
  );
}
