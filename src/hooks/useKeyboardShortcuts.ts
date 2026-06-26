import { useEffect } from "preact/hooks";
import { togglePlay, currentFrameIndex } from "../stores/playbackStore";
import {
  timeline,
  selectedSourceId,
  deleteSelectedFrames,
  selectedFrameIds,
  selectAllFrames,
} from "../stores/projectStore";
import { undo, redo } from "../stores/historyStore";

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const frames = timeline.value;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((mod && e.key === "y") || (mod && e.shiftKey && e.key === "z")) {
        e.preventDefault();
        redo();
        return;
      }

      if (mod && e.key === "a") {
        e.preventDefault();
        selectAllFrames();
        return;
      }

      switch (e.key) {
        case "Delete":
        case "Backspace":
          if (selectedFrameIds.value.size > 0) {
            e.preventDefault();
            deleteSelectedFrames();
          }
          break;
        case " ":
          if (frames.length > 0) {
            e.preventDefault();
            selectedSourceId.value = null;
            togglePlay();
          }
          break;
        case "ArrowRight":
          if (frames.length > 0) {
            e.preventDefault();
            selectedSourceId.value = null;
            currentFrameIndex.value = (currentFrameIndex.value + 1) % frames.length;
          }
          break;
        case "ArrowLeft":
          if (frames.length > 0) {
            e.preventDefault();
            selectedSourceId.value = null;
            currentFrameIndex.value =
              (currentFrameIndex.value - 1 + frames.length) % frames.length;
          }
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
