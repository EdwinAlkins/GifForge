import { signal, computed } from "@preact/signals";
import type { Project, SourceAsset, TimelineFrame, CropRect } from "../lib/types";
import type { ImportResult } from "../lib/tauri";
import { pushHistory } from "./historyStore";
import { currentFrameIndex } from "./playbackStore";
import { invalidateLayoutMemo } from "../lib/timelineLayoutMemo";

/** The currently open project. null until a project is created or opened. */
export const project = signal<Project | null>(null);

/** Path of the .gifforge file on disk, null for an unsaved new project. */
export const projectPath = signal<string | null>(null);

/** Source selected in the library (drives crop-edit mode in the preview). */
export const selectedSourceId = signal<string | null>(null);

/** Timeline frames currently selected (multi-select for deletion / duration edits). */
export const selectedFrameIds = signal<Set<string>>(new Set());

export const sources = computed<SourceAsset[]>(() => project.value?.sources ?? []);
export const timeline = computed<TimelineFrame[]>(() => project.value?.timeline ?? []);

export function createEmptyProject(name = "Sans titre"): Project {
  const now = new Date().toISOString();
  return {
    version: 1,
    name,
    createdAt: now,
    modifiedAt: now,
    sources: [],
    timeline: [],
    sourceFrames: {},
  };
}

/** Replace the project, stamping modifiedAt. Use for any mutation. */
export function setProject(next: Project): void {
  invalidateLayoutMemo();
  project.value = { ...next, modifiedAt: new Date().toISOString() };
}

export function selectSource(id: string | null): void {
  selectedSourceId.value = id;
}

/** Append an imported GIF's source and its frames to the current project. */
export function addImported({ source, frames }: ImportResult): void {
  pushHistory();
  const p = project.value ?? createEmptyProject();
  setProject({
    ...p,
    sources: [...p.sources, source],
    timeline: [...p.timeline, ...frames],
    sourceFrames: { ...p.sourceFrames, [source.id]: frames },
  });
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

export function selectFrameRange(frameIds: string[], extend: boolean): void {
  const next = extend ? new Set(selectedFrameIds.value) : new Set<string>();
  for (const id of frameIds) next.add(id);
  selectedFrameIds.value = next;
  selectedSourceId.value = null;
}

export function selectAllFrames(): void {
  const p = project.value;
  if (!p) return;
  selectedFrameIds.value = new Set(p.timeline.map((f) => f.id));
  selectedSourceId.value = null;
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

export function deleteSelectedFrames(): void {
  const ids = selectedFrameIds.value;
  if (ids.size === 0) return;
  const p = project.value;
  if (!p) return;
  pushHistory();
  const timelineNext = p.timeline.filter((f) => !ids.has(f.id));
  setProject({ ...p, timeline: timelineNext });
  selectedFrameIds.value = new Set();
  if (currentFrameIndex.value >= timelineNext.length) {
    currentFrameIndex.value = Math.max(0, timelineNext.length - 1);
  }
}

export function setFrameDuration(frameId: string, durationCs: number): void {
  const clamped = Math.min(255, Math.max(1, Math.round(durationCs)));
  const p = project.value;
  if (!p) return;
  pushHistory();
  setProject({
    ...p,
    timeline: p.timeline.map((f) =>
      f.id === frameId ? { ...f, durationCs: clamped } : f,
    ),
  });
}

export function setSelectedFramesDuration(durationCs: number): void {
  const ids = selectedFrameIds.value;
  if (ids.size === 0) return;
  const clamped = Math.min(255, Math.max(1, Math.round(durationCs)));
  const p = project.value;
  if (!p) return;
  pushHistory();
  setProject({
    ...p,
    timeline: p.timeline.map((f) =>
      ids.has(f.id) ? { ...f, durationCs: clamped } : f,
    ),
  });
}

export function reorderTimeline(fromIndex: number, toIndex: number): void {
  const p = project.value;
  if (!p || fromIndex === toIndex) return;
  const tl = [...p.timeline];
  const [item] = tl.splice(fromIndex, 1);
  tl.splice(toIndex, 0, item);
  pushHistory();
  setProject({ ...p, timeline: tl });
}

/**
 * Move all selected frames to a target track and insert position (block move).
 * Preserves relative order within the selection.
 */
export function moveSelectedFrames(
  targetTrack: number,
  insertBeforeGlobalIndex: number,
): void {
  const ids = selectedFrameIds.value;
  if (ids.size === 0) return;
  const p = project.value;
  if (!p) return;

  const selected = p.timeline.filter((f) => ids.has(f.id));
  const remaining = p.timeline.filter((f) => !ids.has(f.id));
  const moved = selected.map((f) => ({ ...f, trackIndex: targetTrack }));

  let insertAt = insertBeforeGlobalIndex;
  for (const f of p.timeline.slice(0, insertBeforeGlobalIndex)) {
    if (ids.has(f.id)) insertAt--;
  }
  insertAt = Math.max(0, Math.min(remaining.length, insertAt));

  pushHistory();
  const newTimeline = [
    ...remaining.slice(0, insertAt),
    ...moved,
    ...remaining.slice(insertAt),
  ];
  setProject({ ...p, timeline: newTimeline });
  selectedFrameIds.value = new Set(moved.map((f) => f.id));
}

/** Move a contiguous block (already selected) by drag-drop between two global indices. */
export function moveFrameBlock(fromIndices: number[], toGlobalIndex: number): void {
  if (fromIndices.length === 0) return;
  const p = project.value;
  if (!p) return;

  const ids = new Set(fromIndices.map((i) => p.timeline[i].id));
  const selected = p.timeline.filter((f) => ids.has(f.id));
  const remaining = p.timeline.filter((f) => !ids.has(f.id));

  let insertAt = toGlobalIndex;
  for (let i = 0; i < toGlobalIndex; i++) {
    if (ids.has(p.timeline[i].id)) insertAt--;
  }
  insertAt = Math.max(0, Math.min(remaining.length, insertAt));

  pushHistory();
  setProject({
    ...p,
    timeline: [...remaining.slice(0, insertAt), ...selected, ...remaining.slice(insertAt)],
  });
}

/** Append copies of a source's frames to the timeline (multi-GIF merge). */
export function appendSourceToTimeline(sourceId: string, atPlayhead = false): void {
  const p = project.value;
  if (!p) return;

  const bank = p.sourceFrames?.[sourceId];
  const seenIndices = new Set<number>();
  const template =
    bank ??
    p.timeline.filter((f) => {
      if (f.sourceId !== sourceId || seenIndices.has(f.sourceFrameIndex ?? 0)) return false;
      seenIndices.add(f.sourceFrameIndex ?? 0);
      return true;
    });
  if (template.length === 0) return;

  pushHistory();
  const clones = template.map((f) => ({
    ...f,
    id: crypto.randomUUID(),
    thumbnail: undefined,
  }));

  let tl = [...p.timeline];
  if (atPlayhead && tl.length > 0) {
    const idx = Math.min(currentFrameIndex.value + 1, tl.length);
    tl.splice(idx, 0, ...clones);
  } else {
    tl = [...tl, ...clones];
  }
  setProject({ ...p, timeline: tl });
}

export function loadProjectFromDisk(path: string, loaded: Project): void {
  projectPath.value = path;
  project.value = loaded;
  selectedFrameIds.value = new Set();
  selectedSourceId.value = null;
  currentFrameIndex.value = 0;
}

export function newProject(): void {
  projectPath.value = null;
  project.value = createEmptyProject();
  selectedFrameIds.value = new Set();
  selectedSourceId.value = null;
  currentFrameIndex.value = 0;
}
