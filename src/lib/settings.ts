/** Tunable performance defaults (optional user overrides later). */

/** Warn in console when a GIF exceeds this frame count. */
export const LARGE_GIF_FRAME_WARNING = 500;

/** Hard confirmation threshold (future UI dialog). */
export const LARGE_GIF_FRAME_CONFIRM = 2000;

/** Frames decoded ahead of / behind the playhead while playing. */
export const PREFETCH_AHEAD = 8;
export const PREFETCH_BEHIND = 4;

/** LRU cache sizes for full-res and thumbnail asset URLs. */
export const FULL_RES_CACHE_MAX = 32;
export const THUMB_CACHE_MAX = 256;

/** Undo history depth for large projects. */
export const MAX_UNDO_HISTORY = 30;
