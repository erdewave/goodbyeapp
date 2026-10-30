// Updates come from GitHub Releases. Windows (NSIS) and Linux (AppImage) download in the background and install on the
// user's go-ahead, or on quit (main.rs); macOS needs a Developer ID signature to install in place, so it only links to the release.
// The renderer starts every check (on launch when automatic updates are on, or from Settings), so no event is sent
// before it listens. Returns the new version, or null when up to date; the toast arrives over the `update` event.
use crate::{i18n::t, state::*, util::*};
use serde_json::{json, Value};
use std::sync::{atomic::Ordering::SeqCst, Arc};
use tauri::{AppHandle, Emitter, State};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_updater::UpdaterExt;

const RELEASES: &str = "https://github.com/erdewave/goodbyeapp/releases/latest";
#[cfg(target_os = "macos")]
fn latest_tag() -> R<String> {
    let json = run("curl", &["-fsSL", "-H", "User-Agent: goodbyeapp", "https://api.github.com/repos/erdewave/goodbyeapp/releases/latest"])?;
    serde_json::from_str::<Value>(&json).ctx()?["tag_name"].as_str().map(String::from).ok_or_else(|| "no tag".to_string())
}
#[tauri::command]
pub async fn check_update(app: AppHandle, st: State<'_, Arc<AppState>>) -> R<Option<Value>> {
    let st = st.inner().clone();
    if cfg!(debug_assertions) { return Ok(None); }
    #[cfg(target_os = "macos")]
    {
        // ponytail: "differs from the latest tag" stands in for "older"; packaged builds only come from releases.
        let tag = tauri::async_runtime::spawn_blocking(latest_tag).await.ctx()?.map_err(|_| t().update_failed.to_string())?;
        if tag == format!("v{}", st.version) { return Ok(None); }
        let version = tag.trim_start_matches('v').to_string();
        let _ = app.emit("update", json!({ "version": version, "ready": false }));
        return Ok(Some(json!({ "version": version, "downloading": false })));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let fail = |_| t().update_failed.to_string();
        let Some(update) = app.updater().map_err(fail)?.check().await.map_err(fail)? else { return Ok(None) };
        let version = update.version.clone();
        // A repeat check reuses the running or cached download.
        if st.inner.lock().unwrap().pending.is_some() { let _ = app.emit("update", json!({ "version": version, "ready": true })); }
        else if !st.downloading.swap(true, SeqCst) {
            let v = version.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(bytes) = update.download(|_, _| {}, || {}).await { st.inner.lock().unwrap().pending = Some(Pending { update, bytes }); let _ = app.emit("update", json!({ "version": v, "ready": true })); }
                st.downloading.store(false, SeqCst);
            });
        }
        Ok(Some(json!({ "version": version, "downloading": true })))
    }
}
#[tauri::command]
pub async fn install_update(app: AppHandle, st: State<'_, Arc<AppState>>) -> R<()> {
    if cfg!(target_os = "macos") { return opener::open_browser(RELEASES).ctx(); }
    if st.busy.load(SeqCst) || st.health_cleaning.load(SeqCst) { return Err(t().busy.into()); } // the close handler would block the quit mid-operation anyway
    let pending = st.inner.lock().unwrap().pending.take().ok_or_else(|| t().update_failed.to_string())?;
    pending.update.install(pending.bytes).ctx()?;
    app.restart()
}
