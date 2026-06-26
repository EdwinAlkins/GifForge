use std::collections::HashMap;

use tauri::{AppHandle, Emitter};

use crate::error::{GifForgeError, Result};
use crate::models::{CropRect, ExportQuality, SourceAsset, TimelineFrame};
use crate::services::gif_encoder;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPayload {
    pub path: String,
    pub frames: Vec<TimelineFrame>,
    pub sources: Vec<SourceAsset>,
    #[serde(default)]
    pub quality: ExportQuality,
}

/// Encode the current timeline to a GIF file at `path`, applying per-source crops.
#[tauri::command]
pub async fn export_gif(app: AppHandle, payload: ExportPayload) -> Result<()> {
    if payload.frames.is_empty() {
        return Err(GifForgeError::other("la timeline est vide"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let total = payload.frames.len();
        let crops: HashMap<String, Option<CropRect>> = payload
            .sources
            .iter()
            .map(|s| (s.id.clone(), s.crop.clone()))
            .collect();

        let _ = app.emit(
            "export-progress",
            serde_json::json!({ "done": 0, "total": total, "batch": 0 }),
        );

        gif_encoder::encode_timeline(
            &payload.path,
            &payload.frames,
            &crops,
            &payload.quality,
            |done, batch_total| {
                let _ = app.emit(
                    "export-progress",
                    serde_json::json!({ "done": done, "total": batch_total }),
                );
            },
        )?;

        let _ = app.emit(
            "export-progress",
            serde_json::json!({ "done": total, "total": total }),
        );
        Ok(())
    })
    .await
    .map_err(|e| GifForgeError::other(format!("tâche d'export interrompue : {e}")))?
}
