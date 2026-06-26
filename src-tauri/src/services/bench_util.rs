//! Synthetic GIF fixtures and RSS helpers for performance benchmarks.

use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use image::codecs::gif::{GifEncoder, Repeat};
use image::{Delay, Frame, Rgba, RgbaImage};

/// Peak resident set size in KiB from `/proc/self/status` (Linux only).
pub fn peak_rss_kib() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("VmPeak:") {
            let kib: u64 = rest.trim().trim_end_matches(" kB").parse().ok()?;
            return Some(kib);
        }
    }
    None
}

/// Write a synthetic animated GIF with `count` frames at `width`×`height`.
pub fn write_synthetic_gif(path: &Path, width: u32, height: u32, count: usize) {
    let file = File::create(path).unwrap();
    let mut encoder = GifEncoder::new(BufWriter::new(file));
    encoder.set_repeat(Repeat::Infinite).unwrap();

    for i in 0..count {
        let shade = ((i * 37) % 256) as u8;
        let mut img = RgbaImage::new(width, height);
        for (x, y, px) in img.enumerate_pixels_mut() {
            *px = Rgba([
                shade,
                ((x as u32 * 3) % 256) as u8,
                ((y as u32 * 5) % 256) as u8,
                255,
            ]);
        }
        let delay = Delay::from_numer_denom_ms(100, 1);
        encoder
            .encode_frame(Frame::from_parts(img, 0, 0, delay))
            .unwrap();
    }
}
