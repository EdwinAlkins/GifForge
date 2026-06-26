#!/usr/bin/env bash
# Benchmark import/decode pipeline. Usage:
#   GIFFORGE_BENCH=/path/to/file.gif ./scripts/bench-import.sh
#   ./scripts/bench-import.sh synthetic 100   # 100 frames @ 64×64 (default)
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-synthetic}"
COUNT="${2:-100}"

if [[ "$MODE" == "synthetic" ]]; then
  echo "Running synthetic perf tests (${COUNT} frames)…"
  cd src-tauri
  GIFFORGE_BENCH_COUNT="$COUNT" cargo test perf_synthetic_import -- --nocapture --ignored
elif [[ -n "${GIFFORGE_BENCH:-}" ]]; then
  echo "Benchmarking real GIF: $GIFFORGE_BENCH"
  cd src-tauri
  cargo test bench_decode_real_gif bench_full_import_debug -- --nocapture --ignored
else
  echo "Set GIFFORGE_BENCH=/path/to.gif or run: $0 synthetic [100|500|1000]"
  exit 1
fi
