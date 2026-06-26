import { open, save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { importGif, saveProject, openProject } from "./tauri";
import {
  addImported,
  project,
  projectPath,
  loadProjectFromDisk,
  newProject,
} from "../stores/projectStore";
import { busy, progress, reportError } from "../stores/uiStore";
import { clearHistory } from "../stores/historyStore";
import { clearAssetCache } from "./assetCache";
import { clearAssetUrlCache } from "./assetUrls";
import { LARGE_GIF_FRAME_WARNING } from "./settings";

function bindImportProgress() {
  return listen<{ phase?: string; done: number; total: number }>(
    "import-progress",
    (e) => {
      const { phase, done, total } = e.payload;
      if (phase === "decode") {
        busy.value = total > 0 ? `Décodage… ${done}/${total}` : `Décodage… ${done} frames`;
        progress.value = total > 0 ? { phase, done, total } : { phase, done, total: 0 };
      } else {
        busy.value = "Mise en cache…";
        progress.value = { phase: "cache", done, total };
      }
    },
  );
}

function bindSaveProgress() {
  return listen<{ done: number; total: number }>("save-progress", (e) => {
    busy.value = "Sauvegarde…";
    progress.value = e.payload;
  });
}

function bindOpenProgress() {
  return listen<{ phase?: string; done: number; total: number }>(
    "open-progress",
    (e) => {
      const { phase, done, total } = e.payload;
      if (phase === "extract") {
        busy.value = "Extraction de l'archive…";
        progress.value = null;
      } else {
        busy.value = `Reconstruction du cache… ${done}/${total}`;
        progress.value = { phase, done, total };
      }
    },
  );
}

/** Prompt for one or more GIFs, import each, and append to the timeline. */
export async function pickAndImport(): Promise<void> {
  const selection = await open({
    multiple: true,
    filters: [{ name: "GIF", extensions: ["gif"] }],
  });
  if (!selection) return;
  const paths = Array.isArray(selection) ? selection : [selection];

  const unlisten = await bindImportProgress();
  try {
    for (const path of paths) {
      progress.value = null;
      busy.value = "Décodage…";
      const result = await importGif(path);
      if (result.frames.length >= LARGE_GIF_FRAME_WARNING) {
        console.warn(
          `GIF volumineux : ${result.frames.length} frames — l'import peut être long.`,
        );
      }
      addImported(result);
    }
  } catch (err) {
    reportError(err);
  } finally {
    unlisten();
    progress.value = null;
    busy.value = null;
  }
}

export async function pickAndSaveProject(): Promise<void> {
  const p = project.value;
  if (!p) return;

  let path = projectPath.value;
  if (!path) {
    path = await save({
      defaultPath: `${p.name}.gifforge`,
      filters: [{ name: "Projet GifForge", extensions: ["gifforge"] }],
    });
    if (!path) return;
  }

  busy.value = "Sauvegarde…";
  progress.value = { done: 0, total: p.sources.length + 1 };
  const unlisten = await bindSaveProgress();
  try {
    await saveProject(path, p);
    projectPath.value = path;
  } catch (err) {
    reportError(err);
  } finally {
    unlisten();
    progress.value = null;
    busy.value = null;
  }
}

export async function pickAndOpenProject(): Promise<void> {
  const path = await open({
    filters: [{ name: "Projet GifForge", extensions: ["gifforge"] }],
  });
  if (!path || Array.isArray(path)) return;

  busy.value = "Ouverture…";
  progress.value = null;
  const unlisten = await bindOpenProgress();
  try {
    clearAssetCache();
    clearAssetUrlCache();
    const loaded = await openProject(path);
    loadProjectFromDisk(path, loaded);
    clearHistory();
  } catch (err) {
    reportError(err);
  } finally {
    unlisten();
    progress.value = null;
    busy.value = null;
  }
}

export function createNewProject(): void {
  clearAssetCache();
  clearAssetUrlCache();
  newProject();
  clearHistory();
}
