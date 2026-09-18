import { signal, computed } from "@preact/signals";
import type { Project, SourceAsset, TimelineClip, CropRect } from "../lib/types";
import { PROJECT_VERSION } from "../lib/types";
import type { ImportResult } from "../lib/tauri";
import { pushHistory } from "./historyStore";
import {
  buildRenderPlan,
  buildTimelineModel,
  clipAt,
  clipDurationCs,
  isFree,
  MAX_DURATION_CS,
  upperBound,
} from "../lib/timelineModel";

/** The currently open project. null until a project is created or opened. */
export const project = signal<Project | null>(null);

/** Path of the .gifforge file on disk, null for an unsaved new project. */
export const projectPath = signal<string | null>(null);

/** Source selected in the library (drives crop-edit mode in the preview). */
export const selectedSourceId = signal<string | null>(null);

/** Timeline frames currently selected (multi-select for deletion / duration edits). */
export const selectedFrameIds = signal<Set<string>>(new Set());

export const sources = computed<SourceAsset[]>(() => project.value?.sources ?? []);
export const clips = computed<TimelineClip[]>(() => project.value?.clips ?? []);

/** Time index of the clips — rebuilt only when `clips` changes (not on zoom/scroll). */
export const timelineModel = computed(() => buildTimelineModel(clips.value));

/** Timeline cut into segments of constant visible frames: preview, playback and export. */
export const renderPlan = computed(() => buildRenderPlan(timelineModel.value));

export function createEmptyProject(name = "Sans titre"): Project {
  const now = new Date().toISOString();
  return {
    version: PROJECT_VERSION,
    name,
    createdAt: now,
    modifiedAt: now,
    sources: [],
    clips: [],
    sourceFrames: {},
  };
}

/** Replace the project, stamping modifiedAt. Use for any mutation. */
export function setProject(next: Project): void {
  project.value = { ...next, modifiedAt: new Date().toISOString() };
}

function setClips(p: Project, next: TimelineClip[]): void {
  setProject({ ...p, clips: next });
}

/**
 * Shift clips right on the given tracks until none overlap (a clip that grew pushes
 * the following ones). Clips never move left, so gaps are preserved.
 */
function resolveOverlaps(list: TimelineClip[], tracks: Set<number>): TimelineClip[] {
  const byTrack = new Map<number, TimelineClip[]>();
  for (const c of list) {
    if (tracks.has(c.trackIndex)) {
      if (!byTrack.has(c.trackIndex)) byTrack.set(c.trackIndex, []);
      byTrack.get(c.trackIndex)!.push(c);
    }
  }
  const moved = new Map<string, TimelineClip>();
  for (const trackClips of byTrack.values()) {
    trackClips.sort((a, b) => a.startCs - b.startCs);
    let end = 0;
    for (const c of trackClips) {
      const start = Math.max(c.startCs, end);
      if (start !== c.startCs) moved.set(c.id, { ...c, startCs: start });
      end = start + clipDurationCs(c);
    }
  }
  return moved.size === 0 ? list : list.map((c) => moved.get(c.id) ?? c);
}

function trackEndCs(trackIndex: number): number {
  const track = timelineModel.value.tracks[trackIndex];
  return track && track.clips.length > 0 ? track.ends[track.ends.length - 1] : 0;
}

/** Add an imported GIF's source and place its frames as a clip at the end of V1. */
export function addImported({ source, frames }: ImportResult): void {
  pushHistory();
  const p = project.value ?? createEmptyProject();
  const startCs = project.value ? trackEndCs(0) : 0;
  setProject({
    ...p,
    sources: [...p.sources, source],
    clips: [...p.clips, { id: crypto.randomUUID(), trackIndex: 0, startCs, frames }],
    sourceFrames: { ...p.sourceFrames, [source.id]: frames },
  });
}

/**
 * Place a new clip of all the source's frames at `timeCs`, on the lowest track where it
 * fits (a new track above the others if none) — dropping on the playhead over an
 * existing clip therefore creates an overlay.
 */
export function insertSourceAt(sourceId: string, timeCs: number): void {
  const p = project.value;
  const bank = p?.sourceFrames?.[sourceId];
  if (!p || !bank || bank.length === 0) return;

  const frames = bank.map((f) => ({ ...f, id: crypto.randomUUID(), thumbnail: undefined }));
  const length = frames.reduce((d, f) => d + f.durationCs, 0);
  const tracks = timelineModel.value.tracks;
  let trackIndex = tracks.findIndex((t) => isFree(t, timeCs, length));
  if (trackIndex < 0) trackIndex = tracks.length;

  pushHistory();
  setClips(p, [...p.clips, { id: crypto.randomUUID(), trackIndex, startCs: timeCs, frames }]);
}

