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
  trackIndex?: number;
  thumbnailPath?: string;
  thumbnail?: string;
}

export interface Project {
  version: number;
  name: string;
  createdAt: string;
  modifiedAt: string;
  sources: SourceAsset[];
  timeline: TimelineFrame[];
  sourceFrames?: Record<string, TimelineFrame[]>;
}

export type ExportQuality = "fast" | "balanced" | "light";

/** Remove legacy inline base64 thumbs only — keep cache paths intact. */
export function stripInlineThumbsFromFrame(f: TimelineFrame): TimelineFrame {
  const { thumbnail: _t, ...rest } = f;
  return rest;
}

export function stripInlineThumbsFromSource(s: SourceAsset): SourceAsset {
  const { thumbnail: _t, ...rest } = s;
  return rest;
}

/** Payload for save IPC: no cache paths, no sourceFrames bank. */
export function projectForSavePayload(proj: Project): Project {
  return {
    ...proj,
    sources: proj.sources.map(stripInlineThumbsFromSource),
    timeline: proj.timeline.map(({ thumbnail: _t, framePath: _fp, thumbnailPath: _tp, ...f }) => ({
      ...f,
      framePath: "",
    })),
    sourceFrames: undefined,
  };
}

/** Resolve runtime PNG cache path (handles undo/save snapshots with empty framePath). */
export function resolveFrameCachePath(
  frame: TimelineFrame,
  project: Project | null,
): string {
  if (frame.framePath?.length > 0) return frame.framePath;

  const idx = frame.sourceFrameIndex ?? 0;
  const fromBank = project?.sourceFrames?.[frame.sourceId]?.find(
    (f) => (f.sourceFrameIndex ?? 0) === idx,
  );
  if (fromBank?.framePath) return fromBank.framePath;

  const fromTimeline = project?.timeline.find(
    (f) =>
      f.sourceId === frame.sourceId &&
      (f.sourceFrameIndex ?? 0) === idx &&
      f.framePath.length > 0,
  );
  return fromTimeline?.framePath ?? "";
}

/** Payload for export IPC: resolve cache paths, strip inline thumbs only. */
export function framesForExportPayload(
  frames: TimelineFrame[],
  project: Project | null,
): TimelineFrame[] {
  return frames.map((f) => ({
    ...stripInlineThumbsFromFrame(f),
    framePath: resolveFrameCachePath(f, project),
  }));
}

export function sourcesForExportPayload(sources: SourceAsset[]): SourceAsset[] {
  return sources.map(stripInlineThumbsFromSource);
}

/** Undo snapshot: strip inline thumbs but preserve cache paths. */
export function snapshotForHistory(proj: Project): Project {
  return {
    ...proj,
    sources: proj.sources.map(stripInlineThumbsFromSource),
    timeline: proj.timeline.map(stripInlineThumbsFromFrame),
    sourceFrames: proj.sourceFrames
      ? Object.fromEntries(
          Object.entries(proj.sourceFrames).map(([k, frames]) => [
            k,
            frames.map(stripInlineThumbsFromFrame),
          ]),
        )
      : undefined,
  };
}
