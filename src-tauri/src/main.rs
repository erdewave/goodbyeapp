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
use serde_json::{json, Value};
use std::sync::{atomic::Ordering::SeqCst, Arc};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

fn window_state(w: &tauri::WebviewWindow) -> Value { json!({ "maximized": w.is_maximized().unwrap_or(false), "focused": w.is_focused().unwrap_or(true), "platform": state::PLATFORM }) }
#[tauri::command]
fn window_state_get(window: tauri::WebviewWindow) -> Value { window_state(&window) }
#[tauri::command]
fn window_control(window: tauri::WebviewWindow, st: State<'_, Arc<state::AppState>>, action: String) -> util::R<Value> {
    match action.as_str() {
        "minimize" => { let _ = window.minimize(); }
        "maximize" => { let _ = if window.is_maximized().unwrap_or(false) { window.unmaximize() } else { window.maximize() }; }
        "close" => { if st.busy.load(SeqCst) { return Ok(json!({ "blocked": true })); } let _ = window.close(); return Ok(json!({})); }
        _ => return Err(i18n::t().invalid_window_action.into()),
    }
    Ok(window_state(&window))
}
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
            let window = win.build()?;
            let w = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } if st.busy.load(SeqCst) => api.prevent_close(),
                WindowEvent::Resized(_) | WindowEvent::Focused(_) => { if let Some(w) = w.app_handle().get_webview_window("main") { let _ = w.emit("window:changed", window_state(&w)); } }
                _ => {}
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load, commands::icons, commands::sizes, commands::scan, commands::uninstall, commands::clean, commands::clean_elevated, commands::backups, commands::drives,
            commands::scan_files, commands::cancel_files, commands::reveal, commands::open, commands::language, commands::health_scan, commands::health_reveal, commands::health_clean,
            update::check_update, update::install_update, window_state_get, window_control,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build GoodbyeAPP")
        .run(|_, event| if let tauri::RunEvent::Exit = event { log::log("quit"); });
}
