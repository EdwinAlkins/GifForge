use std::borrow::Cow;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use gif::{DisposalMethod, Encoder, Frame, Repeat};
use image::imageops;
use image::RgbaImage;
use imagequant::RGBA;
use rayon::prelude::*;

use crate::error::{GifForgeError, Result};
use crate::models::{CropRect, ExportQuality, TimelineFrame};

const READ_BATCH: usize = 64;

struct PreparedFrame {
    rgba: RgbaImage,
    duration_cs: u16,
}

struct IndexedFrame {
    width: u16,
    height: u16,
    pixels: Vec<u8>,
    palette: Vec<u8>,
    transparent: Option<u8>,
    duration_cs: u16,
}

/// Encode the timeline into a GIF, applying per-source crops.
/// Progress runs 0 → `total * 2` (lecture puis quantification/écriture frame par frame).
pub fn encode_timeline<F>(
    out_path: &str,
    frames: &[TimelineFrame],
    crops: &std::collections::HashMap<String, Option<CropRect>>,
    quality: &ExportQuality,
    on_progress: F,
) -> Result<()>
where
    F: FnMut(usize, usize) + Send,
{
    let total = frames.len();
    if total == 0 {
        return Ok(());
    }

    let progress_total = total * 2;
    let progress_cb = Arc::new(Mutex::new(on_progress));
    let report = |done: usize| {
        if let Ok(mut cb) = progress_cb.lock() {
            cb(done, progress_total);
        }
    };

    let mut prepared: Vec<PreparedFrame> = Vec::with_capacity(total);
    let batch_count = total.div_ceil(READ_BATCH);
    let read_done = AtomicUsize::new(0);

    for batch_idx in 0..batch_count {
        let start = batch_idx * READ_BATCH;
        let end = (start + READ_BATCH).min(total);
        let slice = &frames[start..end];

        let batch: Result<Vec<PreparedFrame>> = slice
            .par_iter()
            .map(|tf| prepare_frame(tf, crops))
            .collect();

        prepared.extend(batch?);
        let n = read_done.fetch_add(slice.len(), Ordering::Relaxed) + slice.len();
        report(n);
    }

    let (screen_w, screen_h) = canvas_size(&prepared);
    let file = File::create(out_path)?;
    let mut encoder = Encoder::new(BufWriter::new(file), screen_w, screen_h, &[])
        .map_err(|e| GifForgeError::other(format!("encodeur GIF : {e}")))?;
    encoder
        .set_repeat(Repeat::Infinite)
        .map_err(|e| GifForgeError::other(format!("encodeur GIF : {e}")))?;

    match quality {
        ExportQuality::Fast => {
            for (i, pf) in prepared.iter().enumerate() {
                write_rgba_frame(&mut encoder, pf)?;
                report(total + i + 1);
            }
        }
        ExportQuality::Balanced | ExportQuality::Light => {
            // Quantification + écriture frame par frame pour une progression fluide (50 % → 100 %).
            for (i, pf) in prepared.iter().enumerate() {
                let indexed = quantize_single_frame(pf, quality)?;
                write_indexed_frame(&mut encoder, &indexed)?;
                report(total + i + 1);
            }
        }
    }

    report(progress_total);
    Ok(())
}

fn prepare_frame(
    tf: &TimelineFrame,
    crops: &std::collections::HashMap<String, Option<CropRect>>,
) -> Result<PreparedFrame> {
    if tf.frame_path.is_empty() {
        return Err(GifForgeError::other(format!(
            "cache PNG introuvable pour la frame {} (source {}, index {})",
            tf.id, tf.source_id, tf.source_frame_index
        )));
    }
    if !Path::new(&tf.frame_path).exists() {
        return Err(GifForgeError::other(format!(
            "fichier cache absent : {} — réimportez le GIF ou rouvrez le projet",
            tf.frame_path
        )));
    }

    let mut image = image::open(&tf.frame_path)?.to_rgba8();
    if let Some(crop) = crops.get(&tf.source_id).and_then(|c| c.as_ref()) {
        image = apply_crop(&image, crop);
    }
    Ok(PreparedFrame {
        rgba: image,
        duration_cs: tf.duration_cs,
    })
}

