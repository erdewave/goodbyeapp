// macOS: apps are the .app bundles in /Applications and ~/Applications.
use crate::{i18n::t, types::*, util::*};
use std::{fs, path::{Path, PathBuf}};

// `name` is the bundle id or one of its sub-ids (com.x.app.helper.plist, com.x.app.binarycookies), case-insensitively.
fn owns(name: &str, bundle: &str) -> bool { let (n, b) = (name.to_lowercase(), bundle.to_lowercase()); n == b || n.strip_prefix(&b).is_some_and(|r| r.starts_with('.')) }
// Group containers are named <TEAMID>.group.<id> after no fixed rule; they count when they carry the bundle's vendor
// segment and end in its last one (8M34BTQQ45.group.com.piriform.osx.ccleaner for com.piriform.ccleaner).
fn group_owns(name: &str, bundle: &str) -> bool {
    let (n, b) = (name.to_lowercase(), bundle.to_lowercase());
    let segs: Vec<&str> = b.split('.').collect();
    segs.len() >= 3 && n.ends_with(&format!(".{}", segs[segs.len() - 1])) && n.split('.').any(|s| s == segs[1])
}
// Entries of the scan roots that belong to the app's bundle id, minus those a more specific installed app owns
// (com.google.Chrome.canary stays when Chrome is removed and Canary is installed).
pub fn owned_entries(app: &AppRecord, others: &[AppRecord], roots: &[PathBuf]) -> Vec<(PathBuf, PathBuf)> {
    let Some(bundle) = app.bundle.as_deref().filter(|b| safe_name(b) && b.contains('.')) else { return vec![] };
    let theirs: Vec<&str> = others.iter().filter_map(|o| o.bundle.as_deref()).filter(|o| !o.eq_ignore_ascii_case(bundle)).collect();
    let mine = |root: &Path, n: &str| if root.ends_with("Group Containers") { group_owns(n, bundle) && !theirs.iter().any(|o| group_owns(n, o)) } else { owns(n, bundle) && !theirs.iter().any(|o| o.len() > bundle.len() && owns(n, o)) };
    let mut out = Vec::new();
    for root in roots { for e in fs::read_dir(root).into_iter().flatten().flatten() { if mine(root, &e.file_name().to_string_lossy()) { out.push((root.clone(), e.path())); } } }
    // A pkg install leaves its receipt (bom + plist); the package is the app's when it shares the vendor and lays down <Name>.app.
    // Apple's own packages (system, Command Line Tools) are never an app's leftovers and their file lists are huge.
    let vendor = bundle.split('.').nth(1).unwrap_or_default().to_lowercase();
    let dir = format!("{}.app", app.name);
    for pkg in run("/usr/sbin/pkgutil", &["--pkgs"]).unwrap_or_default().lines().filter(|p| vendor != "apple" && p.to_lowercase().split('.').any(|s| s == vendor)) {
        if run("/usr/sbin/pkgutil", &["--files", pkg]).unwrap_or_default().lines().any(|l| l == dir || l == format!("Applications/{dir}")) {
            for ext in ["bom", "plist"] { out.push((PathBuf::from("/private/var/db/receipts"), PathBuf::from(format!("/private/var/db/receipts/{pkg}.{ext}")))); }
        }
    }
    out
}
// Last-used dates from Spotlight, one mdls call for every bundle; "(null)" when the app never ran.
pub fn last_used(apps: &mut [AppRecord]) {
    let paths: Vec<&str> = apps.iter().filter_map(|a| a.location.as_deref()).collect();
    let mut args = vec!["-raw", "-name", "kMDItemLastUsedDate"]; args.extend(&paths);
    let out = run("/usr/bin/mdls", &args).unwrap_or_default();
    let dates: Vec<&str> = out.split('\0').collect();
    if dates.len() != apps.len() { return; }
    for (app, d) in apps.iter_mut().zip(dates) { app.last_used = d.get(..10).filter(|d| d.starts_with("20")).map(String::from); }
}
// Full Disk Access: the system TCC database is readable only with it, and Safari, Mail and cookie folders need it too.
pub fn full_disk_access() -> bool { fs::File::open("/Library/Application Support/com.apple.TCC/TCC.db").is_ok() }
// Browsers keep their files open while running and macOS does not lock them, so cleaning under one would race it.
pub fn browser_running(group: &str) -> bool {
    let name = match group { "Google Chrome" => "Google Chrome", "Edge Chromium" => "Microsoft Edge", "Brave" => "Brave Browser", "Firefox" => "firefox", "Safari" => "Safari", "Opera" | "Vivaldi" | "Chromium" => group, _ => return false };
    run("/usr/bin/pgrep", &["-x", name]).is_ok()
}

