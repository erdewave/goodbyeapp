#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod commands;
mod files;
mod health;
mod i18n;
mod icons;
mod log;
mod mft;
mod platform;
mod sizes;
mod state;
mod tree;
mod types;
mod update;
mod util;
use std::sync::{atomic::Ordering::SeqCst, Arc};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Same folder the Electron build used, so backups and the app history carry over.
            let data_dir = app.path().config_dir()?.join("GoodbyeAPP");
            let version = app.package_info().version.to_string();
            log::start(&data_dir, &version);
            let st = Arc::new(state::AppState::new(data_dir, version));
            app.manage(st.clone());
            let mut win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("GoodbyeAPP").inner_size(1240.0, 820.0).min_inner_size(920.0, 640.0).background_color(tauri::window::Color(255, 255, 255, 255))
                // The page is the app's own bundle; anything else (links, redirects) stays out.
                .on_navigation(|url| matches!(url.scheme(), "tauri" | "asset") || url.host_str() == Some("tauri.localhost"));
            // Windows keeps the app's own buttons (frameless); macOS gets its traffic lights and Linux the system's title bar.
            win = win.decorations(!cfg!(windows));
            #[cfg(target_os = "macos")] { win = win.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true); }
            // The title bar buttons use Tauri's window API (ui/tauri.ts); closing waits for the running operation.
            win.build()?.on_window_event(move |event| if let WindowEvent::CloseRequested { api, .. } = event { if st.busy.load(SeqCst) { api.prevent_close(); } });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load, commands::icons, commands::sizes, commands::scan, commands::uninstall, commands::clean, commands::clean_elevated, commands::backups, commands::drives,
            commands::scan_files, commands::cancel_files, commands::reveal, commands::open, commands::language, commands::health_scan, commands::health_reveal, commands::health_clean,
            update::check_update, update::install_update,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build GoodbyeAPP")
        .run(|_, event| if let tauri::RunEvent::Exit = event { log::log("quit"); });
}
