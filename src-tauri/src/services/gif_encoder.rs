use std::borrow::Cow;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use gif::{DisposalMethod, Encoder, Frame, Repeat};
use image::imageops;
use image::RgbaImage;
use imagequant::RGBA;
use rayon::prelude::*;

use crate::error::{GifForgeError, Result};
use crate::models::{CropRect, ExportQuality, ExportSegment, TimelineFrame};

/// Below this alpha threshold, a pixel is transparent in the GIF.
const ALPHA_THRESHOLD: u8 = 128;

type GifWriter = Encoder<BufWriter<File>>;

/// Canvas rectangle, in pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Rect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

/// Canvas region to encode as a GIF frame.
struct Job {
    rgba: RgbaImage,
    rect: Rect,
    duration_cs: u16,
    dispose: DisposalMethod,
}

/// Number of frames read and quantized in parallel. Limits RAM to
/// O(batch × width × height) instead of O(frames × width × height).
fn batch_size() -> usize {
    rayon::current_num_threads().clamp(2, 8)
}

/// Stream-encodes timeline segments as a GIF, applying per-source crops.
/// source.
///
/// Each segment is composited on the canvas (layers from the bottom track to the
/// top) and compared with the previous one:
/// - identical frame → its duration is added to the previous frame;
/// - otherwise only the changed rectangle is encoded (`Keep` disposal);
/// - if opaque pixels must become transparent again, the previous frame is
///   rewritten across the full canvas with `Background` disposal to clear the screen.
///
/// Progression : 0 → `segments.len()`.
pub fn encode_timeline<F>(
    out_path: &str,
    segments: &[ExportSegment],
    crops: &HashMap<String, Option<CropRect>>,
    quality: &ExportQuality,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(usize, usize) + Send,
{
    let total = segments.len();
    if total == 0 {
        return Ok(());
    }

    let (screen_w, screen_h) = canvas_size(segments, crops)?;
    let full = Rect {
        x: 0,
        y: 0,
        w: screen_w as u32,
        h: screen_h as u32,
    };
    let file = File::create(out_path)?;
    let mut encoder = Encoder::new(BufWriter::new(file), screen_w, screen_h, &[])
        .map_err(|e| GifForgeError::other(format!("encodeur GIF : {e}")))?;
    encoder
        .set_repeat(Repeat::Infinite)
        .map_err(|e| GifForgeError::other(format!("encodeur GIF : {e}")))?;

    // Canvas displayed after the last scheduled frame.
    let mut prev: Option<RgbaImage> = None;
    // Last encoded frame, retained because the next one may extend its duration
    // or require it to clear the screen.
    let mut pending: Option<Frame<'static>> = None;
    let mut done = 0;

    for chunk in segments.chunks(batch_size()) {
        let canvases: Vec<RgbaImage> = chunk
            .par_iter()
            .map(|seg| render_canvas(seg, crops, full))
            .collect::<Result<_>>()?;

        let mut jobs: Vec<Job> = Vec::with_capacity(chunk.len());
        for (seg, canvas) in chunk.iter().zip(canvases) {
            let duration_cs = seg.duration_cs;
            let Some(prev_canvas) = prev.as_ref() else {
                jobs.push(Job {
                    rgba: canvas.clone(),
                    rect: full,
                    duration_cs,
                    dispose: DisposalMethod::Keep,
                });
                prev = Some(canvas);
                continue;
            };

            let rect = match diff_rect(prev_canvas, &canvas) {
                Some(rect) => rect,
                None => {
                    let last_delay = match jobs.last_mut() {
                        Some(job) => &mut job.duration_cs,
                        None => &mut pending.as_mut().expect("previous frame").delay,
                    };
                    if let Some(sum) = last_delay.checked_add(duration_cs) {
                        *last_delay = sum;
                        continue;
                    }
                    // Accumulated duration outside the 16-bit GIF range: unchanged 1×1 frame.
                    Rect { x: 0, y: 0, w: 1, h: 1 }
                }
            };

            if needs_clear(prev_canvas, &canvas, rect) {
                match jobs.last_mut() {
                    Some(job) => {
                        job.rgba = prev_canvas.clone();
                        job.rect = full;
                        job.dispose = DisposalMethod::Background;
                    }
                    None => {
                        let last = pending.take().expect("previous frame");
                        pending = Some(encode_job(
                            Job {
                                rgba: prev_canvas.clone(),
                                rect: full,
                                duration_cs: last.delay,
                                dispose: DisposalMethod::Background,
                            },
                            quality,
                        )?);
                    }
                }
                jobs.push(Job {
                    rgba: canvas.clone(),
                    rect: full,
                    duration_cs,
                    dispose: DisposalMethod::Keep,
                });
            } else {
                jobs.push(Job {
                    rgba: imageops::crop_imm(&canvas, rect.x, rect.y, rect.w, rect.h).to_image(),
                    rect,
                    duration_cs,
                    dispose: DisposalMethod::Keep,
                });
            }
            prev = Some(canvas);
        }

        let encoded: Vec<Frame<'static>> = jobs
            .into_par_iter()
            .map(|job| encode_job(job, quality))
            .collect::<Result<_>>()?;
        for frame in encoded {
            if let Some(ready) = pending.replace(frame) {
                write_frame(&mut encoder, &ready)?;
            }
        }

        done += chunk.len();
        on_progress(done, total);
    }

    if let Some(last) = pending {
        write_frame(&mut encoder, &last)?;
    }
    encoder
        .into_inner()
        .and_then(|mut w| w.flush())
        .map_err(|e| GifForgeError::other(format!("GIF finalization: {e}")))?;
    Ok(())
}

fn check_cache_path(tf: &TimelineFrame) -> Result<()> {
    if tf.frame_path.is_empty() {
        return Err(GifForgeError::other(format!(
            "PNG cache not found for frame {} (source {}, index {})",
            tf.id, tf.source_id, tf.source_frame_index
        )));
    }
    if !Path::new(&tf.frame_path).exists() {
        return Err(GifForgeError::other(format!(
            "cache file missing: {} — re-import the GIF or reopen the project",
            tf.frame_path
        )));
    }
    Ok(())
}

fn source_crop<'a>(
    tf: &TimelineFrame,
    crops: &'a HashMap<String, Option<CropRect>>,
) -> Option<&'a CropRect> {
    crops.get(&tf.source_id).and_then(|c| c.as_ref())
}

