import { useState } from "preact/hooks";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  pickAndImport,
  pickAndSaveProject,
  pickAndOpenProject,
  createNewProject,
} from "../../lib/actions";
import { exportGif } from "../../lib/tauri";
import { renderPlan, sources, projectPath, project } from "../../stores/projectStore";
import { busy, errorMessage, progress, progressPercent, reportError } from "../../stores/uiStore";
import type { ExportQuality } from "../../lib/types";

export function Toolbar() {
  const isBusy = busy.value !== null;
  const pct = progressPercent(progress.value);
  const [exportQuality, setExportQuality] = useState<ExportQuality>("balanced");

  async function handleExport() {
    const segments = renderPlan.value.segments;
    if (segments.length === 0) return;

    const path = await save({
      defaultPath: "export.gif",
      filters: [{ name: "GIF", extensions: ["gif"] }],
    });
    if (!path) return;

    busy.value = "Export — encoding…";
    progress.value = { done: 0, total: segments.length };
    const unlisten = await listen<{ done: number; total: number }>(
      "export-progress",
      (e) => {
        progress.value = e.payload;
      },
    );
    try {
      await exportGif(
        path,
        segments,
        sources.value,
        project.value,
        exportQuality,
      );
    } catch (err) {
      reportError(err);
    } finally {
      unlisten();
      progress.value = null;
      busy.value = null;
    }
  }

  return (
    <div class="flex items-center gap-2 border-b border-edge bg-panel px-3 py-1.5">
      <span class="mr-2 font-semibold tracking-wide text-neutral-200">GifForge</span>

      <button
        type="button"
        disabled={isBusy}
        onClick={createNewProject}
        class="rounded bg-panel-2 px-2 py-1 text-xs text-neutral-300 hover:bg-edge disabled:opacity-50"
      >
        New
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={pickAndOpenProject}
        class="rounded bg-panel-2 px-2 py-1 text-xs text-neutral-300 hover:bg-edge disabled:opacity-50"
      >
        Open
      </button>
      <button
        type="button"
        disabled={isBusy}
        onClick={pickAndSaveProject}
        class="rounded bg-panel-2 px-2 py-1 text-xs text-neutral-300 hover:bg-edge disabled:opacity-50"
        title={projectPath.value ?? "Unsaved project"}
      >
        Save
      </button>

      <span class="mx-1 h-4 w-px bg-edge" />

      <button
        type="button"
        disabled={isBusy}
        onClick={pickAndImport}
        class="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
      >
        Import
      </button>

      <select
        value={exportQuality}
        onChange={(e) => setExportQuality(e.currentTarget.value as ExportQuality)}
        class="rounded border border-edge bg-panel-2 px-1 py-1 text-xs text-neutral-300"
        title="Export quality"
      >
        <option value="fast">Fast export</option>
        <option value="balanced">Balanced export</option>
        <option value="light">Light export</option>
      </select>

      <button
        type="button"
        disabled={isBusy || renderPlan.value.segments.length === 0}
        onClick={handleExport}
        class="rounded bg-panel-2 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-edge disabled:opacity-40"
      >
        Export
      </button>

      <div class="ml-auto flex items-center gap-2 text-xs">
        {busy.value ? (
          <>
            {pct !== null && (
              <span class="h-1.5 w-32 overflow-hidden rounded bg-panel-2">
                <span
                  class="block h-full bg-accent transition-[width] duration-150"
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
            <span class="text-accent">
              {busy.value}
              {pct !== null ? ` ${pct}%` : ""}
            </span>
          </>
        ) : errorMessage.value ? (
          <span class="text-red-400" title={errorMessage.value}>
            ⚠ {errorMessage.value}
          </span>
        ) : projectPath.value ? (
          <span class="max-w-[200px] truncate text-neutral-500" title={projectPath.value}>
            {projectPath.value.split("/").pop()}
          </span>
        ) : null}
      </div>
    </div>
  );
}
