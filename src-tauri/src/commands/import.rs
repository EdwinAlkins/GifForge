use tauri::AppHandle;

use crate::error::{GifForgeError, Result};
use crate::services::import_service::{self, ImportOptions};

/// Import a GIF: stream-decode frames, cache PNGs/thumbs in batches, return paths only.
#[tauri::command]
pub async fn import_gif(app: AppHandle, path: String) -> Result<crate::models::ImportResult> {
    tauri::async_runtime::spawn_blocking(move || {
        import_service::import_gif_to_cache(
            Some(&app),
            ImportOptions {
                path,
                source_id: None,
                emit_progress: true,
                cache_root: None,
            },
        )
    })
    .await
    .map_err(|e| GifForgeError::other(format!("import task interrupted: {e}")))?
}
