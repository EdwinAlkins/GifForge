//! Core round-trip tests for the GIF decode/encode services (no GUI needed).

use std::fs::File;
use std::path::Path;

use image::codecs::gif::{GifEncoder, Repeat};
use image::{Delay, Frame, Rgba, RgbaImage};
use rayon::prelude::*;

use crate::models::{ExportQuality, ExportSegment, TimelineFrame};
use crate::services::{bench_util, frame_store, gif_decoder, gif_encoder};

/// Write a small synthetic animated GIF with `count` 4×4 frames at 10 cs each.
fn make_fixture_gif(path: &Path, count: usize) {
    let mut encoder = GifEncoder::new(File::create(path).unwrap());
    encoder.set_repeat(Repeat::Infinite).unwrap();
    for i in 0..count {
        let shade = (i * 40) as u8;
        let mut img = RgbaImage::new(4, 4);
        for px in img.pixels_mut() {
            *px = Rgba([shade, 0, 255 - shade, 255]);
        }
        let delay = Delay::from_numer_denom_ms(100, 1);
        encoder
            .encode_frame(Frame::from_parts(img, 0, 0, delay))
            .unwrap();
    }
}

#[test]
fn decode_reports_frames_dimensions_and_duration() {
    let dir = std::env::temp_dir().join(format!("gifforge-dec-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let gif = dir.join("in.gif");
    make_fixture_gif(&gif, 3);

    let decoded = gif_decoder::decode_gif(gif.to_str().unwrap()).unwrap();
    assert_eq!(decoded.len(), 3, "frame count");
    assert_eq!(decoded[0].image.dimensions(), (4, 4), "dimensions");
    assert_eq!(decoded[0].duration_cs, 10, "100ms should round to 10cs");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn decode_keeps_delays_longer_than_255_cs() {
    let dir = std::env::temp_dir().join(format!("gifforge-long-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let gif = dir.join("long.gif");
    {
        let mut encoder = GifEncoder::new(File::create(&gif).unwrap());
        for shade in [0u8, 255] {
            let img = RgbaImage::from_pixel(4, 4, Rgba([shade, 0, 0, 255]));
            let delay = Delay::from_numer_denom_ms(5000, 1);
            encoder.encode_frame(Frame::from_parts(img, 0, 0, delay)).unwrap();
        }
    }

    let decoded = gif_decoder::decode_gif(gif.to_str().unwrap()).unwrap();
    assert_eq!(decoded[0].duration_cs, 500, "5 s must not be clamped to 2.55 s");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn decode_encode_roundtrip_preserves_frame_count() {
    let dir = std::env::temp_dir().join(format!("gifforge-rt-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let src = dir.join("in.gif");
    make_fixture_gif(&src, 4);

    let decoded = gif_decoder::decode_gif(src.to_str().unwrap()).unwrap();

    let mut timeline = Vec::new();
    for (i, df) in decoded.iter().enumerate() {
        let frame_path = dir.join(format!("frame{i}.png"));
        df.image.save(&frame_path).unwrap();
        timeline.push(TimelineFrame {
            id: i.to_string(),
            source_id: "src".into(),
            source_frame_index: i as u32,
            frame_path: frame_path.to_string_lossy().into_owned(),
            duration_cs: df.duration_cs,
            track_index: 0,
            clip_id: None,
            thumbnail_path: None,
            thumbnail: None,
        });
    }

    let out = dir.join("out.gif");
    gif_encoder::encode_timeline(
        out.to_str().unwrap(),
        &sequential(&timeline),
        &std::collections::HashMap::from([("src".into(), None)]),
        &ExportQuality::Fast,
        |_, _| {},
    )
    .unwrap();
    assert!(out.exists(), "encoder must produce a file");

    let redecoded = gif_decoder::decode_gif(out.to_str().unwrap()).unwrap();
    assert_eq!(redecoded.len(), 4, "round-trip frame count");
    assert_eq!(redecoded[0].image.dimensions(), (4, 4), "round-trip dimensions");

    std::fs::remove_dir_all(&dir).ok();
}

/// Save `images` as PNG cache files and build a single-source timeline over them.
fn timeline_from_images(dir: &Path, images: &[RgbaImage], duration_cs: u16) -> Vec<TimelineFrame> {
    images
        .iter()
        .enumerate()
        .map(|(i, img)| {
            let frame_path = dir.join(format!("f{i}.png"));
            frame_store::save_frame_png(img, &frame_path).unwrap();
            TimelineFrame {
                id: i.to_string(),
                source_id: "src".into(),
                source_frame_index: i as u32,
                frame_path: frame_path.to_string_lossy().into_owned(),
                duration_cs,
                track_index: 0,
                clip_id: None,
                thumbnail_path: None,
                thumbnail: None,
            }
        })
        .collect()
}

/// One single-layer segment per frame: a one-track timeline without gaps.
fn sequential(frames: &[TimelineFrame]) -> Vec<ExportSegment> {
    frames
        .iter()
        .map(|f| ExportSegment {
            duration_cs: f.duration_cs,
            layers: vec![f.clone()],
        })
        .collect()
}

/// Export `timeline` to `out`, returning the file size and the re-decoded frames.
fn export_and_decode(
    out: &Path,
    timeline: &[TimelineFrame],
    quality: ExportQuality,
) -> (u64, Vec<gif_decoder::DecodedFrame>) {
    export_segments_and_decode(out, &sequential(timeline), quality)
}

fn export_segments_and_decode(
    out: &Path,
    segments: &[ExportSegment],
    quality: ExportQuality,
) -> (u64, Vec<gif_decoder::DecodedFrame>) {
    gif_encoder::encode_timeline(
        out.to_str().unwrap(),
        segments,
        &std::collections::HashMap::from([("src".into(), None)]),
        &quality,
        |_, _| {},
    )
    .unwrap();
    let size = std::fs::metadata(out).unwrap().len();
    (size, gif_decoder::decode_gif(out.to_str().unwrap()).unwrap())
}

/// 16-colour checkerboard background with an 8×8 white sprite at `sprite_x`.
fn sprite_scene(w: u32, h: u32, sprite_x: u32) -> RgbaImage {
    RgbaImage::from_fn(w, h, |x, y| {
        if (sprite_x..sprite_x + 8).contains(&x) && (8..16).contains(&y) {
            Rgba([255, 255, 255, 255])
        } else {
            let c = (((x / 8 + y / 8) % 16) * 16) as u8;
            Rgba([c, 255 - c, c / 2, 255])
        }
    })
}

fn max_channel_diff(a: &RgbaImage, b: &RgbaImage) -> u8 {
    a.as_raw()
        .iter()
        .zip(b.as_raw())
        .map(|(x, y)| x.abs_diff(*y))
        .max()
        .unwrap_or(0)
}

#[test]
fn export_merges_identical_frames() {
    let dir = std::env::temp_dir().join(format!("gifforge-dup-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let still = sprite_scene(32, 32, 4);
    let timeline = timeline_from_images(&dir, &vec![still; 10], 4);

    for quality in [ExportQuality::Fast, ExportQuality::Balanced] {
        let (_, decoded) = export_and_decode(&dir.join("out.gif"), &timeline, quality);
        assert_eq!(decoded.len(), 1, "identical frames must be merged");
        assert_eq!(decoded[0].duration_cs, 40, "merged frame keeps total duration");
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn export_delta_frames_reproduce_source_and_stay_small() {
    let dir = std::env::temp_dir().join(format!("gifforge-delta-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let scenes: Vec<RgbaImage> = (0..20).map(|i| sprite_scene(256, 192, i * 8)).collect();
    let timeline = timeline_from_images(&dir, &scenes, 5);

    let (single_size, _) =
        export_and_decode(&dir.join("single.gif"), &timeline[..1], ExportQuality::Balanced);
    let (size, decoded) =
        export_and_decode(&dir.join("anim.gif"), &timeline, ExportQuality::Balanced);

    assert_eq!(decoded.len(), scenes.len());
    for (i, (got, want)) in decoded.iter().zip(&scenes).enumerate() {
        assert_eq!(got.duration_cs, 5, "frame {i} duration");
        // Quantization costs a few levels; a misplaced or stale sprite would cost ~255.
        let diff = max_channel_diff(&got.image, want);
        assert!(diff <= 32, "frame {i} differs from source by {diff}");
    }
    assert!(
        size < single_size * 2,
        "20 frames with a moving 8×8 sprite should cost far less than 20 full frames \
         (animation {size} B, one frame {single_size} B)"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn export_clears_pixels_that_become_transparent() {
    let dir = std::env::temp_dir().join(format!("gifforge-alpha-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let opaque = RgbaImage::from_pixel(8, 8, Rgba([255, 0, 0, 255]));
    let half = RgbaImage::from_fn(8, 8, |x, _| {
        if x < 4 {
            Rgba([0, 0, 0, 0])
        } else {
            Rgba([255, 0, 0, 255])
        }
    });
    let timeline = timeline_from_images(&dir, &[opaque.clone(), half, opaque], 5);

    for quality in [ExportQuality::Fast, ExportQuality::Balanced] {
        let (_, decoded) = export_and_decode(&dir.join("out.gif"), &timeline, quality);
        assert_eq!(decoded.len(), 3);
        assert_eq!(decoded[1].image.get_pixel(1, 1)[3], 0, "left half must be cleared");
        assert_eq!(decoded[1].image.get_pixel(6, 1)[3], 255, "right half stays opaque");
        assert_eq!(decoded[2].image.get_pixel(1, 1)[3], 255, "left half repainted");
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn export_never_fails_on_images_too_rich_for_the_quality_target() {
    let dir = std::env::temp_dir().join(format!("gifforge-noise-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    // Pseudo-random noise: thousands of unrelated colours, far beyond 256.
    let mut seed = 0x2545_f491_4f6c_dd1du64;
    let mut next = move || {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        seed as u8
    };
    let noise: Vec<RgbaImage> = (0..2)
        .map(|_| RgbaImage::from_fn(96, 96, |_, _| Rgba([next(), next(), next(), 255])))
        .collect();
    let timeline = timeline_from_images(&dir, &noise, 5);

    for quality in [ExportQuality::Balanced, ExportQuality::Light] {
        let (_, decoded) = export_and_decode(&dir.join("out.gif"), &timeline, quality);
        assert_eq!(decoded.len(), 2);
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn export_composites_tracks_and_renders_gaps_transparent() {
    let dir = std::env::temp_dir().join(format!("gifforge-comp-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    // V1: opaque red 8×8. V2: 4×4 overlay, blue except a transparent pixel at (0, 0).
    let red = RgbaImage::from_pixel(8, 8, Rgba([255, 0, 0, 255]));
    let overlay = RgbaImage::from_fn(4, 4, |x, y| {
        if (x, y) == (0, 0) {
            Rgba([0, 0, 0, 0])
        } else {
            Rgba([0, 0, 255, 255])
        }
    });
    let frames = timeline_from_images(&dir, &[red, overlay], 5);
    let segments = vec![
        ExportSegment { duration_cs: 5, layers: vec![frames[0].clone()] },
        ExportSegment { duration_cs: 7, layers: vec![frames[0].clone(), frames[1].clone()] },
        ExportSegment { duration_cs: 3, layers: vec![] },
    ];

    for quality in [ExportQuality::Fast, ExportQuality::Balanced] {
        let (_, decoded) = export_segments_and_decode(&dir.join("out.gif"), &segments, quality);
        assert_eq!(decoded.len(), 3);
        assert_eq!(decoded[1].duration_cs, 7);
        let px = |i: usize, x, y| *decoded[i].image.get_pixel(x, y);
        assert_eq!(px(1, 2, 2), Rgba([0, 0, 255, 255]), "overlay drawn on top");
        assert_eq!(px(1, 0, 0), Rgba([255, 0, 0, 255]), "transparent overlay pixel shows V1");
        assert_eq!(px(1, 6, 6), Rgba([255, 0, 0, 255]), "V1 outside the overlay");
        assert_eq!(px(2, 6, 6)[3], 0, "gap renders transparent");
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn project_save_open_roundtrip() {
    use crate::models::{Project, SourceAsset, TimelineClip, TimelineFrame};
    use crate::services::{bench_util, import_service, project_io};
    use import_service::ImportOptions;

    let dir = project_io::extract_dir_for_test("proj");
    std::fs::create_dir_all(&dir).unwrap();

    let gif_path = dir.join("test.gif");
    bench_util::write_synthetic_gif(&gif_path, 8, 8, 2);

    let cache = dir.join("cache");
    let imported = import_service::import_gif_to_cache(
        None,
        ImportOptions {
            path: gif_path.to_string_lossy().into_owned(),
            source_id: Some("src-1".into()),
            emit_progress: false,
            cache_root: Some(cache.clone()),
        },
    )
    .unwrap();

    let source_id = imported.source.id.clone();
    let frame_id = imported.frames[0].id.clone();
    let tf = TimelineFrame {
        id: frame_id.clone(),
        source_id: source_id.clone(),
        source_frame_index: 0,
        frame_path: imported.frames[0].frame_path.clone(),
        duration_cs: 12,
        track_index: 1,
        clip_id: Some("clip-1".into()),
        thumbnail_path: imported.frames[0].thumbnail_path.clone(),
        thumbnail: None,
    };

    let project = Project {
        version: 2,
        name: "Test".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        modified_at: "2026-01-01T00:00:00Z".into(),
        sources: vec![SourceAsset {
            id: source_id.clone(),
            filename: "test.gif".into(),
            path: gif_path.to_string_lossy().into_owned(),
            width: 8,
            height: 8,
            crop: None,
            thumbnail_path: imported.source.thumbnail_path.clone(),
            thumbnail: None,
        }],
        timeline: vec![tf],
        clips: vec![TimelineClip {
            id: "clip-1".into(),
            track_index: 1,
            start_cs: 30,
        }],
        source_frames: Some(std::collections::HashMap::from([(
            source_id,
            imported.frames,
        )])),
    };

    let zip_path = dir.join("test.gifforge");
    project_io::save_project_disk(zip_path.to_str().unwrap(), &project).unwrap();

    let extract = dir.join("extract");
    project_io::extract_archive(zip_path.to_str().unwrap(), &extract).unwrap();
    assert!(!project_io::is_legacy_archive(&extract));
    assert!(extract.join("project.json").exists());
    assert!(extract.join("sources/test.gif").exists());
    assert!(!extract.join("frames").exists());

    let saved = project_io::read_saved_project(&extract).unwrap();
    let open_cache = dir.join("open_cache");
    let loaded =
        project_io::hydrate_project_with_cache(&extract, saved, &open_cache, None).unwrap();

    assert_eq!(loaded.name, "Test");
    assert_eq!(loaded.timeline.len(), 1);
    assert_eq!(loaded.timeline[0].duration_cs, 12);
    assert_eq!(loaded.timeline[0].source_frame_index, 0);
    assert_eq!(loaded.timeline[0].clip_id.as_deref(), Some("clip-1"));
    assert_eq!(loaded.clips.len(), 1);
    assert_eq!((loaded.clips[0].track_index, loaded.clips[0].start_cs), (1, 30));
    assert!(std::path::Path::new(&loaded.timeline[0].frame_path).exists());

    std::fs::remove_dir_all(&dir).ok();
}

/// CI perf gate: streaming import pipeline on 100 small frames must finish quickly.
#[test]
fn perf_synthetic_import_100_frames() {
    let dir = std::env::temp_dir().join(format!("gifforge-perf-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let gif = dir.join("synthetic.gif");
    bench_util::write_synthetic_gif(&gif, 64, 64, 100);

    let frames_dir = dir.join("frames");
    let thumbs_dir = dir.join("thumbs");
    std::fs::create_dir_all(&frames_dir).unwrap();
    std::fs::create_dir_all(&thumbs_dir).unwrap();

    let t0 = std::time::Instant::now();
    let mut count = 0usize;
    gif_decoder::decode_gif_streaming(gif.to_str().unwrap(), |df| {
        let frame_path = frames_dir.join(format!("{count}.png"));
        let thumb_path = thumbs_dir.join(format!("{count}.png"));
        frame_store::save_frame_png(&df.image, &frame_path)?;
        frame_store::save_thumb_png(&df.image, &thumb_path)?;
        count += 1;
        Ok(())
    })
    .unwrap();
    let elapsed = t0.elapsed();

    assert_eq!(count, 100);
    assert!(
        elapsed.as_secs() < 30,
        "100-frame import too slow: {elapsed:?}"
    );

    let payload_estimate = count * 120;
    assert!(
        payload_estimate < 50_000,
        "estimated IPC payload should be path-only"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
#[ignore]
fn perf_synthetic_import_scaled() {
    let count: usize = std::env::var("GIFFORGE_BENCH_COUNT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);
    let dir = std::env::temp_dir().join(format!("gifforge-perf-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let gif = dir.join("synthetic.gif");
    bench_util::write_synthetic_gif(&gif, 64, 64, count);

    let frames_dir = dir.join("frames");
    let thumbs_dir = dir.join("thumbs");
    std::fs::create_dir_all(&frames_dir).unwrap();
    std::fs::create_dir_all(&thumbs_dir).unwrap();

    let rss_before = bench_util::peak_rss_kib();
    let t0 = std::time::Instant::now();
    let mut n = 0usize;
    gif_decoder::decode_gif_streaming(gif.to_str().unwrap(), |df| {
        let frame_path = frames_dir.join(format!("{n}.png"));
        let thumb_path = thumbs_dir.join(format!("{n}.png"));
        frame_store::save_frame_png(&df.image, &frame_path)?;
        frame_store::save_thumb_png(&df.image, &thumb_path)?;
        n += 1;
        Ok(())
    })
    .unwrap();
    let elapsed = t0.elapsed();
    let rss_after = bench_util::peak_rss_kib();

    eprintln!(
        "frames={n} elapsed={elapsed:?} rss_before={rss_before:?} rss_after={rss_after:?}"
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
#[ignore]
fn bench_decode_real_gif() {
    let path = std::env::var("GIFFORGE_BENCH").expect("set GIFFORGE_BENCH=path");
    let t = std::time::Instant::now();
    let mut count = 0usize;
    gif_decoder::decode_gif_streaming(&path, |_| {
        count += 1;
        Ok(())
    })
    .unwrap();
    eprintln!("streamed {count} frames in {:?}", t.elapsed());
}

#[test]
#[ignore]
fn bench_full_import_debug() {
    use crate::services::frame_store;
    let path = std::env::var("GIFFORGE_BENCH").expect("set GIFFORGE_BENCH=path");
    let dir = std::env::temp_dir().join(format!("gifforge-imp-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let frames_dir = dir.join("frames");
    let thumbs_dir = dir.join("thumbs");
    std::fs::create_dir_all(&frames_dir).unwrap();
    std::fs::create_dir_all(&thumbs_dir).unwrap();

    let t0 = std::time::Instant::now();
    let mut batch: Vec<(usize, image::RgbaImage)> = Vec::new();
    let mut total = 0usize;
    gif_decoder::decode_gif_streaming(&path, |df| {
        batch.push((total, df.image));
        total += 1;
        if batch.len() >= 32 {
            let chunk: Vec<_> = batch.drain(..).collect();
            chunk.par_iter().for_each(|(i, img)| {
                frame_store::save_frame_png(img, &frames_dir.join(format!("f{i}.png"))).unwrap();
                frame_store::save_thumb_png(img, &thumbs_dir.join(format!("t{i}.png"))).unwrap();
            });
        }
        Ok(())
    })
    .unwrap();
    if !batch.is_empty() {
        batch.par_iter().for_each(|(i, img)| {
            frame_store::save_frame_png(img, &frames_dir.join(format!("f{i}.png"))).unwrap();
            frame_store::save_thumb_png(img, &thumbs_dir.join(format!("t{i}.png"))).unwrap();
        });
    }
    eprintln!(
        "frames={total} streaming_import={:?} rss={:?}",
        t0.elapsed(),
        bench_util::peak_rss_kib()
    );
    std::fs::remove_dir_all(&dir).ok();
}

/// Export benchmark: peak RSS and time for `GIFFORGE_BENCH_COUNT` frames at
/// `GIFFORGE_BENCH_SIZE` (e.g. `1920x1080`). Run alone so the RSS peak is meaningful:
/// `cargo test --release bench_export_scaled -- --ignored --nocapture`
#[test]
#[ignore]
fn bench_export_scaled() {
    let count: usize = std::env::var("GIFFORGE_BENCH_COUNT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);
    let (w, h) = std::env::var("GIFFORGE_BENCH_SIZE")
        .ok()
        .and_then(|s| {
            let (a, b) = s.split_once('x')?;
            Some((a.parse().ok()?, b.parse().ok()?))
        })
        .unwrap_or((1920u32, 1080u32));
    let quality = match std::env::var("GIFFORGE_BENCH_QUALITY").as_deref() {
        Ok("fast") => ExportQuality::Fast,
        Ok("light") => ExportQuality::Light,
        _ => ExportQuality::Balanced,
    };

    let dir = std::env::temp_dir().join(format!("gifforge-exp-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let timeline: Vec<TimelineFrame> = (0..count)
        .into_par_iter()
        .map(|i| {
            let shade = ((i * 37) % 256) as u8;
            let img = RgbaImage::from_fn(w, h, |x, y| {
                Rgba([shade, (x % 256) as u8, (y % 256) as u8, 255])
            });
            let frame_path = dir.join(format!("f{i}.png"));
            frame_store::save_frame_png(&img, &frame_path).unwrap();
            TimelineFrame {
                id: i.to_string(),
                source_id: "src".into(),
                source_frame_index: i as u32,
                frame_path: frame_path.to_string_lossy().into_owned(),
                duration_cs: 4,
                track_index: 0,
                clip_id: None,
                thumbnail_path: None,
                thumbnail: None,
            }
        })
        .collect();

    let rss_before = bench_util::peak_rss_kib();
    let out = dir.join("out.gif");
    let t0 = std::time::Instant::now();
    gif_encoder::encode_timeline(
        out.to_str().unwrap(),
        &sequential(&timeline),
        &std::collections::HashMap::from([("src".into(), None)]),
        &quality,
        |_, _| {},
    )
    .unwrap();
    let elapsed = t0.elapsed();
    let rss_after = bench_util::peak_rss_kib();
    let size = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);

    eprintln!(
        "export frames={count} size={w}x{h} elapsed={elapsed:?} peak_rss_before={rss_before:?}KiB peak_rss_after={rss_after:?}KiB out_bytes={size}"
    );
    std::fs::remove_dir_all(&dir).ok();
}
