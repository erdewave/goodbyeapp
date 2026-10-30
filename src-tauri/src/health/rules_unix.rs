// macOS follows CCleaner for Mac 2.11 (CleaningEngine.framework config.json and SharedKit's browser readers): caches, logs and
// trash from Root, Home and app sandboxes, Downloads with Mail attachments, Xcode data. It cleans no temp folder there.
// Linux has no CCleaner, so its rules are our own. Windows-only rules find no folders on either and their groups stay hidden.
use super::rules::*;

const MA: &str = "~/Library/Application Support";
const MC: &str = "~/Library/Caches";
const XC: &str = "~/.config";
const XK: &str = "~/.cache";
const CONTAINERS: &str = "~/Library/Containers/*/Data/Library";
const MAIL: &str = "~/Library/Containers/com.apple.mail/Data";
// Browser caches belong to their browser groups; fontconfig and Java are CCleaner's own Cache.User exclusions.
const USER_CACHE_SKIP: &str = r"(?i)[\\/](?:Caches|\.cache)[\\/](Google|Firefox|BraveSoftware|Microsoft Edge|Vivaldi|com\.operasoftware\.Opera|com\.apple\.Safari|fontconfig|Java|google-chrome|chromium|mozilla|microsoft-edge|vivaldi|opera|thumbnails|huggingface)[\\/]";

pub fn macos() -> Vec<Rule> {
    let mut v = vec![
        rs("system", "usercache", true, fl![MC], "*", "r", Some(USER_CACHE_SKIP)), r("system", "usercache", true, fl!["/Library/Caches"]), rs("system", "usercache", true, fl![format!("{CONTAINERS}/Caches")], "*", "r", Some(r"(?i)[\\/]Containers[\\/]com\.apple\.Safari[\\/]")),
    ];
    // Cache.Darwin is DARWIN_USER_CACHE_DIR, the C folder next to $TMPDIR (T) under /var/folders.
    if let Some(tmp) = std::env::var_os("TMPDIR") { v.push(rs("system", "usercache", true, fl![std::path::Path::new(&tmp).join("..").join("C").to_string_lossy().into_owned()], "*", "r", Some(r"[\\/](com\.apple\.FontRegistry|com\.apple\.metadata\.mdworker)[\\/]"))); }
    v.extend([
        rs("system", "userlogs", true, fl!["~/Library/Logs"], "*", "r", Some(r"[\\/]Logs[\\/](AvastCleanup|AVGTuneUp|CCleaner)[\\/]")), r("system", "userlogs", true, fl!["/Library/Logs", format!("{CONTAINERS}/Logs")]),
        r("system", "trash", true, fl!["~/.Trash"]), rs("system", "trash", true, fl!["/Volumes/*/.Trashes"], "*", "r", Some(r"[\\/]MobileBackups[\\/]")),
        r("system", "downloads", false, fl!["~/Downloads", "~/MailDownloads", "~/Mail Downloads", "~/Library/MailDownloads", "~/Library/Mail Downloads", format!("{MAIL}/MailDownloads"), format!("{MAIL}/Mail Downloads"), format!("{MAIL}/Library/Mail Downloads")]),
        r("apps", "Xcode - DerivedData", true, fl!["~/Library/Developer/Xcode/DerivedData"]), r("apps", "Xcode - Simulators", false, fl!["~/Library/Developer/Xcode/Simulators"]),
        // Safari history is SQL inside History.db (CCleaner runs DELETE FROM history_visits), so only its caches and cookie jar are files to remove.
        rs("Safari", "cache", true, fl![format!("{MC}/com.apple.Safari"), "~/Library/Containers/com.apple.Safari/Data/Library/Caches/com.apple.Safari,WebKit"], "*", "r", Some(r"(?i)[\\/]com\.apple\.Safari[\\/]Extensions[\\/]")),
        rm("Safari", "cookies", false, fl!["~/Library/Cookies", "~/Library/Containers/com.apple.Safari/Data/Library/Cookies"], "Cookies.binarycookies", ""),
    ]);
    for (name, dir) in [("Google Chrome", "Google/Chrome"), ("Edge Chromium", "Microsoft Edge"), ("Brave", "BraveSoftware/Brave-Browser"), ("Vivaldi", "Vivaldi")] {
        v.extend(browser(name, &format!("{MA}/{dir}/*"), &format!("{MC}/{dir}/*"), &format!("{MA}/{dir}")));
    }
    v.extend(browser("Opera", &format!("{MA}/com.operasoftware.Opera"), &format!("{MC}/com.operasoftware.Opera"), &format!("{MA}/com.operasoftware.Opera")));
    v.extend([rm("Firefox", "cookies", false, fl![format!("{MA}/Firefox/Profiles/*")], "cookies.sqlite;cookies.sqlite-wal;cookies.sqlite-shm", ""), r("Firefox", "cache", true, fl![format!("{MC}/Firefox/Profiles/*/cache2,startupCache,jumpListCache,thumbnails,OfflineCache")])]);
    v
}
pub fn linux() -> Vec<Rule> {
    let mut v = vec![
        rm("system", "temp", true, fl!["/tmp", "/var/tmp"], "*", "rd"), r("system", "trash", true, fl!["~/.local/share/Trash/files,info"]),
        rs("system", "usercache", true, fl![XK], "*", "r", Some(USER_CACHE_SKIP)), r("system", "thumbs", true, fl![format!("{XK}/thumbnails")]),
        rm("system", "userlogs", true, fl!["~"], ".xsession-errors;.xsession-errors.old", ""), rm("system", "userlogs", true, fl!["~/.local/share/xorg"], "*.log", ""),
    ];
    for (name, dir) in [("Google Chrome", "google-chrome"), ("Edge Chromium", "microsoft-edge"), ("Brave", "BraveSoftware/Brave-Browser"), ("Vivaldi", "vivaldi")] {
        v.extend(browser(name, &format!("{XC}/{dir}/*"), &format!("{XK}/{dir}/*"), &format!("{XC}/{dir}")));
    }
    v.extend(browser("Opera", &format!("{XC}/opera"), &format!("{XK}/opera"), &format!("{XC}/opera")));
    v.extend([rm("Firefox", "cookies", false, fl!["~/.mozilla/firefox/*"], "cookies.sqlite;cookies.sqlite-wal;cookies.sqlite-shm", ""), r("Firefox", "cache", true, fl![format!("{XK}/mozilla/firefox/*/cache2,startupCache,thumbnails,OfflineCache")])]);
    v
}
