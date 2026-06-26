import { signal } from "@preact/signals";

/** A long-running backend op (import/export/save/open) is in progress. */
export const busy = signal<string | null>(null);

/** Progress for the current op. `total === 0` means indeterminate (no bar). */
export const progress = signal<{
  done: number;
  total: number;
  phase?: string;
} | null>(null);

export const errorMessage = signal<string | null>(null);

export function reportError(err: unknown): void {
  errorMessage.value = err instanceof Error ? err.message : String(err);
  console.error(err);
}

export function progressPercent(p: { done: number; total: number } | null): number | null {
  if (!p || p.total <= 0) return null;
  return Math.min(100, Math.round((p.done / p.total) * 100));
}
