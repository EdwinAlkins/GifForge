use serde::{Serialize, Serializer};

/// Backend error type. Serialized to a plain string so the frontend receives a
/// readable message from a rejected `invoke`.
#[derive(Debug, thiserror::Error)]
pub enum GifForgeError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("image error: {0}")]
    Image(#[from] image::ImageError),

    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("imagequant error: {0}")]
    Quant(#[from] imagequant::Error),

    #[error("{0}")]
    Other(String),
}

impl GifForgeError {
    pub fn other(msg: impl Into<String>) -> Self {
        GifForgeError::Other(msg.into())
    }
}

impl Serialize for GifForgeError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, GifForgeError>;
