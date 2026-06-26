mod commands;
mod error;
mod models;
mod services;

#[cfg(test)]
mod tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::import::import_gif,
            commands::export::export_gif,
            commands::preview::get_frame_data,
            commands::preview::get_cropped_frame_path,
            commands::project::save_project,
            commands::project::open_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
