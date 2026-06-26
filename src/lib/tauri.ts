// Typed wrappers around Tauri IPC. Commands land progressively across milestones;
// this module centralises the invoke signatures so the UI stays decoupled.
import { invoke } from "@tauri-apps/api/core";
import type { CropRect } from "./types";

/** Placeholder ping to the existing Rust `greet` command — replaced by real
 *  commands (import_gif, export_gif, …) in Jalon 1. Kept so the IPC path is wired. */
export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

// --- To be implemented in Jalon 1+ (signatures declared for reference) ---
// export function importGif(path: string): Promise<{ source: SourceAsset; frames: TimelineFrame[] }>;
// export function exportGif(path: string, project: Project): Promise<void>;

export type { CropRect };
