import { LibraryPanel } from "../library/LibraryPanel";
import { PreviewPanel } from "../preview/PreviewPanel";
import { TimelinePanel } from "../timeline/TimelinePanel";

/**
 * Three-panel NLE layout:
 *   ┌─────────────┬──────────────────────────┐
 *   │  Library    │        Preview           │
 *   ├─────────────┴──────────────────────────┤
 *   │              Timeline                   │
 *   └─────────────────────────────────────────┘
 */
export function AppShell() {
  return (
    <div class="grid h-full grid-cols-[240px_1fr] grid-rows-[1fr_220px] bg-app text-sm">
      <aside class="row-start-1 col-start-1 overflow-y-auto border-r border-edge bg-panel">
        <LibraryPanel />
      </aside>

      <main class="row-start-1 col-start-2 overflow-hidden bg-app">
        <PreviewPanel />
      </main>

      <footer class="row-start-2 col-span-2 overflow-hidden border-t border-edge bg-panel">
        <TimelinePanel />
      </footer>
    </div>
  );
}
