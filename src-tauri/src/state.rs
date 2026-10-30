// Session state shared by the commands: the app catalog, cleanup plans, scan results and the one-operation-at-a-time lock.
use crate::{i18n::t, platform, types::*, util::*};
use serde_json::{json, Value};
use std::{collections::{HashMap, HashSet}, fs, path::PathBuf, sync::{atomic::{AtomicBool, Ordering::SeqCst}, Arc, Mutex}};

pub struct Pending { pub update: tauri_plugin_updater::Update, pub bytes: Vec<u8> }
#[derive(Default)]
pub struct Inner {
    pub known: Vec<AppRecord>, pub plans: HashMap<String, Vec<Item>>, pub found: HashSet<String>, pub health: HashMap<String, HealthItem>,
    pub icons: Option<HashMap<String, String>>, pub sizes: Option<HashMap<String, u64>>, pub pending: Option<Pending>,
}
pub struct AppState { pub inner: Mutex<Inner>, pub busy: AtomicBool, pub health_cleaning: AtomicBool, pub downloading: AtomicBool, pub file_scan: Mutex<Option<Arc<AtomicBool>>>, pub data_dir: PathBuf, pub version: String }
// Releases the lock when the operation ends, however it ends.
pub struct Busy(Arc<AppState>);
impl Drop for Busy { fn drop(&mut self) { self.0.busy.store(false, SeqCst); } }
pub const PLATFORM: &str = if cfg!(windows) { "win32" } else if cfg!(target_os = "macos") { "darwin" } else { "linux" };

impl AppState {
    pub fn new(data_dir: PathBuf, version: String) -> Self {
        let known = fs::read_to_string(data_dir.join("state.json")).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| serde_json::from_value(v["known"].clone()).ok()).unwrap_or_default(); // first launch: none
        Self { inner: Mutex::new(Inner { known, ..Default::default() }), busy: false.into(), health_cleaning: false.into(), downloading: false.into(), file_scan: Mutex::new(None), data_dir, version }
    }
    pub fn lock(self: &Arc<Self>) -> R<Busy> { if self.busy.swap(true, SeqCst) { Err(t().busy.into()) } else { Ok(Busy(self.clone())) } }
    pub fn backup_dir(&self) -> PathBuf { self.data_dir.join("registry-backups") }
    pub fn app(&self, id: &str) -> R<AppRecord> { self.inner.lock().unwrap().known.iter().find(|a| a.id == id).cloned().ok_or_else(|| t().app_not_found.into()) }
    pub fn others(&self, id: &str) -> Vec<AppRecord> { self.inner.lock().unwrap().known.iter().filter(|o| !o.removed && o.id != id).cloned().collect() }
    // Failed items stay in the plan so the elevated retry works only on them.
    pub fn keep_failed(&self, id: &str, items: &[Item], results: &[CleanResult]) {
        let left: Vec<Item> = items.iter().filter(|i| results.iter().any(|r| !r.ok && r.path == i.path)).cloned().collect();
        let mut inner = self.inner.lock().unwrap();
        if left.is_empty() { inner.plans.remove(id); } else { inner.plans.insert(id.into(), left); }
    }
    // Rebuilds the catalog from the system; apps that vanished stay listed as removed.
    pub async fn refresh(self: &Arc<Self>) -> R<Value> {
        let current = tauri::async_runtime::spawn_blocking(platform::list_apps).await.ctx()??;
        let mut inner = self.inner.lock().unwrap();
        let ids: HashSet<&str> = current.iter().map(|a| a.id.as_str()).collect();
        let removed: Vec<AppRecord> = inner.known.iter().filter(|a| !ids.contains(a.id.as_str())).map(|a| AppRecord { removed: true, ..a.clone() }).collect();
        inner.known = current.into_iter().chain(removed).collect();
        inner.icons = None; inner.sizes = None;
        let file = self.data_dir.join("state.json");
        let _ = fs::create_dir_all(&self.data_dir);
        fs::write(file.with_extension("json.tmp"), json!({ "known": inner.known }).to_string()).and_then(|_| fs::rename(file.with_extension("json.tmp"), &file)).ctx()?;
        Ok(json!({ "apps": inner.known.iter().map(AppRecord::public).collect::<Vec<_>>(), "platform": PLATFORM, "version": self.version }))
    }
}