export function setSourceCrop(sourceId: string, crop: CropRect | null): void {
  const p = project.value;
  if (!p) return;
  pushHistory();
  setProject({
    ...p,
    sources: p.sources.map((s) => (s.id === sourceId ? { ...s, crop } : s)),
  });
}

// ── Selection ────────────────────────────────────────────────────────────────

export function selectSource(id: string | null): void {
  selectedSourceId.value = id;
}

export function selectFrameRange(frameIds: string[], extend: boolean): void {
  const next = extend ? new Set(selectedFrameIds.value) : new Set<string>();
  for (const id of frameIds) next.add(id);
  selectedFrameIds.value = next;
  selectedSourceId.value = null;
}

export function selectAllFrames(): void {
  selectFrameRange(clips.value.flatMap((c) => c.frames.map((f) => f.id)), false);
}

/** Select every frame of a clip (toggling it when `extend` and already selected). */
export function selectClip(clipId: string, extend: boolean): void {
  const clip = timelineModel.value.clipById.get(clipId)?.clip;
  if (!clip) return;
  const ids = clip.frames.map((f) => f.id);
  if (extend && ids.every((id) => selectedFrameIds.value.has(id))) {
    const next = new Set(selectedFrameIds.value);
    for (const id of ids) next.delete(id);
    selectedFrameIds.value = next;
    return;
  }
  selectFrameRange(ids, extend);
}

export function toggleFrameSelection(frameId: string, extend: boolean): void {
  const next = new Set(extend ? selectedFrameIds.value : []);
  if (extend && selectedFrameIds.value.has(frameId)) {
    next.delete(frameId);
  } else {
    next.add(frameId);
  }
  selectedFrameIds.value = next;
  selectedSourceId.value = null;
}

export function clearFrameSelection(): void {
  selectedFrameIds.value = new Set();
}

/** Ids of clips holding at least one selected frame. */
export function clipsWithSelection(): Set<string> {
  const out = new Set<string>();
  const loc = timelineModel.value.frameById;
  for (const id of selectedFrameIds.value) {
    const l = loc.get(id);
    if (l) out.add(l.clip.clip.id);
  }
  return out;
}

// ── Edits ────────────────────────────────────────────────────────────────────

/** Remove selected frames; the rest of each clip closes up, empty clips disappear. */
export function deleteSelectedFrames(): void {
  const ids = selectedFrameIds.value;
  const p = project.value;
  if (ids.size === 0 || !p) return;
  pushHistory();
  const next = p.clips
    .map((c) =>
      c.frames.some((f) => ids.has(f.id)) ? { ...c, frames: c.frames.filter((f) => !ids.has(f.id)) } : c,
    )
    .filter((c) => c.frames.length > 0);
  setClips(p, next);
  selectedFrameIds.value = new Set();
}

function clampDurationCs(durationCs: number): number {
  return Math.min(MAX_DURATION_CS, Math.max(1, Math.round(durationCs)));
}

function setDurations(ids: Set<string>, durationCs: number): void {
  const p = project.value;
  if (ids.size === 0 || !p) return;
  const d = clampDurationCs(durationCs);
  pushHistory();
  const touched = new Set<number>();
  const next = p.clips.map((c) => {
    if (!c.frames.some((f) => ids.has(f.id))) return c;
    touched.add(c.trackIndex);
    return { ...c, frames: c.frames.map((f) => (ids.has(f.id) ? { ...f, durationCs: d } : f)) };
  });
  setClips(p, resolveOverlaps(next, touched));
}

export function setFrameDuration(frameId: string, durationCs: number): void {
  setDurations(new Set([frameId]), durationCs);
}

export function setSelectedFramesDuration(durationCs: number): void {
  setDurations(selectedFrameIds.value, durationCs);
}

/**
 * Where the clips would land if shifted by `deltaCs` / `deltaTrack`, or null if a clip
 * would leave the timeline or overlap a clip that is not moving.
 */
export function planClipMove(
  clipIds: Set<string>,
  deltaCs: number,
  deltaTrack: number,
): TimelineClip[] | null {
  const model = timelineModel.value;
  const moved: TimelineClip[] = [];
  for (const id of clipIds) {
    const cm = model.clipById.get(id);
    if (!cm) continue;
    const trackIndex = cm.clip.trackIndex + deltaTrack;
    const startCs = cm.startCs + deltaCs;
    if (trackIndex < 0 || !isFree(model.tracks[trackIndex], startCs, cm.endCs - cm.startCs, clipIds)) {
      return null;
    }
    moved.push({ ...cm.clip, trackIndex, startCs });
  }
  return moved;
}

