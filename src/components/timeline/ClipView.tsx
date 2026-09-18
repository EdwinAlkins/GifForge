import type { ClipModel } from "../../lib/timelineModel";
import { frameRangeInClip, upperBound } from "../../lib/timelineModel";
import {
  CLIP_HEADER_HEIGHT,
  CLIP_PADDING_Y,
  FRAME_MODE_MIN_PX,
  TRACK_HEIGHT,
  pxPerCs,
  timeToX,
} from "../../lib/timelineGeometry";
import { selectedFrameIds } from "../../stores/projectStore";
import { resolveThumbUrl } from "../../lib/assetCache";

const BODY_HEIGHT = TRACK_HEIGHT - 2 * CLIP_PADDING_Y - CLIP_HEADER_HEIGHT;
const FILMSTRIP_TILE = Math.round((BODY_HEIGHT * 4) / 3);

interface Props {
  cm: ClipModel;
  top: number;
  pxPerSec: number;
  /** Visible time range (cs): only frames / tiles inside it are rendered. */
  visFromCs: number;
  visToCs: number;
  label: string;
  hasSelection: boolean;
  dimmed: boolean;
  onPointerDownClip: (e: PointerEvent, cm: ClipModel) => void;
  onPointerDownFrame: (e: PointerEvent, cm: ClipModel, index: number) => void;
}

/**
 * A clip at its time position. Wide enough frames are drawn as individual cells (frame
 * editing); otherwise the body is a filmstrip of thumbnails sampled along the clip.
 */
export function ClipView({
  cm,
  top,
  pxPerSec,
  visFromCs,
  visToCs,
  label,
  hasSelection,
  dimmed,
  onPointerDownClip,
  onPointerDownFrame,
}: Props) {
  const ppc = pxPerCs(pxPerSec);
  const left = timeToX(cm.startCs, pxPerSec);
  const width = Math.max(2, (cm.endCs - cm.startCs) * ppc);
  const frames = cm.clip.frames;
  const frameMode = width / frames.length >= FRAME_MODE_MIN_PX;
  const durationS = ((cm.endCs - cm.startCs) / 100).toFixed(2);

  return (
    <div
      data-clip-id={cm.clip.id}
      class={`absolute overflow-hidden rounded border ${
        hasSelection ? "border-accent ring-1 ring-accent/70" : "border-sky-900"
      } bg-sky-950/80 ${dimmed ? "opacity-40" : ""}`}
      style={{
        left: `${left}px`,
        top: `${top + CLIP_PADDING_Y}px`,
        width: `${width}px`,
        height: `${TRACK_HEIGHT - 2 * CLIP_PADDING_Y}px`,
      }}
    >
      <div
        class="flex cursor-grab items-center gap-2 overflow-hidden whitespace-nowrap bg-sky-900/70 px-1 text-[10px] text-sky-100 active:cursor-grabbing"
        style={{ height: `${CLIP_HEADER_HEIGHT}px` }}
        onPointerDown={(e) => onPointerDownClip(e, cm)}
        title={`${label} · ${frames.length} frames · ${durationS} s`}
      >
        <span class="truncate font-medium">{label}</span>
        <span class="shrink-0 tabular-nums text-sky-300/70">{durationS} s</span>
      </div>
      <div class="relative" style={{ height: `${BODY_HEIGHT}px` }}>
        {frameMode ? (
          <FrameCells
            cm={cm}
            ppc={ppc}
            visFromCs={visFromCs}
            visToCs={visToCs}
            onPointerDownFrame={onPointerDownFrame}
          />
        ) : (
          <Filmstrip
            cm={cm}
            ppc={ppc}
            visFromCs={visFromCs}
            visToCs={visToCs}
            onPointerDown={(e) => onPointerDownClip(e, cm)}
          />
        )}
      </div>
    </div>
  );
}

function FrameCells({
  cm,
  ppc,
  visFromCs,
  visToCs,
  onPointerDownFrame,
}: {
  cm: ClipModel;
  ppc: number;
  visFromCs: number;
  visToCs: number;
  onPointerDownFrame: Props["onPointerDownFrame"];
}) {
  const [first, last] = frameRangeInClip(cm, visFromCs, visToCs);
  const selected = selectedFrameIds.value;
  const cells = [];
  for (let i = first; i < last; i++) {
    const f = cm.clip.frames[i];
    const w = f.durationCs * ppc;
    const thumb = resolveThumbUrl(f.thumbnailPath, f.thumbnail);
    const isSel = selected.has(f.id);
    cells.push(
      <div
        key={f.id}
        data-frame-id={f.id}
        onPointerDown={(e) => onPointerDownFrame(e, cm, i)}
        title={`Frame ${i + 1} · ${f.durationCs} cs`}
        class={`absolute top-0 flex h-full cursor-grab flex-col overflow-hidden border-r border-black/60 ${
          isSel ? "bg-accent/40 outline outline-2 -outline-offset-2 outline-accent" : "bg-black"
        }`}
        style={{ left: `${(cm.frameStarts[i] - cm.startCs) * ppc}px`, width: `${w}px` }}
      >
        <div class="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {thumb && (
            <img
              src={thumb}
              alt=""
              draggable={false}
              class="pointer-events-none max-h-full max-w-full object-contain"
            />
          )}
        </div>
        {w >= 40 && (
          <div class="flex shrink-0 justify-between bg-black/70 px-0.5 text-[9px] tabular-nums text-neutral-400">
            <span>{i + 1}</span>
            <span>{f.durationCs}cs</span>
          </div>
        )}
      </div>,
    );
  }
  return <>{cells}</>;
}

function Filmstrip({
  cm,
  ppc,
  visFromCs,
  visToCs,
  onPointerDown,
}: {
  cm: ClipModel;
  ppc: number;
  visFromCs: number;
  visToCs: number;
  onPointerDown: (e: PointerEvent) => void;
}) {
  const tileCs = FILMSTRIP_TILE / ppc;
  const firstTile = Math.max(0, Math.floor((visFromCs - cm.startCs) / tileCs));
  const lastTile = Math.min(
    Math.ceil((cm.endCs - cm.startCs) / tileCs),
    Math.ceil((visToCs - cm.startCs) / tileCs),
  );
  const tiles = [];
  for (let i = firstTile; i < lastTile; i++) {
    const t = Math.min(cm.endCs - 0.001, cm.startCs + (i + 0.5) * tileCs);
    const f = cm.clip.frames[Math.max(0, upperBound(cm.frameStarts, t) - 1)];
    const thumb = resolveThumbUrl(f.thumbnailPath, f.thumbnail);
    tiles.push(
      <div
        key={i}
        class="absolute top-0 h-full overflow-hidden border-r border-black/40 bg-black"
        style={{ left: `${i * FILMSTRIP_TILE}px`, width: `${FILMSTRIP_TILE}px` }}
      >
        {thumb && (
          <img src={thumb} alt="" draggable={false} class="pointer-events-none h-full w-full object-cover" />
        )}
      </div>,
    );
  }
  return (
    <div class="absolute inset-0 cursor-grab active:cursor-grabbing" onPointerDown={onPointerDown}>
      {tiles}
    </div>
  );
}
