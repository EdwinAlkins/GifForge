use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use rayon::prelude::*;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::error::{GifForgeError, Result};
use crate::models::{ImportResult, SourceAsset, TimelineFrame};
use crate::services::{frame_store, gif_decoder};

const BATCH_SIZE: usize = 32;

pub struct ImportOptions {
    pub path: String,
    pub source_id: Option<String>,
    pub emit_progress: bool,
    /// Override cache root (tests). Uses app cache dir when None.
    pub cache_root: Option<PathBuf>,
}

struct PendingFrame {
    frame_id: String,
    source_frame_index: u32,
    frame_path: PathBuf,
    thumb_path: PathBuf,
    image: image::RgbaImage,
    duration_cs: u16,
}

pub fn import_gif_to_cache(app: Option<&AppHandle>, opts: ImportOptions) -> Result<ImportResult> {
    let cache = if let Some(root) = opts.cache_root {
        root
    } else {
        let handle = app.ok_or_else(|| {
            GifForgeError::other("cache indisponible sans AppHandle ni cache_root")
        })?;
        handle
            .path()
            .app_cache_dir()
            .map_err(|e| GifForgeError::other(format!("répertoire cache indisponible : {e}")))?
    };

    let frames_dir = frame_store::frames_dir(&cache);
    let thumbs_dir = frame_store::thumbs_dir(&cache);
    fs::create_dir_all(&frames_dir)?;
    fs::create_dir_all(&thumbs_dir)?;

    let source_id = opts
        .source_id
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let path = opts.path;
    let emit = opts.emit_progress;

    let cached = AtomicUsize::new(0);
    let batch: Mutex<Vec<PendingFrame>> = Mutex::new(Vec::with_capacity(BATCH_SIZE));
    let mut timeline_frames: Vec<TimelineFrame> = Vec::new();
    let mut width = 0u32;
    let mut height = 0u32;
    let mut frame_count = 0usize;

    let emit_progress = |phase: &str, done: usize, total: usize| {
        if !emit {
            return;
        }
        if let Some(app) = app {
            let _ = app.emit(
                "import-progress",
                serde_json::json!({ "phase": phase, "done": done, "total": total }),
            );
        }
    };

    let flush_batch = |batch: &mut Vec<PendingFrame>,
                       timeline: &mut Vec<TimelineFrame>,
                       source_id: &str,
                       total: usize|
     -> Result<()> {
        if batch.is_empty() {
            return Ok(());
        }
        let items: Vec<_> = batch.drain(..).collect();
        let results: Result<Vec<TimelineFrame>> = items
            .par_iter()
            .map(|pf| {
                frame_store::save_frame_png(&pf.image, &pf.frame_path)?;
                frame_store::save_thumb_png(&pf.image, &pf.thumb_path)?;
                let n = cached.fetch_add(1, Ordering::Relaxed) + 1;
                if n % 8 == 0 || n == total {
                    emit_progress("cache", n, total);
                }
                Ok(TimelineFrame {
                    id: pf.frame_id.clone(),
                    source_id: source_id.to_string(),
                    source_frame_index: pf.source_frame_index,
                    frame_path: pf.frame_path.to_string_lossy().into_owned(),
                    duration_cs: pf.duration_cs,
                    track_index: 0,
                    thumbnail_path: Some(pf.thumb_path.to_string_lossy().into_owned()),
                    thumbnail: None,
                })
            })
            .collect();
        timeline.extend(results?);
        Ok(())
    };

    let meta = gif_decoder::decode_gif_streaming(&path, |df| {
        if frame_count == 0 {
            width = df.image.width();
            height = df.image.height();
        }
        let source_frame_index = frame_count as u32;
        frame_count += 1;

        if frame_count % 16 == 0 {
            emit_progress("decode", frame_count, 0);
        }

        let frame_id = Uuid::new_v4().to_string();
        let frame_path = frames_dir.join(format!("{frame_id}.png"));
        let thumb_path = thumbs_dir.join(format!("{frame_id}.png"));

        let mut guard = batch.lock().unwrap();
        guard.push(PendingFrame {
            frame_id,
            source_frame_index,
            frame_path,
            thumb_path,
            image: df.image,
            duration_cs: df.duration_cs,
        });

        if guard.len() >= BATCH_SIZE {
            let mut drained = Vec::with_capacity(BATCH_SIZE);
            std::mem::swap(&mut *guard, &mut drained);
            drop(guard);
            flush_batch(&mut drained, &mut timeline_frames, &source_id, frame_count)?;
        }
        Ok(())
    })?;

    if meta.frame_count == 0 {
        return Err(GifForgeError::other("le GIF ne contient aucune frame"));
    }
    frame_count = meta.frame_count;
    width = meta.width;
    height = meta.height;

    emit_progress("decode", frame_count, frame_count);

    {
        let mut guard = batch.lock().unwrap();
        if !guard.is_empty() {
            let mut drained = Vec::new();
            std::mem::swap(&mut *guard, &mut drained);
            drop(guard);
            flush_batch(&mut drained, &mut timeline_frames, &source_id, frame_count)?;
        }
    }

    emit_progress("cache", frame_count, frame_count);

    let filename = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "sans-nom.gif".to_string());

    let source_thumb = timeline_frames
        .first()
        .and_then(|f| f.thumbnail_path.clone());

    let source = SourceAsset {
        id: source_id,
        filename,
        path,
        width,
        height,
        crop: None,
        thumbnail_path: source_thumb,
        thumbnail: None,
    };

    Ok(ImportResult {
        source,
        frames: timeline_frames,
    })
}