fn canvas_size(prepared: &[PreparedFrame]) -> (u16, u16) {
    let (w, h) = prepared
        .iter()
        .map(|pf| pf.rgba.dimensions())
        .fold((0u32, 0u32), |(mw, mh), (dw, dh)| (mw.max(dw), mh.max(dh)));
    (w.min(u16::MAX as u32) as u16, h.min(u16::MAX as u32) as u16)
}

fn write_rgba_frame(encoder: &mut Encoder<BufWriter<File>>, pf: &PreparedFrame) -> Result<()> {
    let (w, h) = pf.rgba.dimensions();
    let rgba = pf.rgba.clone();
    let mut raw = rgba.into_raw();
    let mut frame = Frame::from_rgba_speed(w as u16, h as u16, &mut raw, 5);
    frame.delay = pf.duration_cs;
    frame.dispose = DisposalMethod::Background;
    encoder
        .write_frame(&frame)
        .map_err(|e| GifForgeError::other(format!("écriture frame : {e}")))?;
    Ok(())
}

fn write_indexed_frame(encoder: &mut Encoder<BufWriter<File>>, frame: &IndexedFrame) -> Result<()> {
    let gif_frame = Frame {
        width: frame.width,
        height: frame.height,
        buffer: Cow::Owned(frame.pixels.clone()),
        palette: Some(frame.palette.clone()),
        transparent: frame.transparent,
        delay: frame.duration_cs,
        dispose: DisposalMethod::Background,
        ..Default::default()
    };
    encoder
        .write_frame(&gif_frame)
        .map_err(|e| GifForgeError::other(format!("écriture frame : {e}")))?;
    Ok(())
}

fn quantize_single_frame(pf: &PreparedFrame, quality: &ExportQuality) -> Result<IndexedFrame> {
    let (w, h) = pf.rgba.dimensions();
    let mut liq = imagequant::new();
    apply_quality(&mut liq, quality)?;
    liq.set_max_colors(256)?;

    let pixels: Vec<RGBA> = pf
        .rgba
        .pixels()
        .map(|p| RGBA::new(p[0], p[1], p[2], p[3]))
        .collect();
    let mut img = liq.new_image(pixels, w as usize, h as usize, 0.0)?;
    let mut quantization = liq.quantize(&mut img)?;
    let (palette, indexed) = quantization.remapped(&mut img)?;
    Ok(indexed_frame_from_quant(w, h, &palette, indexed, pf.duration_cs))
}

fn apply_quality(liq: &mut imagequant::Attributes, quality: &ExportQuality) -> Result<()> {
    match quality {
        ExportQuality::Balanced => {
            liq.set_quality(70, 90)?;
            liq.set_speed(6)?;
        }
        ExportQuality::Light => {
            liq.set_quality(55, 85)?;
            liq.set_speed(8)?;
        }
        ExportQuality::Fast => {}
    }
    Ok(())
}

fn indexed_frame_from_quant(
    w: u32,
    h: u32,
    palette: &[imagequant::RGBA],
    indexed: Vec<u8>,
    duration_cs: u16,
) -> IndexedFrame {
    let mut gif_palette: Vec<u8> = Vec::with_capacity(palette.len() * 3);
    let mut transparent = None;
    for (i, c) in palette.iter().enumerate() {
        gif_palette.push(c.r);
        gif_palette.push(c.g);
        gif_palette.push(c.b);
        if c.a < 128 {
            transparent = Some(i as u8);
        }
    }
    IndexedFrame {
        width: w as u16,
        height: h as u16,
        pixels: indexed,
        palette: gif_palette,
        transparent,
        duration_cs,
    }
}

pub fn apply_crop(img: &RgbaImage, crop: &CropRect) -> RgbaImage {
    let (w, h) = img.dimensions();
    let x = crop.x.min(w.saturating_sub(1));
    let y = crop.y.min(h.saturating_sub(1));
    let cw = crop.width.min(w - x).max(1);
    let ch = crop.height.min(h - y).max(1);
    imageops::crop_imm(img, x, y, cw, ch).to_image()
}
