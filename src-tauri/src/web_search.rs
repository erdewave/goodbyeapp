use crate::{i18n::t, util::R};

fn filename(path: &str) -> R<&str> {
    path.rsplit(['/', '\\']).next().filter(|s| !s.is_empty() && !s.contains('\0'))
        .ok_or_else(|| t().invalid_selection.to_string())
}

// Let the browser resolve its own search engine and profile; do not read its private preferences.
// Chromium: startup_tab_provider.cc, ParseTabFromCommandLineArg ("? " search prefix).
// Firefox: https://firefox-source-docs.mozilla.org/browser/CommandLineParameters.html
fn search_args(executable: &str, query: &str) -> R<Vec<String>> {
    match filename(executable)?.to_ascii_lowercase().as_str() {
        "firefox.exe" | "librewolf.exe" | "waterfox.exe" | "firefox" | "librewolf" | "waterfox" => Ok(vec!["--search".into(), query.into()]),
        "chrome.exe" | "chromium.exe" | "msedge.exe" | "brave.exe" | "vivaldi.exe" | "opera.exe"
        | "google chrome" | "google chrome beta" | "google chrome dev" | "google chrome canary"
        | "chromium" | "microsoft edge" | "brave browser" | "vivaldi" | "opera" | "helium" => Ok(vec![format!("? {query}")]),
        _ => Err(t().search_unsupported.into()),
    }
}

#[cfg(windows)]
pub fn search(path: &str) -> R<()> {
    use crate::util::Ctx;
    use std::{os::windows::process::CommandExt, process::Command};
    use windows::{core::{w, PWSTR}, Win32::UI::Shell::{AssocQueryStringW, ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE}};
    let query = filename(path)?;
    let mut buffer = vec![0u16; 32768];
    let mut length = buffer.len() as u32;
    unsafe { AssocQueryStringW(ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE, w!("https"), w!("open"), Some(PWSTR(buffer.as_mut_ptr())), &mut length).ok() }.ctx()?;
    let executable = String::from_utf16_lossy(&buffer[..buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len())]);
    let args = search_args(&executable, query)?;
    // Separate arguments avoid shell interpretation, including quotes and leading hyphens in names.
    Command::new(executable).args(args).creation_flags(0x08000000).spawn().ctx()?;
    Ok(())
}

#[cfg(target_os = "macos")]
const MAC_BROWSER: &str = r#"ObjC.import('AppKit');
const url = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('https://example.com'));
if (!url) throw new Error('No default web browser');
const bundle = $.NSBundle.bundleWithURL(url);
JSON.stringify([ObjC.unwrap(bundle.bundleIdentifier), ObjC.unwrap(bundle.executablePath)]);"#;

// Same native service used by WebKit's Search the Web action. A private pasteboard
// keeps the user's clipboard intact; Safari selects its configured search engine.
#[cfg(target_os = "macos")]
const SAFARI_SEARCH: &str = r#"ObjC.import('AppKit');
function run(argv) {
    $.NSApplication.sharedApplication;
    const board = $.NSPasteboard.pasteboardWithUniqueName;
    try {
        board.declareTypesOwner(['public.utf8-plain-text'], null);
        board.setStringForType(argv[0], 'public.utf8-plain-text');
        if (!$.NSPerformService('Search With %WebSearchProvider@', board)) throw new Error('Safari search service unavailable');
    } finally { board.releaseGlobally; }
}"#;

#[cfg(target_os = "macos")]
pub fn search(path: &str) -> R<()> {
    use crate::util::{run, Ctx};
    let query = filename(path)?;
    let info = run("/usr/bin/osascript", &["-l", "JavaScript", "-e", MAC_BROWSER])?;
    let (browser, executable): (String, String) = serde_json::from_str(&info).ctx()?;
    if browser == "com.apple.Safari" || browser == "com.apple.SafariTechnologyPreview" {
        return run("/usr/bin/osascript", &["-l", "JavaScript", "-e", SAFARI_SEARCH, "--", query]).map(|_| ());
    }
    let args = search_args(&executable, query)?;
    std::process::Command::new(executable).args(args).spawn().ctx()?;
    Ok(())
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn search(_path: &str) -> R<()> { Err(t().search_unsupported.into()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_uses_browser_engine_and_only_filename() {
        let name = filename(r"C:\Users\Private\çalışma & #1.exe").unwrap();
        assert_eq!(name, "çalışma & #1.exe");
        for browser in ["chrome.exe", "msedge.exe", "brave.exe", "vivaldi.exe", "opera.exe"] {
            assert_eq!(search_args(browser, name).unwrap(), vec![format!("? {name}")]);
        }
        assert_eq!(search_args("firefox.exe", name).unwrap(), vec!["--search", name]);
        assert_eq!(search_args("chrome.exe", "--test.exe").unwrap(), vec!["? --test.exe"]);
        assert!(search_args("unknown.exe", name).is_err());
        assert!(filename("").is_err());
        assert!(filename("bad\0name").is_err());
    }
    #[test]
    fn mac_browser_arguments_preserve_special_characters() {
        let query = filename("/Users/private/çalışma & #1.txt").unwrap();
        for browser in ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser", "Vivaldi", "Opera", "Helium"] {
            let path = format!("/Applications/{browser}.app/Contents/MacOS/{browser}");
            assert_eq!(search_args(&path, query).unwrap(), vec![format!("? {query}")]);
        }
        assert_eq!(search_args("/Applications/Firefox.app/Contents/MacOS/firefox", query).unwrap(), vec!["--search", query]);
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "opens the configured browser; run explicitly for native verification"]
    fn native_default_browser_search() {
        search("/private/GoodbyeAPP search & test.txt").unwrap();
    }
}
