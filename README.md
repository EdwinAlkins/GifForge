# GifForge

Éditeur de GIFs frame par frame pour Linux — interface type montage vidéo (NLE), construit avec **Tauri 2**, **Preact** et **Rust**.

## Fonctionnalités

- Import de un ou plusieurs GIFs dans la bibliothèque
- Timeline horizontale avec vignettes, lecture et playhead
- Suppression multi-frames (Shift+clic, touche Suppr)
- Édition de la durée par frame (1–255 centisecondes)
- Réordonnancement par glisser-déposer
- Recadrage **par GIF source** (bouton « Recadrer » dans la bibliothèque)
- Fusion multi-GIF (« + Timeline » sur une source)
- Export GIF avec qualité réglable (rapide / équilibré / léger)
- Sauvegarde de projet au format `.gifforge` (ZIP)

## Timeline (NLE)

- **Zoom** : slider, boutons +/−, 100%, ou Ctrl+molette sur la timeline
- **Multi-pistes** : bouton « + Piste » — glissez une sélection vers V1, V2, …
- **Sélection lasso** : clic-drag sur le fond pour dessiner une zone de sélection
- **Multi-sélection** : Shift+clic, lasso, « Tout sélectionner », Ctrl+A
- **Déplacement groupé** : glissez une frame sélectionnée (toute la sélection suit)
- **Suppression groupée** : Suppr ou bouton « Supprimer (N) »
- **Export** : ordre piste 0 → 1 → … (frames de chaque piste de gauche à droite)

## Raccourcis clavier

| Touche | Action |
|--------|--------|
| Espace | Lecture / pause |
| ← / → | Frame précédente / suivante |
| Suppr | Supprimer les frames sélectionnées |
| Ctrl+Z | Annuler |
| Ctrl+Y | Rétablir |
| Ctrl+A | Tout sélectionner (timeline) |

## Développement

Prérequis : Node.js 20+, Rust stable, WebKitGTK (Linux).

```bash
npm install
npm run tauri dev
```

## Tests

```bash
cd src-tauri && cargo test
npm run build
```

Benchmark local (synthétique) :

```bash
chmod +x scripts/bench-import.sh
./scripts/bench-import.sh synthetic 100
```

## Sauvegarde (`.gifforge`)

Le fichier de projet contient uniquement **`project.json`** (métadonnées timeline, crops, durées) et les **GIFs sources** originaux — pas de PNG de frames. À l'ouverture, le cache est reconstruit automatiquement par re-décodage des sources.

## Performance

GifForge vise des GIFs volumineux (1000+ frames, 1080p). Optimisations clés :

| Zone | Approche |
|------|----------|
| IPC | Chemins disque via `convertFileSrc`, pas de base64 |
| Decode Rust | Streaming frame-par-frame, batches parallèles PNG |
| Timeline | Virtualisation horizontale, playhead overlay unique |
| Preview | Prefetch ±8 frames, cache LRU asset |
| Undo | Snapshots immuables sans `structuredClone` ni thumbs inline |

**Limites recommandées** : 8 Go RAM, SSD, 1000 frames @ 1080p confortables ; au-delà de 2000 frames, l'import peut être long.

**Baseline CI** : `perf_synthetic_import_100_frames` (100 frames 64×64, < 30 s).

Métriques dev : `window.__gifforgePerf` en mode développement.

## Build Linux (deb / AppImage)

```bash
npm run tauri build
```

Les artefacts se trouvent dans `src-tauri/target/release/bundle/`.
