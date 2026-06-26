import { signal } from "@preact/signals";
import type { Project } from "../lib/types";
import { snapshotForHistory } from "../lib/types";
import { project } from "./projectStore";

const MAX_HISTORY = 30;

export const past = signal<Project[]>([]);
export const future = signal<Project[]>([]);

/** Snapshot current project before a mutating edit (paths only, no inline thumbs). */
export function pushHistory(): void {
  const p = project.value;
  if (!p) return;
  past.value = [...past.value.slice(-(MAX_HISTORY - 1)), snapshotForHistory(p)];
  future.value = [];
}

export function undo(): void {
  if (past.value.length === 0) return;
  const current = project.value;
  if (current) {
    future.value = [snapshotForHistory(current), ...future.value];
  }
  const prev = past.value[past.value.length - 1];
  past.value = past.value.slice(0, -1);
  project.value = prev;
}

export function redo(): void {
  if (future.value.length === 0) return;
  const current = project.value;
  if (current) {
    past.value = [...past.value, snapshotForHistory(current)];
  }
  const next = future.value[0];
  future.value = future.value.slice(1);
  project.value = next;
}

export function clearHistory(): void {
  past.value = [];
  future.value = [];
}