pub fn list_apps() -> R<Vec<AppRecord>> {
    let mut apps = Vec::new();
    for root in [Path::new("/Applications").to_path_buf(), home().join("Applications")] {
        let entries = match fs::read_dir(&root) { Ok(e) => e, Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue, Err(e) => return Err(e.to_string()) };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if !entry.path().is_dir() || !file.ends_with(".app") || file.eq_ignore_ascii_case("GoodbyeAPP.app") { continue; }
            let location = s(&entry.path());
            let plist = s(&entry.path().join("Contents/Info.plist"));
            let read = |key: &str| run("/usr/libexec/PlistBuddy", &["-c", &format!("Print :{key}"), &plist]).unwrap_or_default();
            apps.push(AppRecord { id: id(&location), name: file[..file.len() - 4].into(), version: read("CFBundleShortVersionString"), bundle: Some(read("CFBundleIdentifier")).filter(|b| !b.is_empty()), source: "macOS".into(), location: Some(location), ..Default::default() });
        }
    }
    last_used(&mut apps);
    Ok(apps)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lists_installed_apps_with_ids_and_bundles() {
        let apps = list_apps().unwrap();
        assert!(!apps.is_empty() && apps.iter().all(|a| a.source == "macOS" && a.location.as_deref().is_some_and(|l| l.ends_with(".app"))));
        assert!(apps.iter().any(|a| a.bundle.is_some() && !a.version.is_empty()), "no app with a bundle id and version");
    }
    #[test]
    fn bundle_matching_leaves_other_apps_entries() {
        assert!(owns("com.piriform.ccleaner.update.plist", "com.piriform.ccleaner") && owns("com.piriform.CCleaner", "com.piriform.ccleaner") && !owns("com.piriform.ccleanerx", "com.piriform.ccleaner"));
        assert!(group_owns("8M34BTQQ45.group.com.piriform.osx.ccleaner", "com.piriform.ccleaner") && !group_owns("UBF8T346G9.Office", "com.microsoft.Word"));
        let root = std::env::temp_dir().join(format!("goodbyeapp-owned-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        for n in ["com.x.app.plist", "com.x.app.canary.plist", "com.x.other"] { fs::write(root.join(n), "").unwrap(); }
        let rec = |b: &str| AppRecord { name: "App".into(), bundle: Some(b.into()), ..Default::default() };
        let found: Vec<String> = owned_entries(&rec("com.x.app"), &[rec("com.x.app.canary")], &[root.clone()]).iter().map(|e| e.1.file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(found, ["com.x.app.plist"]);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn icons_are_png_data_urls() {
        let icons = crate::icons::load_icons(&list_apps().unwrap());
        eprintln!("{} icons", icons.len());
        assert!(icons.values().all(|u| u.starts_with("data:image/png;base64,")));
    }
    #[test]
    fn uninstalls_generated_bundle_to_trash() {
        let name = format!("GoodbyeAPP-Smoke-{}.app", std::process::id());
        let bundle = std::env::temp_dir().join(&name);
        let trash = home().join(".Trash").join(&name);
        assert!(!bundle.exists() && !trash.exists(), "fixture already exists");
        fs::create_dir(&bundle).unwrap();
        fs::create_dir(bundle.join("Contents")).unwrap();
        fs::write(bundle.join("Contents/Info.plist"), r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>app.goodbyeapp.smoke</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>"#).unwrap();
        fs::write(bundle.join("smoke-marker"), "goodbyeapp-native-test").unwrap();
        uninstall(&AppRecord { location: Some(s(&bundle)), ..Default::default() }).unwrap();
        assert!(!bundle.exists(), "bundle remains after uninstall");
        assert_eq!(fs::read_to_string(trash.join("smoke-marker")).unwrap(), "goodbyeapp-native-test");
        // Only the uniquely named fixture whose marker was verified above is removed.
        fs::remove_dir_all(trash).unwrap();
    }
}
// NSFileManager trashes user-owned bundles without asking (and without the Finder automation prompt); root-owned ones
// (App Store, pkg installs) fall back to Finder, which asks for the admin password.
const TRASH: &str = "function run(argv) { ObjC.import('Foundation'); if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError($.NSURL.fileURLWithPath(argv[0]), null, null)) throw new Error('trash failed') }";
// Before the bundle goes: the app's launchd jobs in this login session are stopped (a KeepAlive agent would start
// it again), then the app is asked to quit. Both are best effort; a running app still moves to the Trash.
fn stop(app: &AppRecord) {
    let Some(bundle) = app.bundle.as_deref().filter(|b| b.contains('.')) else { return };
    for label in run("/bin/launchctl", &["list"]).unwrap_or_default().lines().filter_map(|l| l.split('\t').nth(2)).filter(|l| owns(l, bundle)) {
        let _ = run("/bin/sh", &["-c", r#"launchctl bootout "gui/$(id -u)/$1""#, "sh", label]);
    }
    let _ = run("/usr/bin/osascript", &["-e", "on run argv", "-e", "if application id (item 1 of argv) is running then", "-e", "with timeout of 10 seconds", "-e", "tell application id (item 1 of argv) to quit", "-e", "end timeout", "-e", "end if", "-e", "end run", bundle]);
}
pub fn uninstall(app: &AppRecord) -> R<()> {
    let location = app.location.clone().unwrap_or_default();
    stop(app);
    run("osascript", &["-l", "JavaScript", "-e", TRASH, &location])
        .or_else(|_| run("osascript", &["-e", "on run argv", "-e", "tell application \"Finder\" to delete (POSIX file (item 1 of argv) as alias)", "-e", "end run", &location]))
        .map(|_| ())?;
    unpin(&location);
    Ok(())
}
// A trashed app stays in the Dock as a question mark; its tile is dropped through the Dock's own defaults domain.
const UNPIN: &str = "function run(argv) { ObjC.import('Foundation'); const d = $.NSUserDefaults.alloc.initWithSuiteName('com.apple.dock'), apps = d.arrayForKey('persistent-apps'); if (!apps) return 'no';
  const keep = $.NSMutableArray.array; let gone = 0;
  for (let i = 0; i < apps.count; i++) { const url = ObjC.unwrap(apps.objectAtIndex(i).valueForKeyPath('tile-data.file-data._CFURLString')) || ''; if (decodeURIComponent(url).replace(/^file:\\/\\//, '').replace(/\\/$/, '') === argv[0]) gone++; else keep.addObject(apps.objectAtIndex(i)); }
  if (!gone) return 'no'; d.setObjectForKey(keep, 'persistent-apps'); d.synchronize; return 'yes' }";
fn unpin(location: &str) {
    if run("/usr/bin/osascript", &["-l", "JavaScript", "-e", UNPIN, location]).is_ok_and(|o| o == "yes") { let _ = run("/usr/bin/killall", &["Dock"]); }
}
// One administrator prompt for the plan items that failed. Paths travel as separate arguments (AppleScript's quoted
// form), never inside the script text. launchd jobs are booted out of the system and the user's GUI domain first, by
// label (the file name), since a plist linked into the trashed bundle no longer reads. rm never follows a link, and a
// path whose folder resolves elsewhere (a parent swapped for a link after validation) is skipped.
const SUDO_SH: &str = r#"uid=$1; shift; for p; do d=$(dirname "$p"); [ "$(cd "$d" && pwd -P)" = "$d" ] || continue; case "$p" in */LaunchAgents/*.plist|*/LaunchDaemons/*.plist) l=$(basename "$p" .plist); launchctl bootout "system/$l"; launchctl bootout "gui/$uid/$l";; esac; rm -rf "$p"; done 2>/dev/null; exit 0"#;
pub async fn clean_elevated(items: &[Item], app: &AppRecord, _: &[AppRecord], _: &Path) -> R<Vec<CleanResult>> {
    let (mut results, mut jobs) = (Vec::new(), Vec::new());
    let roots = super::scan_roots(app);
    for item in items {
        let root = item.root.clone().unwrap_or_default();
        match if roots.iter().any(|r| s(r) == root) { super::validate_path(Path::new(&root), Path::new(&item.path)).map(|_| ()) } else { Err(t().outside_root.into()) } {
            Ok(()) => jobs.push(item.path.clone()),
            Err(e) => results.push(CleanResult::fail(&item.path, e)),
        }
    }
    if jobs.is_empty() { return Ok(results); }
    let uid = run("/usr/bin/id", &["-u"])?;
    // Item 1 is the dialog text (without it macOS names osascript as the asker), item 2 the script, then its arguments.
    let script = ["on run argv", r#"set cmd to "/bin/sh -c " & quoted form of (item 2 of argv) & " sh""#, "repeat with i from 3 to count of argv", r#"set cmd to cmd & " " & quoted form of (item i of argv)"#, "end repeat", "do shell script cmd with prompt (item 1 of argv) with administrator privileges", "end run"];
    let args: Vec<String> = script.iter().flat_map(|l| ["-e", l]).chain([t().admin_prompt, SUDO_SH, uid.as_str()]).map(String::from).chain(jobs.iter().cloned()).collect();
    let error = tauri::async_runtime::spawn_blocking(move || run("/usr/bin/osascript", &args.iter().map(String::as_str).collect::<Vec<_>>())).await.ctx()?
        .map(|_| t().elevated_failed.to_string()).unwrap_or_else(|e| if e.contains("-128") { t().elevation_denied.into() } else { e });
    for path in jobs {
        let gone = fs::symlink_metadata(&path).is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound);
        results.push(if gone { CleanResult::ok(&path, None) } else { CleanResult::fail(&path, error.clone()) });
    }
    Ok(results)
}
