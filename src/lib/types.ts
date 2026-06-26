// Shared domain types — kept in sync with the Rust models (src-tauri/src/models).

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A GIF imported into the library. Each source owns its own crop. */
export interface SourceAsset {
  id: string;
  filename: string;
  /** Path inside the .gifforge archive, e.g. "sources/chat.gif". */
  path: string;
  width: number;
  height: number;
  /** null = no crop applied to this source. */
  crop: CropRect | null;
  /** Data URL (base64 PNG) of the first frame, for the library thumbnail. */
  thumbnail?: string;
}

/** A single frame placed on the timeline, resolved back to its source via sourceId. */
export interface TimelineFrame {
  id: string;
  sourceId: string;
  /** Path inside the archive, e.g. "frames/abc.png". */
  framePath: string;
  /** Display duration in centiseconds (GIF-native unit, 1–255). */
  durationCs: number;
  /** Data URL (base64 PNG) thumbnail for the timeline clip. */
  thumbnail?: string;
}

export interface Project {
  version: number;
  name: string;
  createdAt: string;
  modifiedAt: string;
  sources: SourceAsset[];
  timeline: TimelineFrame[];
}
