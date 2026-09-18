# GifForge

Frame-by-frame GIF editor for Linux — a non-linear video editor (NLE)-style interface built with **Tauri 2**, **Preact**, and **Rust**.

## Features

- Import one or more GIFs into the library
- Horizontal timeline with thumbnails, playback, and playhead
- Multi-frame deletion (Shift-click, Delete key)
- Per-frame duration editing (1–255 centiseconds)
- Drag-and-drop reordering
- **Per-source GIF** cropping (the “Crop” button in the library)
- Multi-GIF composition (“+ Timeline” on a source)
- GIF export with adjustable quality (fast / balanced / light)
- Project saving in `.gifforge` (ZIP) format

## Timeline (NLE)

- **Zoom**: slider, +/− buttons, 100%, or Ctrl+wheel over the timeline
- **Multiple tracks**: “+ Track” button — drag a selection to V1, V2, …
- **Marquee selection**: click-drag on the background to draw a selection area
- **Multi-selection**: Shift-click, marquee, “Select all”, Ctrl+A
- **Group movement**: drag a selected frame (the whole selection follows)
- **Group deletion**: Delete or the “Delete (N)” button
- **Export**: track 0 → 1 → … order (each track’s frames from left to right)

## Keyboard shortcuts

| Key | Action |
|--------|--------|
| Space | Play / pause |
| ← / → | Previous / next frame |
| Delete | Delete selected frames |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+A | Select all (timeline) |

## Development

Requirements: Node.js 20+, stable Rust, WebKitGTK (Linux).

```bash
npm install
npm run tauri dev
```

## Tests

```bash
cd src-tauri && cargo test
npm run build
```

Local synthetic benchmark:

```bash
chmod +x scripts/bench-import.sh
./scripts/bench-import.sh synthetic 100
```

## Saving (`.gifforge`)

The project file contains only **`project.json`** (timeline metadata, crops, and durations) and the original **source GIFs** — no frame PNGs. When opened, the cache is rebuilt automatically by decoding the sources again.

## Performance

GifForge targets large GIFs (1000+ frames, 1080p). Key optimizations:

| Area | Approach |
|------|----------|
| IPC | Disk paths through `convertFileSrc`, no base64 |
| Decode Rust | Frame-by-frame streaming, parallel PNG batches |
| Timeline | Horizontal virtualization, single playhead overlay |
| Preview | Prefetch ±8 frames, asset LRU cache |
| Undo | Immutable snapshots without `structuredClone` or inline thumbnails |

**Recommended limits**: 8 GB RAM, SSD, 1000 frames at 1080p comfortably; imports may take longer beyond 2000 frames.

**CI baseline**: `perf_synthetic_import_100_frames` (100 frames at 64×64, < 30 s).

Dev metrics: `window.__gifforgePerf` in development mode.

## Build Linux (deb / AppImage)

```bash
npm run tauri build
```

Artifacts are located in `src-tauri/target/release/bundle/`.

## Releases

To publish a downloadable version, update the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, commit the changes, and push a matching tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions then builds the Linux `.deb` and `.AppImage` bundles and attaches them to a new GitHub Release.
