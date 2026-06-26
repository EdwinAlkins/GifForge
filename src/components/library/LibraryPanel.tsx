import { sources, selectedSourceId, selectSource } from "../../stores/projectStore";

/** Library of imported GIF sources. Selecting a source enters crop-edit mode
 *  (handled by the PreviewPanel). Import wiring lands in Jalon 1. */
export function LibraryPanel() {
  return (
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 class="font-medium text-neutral-300">Bibliothèque</h2>
        <button
          type="button"
          disabled
          class="rounded bg-accent px-2 py-1 text-xs font-medium text-white opacity-50"
          title="À venir (Jalon 1)"
        >
          + Importer
        </button>
      </header>

      <div class="flex-1 overflow-y-auto p-2">
        {sources.value.length === 0 ? (
          <p class="px-1 py-6 text-center text-xs text-neutral-500">
            Aucun GIF importé.
          </p>
        ) : (
          <ul class="space-y-1">
            {sources.value.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectSource(s.id)}
                  class={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                    selectedSourceId.value === s.id
                      ? "bg-accent-soft text-white"
                      : "hover:bg-panel-2 text-neutral-300"
                  }`}
                >
                  <span class="h-8 w-8 shrink-0 rounded bg-neutral-700" />
                  <span class="truncate text-xs">{s.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
