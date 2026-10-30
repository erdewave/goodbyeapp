// Folder sizes for apps whose installer recorded no EstimatedSize; kept for the whole session.
use crate::{icons::parse_icon_location, platform::install_dir_ok, types::*, util::*};
use regex::Regex;
use std::{collections::HashMap, fs, path::{Path, PathBuf}, sync::{Mutex, OnceLock}};

static CACHE: OnceLock<Mutex<HashMap<PathBuf, u64>>> = OnceLock::new();
// Executables in bin\ or Squirrel's app-1.2.3\ sit one level below the real install folder.
fn lift(dir: &Path) -> PathBuf {
    let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if Regex::new(r"(?i)^(bin|bin64|x64|x86|app-[\d.]+)$").unwrap().is_match(&name) { dir.parent().unwrap_or(dir).to_path_buf() } else { dir.to_path_buf() }
}
fn words(text: &str) -> Vec<String> { text.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|w| w.chars().count() >= 3).map(String::from).collect() }
// Icon and uninstaller folders can belong to a launcher or package manager (Steam, Zero Install); trust them only
// when their last segments name the app or its publisher. Short words must match whole ("team" is not "steam").
fn related(dir: &Path, app: &AppRecord) -> bool {
    let parts: Vec<String> = dir.to_string_lossy().split(['\\', '/']).map(String::from).collect();
    let tail = words(&parts[parts.len().saturating_sub(3)..].join(" "));
    words(&format!("{} {}", app.name, app.vendor.as_deref().unwrap_or(""))).iter().any(|w| tail.iter().any(|t| t == w || (w.chars().count() >= 5 && t.contains(w.as_str()))))
}
// Registered install folder, then the icon's folder, then the uninstaller's folder; each must pass the same
// checks as cleanup candidates, so shared folders (Program Files root, another app's folder) are skipped,
// and installer caches named by a {GUID} never stand in for the installed app.
pub fn app_folder(app: &AppRecord, others: &[AppRecord]) -> Option<PathBuf> {
    if let Some(l) = app.location.as_deref().filter(|l| !l.is_empty()) { return Some(l.into()); }
    let guessed = [parse_icon_location(&app.icon_source).map(|i| i.0), app.command.as_deref().and_then(split_command).map(|c| c.0).filter(|e| e.get(1..3) == Some(r":\"))].into_iter().flatten()
        .filter_map(|file| Path::new(&file).parent().map(lift)).filter(|dir| related(dir, app));
    let guid = Regex::new(r"(?i)\{[0-9a-f-]{36}\}").unwrap();
    app.install_dir.iter().filter(|d| !d.is_empty()).map(PathBuf::from).chain(guessed).map(|d| resolve(&d)).find(|d| !guid.is_match(&s(d)) && install_dir_ok(d, others))
}
// ponytail: sequential walk capped at 300k entries; trees beyond that come out low.
pub fn folder_size(root: &Path) -> u64 {
    let (mut total, mut count, mut stack) = (0u64, 0u32, vec![root.to_path_buf()]);
    while count < 300_000 {
        let Some(dir) = stack.pop() else { break };
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            count += 1;
            let Ok(kind) = entry.file_type() else { continue }; // junctions and symlinks would count other folders
            if kind.is_dir() { stack.push(entry.path()); } else if kind.is_file() { total += entry.metadata().map_or(0, |m| m.len()); }
        }
    }
    total
}
pub fn load_sizes(apps: &[AppRecord]) -> HashMap<String, u64> {
    let live: Vec<&AppRecord> = apps.iter().filter(|a| !a.removed).collect();
    let dirs: Vec<(&AppRecord, Option<PathBuf>)> = live.iter().filter(|a| a.size == 0).map(|a| { let others: Vec<AppRecord> = live.iter().filter(|o| o.id != a.id).map(|o| (*o).clone()).collect(); (*a, app_folder(a, &others)) }).collect();
    let mut uses: HashMap<&PathBuf, u32> = HashMap::new();
    for d in dirs.iter().filter_map(|d| d.1.as_ref()) { *uses.entry(d).or_default() += 1; }
    let (mut result, cache) = (HashMap::new(), CACHE.get_or_init(Default::default));
    for (app, dir) in &dirs {
        let Some(dir) = dir else { continue };
        if uses[dir] > 1 { continue; } // one folder for several apps is shared (e.g. NVIDIA InstallerCore)
        let cached = cache.lock().unwrap().get(dir).copied();
        let size = cached.unwrap_or_else(|| folder_size(dir));
        cache.lock().unwrap().insert(dir.clone(), size);
        if size > 0 { result.insert(app.id.clone(), size); }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn short_words_must_match_whole() {
        let app = AppRecord { name: "Team Viewer".into(), vendor: Some("TeamViewer GmbH".into()), ..Default::default() };
        assert!(related(Path::new(r"C:\Program Files\TeamViewer"), &app));
        assert!(!related(Path::new(r"C:\Program Files\Steam"), &AppRecord { name: "Team".into(), ..Default::default() }));
    }
    #[test]
    fn sums_nested_files() {
        let dir = std::env::temp_dir().join(format!("goodbyeapp-size-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("a/b")).unwrap();
        fs::write(dir.join("x"), [0u8; 5]).unwrap(); fs::write(dir.join("a/b/y"), [0u8; 7]).unwrap();
        assert_eq!(folder_size(&dir), 12);
        let _ = fs::remove_dir_all(&dir);
    }
}
