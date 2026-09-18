use std::collections::HashMap;

use tauri::{AppHandle, Emitter};

use crate::error::{GifForgeError, Result};
use crate::models::{CropRect, ExportQuality, ExportSegment, SourceAsset};
use crate::services::gif_encoder;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPayload {
    pub path: String,
    pub segments: Vec<ExportSegment>,
    pub sources: Vec<SourceAsset>,
    #[serde(default)]
    pub quality: ExportQuality,
}

/// Encode the timeline segments (tracks already sliced by time on the frontend) to a GIF
/// file at `path`, compositing layers and applying per-source crops.
#[tauri::command]
pub async fn export_gif(app: AppHandle, payload: ExportPayload) -> Result<()> {
    if payload.segments.is_empty() {
        return Err(GifForgeError::other("timeline is empty"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let total = payload.segments.len();
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
            &payload.segments,
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
    .map_err(|e| GifForgeError::other(format!("export task interrupted: {e}")))?
}
