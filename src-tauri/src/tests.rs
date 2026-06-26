//! Core round-trip tests for the GIF decode/encode services (no GUI needed).

use std::fs::File;
use std::path::Path;

use image::codecs::gif::{GifEncoder, Repeat};
use image::{Delay, Frame, Rgba, RgbaImage};
use rayon::prelude::*;

use crate::models::{ExportQuality, TimelineFrame};
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
            thumbnail_path: None,
            thumbnail: None,
        });
    }

    let out = dir.join("out.gif");
    gif_encoder::encode_timeline(
        out.to_str().unwrap(),
        &timeline,
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

#[test]
fn project_save_open_roundtrip() {
    use crate::models::{Project, SourceAsset, TimelineFrame};
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
        track_index: 0,
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
