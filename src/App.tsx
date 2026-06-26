import { useEffect } from "preact/hooks";
import { AppShell } from "./components/layout/AppShell";
import { project, createEmptyProject, setProject } from "./stores/projectStore";
import { clearHistory } from "./stores/historyStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

export function App() {
  useKeyboardShortcuts();

  // Start with an empty in-memory project; saving will prompt for a path (Jalon 2).
  useEffect(() => {
    if (project.value === null) {
      setProject(createEmptyProject());
      clearHistory();
    }
  }, []);

  return <AppShell />;
}

export default App;
