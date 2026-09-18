use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

use tauri::{AppHandle, Emitter, Manager};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::error::{GifForgeError, Result};
use crate::models::{Project, SavedProject, SavedTimelineFrame, SourceAsset, TimelineFrame};
use crate::services::import_service::{self, ImportOptions};

/// Save a `.gifforge` archive: `project.json` + original source GIFs only.
/// Save without progress events (unit tests).
#[cfg(test)]
pub fn save_project_disk(zip_path: &str, project: &Project) -> Result<()> {
    save_project_inner(None, zip_path, project)
}

pub fn save_project(app: &AppHandle, zip_path: &str, project: &Project) -> Result<()> {
    save_project_inner(Some(app), zip_path, project)
}

fn save_project_inner(app: Option<&AppHandle>, zip_path: &str, project: &Project) -> Result<()> {
    let tmp = format!("{zip_path}.tmp");
    let total_steps = project.sources.len() + 1;
    let mut step = 0usize;

    let emit = |done: usize| {
        if let Some(app) = app {
            let _ = app.emit(
                "save-progress",
                serde_json::json!({ "done": done, "total": total_steps }),
            );
        }
    };

    emit(step);

    {
        let file = File::create(&tmp)?;
        let mut zip = ZipWriter::new(file);
        let json_opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let gif_opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

        let saved = project_for_disk(project);
        let json = serde_json::to_string_pretty(&saved)?;
        zip.start_file("project.json", json_opts)?;
        zip.write_all(json.as_bytes())?;
        step += 1;
        emit(step);

        for src in &project.sources {
            if !Path::new(&src.path).exists() {
                return Err(GifForgeError::other(format!(
                    "Source GIF not found: {}",
                    src.path
                )));
            }
            let entry = format!("sources/{}", src.filename);
            zip.start_file(&entry, gif_opts)?;
            zip.write_all(&fs::read(&src.path)?)?;
            step += 1;
            emit(step);
        }

        zip.finish()?;
    }

    fs::rename(&tmp, zip_path)?;
    Ok(())
}

/// Extract archive to `extract_root` and return raw JSON project (legacy or new format).
pub fn extract_archive(zip_path: &str, extract_root: &Path) -> Result<()> {
    if extract_root.exists() {
        fs::remove_dir_all(extract_root)?;
    }
    fs::create_dir_all(extract_root)?;

    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        if name.ends_with('/') {
            continue;
        }
        let out = extract_root.join(&name);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        fs::write(&out, buf)?;
    }
    Ok(())
}

pub fn is_legacy_archive(extract_root: &Path) -> bool {
    extract_root.join("frames").is_dir()
}

/// Legacy open: hydrate paths from extracted PNG frames (old `.gifforge` format).
pub fn open_project_legacy(extract_root: &Path) -> Result<Project> {
    let json = fs::read_to_string(extract_root.join("project.json"))?;
    let mut project: Project = serde_json::from_str(&json)?;

    for src in &mut project.sources {
        src.path = extract_root
            .join("sources")
            .join(&src.filename)
            .to_string_lossy()
            .into_owned();
        let thumb_path = extract_root.join(format!("thumbs/src-{}.png", src.id));
        src.thumbnail_path = thumb_path_exists(&thumb_path);
        src.thumbnail = None;
    }

    for tf in &mut project.timeline {
        tf.frame_path = extract_root
            .join("frames")
            .join(format!("{}.png", tf.id))
            .to_string_lossy()
            .into_owned();
        let thumb_path = extract_root.join(format!("thumbs/{}.png", tf.id));
        tf.thumbnail_path = thumb_path_exists(&thumb_path);
        tf.thumbnail = None;
    }

    if let Some(ref mut bank) = project.source_frames {
        for frames in bank.values_mut() {
            for tf in frames.iter_mut() {
                tf.frame_path = extract_root
                    .join("frames")
                    .join(format!("{}.png", tf.id))
                    .to_string_lossy()
                    .into_owned();
            }
        }
    }

    Ok(project)
}

/// New format: re-decode source GIFs and rebuild runtime cache + timeline.
pub fn hydrate_project(app: &AppHandle, extract_root: &Path, saved: SavedProject) -> Result<Project> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| GifForgeError::other(format!("cache unavailable: {e}")))?;
    hydrate_project_with_cache(extract_root, saved, &cache, Some(app))
}

