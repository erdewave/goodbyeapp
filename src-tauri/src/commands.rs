// IPC commands. Everything the renderer may do goes through here; paths and registry keys never come from it,
// only ids that were produced by an earlier scan.
use crate::{files, health, i18n::{self, t}, icons, log::log, platform, sizes, state::*, types::*, util::*};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, path::Path, sync::{atomic::{AtomicBool, Ordering::{Relaxed, SeqCst}}, Arc}, time::Duration};
use tauri::{AppHandle, Emitter, State};

type S<'a> = State<'a, Arc<AppState>>;
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> R<T> { tauri::async_runtime::spawn_blocking(f).await.ctx() }

#[tauri::command]
pub async fn load(st: S<'_>) -> R<Value> { let st = st.inner().clone(); let _busy = st.lock()?; log("ipc load"); st.refresh().await }
// Icons and sizes are computed once per catalog; refresh() clears them.
async fn cached<T: Clone + Send + 'static>(st: &Arc<AppState>, name: &str, slot: fn(&mut Inner) -> &mut Option<T>, load: fn(&[AppRecord]) -> T) -> R<T> {
    log(&format!("ipc {name}"));
    let (hit, apps) = { let mut inner = st.inner.lock().unwrap(); (slot(&mut inner).clone(), inner.known.clone()) };
    if let Some(hit) = hit { return Ok(hit); }
    let result = blocking(move || load(&apps)).await?;
    *slot(&mut st.inner.lock().unwrap()) = Some(result.clone());
    log(&format!("{name} done"));
    Ok(result)
}
#[tauri::command]
pub async fn icons(st: S<'_>) -> R<HashMap<String, String>> { cached(st.inner(), "icons", |i| &mut i.icons, icons::load_icons).await }
#[tauri::command]
pub async fn sizes(st: S<'_>) -> R<HashMap<String, u64>> { cached(st.inner(), "sizes", |i| &mut i.sizes, sizes::load_sizes).await }
#[tauri::command]
pub async fn scan(st: S<'_>, id: String) -> R<Vec<Item>> {
    let st = st.inner().clone(); let _busy = st.lock()?; log("ipc scan");
    let (app, others) = (st.app(&id)?, st.others(&id));
    let items = blocking({ let app = app.clone(); move || platform::scan(&app, &others) }).await?;
    st.inner.lock().unwrap().plans.insert(app.id, items.clone());
    Ok(items)
}
#[tauri::command]
pub async fn uninstall(st: S<'_>, id: String, options: Option<Value>) -> R<Value> {
    let st = st.inner().clone(); let _busy = st.lock()?; log("ipc uninstall");
    let target = st.app(&id)?;
    if target.removed { return Err(t().already_removed.into()); }
    let want_restore = options.is_some_and(|o| o["restorePoint"] == true);
    // A failed restore point does not block the uninstall.
    let restore = if want_restore { let name = target.name.clone(); Some(blocking(move || platform::restore_point(&name).map(String::from).unwrap_or_else(|e| e)).await?) } else { None };
    blocking({ let target = target.clone(); move || platform::uninstall(&target) }).await??;
    st.refresh().await?;
    if !st.app(&id)?.removed { return Err(t().still_installed.into()); }
    Ok(json!({ "restore": restore }))
}
// The renderer's ids, each once; one unknown id fails the whole request.
fn picked<T>(selected: &[String], find: impl Fn(&str) -> Option<T>) -> R<Vec<T>> {
    let mut seen = HashSet::new();
    selected.iter().filter(|k| seen.insert(*k)).map(|k| find(k).ok_or_else(|| t().invalid_selection.to_string())).collect()
}
// The installed app list must no longer hold the target, and a scan must have produced the plan.
async fn clean_target(st: &Arc<AppState>, id: &str) -> R<(AppRecord, Vec<Item>)> {
    let target = st.app(id)?;
    let current = blocking(platform::list_apps).await??;
    if current.iter().any(|a| a.id == target.id || a.name.to_lowercase() == target.name.to_lowercase() || (target.bundle.is_some() && a.bundle == target.bundle)) { return Err(t().installed_copy.into()); }
    let plan = st.inner.lock().unwrap().plans.get(id).cloned().ok_or_else(|| t().scan_first.to_string())?;
    Ok((target, plan))
}
#[tauri::command]
pub async fn clean(st: S<'_>, id: String, selected: Vec<String>) -> R<Value> {
    let st = st.inner().clone(); let _busy = st.lock()?; log("ipc clean");
    let (target, plan) = clean_target(&st, &id).await?;
    if selected.is_empty() || selected.len() > 200 { return Err(t().select_items.into()); }
    let items = picked(&selected, |k| plan.iter().find(|i| i.id == k).cloned())?;
    let backups = st.backup_dir();
    let results: Vec<CleanResult> = blocking({ let items = items.clone(); move || items.iter().map(|i| match platform::clean_item(i, &backups) { Ok(backup) => CleanResult::ok(&i.path, backup), Err(e) => CleanResult::fail(&i.path, e) }).collect() }).await?;
    st.keep_failed(&target.id, &items, &results);
    Ok(json!({ "results": results }))
}
// Takes no paths from the renderer: only the failed items of the plan.
#[tauri::command]
pub async fn clean_elevated(st: S<'_>, id: String) -> R<Value> {
    let st = st.inner().clone(); let _busy = st.lock()?; log("ipc cleanElevated");
    let (target, plan) = clean_target(&st, &id).await?;
    let results = platform::clean_elevated(&plan, &target, &st.others(&target.id), &st.backup_dir()).await?;
    st.keep_failed(&target.id, &plan, &results);
    Ok(json!({ "results": results }))
}
#[tauri::command]
pub async fn backups(st: S<'_>) -> R<()> {
    let st = st.inner().clone(); let _busy = st.lock()?;
    std::fs::create_dir_all(st.backup_dir()).ctx()?;
    opener::open(st.backup_dir()).ctx()
}
#[tauri::command]
pub fn language(code: String) { i18n::set_language(&code); }
#[tauri::command]
pub async fn drives() -> R<Vec<Drive>> { blocking(files::list_drives).await? }
fn tree_ids(n: &TreeNode, out: &mut Vec<String>) { out.push(n.id.clone()); for c in n.children.iter().flatten() { tree_ids(c, out); } }
fn remember(st: &AppState, reports: &[DriveReport]) {
    // Map tiles can be revealed too: every tree node id is a scanned path (remainder areas end in \0).
    let mut found: HashSet<String> = reports.iter().flat_map(|r| r.files.iter().map(|f| f.path.clone())).collect();
    for r in reports { let mut ids = Vec::new(); if let Some(t) = &r.tree { tree_ids(t, &mut ids); } found.extend(ids); }
    st.inner.lock().unwrap().found = found;
}
// Disk scan runs outside the busy lock so the window stays usable; reveal and open only accept paths the scan produced.
#[tauri::command]
pub async fn scan_files(app: AppHandle, st: S<'_>) -> R<Vec<DriveReport>> {
    let st = st.inner().clone();
    let cancel = { let mut slot = st.file_scan.lock().unwrap(); if slot.is_some() { return Err(t().scan_running.into()); } let c = Arc::new(AtomicBool::new(false)); *slot = Some(c.clone()); c };
    log("ipc scanFiles");
    let state = st.clone();
    let result = blocking(move || -> R<Vec<DriveReport>> {
        let jobs: Vec<Arc<files::Job>> = files::list_drives()?.iter().map(|d| Arc::new(files::Job::new(&d.root))).collect();
        let threads: Vec<_> = jobs.iter().map(|j| { let (j, c) = (j.clone(), cancel.clone()); std::thread::spawn(move || files::scan_drive(&j, &c)) }).collect();
        while !jobs.iter().all(|j| j.done.load(Relaxed)) {
            std::thread::sleep(Duration::from_millis(400));
            let reports: Vec<DriveReport> = jobs.iter().map(|j| files::report(j, false)).collect();
            remember(&state, &reports);
            let _ = app.emit("files:progress", &reports);
        }
        for t in threads { let _ = t.join(); }
        let reports: Vec<DriveReport> = jobs.iter().map(|j| files::report(j, true)).collect();
        remember(&state, &reports);
        Ok(reports)
    }).await;
    *st.file_scan.lock().unwrap() = None;
    result?
}
#[tauri::command]
pub fn cancel_files(st: S<'_>) { if let Some(c) = st.file_scan.lock().unwrap().as_ref() { c.store(true, SeqCst); } }
fn scanned(st: &AppState, target: &str) -> R<()> { if st.inner.lock().unwrap().found.contains(target) { Ok(()) } else { Err(t().not_in_scan.into()) } }
#[tauri::command]
pub fn reveal(st: S<'_>, target: String) -> R<()> { scanned(&st, &target)?; opener::reveal(Path::new(&target)).ctx() }
#[tauri::command]
pub fn open(st: S<'_>, target: String) -> R<()> { scanned(&st, &target)?; opener::open(Path::new(&target)).ctx() }

// Health Check: the renderer picks ids from the last scan; paths and keys never come from it.
// The clean runs outside the busy lock (like the disk scan) so the other tabs stay usable; only a rescan waits for it.
#[tauri::command]
pub async fn health_scan(st: S<'_>) -> R<Vec<HealthItem>> {
    let st = st.inner().clone();
    if st.health_cleaning.load(SeqCst) { return Err(t().busy.into()); }
    let _busy = st.lock()?; log("ipc healthScan");
    let items = blocking(health::scan_health).await?;
    st.inner.lock().unwrap().health = items.iter().map(|i| (i.id.clone(), i.clone())).collect();
    Ok(items)
}
// Reveals the first file the scan found for the item (its path can be a wildcard, so it is not revealed itself).
#[tauri::command]
pub fn health_reveal(st: S<'_>, key: String) -> R<()> {
    let first = st.inner.lock().unwrap().health.get(&key).filter(|i| i.kind == "files").and_then(|i| i.files.first().cloned());
    opener::reveal(Path::new(&first.ok_or_else(|| t().invalid_selection.to_string())?)).ctx()
}
#[tauri::command]
pub async fn health_clean(app: AppHandle, st: S<'_>, selected: Vec<String>) -> R<Value> {
    let st = st.inner().clone();
    if selected.is_empty() { return Err(t().select_items.into()); }
    let items = { let inner = st.inner.lock().unwrap(); picked(&selected, |k| inner.health.get(k).cloned())? };
    // swap claims the flag in one step, so two clean requests cannot both get through.
    if st.health_cleaning.swap(true, SeqCst) { return Err(t().busy.into()); }
    let backups = st.backup_dir();
    let results = blocking(move || health::clean_health(&items, &backups, &|p| { let _ = app.emit("health:progress", p); })).await;
    st.health_cleaning.store(false, SeqCst);
    Ok(json!({ "results": results? }))
}
