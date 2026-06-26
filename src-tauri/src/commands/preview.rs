use tauri::Manager;

use crate::error::Result;
use crate::models::CropRect;
use crate::services::frame_store;

/// Return the absolute path to a cropped preview PNG (cached on disk, no base64 IPC).
#[tauri::command]
pub fn get_cropped_frame_path(
    app: tauri::AppHandle,
    frame_path: String,
    crop: CropRect,
) -> Result<String> {
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| crate::error::GifForgeError::other(format!("cache indisponible : {e}")))?;
    frame_store::ensure_cropped_frame_path(&cache, &frame_path, &crop)
}

/// Legacy: return a base64 data URL. Prefer `get_cropped_frame_path` + convertFileSrc.
#[tauri::command]
pub fn get_frame_data(frame_path: String, crop: Option<CropRect>) -> Result<String> {
    if let Some(crop) = crop {
        let img = image::open(&frame_path)?.to_rgba8();
        let cropped = crate::services::gif_encoder::apply_crop(&img, &crop);
        return frame_store::png_data_url(&image::DynamicImage::ImageRgba8(cropped));
    }
    frame_store::file_to_data_url(&frame_path)
}
