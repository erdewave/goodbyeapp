// Installed-app discovery, leftover scan and cleanup. OS-specific parts live in windows.rs / macos.rs / linux.rs.
use crate::{i18n::t, types::*, util::*};
use regex::Regex;
use std::{fs, path::{Path, PathBuf}, sync::OnceLock};

#[cfg(windows)] mod windows;
#[cfg(windows)] mod elevate;
#[cfg(windows)] pub use {windows::*, elevate::{clean_elevated, restore_point}};
#[cfg(target_os = "macos")] mod macos;
#[cfg(target_os = "macos")] pub use macos::*;
#[cfg(target_os = "linux")] mod linux;
#[cfg(target_os = "linux")] pub use linux::*;
#[cfg(not(windows))]
pub async fn clean_elevated(_: &[Item], _: &AppRecord, _: &[AppRecord], _: &Path) -> R<Vec<CleanResult>> { Err(t().windows_only.into()) }
#[cfg(not(windows))]
pub fn restore_point(_: &str) -> R<&'static str> { Err(t().windows_only.into()) }

// Only <hive>\Software\<Name> or <hive>\Software\<Publisher>\<Name>. HKLM keys need admin rights to delete.
pub fn registry_key_ok(key: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)^(?:HKCU\\Software|HKLM\\SOFTWARE(?:\\WOW6432Node)?)((?:\\[^\\]+){1,2})$").unwrap());
    re.captures(key).is_some_and(|m| m[1][1..].split('\\').all(safe_name))
}
fn roots() -> Vec<PathBuf> {
    let home = home();
    if cfg!(windows) {
        let menu = r"Microsoft\Windows\Start Menu\Programs";
        return [env("APPDATA"), env("LOCALAPPDATA"), env("PROGRAMDATA"), env("TEMP"), env("ProgramFiles"), env("ProgramFiles(x86)"), env("APPDATA").map(|p| p.join(menu)), env("PROGRAMDATA").map(|p| p.join(menu)), Some(home.join("Desktop")), env("PUBLIC").map(|p| p.join("Desktop"))].into_iter().flatten().collect();
    }
    if cfg!(target_os = "macos") { return ["Application Support", "Caches", "Preferences", "Logs", "Saved Application State"].iter().map(|p| home.join("Library").join(p)).collect(); }
    vec![env("XDG_CONFIG_HOME").unwrap_or(home.join(".config")), env("XDG_CACHE_HOME").unwrap_or(home.join(".cache")), env("XDG_DATA_HOME").unwrap_or(home.join(".local/share")), home.join(".var/app")]
}
pub fn validate_path(root: &Path, target: &Path) -> R<fs::Metadata> {
    if !contained(root, target) || !target.parent().is_some_and(|p| same(p, root)) { return Err(t().outside_root.into()); }
    let meta = fs::symlink_metadata(target).ctx()?;
    if meta.file_type().is_symlink() { return Err(t().symlink.into()); }
    if !contained(&fs::canonicalize(root).ctx()?, &fs::canonicalize(target).ctx()?) { return Err(t().redirected.into()); }
    Ok(meta)
}
fn size_of(target: &Path, budget: &mut u32) -> u64 {
    *budget += 1;
    if *budget > 10000 { return 0; }
    let Ok(meta) = fs::symlink_metadata(target) else { return 0 };
    if meta.file_type().is_symlink() { return 0; }
    if !meta.is_dir() { return meta.len(); }
    let mut size = 0;
    for child in fs::read_dir(target).into_iter().flatten().flatten() { if *budget > 10000 { break; } size += size_of(&child.path(), budget); }
    size
}
// The registered install folder is a candidate only inside known install bases and when no installed app shares it.
pub fn install_dir_ok(dir: &Path, others: &[AppRecord]) -> bool {
    let overlaps = |a: &Path, b: &Path| same(a, b) || contained(a, b) || contained(b, a);
    dir.file_name().is_some_and(|n| safe_name(&n.to_string_lossy()))
        && ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA", "APPDATA"].iter().filter_map(|k| env(k)).any(|base| contained(&base, dir))
        && !others.iter().filter_map(|o| o.install_dir.as_deref()).filter(|d| !d.is_empty()).any(|d| overlaps(&resolve(Path::new(d)), dir))
}
pub fn scan_roots(app: &AppRecord) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let all = roots();
    let vendor = app.vendor.clone().filter(|_| cfg!(windows) && safe_opt(&app.vendor));
    for root in all.iter().cloned().chain(vendor.iter().flat_map(|v| all.iter().map(move |r| r.join(v)))) { if !dirs.contains(&root) { dirs.push(root); } }
    dirs
}
pub fn scan(app: &AppRecord, others: &[AppRecord]) -> Vec<Item> {
    let mut names: Vec<String> = [Some(app.name.clone()), app.bundle.clone()].into_iter().flatten().filter(|n| safe_name(n)).collect();
    if cfg!(target_os = "macos") && safe_opt(&app.bundle) { let b = app.bundle.clone().unwrap(); names.extend([format!("{b}.plist"), format!("{b}.savedState")]); }
    if cfg!(windows) && safe_name(&app.name) { names.push(format!("{}.lnk", app.name)); }
    let mut found: Vec<Item> = Vec::new();
    let mut add_file = |root: &Path, target: PathBuf| {
        let path = s(&target);
        if found.iter().any(|i| i.path.eq_ignore_ascii_case(&path)) || validate_path(root, &target).is_err() { return; }
        found.push(Item { id: id(&path), kind: Kind::File, size: size_of(&target, &mut 0), path, root: Some(s(root)) });
    };
    for root in scan_roots(app) { let mut seen = Vec::new(); for name in &names { if !seen.contains(&name) { seen.push(name); add_file(&root, root.join(name)); } } }
    if let Some(dir) = app.install_dir.as_deref().filter(|d| !d.is_empty()).map(|d| resolve(Path::new(d))) {
        if install_dir_ok(&dir, others) { if let Some(parent) = dir.parent() { add_file(parent, dir.clone()); } }
    }
    #[cfg(windows)]
    for hive in [r"HKCU\Software", r"HKLM\SOFTWARE", r"HKLM\SOFTWARE\WOW6432Node"] {
        for key in [vec![app.name.as_str()], vec![app.vendor.as_deref().unwrap_or(""), app.name.as_str()]] {
            if key[0].is_empty() { continue; }
            let target = format!("{hive}\\{}", key.join("\\"));
            if registry_key_ok(&target) && reg_exists(&target) && !found.iter().any(|i| i.path.eq_ignore_ascii_case(&target)) { found.push(Item { id: id(&target), kind: Kind::Registry, path: target, size: 0, root: None }); }
        }
    }
    found
}
// Permanent delete; remove_dir_all unlinks junctions and symlinks inside the folder instead of following them.
pub fn clean_item(item: &Item, backup_dir: &Path) -> R<Option<String>> {
    if item.kind == Kind::File {
        let (root, path) = (PathBuf::from(item.root.clone().unwrap_or_default()), PathBuf::from(&item.path));
        let meta = validate_path(&root, &path)?;
        if meta.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) }.ctx()?;
        return Ok(None);
    }
    if !registry_key_ok(&item.path) { return Err(t().invalid_registry.into()); }
    #[cfg(windows)] { reg_backup_delete(&item.path, None, &item.id, backup_dir).map(Some) }
    #[cfg(not(windows))] { let _ = backup_dir; Err(t().invalid_registry.into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(name: &str) -> PathBuf { let d = std::env::temp_dir().join(format!("goodbyeapp-{name}-{}", std::process::id())); let _ = fs::remove_dir_all(&d); fs::create_dir_all(&d).unwrap(); d }
    #[test]
    fn registry_candidates_stay_under_software_name() {
        for k in [r"HKCU\Software\Example App", r"HKLM\SOFTWARE\Example App", r"HKLM\SOFTWARE\WOW6432Node\Vendor\Example App"] { assert!(registry_key_ok(k), "{k}"); }
        for k in [r"HKCU\Software", r"HKLM\SOFTWARE\WOW6432Node", r"HKLM\SOFTWARE\Classes\Example", r"HKLM\SOFTWARE\Microsoft\Windows", r"HKLM\SOFTWARE\Policies\Example", r"HKLM\SYSTEM\Example", r"HKLM\SOFTWARE\a\b\Example", r"HKCU\Software\.."] { assert!(!registry_key_ok(k), "{k}"); }
    }
    #[test]
    fn cleanup_deletes_validated_children_without_following_links() {
        let root = tmp("clean"); let outside = tmp("outside");
        let target = root.join("Example App");
        fs::create_dir_all(target.join("sub")).unwrap();
        fs::write(outside.join("keep.txt"), "x").unwrap();
        #[cfg(windows)] { let l = target.join("sub").join("link"); std::process::Command::new("cmd").args(["/c", "mklink", "/J", &s(&l), &s(&outside)]).output().unwrap(); }
        #[cfg(unix)] std::os::unix::fs::symlink(&outside, target.join("sub").join("link")).unwrap();
        assert!(validate_path(&root, &target).is_ok());
        assert!(validate_path(&root, &root).is_err());
        assert!(validate_path(&root, &target.join("nested")).is_err());
        let item = |kind, path: &str| Item { id: "x".into(), kind, path: path.into(), size: 0, root: Some(s(&root)) };
        clean_item(&item(Kind::File, &s(&target)), Path::new("")).unwrap();
        assert!(!target.exists() && outside.join("keep.txt").exists());
        for k in [r"HKCU\Software", r"HKLM\SOFTWARE\Microsoft\Windows", r"HKCU\Software\Microsoft"] { assert!(clean_item(&item(Kind::Registry, k), Path::new("")).is_err()); }
        let _ = fs::remove_dir_all(&root); let _ = fs::remove_dir_all(&outside);
    }
    #[cfg(windows)]
    #[test]
    fn scan_finds_leftovers_named_after_the_app_and_its_publisher() {
        let roaming = tmp("roaming");
        std::env::set_var("APPDATA", &roaming);
        for dir in ["Example App", r"Vendor Co\Example App", "Example App Other"] { fs::create_dir_all(roaming.join(dir)).unwrap(); fs::write(roaming.join(dir).join("x"), "x").unwrap(); }
        let app = AppRecord { name: "Example App".into(), vendor: Some("Vendor Co".into()), ..Default::default() };
        let mut found: Vec<String> = scan(&app, &[]).iter().filter(|i| i.path.starts_with(&s(&roaming))).map(|i| i.path[s(&roaming).len() + 1..].to_string()).collect();
        found.sort();
        assert_eq!(found, ["Example App", r"Vendor Co\Example App"]);
        let _ = fs::remove_dir_all(&roaming);
    }
    #[test]
    fn install_folder_must_sit_inside_an_install_base_and_not_be_shared() {
        let base = resolve(Path::new("PF")); std::env::set_var("ProgramFiles", &base);
        let rec = |d: PathBuf| AppRecord { install_dir: Some(s(&d)), ..Default::default() };
        assert!(install_dir_ok(&base.join("Example App"), &[]));
        assert!(!install_dir_ok(&base, &[]) && !install_dir_ok(&base.join("Common Files"), &[]));
        assert!(!install_dir_ok(&resolve(Path::new("elsewhere")).join("Example App"), &[]));
        assert!(!install_dir_ok(&base.join("Vendor"), &[rec(base.join("Vendor").join("Other"))]));
        assert!(!install_dir_ok(&base.join("Vendor").join("Example App"), &[rec(base.join("Vendor"))]));
    }
}