/// Canvas size = max layer size after cropping, read from PNG headers
/// without decoding pixels.
fn canvas_size(
    segments: &[ExportSegment],
    crops: &HashMap<String, Option<CropRect>>,
) -> Result<(u16, u16)> {
    // The same frame appears in multiple segments when another track splits it.
    let mut unique: Vec<&TimelineFrame> = segments.iter().flat_map(|s| &s.layers).collect();
    unique.sort_by(|a, b| (&a.frame_path, &a.source_id).cmp(&(&b.frame_path, &b.source_id)));
    unique.dedup_by(|a, b| a.frame_path == b.frame_path && a.source_id == b.source_id);

    let (w, h) = unique
        .par_iter()
        .map(|tf| -> Result<(u32, u32)> {
            check_cache_path(tf)?;
            let (w, h) = image::image_dimensions(&tf.frame_path)?;
            Ok(match source_crop(tf, crops) {
                Some(crop) => {
                    let r = crop_rect(w, h, crop);
                    (r.w, r.h)
                }
                None => (w, h),
            })
        })
        .try_reduce(|| (0, 0), |(aw, ah), (bw, bh)| Ok((aw.max(bw), ah.max(bh))))?;
    Ok((w.max(1).min(u16::MAX as u32) as u16, h.max(1).min(u16::MAX as u32) as u16))
}

/// Composes segment layers at the top-left of the canvas, starting with the bottom track.
/// Alpha is binarized (GIF only supports opaque / transparent): an opaque pixel from a
/// layer covers pixels from lower layers.
fn render_canvas(
    segment: &ExportSegment,
    crops: &HashMap<String, Option<CropRect>>,
    canvas: Rect,
) -> Result<RgbaImage> {
    let mut out: Option<RgbaImage> = None;
    for tf in &segment.layers {
        let layer = load_layer(tf, crops)?;
        match out.as_mut() {
            None if layer.dimensions() == (canvas.w, canvas.h) => out = Some(layer),
            None => {
                let mut base = RgbaImage::new(canvas.w, canvas.h);
                imageops::replace(&mut base, &layer, 0, 0);
                out = Some(base);
            }
            Some(base) => {
                for (x, y, px) in layer.enumerate_pixels() {
                    if px[3] != 0 && x < canvas.w && y < canvas.h {
                        base.put_pixel(x, y, *px);
                    }
                }
            }
        }
    }
    Ok(out.unwrap_or_else(|| RgbaImage::new(canvas.w, canvas.h)))
}

/// Charge une frame, applique le crop de sa source et binarise l'alpha.
fn load_layer(tf: &TimelineFrame, crops: &HashMap<String, Option<CropRect>>) -> Result<RgbaImage> {
    check_cache_path(tf)?;
    let mut image = image::open(&tf.frame_path)?.to_rgba8();
    if let Some(crop) = source_crop(tf, crops) {
        image = apply_crop(&image, crop);
    }
    for px in image.pixels_mut() {
        if px[3] < ALPHA_THRESHOLD {
            px.0 = [0, 0, 0, 0];
        } else {
            px[3] = 255;
        }
    }
    Ok(image)
}