export function moveClips(clipIds: Set<string>, deltaCs: number, deltaTrack: number): boolean {
  const p = project.value;
  const moved = p && planClipMove(clipIds, deltaCs, deltaTrack);
  if (!p || !moved || (deltaCs === 0 && deltaTrack === 0)) return false;
  pushHistory();
  const byId = new Map(moved.map((c) => [c.id, c]));
  setClips(p, p.clips.map((c) => byId.get(c.id) ?? c));
  return true;
}

/** Where dropped frames go: inside a clip (before frame `index`) or as a new clip. */
export type FrameDropTarget =
  | { kind: "insert"; clipId: string; index: number }
  | { kind: "new"; trackIndex: number; startCs: number };

/** Drop target for frames released at `timeCs` on `trackIndex`. */
export function frameDropTarget(trackIndex: number, timeCs: number): FrameDropTarget {
  const cm = clipAt(timelineModel.value.tracks[trackIndex], timeCs);
  if (!cm) return { kind: "new", trackIndex, startCs: Math.max(0, Math.round(timeCs)) };
  // Nearest frame boundary.
  const i = upperBound(cm.frameStarts, timeCs) - 1;
  const mid = (cm.frameStarts[i] + cm.frameStarts[i + 1]) / 2;
  return { kind: "insert", clipId: cm.clip.id, index: timeCs < mid ? i : i + 1 };
}

/**
 * Move frames (in timeline order) to `target`. Source clips close up; the target clip
 * grows and pushes the following clips of its track if needed.
 */
export function moveFrames(frameIds: Set<string>, target: FrameDropTarget): void {
  const p = project.value;
  if (!p || frameIds.size === 0) return;
  const loc = timelineModel.value.frameById;
  const moving = [...frameIds]
    .map((id) => loc.get(id))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .sort(
      (a, b) =>
        a.clip.frameStarts[a.index] - b.clip.frameStarts[b.index] ||
        a.clip.clip.trackIndex - b.clip.clip.trackIndex,
    )
    .map((l) => l.clip.clip.frames[l.index]);
  if (moving.length === 0) return;

  let next: TimelineClip[] = p.clips.map((c) => {
    if (target.kind === "insert" && c.id === target.clipId) {
      // Account for moved frames that sat before the insertion point of this clip.
      const before = c.frames.slice(0, target.index).filter((f) => !frameIds.has(f.id));
      const after = c.frames.slice(target.index).filter((f) => !frameIds.has(f.id));
      return { ...c, frames: [...before, ...moving, ...after] };
    }
    return c.frames.some((f) => frameIds.has(f.id))
      ? { ...c, frames: c.frames.filter((f) => !frameIds.has(f.id)) }
      : c;
  });
  next = next.filter((c) => c.frames.length > 0);

  let track: number;
  if (target.kind === "new") {
    track = target.trackIndex;
    next.push({ id: crypto.randomUUID(), trackIndex: track, startCs: target.startCs, frames: moving });
  } else {
    track = p.clips.find((c) => c.id === target.clipId)?.trackIndex ?? 0;
  }

  pushHistory();
  setClips(p, resolveOverlaps(next, new Set([track])));
}

/**
 * Split clips at the frame boundary under `timeCs`: the frame on screen starts the
 * right-hand clip. Only `clipIds` when given, otherwise every clip under the playhead.
 */
export function splitClipsAt(timeCs: number, clipIds?: Set<string>): boolean {
  const p = project.value;
  if (!p) return false;
  const model = timelineModel.value;
  const parts = new Map<string, TimelineClip[]>();
  for (const track of model.tracks) {
    const cm = clipAt(track, timeCs);
    if (!cm || (clipIds && clipIds.size > 0 && !clipIds.has(cm.clip.id))) continue;
    const i = upperBound(cm.frameStarts, timeCs) - 1;
    if (i <= 0) continue;
    parts.set(cm.clip.id, [
      { ...cm.clip, frames: cm.clip.frames.slice(0, i) },
      {
        id: crypto.randomUUID(),
        trackIndex: cm.clip.trackIndex,
        startCs: cm.frameStarts[i],
        frames: cm.clip.frames.slice(i),
      },
    ]);
  }
  if (parts.size === 0) return false;
  pushHistory();
  setClips(p, p.clips.flatMap((c) => parts.get(c.id) ?? [c]));
  return true;
}

export function loadProjectFromDisk(path: string, loaded: Project): void {
  projectPath.value = path;
  project.value = loaded;
  selectedFrameIds.value = new Set();
  selectedSourceId.value = null;
}

export function newProject(): void {
  projectPath.value = null;
  project.value = createEmptyProject();
  selectedFrameIds.value = new Set();
  selectedSourceId.value = null;
}
