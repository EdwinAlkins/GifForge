// Typed wrappers around Tauri IPC, kept in sync with src-tauri/src/commands.
import { invoke } from "@tauri-apps/api/core";
import type {
  CropRect,
  ExportQuality,
  Project,
  SourceAsset,
  TimelineFrame,
} from "./types";
import {
  framesForExportPayload,
  projectForSavePayload,
  sourcesForExportPayload,
} from "./types";

export interface ImportResult {
  source: SourceAsset;
  frames: TimelineFrame[];
}

export function importGif(path: string): Promise<ImportResult> {
  return invoke<ImportResult>("import_gif", { path });
}

export function exportGif(
  path: string,
  frames: TimelineFrame[],
  sources: SourceAsset[],
  project: Project | null,
  quality: ExportQuality = "fast",
): Promise<void> {
  const resolved = framesForExportPayload(frames, project);
  const missing = resolved.find((f) => !f.framePath);
  if (missing) {
    return Promise.reject(
      new Error(
        `Cache frame introuvable (source ${missing.sourceId}, index ${missing.sourceFrameIndex ?? 0}). Réimportez le GIF ou rouvrez le projet.`,
      ),
    );
  }

  return invoke<void>("export_gif", {
    payload: {
      path,
      frames: resolved,
      sources: sourcesForExportPayload(sources),
      quality,
    },
  });
}

export function getCroppedFramePath(
  framePath: string,
  crop: CropRect,
): Promise<string> {
  return invoke<string>("get_cropped_frame_path", { framePath, crop });
}

export function getFrameData(
  framePath: string,
  crop?: CropRect | null,
): Promise<string> {
  return invoke<string>("get_frame_data", { framePath, crop: crop ?? null });
}

/** Save project as `.gifforge` (JSON + source GIFs only). */
export function saveProject(path: string, proj: Project): Promise<void> {
  return invoke<void>("save_project", {
    payload: { path, project: projectForSavePayload(proj) },
  });
}

export function openProject(path: string): Promise<Project> {
  return invoke<Project>("open_project", { path });
}
