// App logos as 48px-ish PNG data URLs. Windows reads them from the registered icon file with the shell API;
// macOS converts the bundle's .icns; Linux reads the Flatpak export. A missing logo falls back to the UI's package icon.
use crate::{types::*, util::*};
use base64::{engine::general_purpose::STANDARD, Engine};
use regex::Regex;
use std::collections::HashMap;
#[cfg(any(windows, target_os = "macos"))] use std::path::Path;
#[cfg(not(windows))] use std::fs;

// Registry icon locations are data, never commands. Reject remote/device paths.
pub fn parse_icon_location(value: &Option<String>) -> Option<(String, i32)> {
    let expanded = expand(value.as_deref()?).trim().to_string();
    let m = Regex::new(r#"^(?:"([^"]+)"|(.+?))(?:,\s*(-?\d+))?$"#).unwrap().captures(&expanded)?;
    let file = m.get(1).or(m.get(2))?.as_str().trim().to_string();
    let index = m.get(3).map_or(Some(0), |i| i.as_str().parse().ok())?;
    let b = file.as_bytes();
    let drive = b.len() > 2 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/');
    let ext = file.to_lowercase();
    (drive && !file.contains('\0') && !file[2..].contains(':') && [".exe", ".dll", ".ico"].iter().any(|e| ext.ends_with(e))).then_some((file, index))
}
fn data_url(png: &[u8]) -> String { format!("data:image/png;base64,{}", STANDARD.encode(png)) }
#[cfg(windows)]
fn extract(file: &str, index: i32) -> Option<String> {
    use windows::{core::PCWSTR, Win32::{Graphics::Gdi::*, UI::{Shell::ExtractIconExW, WindowsAndMessaging::*}}};
    unsafe {
        let wide: Vec<u16> = file.encode_utf16().chain(Some(0)).collect();
        let (mut large, mut small) = (HICON::default(), HICON::default());
        if ExtractIconExW(PCWSTR(wide.as_ptr()), index, Some(&mut large as *mut _), Some(&mut small as *mut _), 1) == 0 { return None; }
        let icon = if large.is_invalid() { small } else { large };
        let size = GetSystemMetrics(SM_CXICON).max(16);
        let hdc = CreateCompatibleDC(None);
        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: size, biHeight: -size, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() };
        let mut bits = std::ptr::null_mut();
        let dib = CreateDIBSection(Some(hdc), &info, DIB_RGB_COLORS, &mut bits, None, 0);
        let png = dib.ok().filter(|_| !bits.is_null()).and_then(|dib| {
            let old = SelectObject(hdc, dib.into());
            let drawn = DrawIconEx(hdc, 0, 0, icon, size, size, 0, None, DI_NORMAL).is_ok();
            let px = std::slice::from_raw_parts_mut(bits as *mut u8, (size * size * 4) as usize);
            let alpha = px.chunks(4).any(|p| p[3] != 0);
            for p in px.chunks_mut(4) {
                p.swap(0, 2); // BGRA -> RGBA
                // GDI draws premultiplied colour; legacy icons carry no alpha at all, so every painted pixel is opaque.
                let a = p[3] as u32;
                if alpha { if a != 0 { for c in &mut p[..3] { *c = ((*c as u32 * 255 + a / 2) / a).min(255) as u8; } } }
                else if p[..3].iter().any(|&c| c != 0) { p[3] = 255; }
            }
            // Encode before the DIB goes away: `px` points into its memory.
            let encoded = drawn.then(|| { let mut out = Vec::new(); let mut enc = png::Encoder::new(&mut out, size as u32, size as u32); enc.set_color(png::ColorType::Rgba); enc.set_depth(png::BitDepth::Eight); enc.write_header().ok()?.write_image_data(px).ok()?; Some(out) }).flatten();
            SelectObject(hdc, old);
            let _ = DeleteObject(dib.into());
            encoded
        });
        let _ = DeleteDC(hdc);
        for h in [large, small] { if !h.is_invalid() { let _ = DestroyIcon(h); } }
        png.map(|p| data_url(&p))
    }
}
#[cfg(windows)]
pub fn load_icons(apps: &[AppRecord]) -> HashMap<String, String> {
    apps.iter().filter_map(|a| { let (file, index) = parse_icon_location(&a.icon_source)?; Path::new(&file).is_file().then(|| extract(&file, index).map(|u| (a.id.clone(), u)))? }).collect()
}
// The bundle's .icns converted with sips; apps that only ship an asset catalog get the UI's fallback.
#[cfg(target_os = "macos")]
pub fn load_icons(apps: &[AppRecord]) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for app in apps.iter().filter(|a| a.location.as_deref().is_some_and(|l| l.ends_with(".app"))) {
        let base = Path::new(app.location.as_deref().unwrap()).join("Contents");
        let Ok(json) = run("/usr/bin/plutil", &["-convert", "json", "-o", "-", &s(&base.join("Info.plist"))]) else { continue };
        let Some(name) = serde_json::from_str::<serde_json::Value>(&json).ok().and_then(|v| v["CFBundleIconFile"].as_str().map(String::from)) else { continue };
        if name.contains(['/', '\\']) { continue; }
        let icns = base.join("Resources").join(if name.contains('.') { name } else { format!("{name}.icns") });
        let out = std::env::temp_dir().join(format!("goodbyeapp-icon-{}.png", app.id));
        if run("/usr/bin/sips", &["-s", "format", "png", "-Z", "48", &s(&icns), "--out", &s(&out)]).is_ok() {
            if let Ok(png) = fs::read(&out) { result.insert(app.id.clone(), data_url(&png)); }
            let _ = fs::remove_file(&out);
        }
    }
    result
}
#[cfg(target_os = "linux")]
pub fn load_icons(apps: &[AppRecord]) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for app in apps {
        let bundle = app.bundle.clone().unwrap_or_default();
        if bundle.is_empty() || !bundle.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) { continue; }
        let root = if app.scope.as_deref() == Some("user") { env("XDG_DATA_HOME").unwrap_or(home().join(".local/share")).join("flatpak/exports/share/icons/hicolor") } else { "/var/lib/flatpak/exports/share/icons/hicolor".into() };
        for size in [64, 48, 128, 32, 256] {
            let file = root.join(format!("{size}x{size}")).join("apps").join(format!("{bundle}.png"));
            if fs::metadata(&file).is_ok_and(|m| m.is_file() && m.len() <= 4 * 1024 * 1024) { if let Ok(png) = fs::read(&file) { result.insert(app.id.clone(), data_url(&png)); break; } }
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    fn at(v: &str) -> Option<(String, i32)> { parse_icon_location(&Some(v.into())) }
    #[test]
    fn parses_icon_locations_and_rejects_unsafe_ones() {
        assert_eq!(at(r#""C:\A B\app.exe",-3"#), Some((r"C:\A B\app.exe".into(), -3)));
        assert_eq!(at(r"C:\x\a.ico"), Some((r"C:\x\a.ico".into(), 0)));
        for bad in [r"\\server\share\a.exe", r"C:\x\a.txt", r"C:\x:stream\a.exe", "cmd /c calc"] { assert_eq!(at(bad), None, "{bad}"); }
    }
    #[cfg(windows)]
    #[test]
    fn extracts_a_real_icon() {
        let url = extract(r"C:\Windows\System32\shell32.dll", 0).expect("icon");
        assert!(url.starts_with("data:image/png;base64,") && url.len() > 200);
    }
}