pub fn hydrate_project_with_cache(
    extract_root: &Path,
    saved: SavedProject,
    cache_root: &Path,
    app: Option<&AppHandle>,
) -> Result<Project> {
    let source_count = saved.sources.len().max(1);
    let mut step = 0usize;

    let emit = |done: usize, phase: &str| {
        if let Some(app) = app {
            let _ = app.emit(
                "open-progress",
                serde_json::json!({
                    "phase": phase,
                    "done": done,
                    "total": source_count,
                }),
            );
        }
    };

    emit(0, "extract");

    let mut sources: Vec<SourceAsset> = Vec::with_capacity(saved.sources.len());
    let mut banks: std::collections::HashMap<String, Vec<TimelineFrame>> =
        std::collections::HashMap::new();

    for disk_src in &saved.sources {
        let gif_path = extract_root
            .join("sources")
            .join(&disk_src.filename)
            .to_string_lossy()
            .into_owned();

        if !Path::new(&gif_path).exists() {
            return Err(GifForgeError::other(format!(
                "Source GIF missing from archive: {}",
                disk_src.filename
            )));
        }

        emit(step, "import");

        let imported = import_service::import_gif_to_cache(
            app,
            ImportOptions {
                path: gif_path.clone(),
                source_id: Some(disk_src.id.clone()),
                emit_progress: false,
                cache_root: Some(cache_root.to_path_buf()),
            },
        )?;

        let mut source = imported.source;
        source.path = gif_path;
        source.crop = disk_src.crop.clone();
        sources.push(source);
        banks.insert(disk_src.id.clone(), imported.frames);
        step += 1;
        emit(step, "import");
    }

    let mut timeline: Vec<TimelineFrame> = Vec::with_capacity(saved.timeline.len());
    for saved_tf in &saved.timeline {
        let bank = banks.get(&saved_tf.source_id).ok_or_else(|| {
            GifForgeError::other(format!(
                "Unknown source in timeline: {}",
                saved_tf.source_id
            ))
        })?;
        let template = bank.get(saved_tf.source_frame_index as usize).ok_or_else(|| {
            GifForgeError::other(format!(
                "Frame {} missing from source {}",
                saved_tf.source_frame_index, saved_tf.source_id
            ))
        })?;

        timeline.push(TimelineFrame {
            id: saved_tf.id.clone(),
            source_id: saved_tf.source_id.clone(),
            source_frame_index: saved_tf.source_frame_index,
            frame_path: template.frame_path.clone(),
            duration_cs: saved_tf.duration_cs,
            track_index: saved_tf.track_index,
            clip_id: saved_tf.clip_id.clone(),
            thumbnail_path: template.thumbnail_path.clone(),
            thumbnail: None,
        });
    }

    Ok(Project {
        version: saved.version,
        name: saved.name,
        created_at: saved.created_at,
        modified_at: saved.modified_at,
        sources,
        timeline,
        clips: saved.clips,
        source_frames: Some(banks),
    })
}

pub fn read_saved_project(extract_root: &Path) -> Result<SavedProject> {
    let json = fs::read_to_string(extract_root.join("project.json"))?;
    serde_json::from_str(&json).map_err(|e| GifForgeError::other(format!("project.json invalide : {e}")))
}

fn project_for_disk(project: &Project) -> SavedProject {
    SavedProject {
        version: project.version.max(3),
        name: project.name.clone(),
        created_at: project.created_at.clone(),
        modified_at: project.modified_at.clone(),
        sources: project
            .sources
            .iter()
            .map(|s| SourceAsset {
                id: s.id.clone(),
                filename: s.filename.clone(),
                path: format!("sources/{}", s.filename),
                width: s.width,
                height: s.height,
                crop: s.crop.clone(),
                thumbnail_path: None,
                thumbnail: None,
            })
            .collect(),
        timeline: project
            .timeline
            .iter()
            .map(|f| SavedTimelineFrame {
                id: f.id.clone(),
                source_id: f.source_id.clone(),
                source_frame_index: f.source_frame_index,
                duration_cs: f.duration_cs,
                track_index: f.track_index,
                clip_id: f.clip_id.clone(),
            })
            .collect(),
        clips: project.clips.clone(),
    }
}

fn thumb_path_exists(path: &Path) -> Option<String> {
    if path.exists() {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    }
}

#[cfg(test)]
pub fn extract_dir_for_test(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("gifforge-{name}-{}", uuid::Uuid::new_v4()))
}
