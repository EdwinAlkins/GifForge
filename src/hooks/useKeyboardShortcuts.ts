import { useEffect } from "preact/hooks";
import { togglePlay, stepFrame, seek, splitAtPlayhead } from "../stores/playbackStore";
import { MS_PER_CS } from "../lib/timelineModel";
import {
  timelineModel,
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

      const empty = timelineModel.value.frameCount === 0;
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
          if (!empty) {
            e.preventDefault();
            selectedSourceId.value = null;
            togglePlay();
          }
          break;
        case "ArrowRight":
          if (!empty) {
            e.preventDefault();
            selectedSourceId.value = null;
            stepFrame(1);
          }
          break;
        case "s":
        case "S":
          if (!empty && !mod) {
            e.preventDefault();
            splitAtPlayhead();
          }
          break;
        case "Home":
          e.preventDefault();
          seek(0);
          break;
        case "End":
          e.preventDefault();
          seek(timelineModel.value.endCs * MS_PER_CS);
          break;
        case "ArrowLeft":
          if (!empty) {
            e.preventDefault();
            selectedSourceId.value = null;
            stepFrame(-1);
          }
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
