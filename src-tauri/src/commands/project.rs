use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::error::{GifForgeError, Result};
use crate::models::Project;
use crate::services::project_io;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectPayload {
    pub path: String,
    pub project: Project,
}

/// Pack the project into a `.gifforge` ZIP (JSON + source GIFs only).
#[tauri::command]
pub async fn save_project(app: AppHandle, payload: SaveProjectPayload) -> Result<()> {
    let SaveProjectPayload { path, project } = payload;
    tauri::async_runtime::spawn_blocking(move || project_io::save_project(&app, &path, &project))
        .await
        .map_err(|e| GifForgeError::other(format!("tâche de sauvegarde interrompue : {e}")))?
}

/// Load a `.gifforge` ZIP, extract it, and rebuild the frame cache from source GIFs.
#[tauri::command]
pub async fn open_project(app: AppHandle, path: String) -> Result<Project> {
    tauri::async_runtime::spawn_blocking(move || {
        let projects_root = app
            .path()
            .app_data_dir()
            .map_err(|e| GifForgeError::other(format!("app_data_dir indisponible : {e}")))?
            .join("projects");
        std::fs::create_dir_all(&projects_root)?;

        let stem = Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "project".into());
        let extract_dir = projects_root.join(format!("{stem}-{}", uuid::Uuid::new_v4()));

        project_io::extract_archive(&path, &extract_dir)?;

        if project_io::is_legacy_archive(&extract_dir) {
            return project_io::open_project_legacy(&extract_dir);
        }

        let saved = project_io::read_saved_project(&extract_dir)?;
        project_io::hydrate_project(&app, &extract_dir, saved)
    })
    .await
    .map_err(|e| GifForgeError::other(format!("tâche d'ouverture interrompue : {e}")))?
}
