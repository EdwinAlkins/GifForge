import { sources } from "../../stores/projectStore";
import { pickAndImport } from "../../lib/actions";
import { busy } from "../../stores/uiStore";
import { SourceItem } from "./SourceItem";

export function LibraryPanel() {
  return (
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 class="font-medium text-neutral-300">Library</h2>
        <button
          type="button"
          disabled={busy.value !== null}
          onClick={pickAndImport}
          class="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          + Import
        </button>
      </header>

      <div class="flex-1 overflow-y-auto p-2">
        {sources.value.length === 0 ? (
          <p class="px-1 py-6 text-center text-xs text-neutral-500">
            No GIF imported.
          </p>
        ) : (
          <ul class="space-y-1">
            {sources.value.map((s) => (
              <SourceItem key={s.id} source={s} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
