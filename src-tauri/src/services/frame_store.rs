use std::fs::File;
use std::io::{BufWriter, Cursor};
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::imageops;
use image::{DynamicImage, ExtendedColorType, ImageEncoder, ImageFormat, RgbaImage};

use crate::error::{GifForgeError, Result};
use crate::models::CropRect;

/// Default edge size for timeline / library thumbnails.
pub const THUMB_MAX: u32 = 64;

/// Per-app cache directory for decoded frames: `<app_cache>/frames`.
pub fn frames_dir(app_cache: &Path) -> PathBuf {
    app_cache.join("frames")
}

/// Per-app cache directory for thumbnails: `<app_cache>/thumbs`.
pub fn thumbs_dir(app_cache: &Path) -> PathBuf {
    app_cache.join("thumbs")
}

/// Crop cache directory: `<app_cache>/crop_cache`.
pub fn crop_cache_dir(app_cache: &Path) -> PathBuf {
    app_cache.join("crop_cache")
}

/// Write a frame to disk as a PNG using *fast* compression and no filtering.
pub fn save_frame_png(img: &RgbaImage, path: &Path) -> Result<()> {
    let writer = BufWriter::new(File::create(path)?);
    let encoder = PngEncoder::new_with_quality(writer, CompressionType::Fast, FilterType::NoFilter);
    encoder.write_image(img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgba8)?;
    Ok(())
}

/// Write a downscaled thumbnail PNG directly to disk (no base64 round-trip).
pub fn save_thumb_png(img: &RgbaImage, path: &Path) -> Result<()> {
    let thumb = imageops::thumbnail(img, THUMB_MAX, THUMB_MAX);
    save_frame_png(&thumb, path)
}

/// Build a downscaled thumbnail in memory without cloning the full source image.
pub fn thumbnail_from_rgba(img: &RgbaImage) -> RgbaImage {
    imageops::thumbnail(img, THUMB_MAX, THUMB_MAX)
}

/// Encode an image as a base64 PNG `data:` URL (legacy / migration only).
pub fn png_data_url(img: &DynamicImage) -> Result<String> {
    let mut cursor = Cursor::new(Vec::new());
    img.write_to(&mut cursor, ImageFormat::Png)?;
    Ok(format!("data:image/png;base64,{}", BASE64.encode(cursor.into_inner())))
}

/// Build a downscaled thumbnail data URL (legacy / migration only).
pub fn thumbnail_data_url(img: &RgbaImage) -> Result<String> {
    let thumb = thumbnail_from_rgba(img);
    png_data_url(&DynamicImage::ImageRgba8(thumb))
}

/// Read an already-cached PNG file and return it as a base64 `data:` URL (legacy).
pub fn file_to_data_url(path: &str) -> Result<String> {
    let bytes = std::fs::read(path)?;
    if image::guess_format(&bytes).map(|f| f == ImageFormat::Png).unwrap_or(false) {
        Ok(format!("data:image/png;base64,{}", BASE64.encode(bytes)))
    } else {
        Err(GifForgeError::other(format!(
            "frame file is not a PNG: {path}"
        )))
    }
}

/// Deterministic cache path for a cropped frame preview.
pub fn cropped_frame_cache_path(
    cache_root: &Path,
    frame_path: &str,
    crop: &CropRect,
) -> PathBuf {
    let stem = Path::new(frame_path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "frame".into());
    crop_cache_dir(cache_root).join(format!(
        "{stem}_{}_{}_{}_{}.png",
        crop.x, crop.y, crop.width, crop.height
    ))
}

/// Apply crop and write to cache if missing or source is newer. Returns absolute path.
pub fn ensure_cropped_frame_path(
    cache_root: &Path,
    frame_path: &str,
    crop: &CropRect,
) -> Result<String> {
    let out = cropped_frame_cache_path(cache_root, frame_path, crop);
    let src = Path::new(frame_path);
    if out.exists() {
        if let (Ok(out_meta), Ok(src_meta)) = (out.metadata(), src.metadata()) {
            if out_meta.modified()? >= src_meta.modified()? {
                return Ok(out.to_string_lossy().into_owned());
            }
        }
    }
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let img = image::open(frame_path)?.to_rgba8();
    let cropped = crate::services::gif_encoder::apply_crop(&img, crop);
    save_frame_png(&cropped, &out)?;
    Ok(out.to_string_lossy().into_owned())
}