/// Smallest rectangle containing all different pixels, `None` if identical.
fn diff_rect(prev: &RgbaImage, cur: &RgbaImage) -> Option<Rect> {
    let w = cur.width() as usize;
    let stride = w * 4;
    let mut rows = None::<(usize, usize)>;
    let (mut x0, mut x1) = (usize::MAX, 0);

    let row_pairs = prev.as_raw().chunks_exact(stride).zip(cur.as_raw().chunks_exact(stride));
    for (y, (a, b)) in row_pairs.enumerate() {
        if a == b {
            continue;
        }
        let pixels = || a.chunks_exact(4).zip(b.chunks_exact(4));
        let first = pixels().position(|(p, q)| p != q).unwrap_or(0);
        let last = w - 1 - pixels().rev().position(|(p, q)| p != q).unwrap_or(0);
        x0 = x0.min(first);
        x1 = x1.max(last);
        rows = Some((rows.map_or(y, |(y0, _)| y0), y));
    }

    rows.map(|(y0, y1)| Rect {
        x: x0 as u32,
        y: y0 as u32,
        w: (x1 - x0 + 1) as u32,
        h: (y1 - y0 + 1) as u32,
    })
}

/// True if an opaque pixel must become transparent in `rect`: impossible with `Keep`,
/// because drawing the transparent index leaves the previous pixel visible.
fn needs_clear(prev: &RgbaImage, cur: &RgbaImage, rect: Rect) -> bool {
    (rect.y..rect.y + rect.h).any(|y| {
        (rect.x..rect.x + rect.w)
            .any(|x| cur.get_pixel(x, y)[3] == 0 && prev.get_pixel(x, y)[3] != 0)
    })
}

fn encode_job(job: Job, quality: &ExportQuality) -> Result<Frame<'static>> {
    let (w, h) = job.rgba.dimensions();
    let mut frame = match quality {
        ExportQuality::Fast => {
            let mut raw = job.rgba.into_raw();
            Frame::from_rgba_speed(w as u16, h as u16, &mut raw, 5)
        }
        ExportQuality::Balanced | ExportQuality::Light => quantize(job.rgba, quality)?,
    };
    frame.left = job.rect.x as u16;
    frame.top = job.rect.y as u16;
    frame.delay = job.duration_cs;
    frame.dispose = job.dispose;
    Ok(frame)
}

fn quantize(rgba: RgbaImage, quality: &ExportQuality) -> Result<Frame<'static>> {
    let (w, h) = rgba.dimensions();
    let mut liq = imagequant::new();
    apply_quality(&mut liq, quality)?;
    liq.set_max_colors(256)?;

    let pixels: Vec<RGBA> = rgba
        .pixels()
        .map(|p| RGBA::new(p[0], p[1], p[2], p[3]))
        .collect();
    drop(rgba);
    let mut img = liq.new_image(pixels, w as usize, h as usize, 0.0)?;
    let mut quantization = liq.quantize(&mut img)?;
    let (palette, indexed) = quantization.remapped(&mut img)?;

    let mut gif_palette: Vec<u8> = Vec::with_capacity(palette.len() * 3);
    let mut transparent = None;
    for (i, c) in palette.iter().enumerate() {
        gif_palette.extend_from_slice(&[c.r, c.g, c.b]);
        if c.a < ALPHA_THRESHOLD {
            transparent = Some(i as u8);
        }
    }
    Ok(Frame {
        width: w as u16,
        height: h as u16,
        buffer: Cow::Owned(indexed),
        palette: Some(gif_palette),
        transparent,
        ..Default::default()
    })
}

/// Imagequant settings by preset. The minimum quality remains 0: above it,
/// imagequant renvoie `QualityTooLow` sur les images trop riches en couleurs au lieu de
/// degradation would make the export fail.
fn apply_quality(liq: &mut imagequant::Attributes, quality: &ExportQuality) -> Result<()> {
    match quality {
        ExportQuality::Balanced => {
            liq.set_quality(0, 90)?;
            liq.set_speed(6)?;
        }
        ExportQuality::Light => {
            liq.set_quality(0, 85)?;
            liq.set_speed(8)?;
        }
        ExportQuality::Fast => {}
    }
    Ok(())
}

fn write_frame(encoder: &mut GifWriter, frame: &Frame<'_>) -> Result<()> {
    encoder
        .write_frame(frame)
        .map_err(|e| GifForgeError::other(format!("frame write: {e}")))
}

/// Crop rectangle clamped to the image (at least 1×1).
fn crop_rect(w: u32, h: u32, crop: &CropRect) -> Rect {
    let x = crop.x.min(w.saturating_sub(1));
    let y = crop.y.min(h.saturating_sub(1));
    Rect {
        x,
        y,
        w: crop.width.min(w - x).max(1),
        h: crop.height.min(h - y).max(1),
    }
}

pub fn apply_crop(img: &RgbaImage, crop: &CropRect) -> RgbaImage {
    let (w, h) = img.dimensions();
    let r = crop_rect(w, h, crop);
    imageops::crop_imm(img, r.x, r.y, r.w, r.h).to_image()
}
