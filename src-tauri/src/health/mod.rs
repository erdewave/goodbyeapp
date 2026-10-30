// Health Check: rule-driven scan of caches, logs and history files (all platforms) and stale registry entries (Windows).
macro_rules! fl { ($($x:expr),* $(,)?) => { vec![$(String::from($x)),*] }; }
mod rules;
mod rules_unix;
#[cfg(windows)] mod registry;
use crate::{i18n::t, types::*, util::*};
use regex::Regex;
use rules::Rule;
use serde::Serialize;
use std::{collections::HashSet, fs, path::{Path, PathBuf}, sync::{atomic::{AtomicUsize, Ordering::Relaxed}, Mutex}, time::{Duration, Instant, SystemTime}};

const HOUR: u64 = 3600;
// WebCache holds a live ESE database's transaction logs.
fn skip_always() -> Regex { Regex::new(r"(?i)\\WebCache\\|\\pfro\.log$").unwrap() }
fn age(flags: &str) -> Duration { Duration::from_secs(if flags.contains('a') { HOUR } else if flags.contains('d') { 24 * HOUR } else if flags.contains('o') { 14 * 24 * HOUR } else { 0 }) }
pub fn glob(g: &str) -> Regex {
    let parts: Vec<String> = g.split([';', ',']).map(|p| p.chars().map(|c| if ".+^${}()|[]\\".contains(c) { format!("\\{c}") } else { c.to_string() }).collect::<String>().replace('*', ".*").replace('?', ".")).collect();
    Regex::new(&format!("(?i)^(?:{})$", parts.join("|"))).unwrap()
}
fn expand_pattern(pattern: &str) -> Vec<PathBuf> {
    let home = s(&home());
    let with_home = if let Some(rest) = pattern.strip_prefix('~') { format!("{home}{rest}") } else { pattern.to_string() };
    let mut missing = false;
    let full = Regex::new(r"%([^%]+)%").unwrap().replace_all(&with_home, |c: &regex::Captures| std::env::var(&c[1]).unwrap_or_else(|_| { missing = true; String::new() })).into_owned();
    if missing { return vec![]; }
    let mut parts = full.split(['\\', '/']);
    let mut dirs = vec![PathBuf::from(format!("{}{}", parts.next().unwrap_or(""), std::path::MAIN_SEPARATOR))];
    for seg in parts.filter(|p| !p.is_empty()) {
        dirs = if seg.contains(['*', ',']) {
            let re = glob(seg);
            dirs.iter().flat_map(|d| fs::read_dir(d).into_iter().flatten().flatten().filter(|e| re.is_match(&e.file_name().to_string_lossy())).map(|e| e.path()).collect::<Vec<_>>()).collect()
        } else { dirs.iter().map(|d| d.join(seg)).collect() };
    }
    dirs
}
// Junctions and symlinks are neither files nor directories here, so they are never followed or deleted.
fn walk(dir: &Path, rule: &Rule, mask: &Regex, always: &Regex, item: &mut HealthItem, seen: &Mutex<HashSet<String>>) {
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let Ok(kind) = e.file_type() else { continue };
        let full = s(&e.path());
        if kind.is_dir() { if rule.flags.contains('r') { item.dirs.push(full); walk(&e.path(), rule, mask, always, item, seen); } continue; }
        if !kind.is_file() || !mask.is_match(&e.file_name().to_string_lossy()) || always.is_match(&full) || rule.skip.as_ref().is_some_and(|r| r.is_match(&full)) || !seen.lock().unwrap().insert(full.to_lowercase()) { continue; }
        let Ok(meta) = e.metadata() else { continue };
        if meta.modified().ok().and_then(|m| SystemTime::now().duration_since(m).ok()).is_none_or(|a| a >= age(rule.flags)) { item.size += meta.len(); item.files.push(full); }
    }
}
fn file_items() -> Vec<HealthItem> {
    let mut rules: Vec<Rule> = Vec::new();
    if cfg!(target_os = "macos") { rules.extend(rules_unix::macos()); }
    if cfg!(target_os = "linux") { rules.extend(rules_unix::linux()); }
    rules.extend(rules::windows());
    let (seen, next, out, always) = (Mutex::new(HashSet::new()), AtomicUsize::new(0), Mutex::new(Vec::new()), skip_always());
    std::thread::scope(|sc| for _ in 0..8 { sc.spawn(|| loop {
        let i = next.fetch_add(1, Relaxed);
        let Some(rule) = rules.get(i) else { break };
        let mask = glob(rule.masks);
        for folder in &rule.folders { for dir in expand_pattern(folder) {
            let path = if rule.masks == "*" { s(&dir) } else { s(&dir.join(rule.masks)) };
            let mut item = HealthItem { id: id(&format!("{}{}{}{}", rule.group, rule.category, s(&dir), rule.masks)), group: rule.group.into(), category: rule.category.into(), on: rule.on, kind: "files".into(), path, ..Default::default() };
            walk(&dir, rule, &mask, &always, &mut item, &seen);
            if !item.files.is_empty() { item.count = Some(item.files.len()); out.lock().unwrap().push((i, item)); }
        } }
    }); });
    let mut items = out.into_inner().unwrap();
    items.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.path.cmp(&b.1.path)));
    items.into_iter().map(|i| i.1).collect()
}
pub fn scan_health() -> Vec<HealthItem> {
    #[cfg_attr(not(windows), allow(unused_mut))]
    let mut items = file_items();
    #[cfg(windows)] {
        let (count, bytes) = registry::recycle();
        items.extend(registry::rule_items());
        if count > 0 { items.push(HealthItem { id: "recycle".into(), group: "system".into(), category: "recycle".into(), on: true, kind: "recycle".into(), path: t().recycle_bin.into(), label: Some((t().recycle_items)(count)), size: bytes, ..Default::default() }); }
        items.extend(registry::stale_items());
    }
    items
}
// Progress for one item: `done` of `total` files; `ok` is set once the item has finished.
#[derive(Serialize, Clone)]
pub struct Progress { pub id: String, pub done: usize, pub total: usize, #[serde(skip_serializing_if = "Option::is_none")] pub ok: Option<bool> }
fn io_message(e: &std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(32 | 33)) { t().in_use.into() } else { e.to_string() }
}
// Only the files this scan matched. Locked ones are normal and skipped; the item fails only when none could go.
// Emptied subfolders are removed deepest first (remove_dir refuses non-empty ones); the rule's own folder stays.
fn clean_one(item: &HealthItem, backup_dir: &Path, progress: &dyn Fn(Progress)) -> R<Option<String>> {
    match item.kind.as_str() {
        "files" => {
            let (mut failed, mut done, mut error, mut sent) = (0, 0, String::new(), Instant::now() - Duration::from_secs(1));
            for file in &item.files {
                if let Err(e) = fs::remove_file(file) { if e.kind() != std::io::ErrorKind::NotFound { failed += 1; error = io_message(&e); } }
                done += 1;
                if sent.elapsed() > Duration::from_millis(100) { sent = Instant::now(); progress(Progress { id: item.id.clone(), done, total: item.files.len(), ok: None }); }
            }
            let mut dirs = item.dirs.clone();
            dirs.sort_by_key(|d| std::cmp::Reverse(d.len()));
            for dir in dirs { let _ = fs::remove_dir(dir); }
            if failed > 0 && failed == item.files.len() { Err(error) } else { Ok(None) }
        }
        #[cfg(windows)] "recycle" => ps("Clear-RecycleBin -Force -ErrorAction SilentlyContinue").map(|_| None),
        #[cfg(windows)] _ => crate::platform::reg_backup_delete(item.key.as_deref().unwrap_or(""), if item.kind == "value" { item.name.as_deref() } else { None }, &item.id, backup_dir).map(Some),
        #[cfg(not(windows))] _ => { let _ = backup_dir; Err(t().invalid_selection.into()) }
    }
}
pub fn clean_health(items: &[HealthItem], backup_dir: &Path, progress: &dyn Fn(Progress)) -> Vec<CleanResult> {
    items.iter().map(|item| {
        let total = item.files.len().max(1);
        let result = clean_one(item, backup_dir, progress);
        progress(Progress { id: item.id.clone(), done: total, total, ok: Some(result.is_ok()) });
        match result { Ok(backup) => CleanResult::ok(&item.path, backup), Err(e) => CleanResult::fail(&item.path, e) }
    }).collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn glob_matches_masks_and_alternatives() {
        assert!(glob("*.tmp;*.old").is_match("A.TMP") && glob("Cache,Code Cache").is_match("code cache"));
        assert!(!glob("*.log").is_match("a.log.bak") && !glob("a.b").is_match("axb"));
    }
    #[test]
    fn every_rule_compiles_and_patterns_expand() {
        assert!(rules::windows().len() > 100 && !rules_unix::macos().is_empty() && !rules_unix::linux().is_empty());
        assert_eq!(expand_pattern("%GOODBYEAPP_UNSET%\\x"), Vec::<PathBuf>::new());
        assert!(expand_pattern(r"%SystemRoot%\Temp").iter().all(|p| p.ends_with("Temp")));
    }
    #[test]
    fn cleans_only_matched_files_and_empties_subfolders() {
        let dir = std::env::temp_dir().join(format!("goodbyeapp-health-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("a.tmp"), "x").unwrap(); fs::write(dir.join("sub").join("b.tmp"), "x").unwrap(); fs::write(dir.join("keep.txt"), "x").unwrap();
        let item = HealthItem { id: "t".into(), kind: "files".into(), files: vec![s(&dir.join("a.tmp")), s(&dir.join("sub").join("b.tmp"))], dirs: vec![s(&dir.join("sub"))], ..Default::default() };
        let results = clean_health(&[item], Path::new(""), &|_| {});
        assert!(results[0].ok && !dir.join("sub").exists() && dir.join("keep.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }
    #[test]
    fn scans_this_machine() { let items = scan_health(); assert!(items.iter().all(|i| i.count.is_none_or(|c| c > 0))); }
}
