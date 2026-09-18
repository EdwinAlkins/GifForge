// Typed wrappers around Tauri IPC, kept in sync with src-tauri/src/commands.
import { invoke } from "@tauri-apps/api/core";
import type {
  CropRect,
  ExportQuality,
  Project,
  SourceAsset,
  TimelineFrame,
  WireProject,
} from "./types";
import {
  projectForSavePayload,
  projectFromWire,
  resolveFrameCachePath,
  sourcesForExportPayload,
} from "./types";
import { MAX_DURATION_CS, type Segment } from "./timelineModel";

export interface ImportResult {
  source: SourceAsset;
  frames: TimelineFrame[];
}

export function importGif(path: string): Promise<ImportResult> {
  return invoke<ImportResult>("import_gif", { path });
}

interface ExportSegmentPayload {
  durationCs: number;
  layers: TimelineFrame[];
}

/**
 * Export the render plan: one GIF frame per segment (layers composited by Rust).
 * Segments longer than the 16-bit GIF delay (long gaps) are split.
 */
export function exportGif(
  path: string,
  segments: Segment[],
  sources: SourceAsset[],
  project: Project | null,
  quality: ExportQuality = "fast",
): Promise<void> {
  const payload: ExportSegmentPayload[] = [];
  for (const seg of segments) {
    const layers = seg.layers.map(({ thumbnail: _t, ...f }) => ({
      ...f,
      framePath: resolveFrameCachePath(f, project),
    }));
    const missing = layers.find((f) => !f.framePath);
    if (missing) {
      return Promise.reject(
        new Error(
          `Cache frame introuvable (source ${missing.sourceId}, index ${missing.sourceFrameIndex ?? 0}). Réimportez le GIF ou rouvrez le projet.`,
        ),
      );
    }
    for (let left = seg.durationCs; left > 0; left -= MAX_DURATION_CS) {
      payload.push({ durationCs: Math.min(left, MAX_DURATION_CS), layers });
    }
  }

  return invoke<void>("export_gif", {
    payload: {
      path,
      segments: payload,
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

export async function openProject(path: string): Promise<Project> {
  return projectFromWire(await invoke<WireProject>("open_project", { path }));
}
