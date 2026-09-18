import { getCroppedFramePath } from "./tauri";
import type { CropRect } from "./types";
import { assetUrl, cropCacheKey, frameAssetUrl } from "./assetUrls";
import { perfDev } from "./perfDev";

const FULL_MAX = 32;
const THUMB_MAX = 256;
/** Decoded full-res frames kept alive (≈ 8 MB each at 1080p). */
const DECODED_MAX = 16;

class LruCache<V = string> {
  private map = new Map<string, V>();

  constructor(private max: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    perfDev.setAssetCacheSize(this.map.size);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    perfDev.setAssetCacheSize(0);
  }
}

const fullCache = new LruCache(FULL_MAX);
const thumbCache = new LruCache(THUMB_MAX);
const inflight = new Map<string, Promise<string>>();
/** Decode promises by asset URL: holding the element keeps WebKit's decoded bitmap alive. */
const decodedCache = new LruCache<Promise<HTMLImageElement>>(DECODED_MAX);

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

/**
 * Resolve and fully decode a frame ahead of display, so that swapping the preview `src`
 * during playback does not wait on PNG decoding.
 */
export async function prefetchFrame(framePath: string, crop?: CropRect | null): Promise<void> {
  const url = await loadFrameUrl(framePath, crop);
  if (decodedCache.get(url)) return;
  const img = new Image();
  img.src = url;
  const decoding = img.decode().then(() => img);
  decodedCache.set(url, decoding);
  await decoding.catch((err) => {
    decodedCache.delete(url);
    throw err;
  });
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
  decodedCache.clear();
  inflight.clear();
}
