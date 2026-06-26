import { signal, computed } from "@preact/signals";
import type { Project, SourceAsset, TimelineFrame, CropRect } from "../lib/types";

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
  };
}

/** Replace the project, stamping modifiedAt. Use for any mutation. */
export function setProject(next: Project): void {
  project.value = { ...next, modifiedAt: new Date().toISOString() };
}

export function selectSource(id: string | null): void {
  selectedSourceId.value = id;
}

export function setSourceCrop(sourceId: string, crop: CropRect | null): void {
  const p = project.value;
  if (!p) return;
  setProject({
    ...p,
    sources: p.sources.map((s) => (s.id === sourceId ? { ...s, crop } : s)),
  });
}
