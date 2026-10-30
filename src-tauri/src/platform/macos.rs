// macOS: apps are the .app bundles in /Applications and ~/Applications.
use crate::{types::*, util::*};
use std::{fs, path::Path};

pub fn list_apps() -> R<Vec<AppRecord>> {
    let mut apps = Vec::new();
    for root in [Path::new("/Applications").to_path_buf(), home().join("Applications")] {
        let entries = match fs::read_dir(&root) { Ok(e) => e, Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue, Err(e) => return Err(e.to_string()) };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if !entry.path().is_dir() || !file.ends_with(".app") || file == "GoodbyeAPP.app" { continue; }
            let location = s(&entry.path());
            let plist = s(&entry.path().join("Contents/Info.plist"));
            let read = |key: &str| run("/usr/libexec/PlistBuddy", &["-c", &format!("Print :{key}"), &plist]).unwrap_or_default();
            apps.push(AppRecord { id: id(&location), name: file[..file.len() - 4].into(), version: read("CFBundleShortVersionString"), bundle: Some(read("CFBundleIdentifier")).filter(|b| !b.is_empty()), source: "macOS".into(), location: Some(location), ..Default::default() });
        }
    }
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
    fn icons_are_png_data_urls() {
        let icons = crate::icons::load_icons(&list_apps().unwrap());
        eprintln!("{} icons", icons.len());
        assert!(icons.values().all(|u| u.starts_with("data:image/png;base64,")));
    }
}
// NSFileManager trashes user-owned bundles without asking (and without the Finder automation prompt); root-owned ones
// (App Store, pkg installs) fall back to Finder, which asks for the admin password.
const TRASH: &str = "function run(argv) { ObjC.import('Foundation'); if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError($.NSURL.fileURLWithPath(argv[0]), null, null)) throw new Error('trash failed') }";
pub fn uninstall(app: &AppRecord) -> R<()> {
    let location = app.location.clone().unwrap_or_default();
    run("osascript", &["-l", "JavaScript", "-e", TRASH, &location])
        .or_else(|_| run("osascript", &["-e", "on run argv", "-e", "tell application \"Finder\" to delete (POSIX file (item 1 of argv) as alias)", "-e", "end run", &location]))
        .map(|_| ())
}
