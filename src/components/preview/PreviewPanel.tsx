import { useEffect, useRef, useState } from "preact/hooks";
import { computed } from "@preact/signals";
import { selectedSourceId, sources, clips, project } from "../../stores/projectStore";
import { currentLayers } from "../../stores/playbackStore";
import { loadFrameUrl, peekFrameUrl } from "../../lib/assetCache";
import type { CropRect, SourceAsset, TimelineFrame } from "../../lib/types";
import { usePlayback } from "../../hooks/usePlayback";
import { useFramePrefetch } from "../../hooks/useFramePrefetch";
import { PlaybackControls } from "./PlaybackControls";
import { CropOverlay } from "./CropOverlay";

function layerSize(src: SourceAsset): { w: number; h: number } {
  return src.crop ? { w: src.crop.width, h: src.crop.height } : { w: src.width, h: src.height };
}

/** Output canvas = largest (cropped) source on the timeline, as in the export. */
const canvasSize = computed(() => {
  const used = new Set(clips.value.flatMap((c) => c.frames.map((f) => f.sourceId)));
  let w = 1;
  let h = 1;
  for (const s of sources.value) {
    if (!used.has(s.id)) continue;
    const size = layerSize(s);
    w = Math.max(w, size.w);
    h = Math.max(h, size.h);
  }
  return { w, h };
});

/** Resolve the (possibly cropped) asset URL of a frame, from cache when possible. */
function useFrameUrl(framePath: string | undefined, crop: CropRect | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(
    framePath ? peekFrameUrl(framePath, crop) : undefined,
  );
  useEffect(() => {
    let active = true;
    if (!framePath) {
      setUrl(undefined);
      return;
    }
    const cached = peekFrameUrl(framePath, crop);
    if (cached) {
      setUrl(cached);
      return;
    }
    loadFrameUrl(framePath, crop)
      .then((u) => active && setUrl(u))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [framePath, crop]);
  return url;
}

export function PreviewPanel() {
  usePlayback();
  useFramePrefetch();

  const cropSource = sources.value.find((s) => s.id === selectedSourceId.value);

  return (
    <div class="flex h-full flex-col">
      <div class="relative flex flex-1 items-center justify-center overflow-hidden p-4">
        {cropSource ? <CropMode source={cropSource} /> : <Composite />}
      </div>
      <PlaybackControls />
    </div>
  );
}

function CropMode({ source }: { source: SourceAsset }) {
  const framePath = project.value?.sourceFrames?.[source.id]?.[0]?.framePath;
  const url = useFrameUrl(framePath, null);
  return (
    <>
      {url ? (
        <CropOverlay
          imageUrl={url}
          sourceId={source.id}
          imageWidth={source.width}
          imageHeight={source.height}
          crop={source.crop}
        />
      ) : (
        <p class="text-sm text-neutral-500">Chargement de l'aperçu…</p>
      )}
      <span class="absolute left-4 top-4 rounded bg-accent-soft px-2 py-1 text-xs text-white">
        Recadrage : {source.filename}
      </span>
    </>
  );
}

/** Tracks stacked like the export: top-left aligned, higher tracks on top. */
function Composite() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layers = currentLayers.value;
  const canvas = canvasSize.value;
  const scale = Math.min(box.w / canvas.w, box.h / canvas.h) || 0;

  return (
    <div ref={boxRef} class="flex h-full w-full items-center justify-center">
      {clips.value.length === 0 ? (
        <p class="text-sm text-neutral-500">Importez un GIF pour commencer.</p>
      ) : (
        <div
          class="relative overflow-hidden"
          style={{ width: `${canvas.w * scale}px`, height: `${canvas.h * scale}px` }}
        >
          {layers.map((frame, z) => (
            <Layer key={z} frame={frame} scale={scale} />
          ))}
        </div>
      )}
    </div>
  );
}

function Layer({ frame, scale }: { frame: TimelineFrame; scale: number }) {
  const src = sources.value.find((s) => s.id === frame.sourceId);
  const crop = src?.crop ?? null;
  const url = useFrameUrl(frame.framePath, crop);
  if (!url || !src) return null;
  const { w, h } = layerSize(src);
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      class="absolute left-0 top-0 max-w-none"
      style={{ width: `${w * scale}px`, height: `${h * scale}px`, imageRendering: "auto" }}
    />
  );
}
