import type { TimelineClip, TimelineFrame } from "./types";

/** A GIF delay unit (centisecond) in milliseconds. */
export const MS_PER_CS = 10;

/** Largest delay the GIF format can store (16-bit field, in centiseconds). */
export const MAX_DURATION_CS = 65535;

export interface ClipModel {
  clip: TimelineClip;
  startCs: number;
  endCs: number;
  /** Absolute start of each frame; `frameStarts[frames.length]` = `endCs`. */
  frameStarts: Float64Array;
}

export interface TrackModel {
  /** Sorted by start; clips on a track never overlap, so `ends` is sorted too. */
  clips: ClipModel[];
  starts: Float64Array;
  ends: Float64Array;
}

export interface FrameLocation {
  clip: ClipModel;
  index: number;
}

/**
 * Time-indexed view of the timeline, independent of zoom. Rebuilt once per edit;
 * every query (viewport, hit test, playhead) is then a binary search.
 */
export interface TimelineModel {
  /** Indexed by track; covers every track that holds a clip. */
  tracks: TrackModel[];
  clipById: Map<string, ClipModel>;
  frameById: Map<string, FrameLocation>;
  endCs: number;
  frameCount: number;
}

export function clipDurationCs(clip: TimelineClip): number {
  let d = 0;
  for (const f of clip.frames) d += f.durationCs;
  return d;
}

export function buildTimelineModel(clips: TimelineClip[]): TimelineModel {
  const clipById = new Map<string, ClipModel>();
  const frameById = new Map<string, FrameLocation>();
  const perTrack: ClipModel[][] = [];
  let endCs = 0;
  let frameCount = 0;

  for (const clip of clips) {
    const frameStarts = new Float64Array(clip.frames.length + 1);
    frameStarts[0] = clip.startCs;
    for (let i = 0; i < clip.frames.length; i++) {
      frameStarts[i + 1] = frameStarts[i] + clip.frames[i].durationCs;
    }
    const cm: ClipModel = {
      clip,
      startCs: clip.startCs,
      endCs: frameStarts[clip.frames.length],
      frameStarts,
    };
    clipById.set(clip.id, cm);
    clip.frames.forEach((f, index) => frameById.set(f.id, { clip: cm, index }));
    (perTrack[clip.trackIndex] ??= []).push(cm);
    endCs = Math.max(endCs, cm.endCs);
    frameCount += clip.frames.length;
  }

  const tracks: TrackModel[] = Array.from(perTrack, (list = []) => {
    list.sort((a, b) => a.startCs - b.startCs);
    return {
      clips: list,
      starts: Float64Array.from(list, (c) => c.startCs),
      ends: Float64Array.from(list, (c) => c.endCs),
    };
  });

  return { tracks, clipById, frameById, endCs, frameCount };
}

/** First index `i` with `arr[i] > value` (arr sorted ascending). */
export function upperBound(arr: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index `i` with `arr[i] >= value` (arr sorted ascending). */
export function lowerBound(arr: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Clips of `track` intersecting [fromCs, toCs). */
export function clipsInRange(track: TrackModel | undefined, fromCs: number, toCs: number): ClipModel[] {
  if (!track) return [];
  const out: ClipModel[] = [];
  for (let i = upperBound(track.ends, fromCs); i < track.clips.length; i++) {
    if (track.starts[i] >= toCs) break;
    out.push(track.clips[i]);
  }
  return out;
}

/** Index range [first, last) of the clip's frames intersecting [fromCs, toCs). */
export function frameRangeInClip(clip: ClipModel, fromCs: number, toCs: number): [number, number] {
  const n = clip.clip.frames.length;
  const first = Math.max(0, upperBound(clip.frameStarts, fromCs) - 1);
  const last = Math.min(n, lowerBound(clip.frameStarts, toCs));
  return [first, Math.max(first, last)];
}

/** Clip of `track` containing `tCs`, if any. */
export function clipAt(track: TrackModel | undefined, tCs: number): ClipModel | null {
  if (!track) return null;
  const i = upperBound(track.starts, tCs) - 1;
  return i >= 0 && tCs < track.ends[i] ? track.clips[i] : null;
}

/** True if [startCs, startCs + lengthCs) is free on `track`, ignoring `ignore` clips. */
export function isFree(
  track: TrackModel | undefined,
  startCs: number,
  lengthCs: number,
  ignore?: Set<string>,
): boolean {
  if (startCs < 0) return false;
  return clipsInRange(track, startCs, startCs + lengthCs).every((c) => ignore?.has(c.clip.id));
}

// ── Render plan ──────────────────────────────────────────────────────────────

/** Interval of time during which the same frames are visible. */
export interface Segment {
  startCs: number;
  durationCs: number;
  /** Visible frames, bottom track first. */
  layers: TimelineFrame[];
}

/** The timeline cut at every frame boundary of every track, from 0 to the end. */
export interface RenderPlan {
  segments: Segment[];
  /** `starts[k]` = start of segment k in cs; `starts[segments.length]` = total. */
  starts: Float64Array;
  totalCs: number;
}

export function buildRenderPlan(model: TimelineModel): RenderPlan {
  const bounds = new Set<number>([0]);
  for (const track of model.tracks) {
    for (const c of track.clips) for (const t of c.frameStarts) bounds.add(t);
  }
  const sorted = Float64Array.from(bounds).sort();

  // One cursor per track, advancing monotonically: O(boundaries × tracks).
  const cursors = model.tracks.map(() => ({ clip: 0, frame: 0 }));
  const segments: Segment[] = [];
  for (let k = 0; k + 1 < sorted.length; k++) {
    const t = sorted[k];
    const layers: TimelineFrame[] = [];
    model.tracks.forEach((track, ti) => {
      const cur = cursors[ti];
      while (cur.clip < track.clips.length && track.ends[cur.clip] <= t) {
        cur.clip++;
        cur.frame = 0;
      }
      const c = track.clips[cur.clip];
      if (!c || c.startCs > t) return;
      while (c.frameStarts[cur.frame + 1] <= t) cur.frame++;
      layers.push(c.clip.frames[cur.frame]);
    });
    segments.push({ startCs: t, durationCs: sorted[k + 1] - t, layers });
  }

  const starts = new Float64Array(segments.length + 1);
  segments.forEach((s, k) => (starts[k + 1] = s.startCs + s.durationCs));
  return { segments, starts, totalCs: model.endCs };
}

/** Segment index at `tCs`, clamped to the plan (-1 if empty). */
export function segmentIndexAt(plan: RenderPlan, tCs: number): number {
  if (plan.segments.length === 0) return -1;
  return Math.min(plan.segments.length - 1, Math.max(0, upperBound(plan.starts, tCs) - 1));
}

/** `mm:ss.cc` */
export function formatTimecode(ms: number): string {
  const totalCs = Math.floor(Math.max(0, ms) / MS_PER_CS);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(Math.floor(totalCs / 6000))}:${pad(Math.floor(totalCs / 100) % 60)}.${pad(totalCs % 100)}`;
}
