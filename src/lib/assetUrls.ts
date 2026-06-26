import { convertFileSrc } from "@tauri-apps/api/core";
import type { CropRect } from "./types";

const urlCache = new Map<string, string>();

/** Convert an absolute filesystem path to a Tauri asset URL (cached). */
export function assetUrl(path: string): string {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const url = convertFileSrc(path);
  urlCache.set(path, url);
  return url;
}

export function thumbAssetUrl(thumbnailPath?: string, legacyDataUrl?: string): string | undefined {
  if (thumbnailPath) return assetUrl(thumbnailPath);
  return legacyDataUrl;
}

export function frameAssetUrl(framePath: string): string {
  return assetUrl(framePath);
}

export function cropCacheKey(framePath: string, crop: CropRect): string {
  return `${framePath}:${crop.x},${crop.y},${crop.width},${crop.height}`;
}

export function clearAssetUrlCache(): void {
  urlCache.clear();
}
