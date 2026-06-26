import { Toolbar } from "./Toolbar";
import { LibraryPanel } from "../library/LibraryPanel";
import { PreviewPanel } from "../preview/PreviewPanel";
import { TimelinePanel } from "../timeline/TimelinePanel";

/**
 * NLE layout:
 *   ┌─────────────────────────────────────────┐
 *   │              Toolbar                     │
 *   ├─────────────┬──────────────────────────┤
 *   │  Library    │        Preview           │
 *   ├─────────────┴──────────────────────────┤
 *   │              Timeline                   │
 *   └─────────────────────────────────────────┘
 */
export function AppShell() {
  return (
    <div class="grid h-full grid-cols-[240px_1fr] grid-rows-[auto_1fr_320px] bg-app text-sm">
      <header class="col-span-2">
        <Toolbar />
      </header>

      <aside class="overflow-y-auto border-r border-edge bg-panel">
        <LibraryPanel />
      </aside>

      <main class="overflow-hidden bg-app">
        <PreviewPanel />
      </main>

      <footer class="col-span-2 overflow-hidden border-t border-edge bg-panel">
        <TimelinePanel />
      </footer>
    </div>
  );
}
