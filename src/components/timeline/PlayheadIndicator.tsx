import type { ClipLayout } from "../../lib/timelineLayout";
import { TRACK_HEIGHT, RULER_HEIGHT } from "../../lib/timelineLayout";

interface Props {
  layout: ClipLayout | null;
}

/** Single playhead overlay — avoids re-rendering every clip on each frame advance. */
export function PlayheadIndicator({ layout }: Props) {
  if (!layout) return null;

  return (
    <div
      class="pointer-events-none absolute z-15 rounded ring-2 ring-accent/90"
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        boxShadow: "0 0 0 1px rgba(59,130,246,0.5)",
      }}
    />
  );
}

export { RULER_HEIGHT, TRACK_HEIGHT };
