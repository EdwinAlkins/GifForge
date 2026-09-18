use std::fs::File;
use std::io::BufReader;

use image::codecs::gif::GifDecoder;
use image::{AnimationDecoder, ImageDecoder, RgbaImage};

use crate::error::Result;

/// A single decoded, fully-composed GIF frame.
pub struct DecodedFrame {
    pub image: RgbaImage,
    pub duration_cs: u16,
}

pub struct GifMeta {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
}

/// Delay in centiseconds, over the whole 16-bit range of the GIF field.
fn duration_cs_from_delay(numer: u32, denom: u32) -> u16 {
    let ms = if denom == 0 { 100 } else { numer as u64 / denom as u64 };
    ((ms + 5) / 10).clamp(1, u16::MAX as u64) as u16
}

/// Stream-decode a GIF frame-by-frame without holding all frames in memory.
/// The callback receives each composed RGBA frame; drop it after caching to disk.
pub fn decode_gif_streaming<F>(path: &str, mut on_frame: F) -> Result<GifMeta>
where
    F: FnMut(DecodedFrame) -> Result<()>,
{
    let file = File::open(path)?;
    let decoder = GifDecoder::new(BufReader::new(file))?;
    let (width, height) = decoder.dimensions();
    let mut count = 0usize;

    for frame in decoder.into_frames() {
        let frame = frame.map_err(|e| crate::error::GifForgeError::other(format!("frame GIF : {e}")))?;
        let (numer, denom) = frame.delay().numer_denom_ms();
        on_frame(DecodedFrame {
            image: frame.into_buffer(),
            duration_cs: duration_cs_from_delay(numer, denom),
        })?;
        count += 1;
    }

    Ok(GifMeta {
        width,
        height,
        frame_count: count,
    })
}

/// Decode a GIF into fully-composed RGBA frames (used in tests and small fixtures).
pub fn decode_gif(path: &str) -> Result<Vec<DecodedFrame>> {
    let mut frames = Vec::new();
    decode_gif_streaming(path, |df| {
        frames.push(df);
        Ok(())
    })?;
    Ok(frames)
}
