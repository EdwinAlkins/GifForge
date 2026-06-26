/** Dev-only performance counters (no-op in production builds). */

const enabled = import.meta.env.DEV;

export const perfDev = {
  timelineRenders: 0,
  layoutMs: 0,
  assetCacheSize: 0,
  frameLoadMs: 0,

  bumpTimelineRender(): void {
    if (enabled) this.timelineRenders++;
  },

  recordLayoutMs(ms: number): void {
    if (enabled) this.layoutMs = ms;
  },

  setAssetCacheSize(n: number): void {
    if (enabled) this.assetCacheSize = n;
  },

  recordFrameLoadMs(ms: number): void {
    if (enabled) this.frameLoadMs = ms;
  },
};

if (enabled && typeof window !== "undefined") {
  (window as unknown as { __gifforgePerf: typeof perfDev }).__gifforgePerf = perfDev;
}
