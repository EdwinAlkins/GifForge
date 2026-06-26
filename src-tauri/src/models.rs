use serde::{Deserialize, Serialize};

/// Crop rectangle in source-pixel coordinates. Owned per source (not global).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// A GIF imported into the library.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceAsset {
    pub id: String,
    pub filename: String,
    /// Original path on disk (until the project is packed into a .gifforge).
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub crop: Option<CropRect>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
}

/// A frame placed on the timeline. `source_id` + `source_frame_index` identify the
/// frame inside the source GIF; `frame_path` is a runtime cache path only.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TimelineFrame {
    pub id: String,
    pub source_id: String,
    /// 0-based index of this frame within the source GIF decode order.
    #[serde(default)]
    pub source_frame_index: u32,
    /// Absolute path of the cached full-resolution RGBA PNG (runtime only).
    #[serde(default)]
    pub frame_path: String,
    pub duration_cs: u16,
    #[serde(default)]
    pub track_index: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub source: SourceAsset,
    pub frames: Vec<TimelineFrame>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub version: u32,
    pub name: String,
    pub created_at: String,
    pub modified_at: String,
    pub sources: Vec<SourceAsset>,
    pub timeline: Vec<TimelineFrame>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_frames: Option<std::collections::HashMap<String, Vec<TimelineFrame>>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum ExportQuality {
    #[default]
    Fast,
    Balanced,
    Light,
}

/// Timeline entry stored on disk (no cache paths).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavedTimelineFrame {
    pub id: String,
    pub source_id: String,
    pub source_frame_index: u32,
    pub duration_cs: u16,
    #[serde(default)]
    pub track_index: u32,
}

/// Project document written to `project.json` inside a `.gifforge` archive.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavedProject {
    pub version: u32,
    pub name: String,
    pub created_at: String,
    pub modified_at: String,
    pub sources: Vec<SourceAsset>,
    pub timeline: Vec<SavedTimelineFrame>,
}
