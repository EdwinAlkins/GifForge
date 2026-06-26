import { signal } from "@preact/signals";

/** Index of the frame shown in the preview during timeline playback. */
export const currentFrameIndex = signal<number>(0);

export const isPlaying = signal<boolean>(false);

export function togglePlay(): void {
  isPlaying.value = !isPlaying.value;
}

export function stop(): void {
  isPlaying.value = false;
  currentFrameIndex.value = 0;
}
