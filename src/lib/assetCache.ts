import { getCroppedFramePath } from "./tauri";
import type { CropRect } from "./types";
import { assetUrl, cropCacheKey, frameAssetUrl } from "./assetUrls";
import { perfDev } from "./perfDev";

const FULL_MAX = 32;
const THUMB_MAX = 256;

class LruCache {
  private map = new Map<string, string>();

  constructor(private max: number) {}

  get(key: string): string | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    perfDev.setAssetCacheSize(this.map.size);
  }

  clear(): void {
    this.map.clear();
    perfDev.setAssetCacheSize(0);
  }
}

const fullCache = new LruCache(FULL_MAX);
const thumbCache = new LruCache(THUMB_MAX);
const inflight = new Map<string, Promise<string>>();

export function peekFrameUrl(
  framePath: string,
  crop?: CropRect | null,
): string | undefined {
  const key = crop ? cropCacheKey(framePath, crop) : framePath;
  return fullCache.get(key);
}

export async function loadFrameUrl(
  framePath: string,
  crop?: CropRect | null,
): Promise<string> {
  const t0 = performance.now();
  const key = crop ? cropCacheKey(framePath, crop) : framePath;

  const cached = fullCache.get(key);
  if (cached) return cached;

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      let path = framePath;
      if (crop) {
        path = await getCroppedFramePath(framePath, crop);
      }
      const url = frameAssetUrl(path);
      fullCache.set(key, url);
      inflight.delete(key);
      perfDev.recordFrameLoadMs(performance.now() - t0);
      return url;
    })().catch((err) => {
      inflight.delete(key);
      throw err;
    });
    inflight.set(key, pending);
  }
  return pending;
}

export function resolveThumbUrl(thumbnailPath?: string, legacy?: string): string | undefined {
  if (thumbnailPath) {
    const cached = thumbCache.get(thumbnailPath);
    if (cached) return cached;
    const url = assetUrl(thumbnailPath);
    thumbCache.set(thumbnailPath, url);
    return url;
  }
  return legacy;
}

export function clearAssetCache(): void {
  fullCache.clear();
  thumbCache.clear();
  inflight.clear();
}
