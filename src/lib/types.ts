// Shared domain types — kept in sync with the Rust models (src-tauri/src/models).

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A GIF imported into the library. Each source owns its own crop. */
export interface SourceAsset {
  id: string;
  filename: string;
  /** Path on disk — absolute at runtime, `sources/…` inside `.gifforge`. */
  path: string;
  width: number;
  height: number;
  crop: CropRect | null;
  thumbnailPath?: string;
  thumbnail?: string;
}

/** A single frame on the timeline. Cache paths are runtime-only. */
export interface TimelineFrame {
  id: string;
  sourceId: string;
  /** 0-based index within the source GIF decode order. */
  sourceFrameIndex?: number;
  /** Absolute path to cached full-resolution PNG (runtime only). */
  framePath: string;
  durationCs: number;
  thumbnailPath?: string;
  thumbnail?: string;
}

/**
 * A clip: frames played back-to-back from `startCs` on track `trackIndex`.
 * Tracks share one time axis; higher tracks are composited on top of lower ones.
 * Clips on the same track never overlap.
 */
export interface TimelineClip {
  id: string;
  trackIndex: number;
  startCs: number;
  frames: TimelineFrame[];
}

export interface Project {
  version: number;
  name: string;
  createdAt: string;
  modifiedAt: string;
  sources: SourceAsset[];
  clips: TimelineClip[];
  /** Every decoded frame of each source (cache paths), keyed by source id. */
  sourceFrames?: Record<string, TimelineFrame[]>;
}

export type ExportQuality = "fast" | "balanced" | "light";

// ── IPC / disk format ────────────────────────────────────────────────────────
// Rust keeps a flat frame list; each frame names its clip and clips carry placement.

export interface WireFrame extends TimelineFrame {
  trackIndex?: number;
  clipId?: string;
}

export interface WireClip {
  id: string;
  trackIndex: number;
  startCs: number;
}

export interface WireProject extends Omit<Project, "clips" | "sourceFrames"> {
  timeline: WireFrame[];
  clips?: WireClip[];
  sourceFrames?: Record<string, WireFrame[]>;
}

export const PROJECT_VERSION = 3;

function stripWireFields({ trackIndex: _t, clipId: _c, ...f }: WireFrame): TimelineFrame {
  return f;
}

/** Build the clip model from the flat wire format, migrating pre-clip projects. */
export function projectFromWire(wire: WireProject): Project {
  const { timeline, clips: placements, sourceFrames, ...rest } = wire;
  const bank = sourceFrames
    ? Object.fromEntries(
        Object.entries(sourceFrames).map(([k, frames]) => [k, frames.map(stripWireFields)]),
      )
    : undefined;

  if (placements && placements.length > 0 && timeline.every((f) => f.clipId)) {
    const byId = new Map<string, TimelineClip>(
      placements.map((c) => [c.id, { ...c, frames: [] }]),
    );
    for (const f of timeline) byId.get(f.clipId!)?.frames.push(stripWireFields(f));
    const clips = [...byId.values()].filter((c) => c.frames.length > 0);
    return { ...rest, version: PROJECT_VERSION, clips, sourceFrames: bank };
  }

  return { ...rest, version: PROJECT_VERSION, clips: migrateSequentialTracks(timeline), sourceFrames: bank };
}

/**
 * v2 projects played track 0, then track 1, … one after the other. Rebuild that as
 * clips (one per run of consecutive frames from the same source), each track starting
 * where the previous one ended, so the result renders exactly as before.
 */
function migrateSequentialTracks(timeline: WireFrame[]): TimelineClip[] {
  const tracks = new Map<number, WireFrame[]>();
  for (const f of timeline) {
    const t = f.trackIndex ?? 0;
    if (!tracks.has(t)) tracks.set(t, []);
    tracks.get(t)!.push(f);
  }

  const clips: TimelineClip[] = [];
  let cursor = 0;
  for (const t of [...tracks.keys()].sort((a, b) => a - b)) {
    let current: TimelineClip | null = null;
    for (const f of tracks.get(t)!) {
      if (!current || current.frames[0].sourceId !== f.sourceId) {
        current = { id: crypto.randomUUID(), trackIndex: t, startCs: cursor, frames: [] };
        clips.push(current);
      }
      current.frames.push(stripWireFields(f));
      cursor += f.durationCs;
    }
  }
  return clips;
}

function stripInlineThumbsFromFrame(f: TimelineFrame): TimelineFrame {
  const { thumbnail: _t, ...rest } = f;
  return rest;
}

function stripInlineThumbsFromSource(s: SourceAsset): SourceAsset {
  const { thumbnail: _t, ...rest } = s;
  return rest;
}

/** Payload for save IPC: flat frames with clip ids, no cache paths, no bank. */
export function projectForSavePayload(proj: Project): WireProject {
  const { clips, sourceFrames: _bank, ...rest } = proj;
  return {
    ...rest,
    version: PROJECT_VERSION,
    sources: proj.sources.map(stripInlineThumbsFromSource),
    timeline: clips.flatMap((c) =>
      c.frames.map(({ thumbnail: _t, thumbnailPath: _tp, ...f }) => ({
        ...f,
        framePath: "",
        clipId: c.id,
        trackIndex: c.trackIndex,
      })),
    ),
    clips: clips.map(({ frames: _f, ...c }) => c),
  };
}

/** Resolve runtime PNG cache path (handles frames whose `framePath` was not kept). */
export function resolveFrameCachePath(frame: TimelineFrame, project: Project | null): string {
  if (frame.framePath?.length > 0) return frame.framePath;
  const idx = frame.sourceFrameIndex ?? 0;
  const fromBank = project?.sourceFrames?.[frame.sourceId]?.find(
    (f) => (f.sourceFrameIndex ?? 0) === idx,
  );
  return fromBank?.framePath ?? "";
}

export function sourcesForExportPayload(sources: SourceAsset[]): SourceAsset[] {
  return sources.map(stripInlineThumbsFromSource);
}

/** Undo snapshot: strip inline thumbs but preserve cache paths. */
export function snapshotForHistory(proj: Project): Project {
  return {
    ...proj,
    sources: proj.sources.map(stripInlineThumbsFromSource),
    clips: proj.clips.map((c) => ({ ...c, frames: c.frames.map(stripInlineThumbsFromFrame) })),
  };
}
