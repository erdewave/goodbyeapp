// Linux: apps are Flatpaks, listed per scope (user, system).
use crate::{types::*, util::*};
use regex::Regex;

// flatpak prints GLib's SI sizes such as "1.2 GB", with the locale's decimal separator.
pub fn flatpak_size(text: &str) -> u64 {
    let Some(m) = Regex::new(r"([\d.,]+)\s*([kMGT]?)B").unwrap().captures(text) else { return 0 };
    let number = m[1].replace(',', ".");
    let mut dots = 0;
    let prefix: String = number.chars().take_while(|c| { dots += (*c == '.') as u8; c.is_ascii_digit() || (*c == '.' && dots < 2) }).collect();
    (prefix.parse::<f64>().unwrap_or(0.0) * 1000f64.powi(" kMGT".find(&m[2]).unwrap_or(0) as i32)).round() as u64
}
pub fn list_apps() -> R<Vec<AppRecord>> {
    let mut apps = Vec::new();
    // Without Flatpak installed there is nothing to list; failing here would leave the app stuck loading.
    if run("flatpak", &["--version"]).is_err() { return Ok(apps); }
    for scope in ["user", "system"] {
        for line in run("flatpak", &["list", "--app", &format!("--{scope}"), "--columns=application,name,version,size"])?.lines().filter(|l| !l.is_empty()) {
            let f: Vec<&str> = line.split('\t').collect();
            if f.len() >= 2 && !f[0].is_empty() && !f[1].is_empty() {
                apps.push(AppRecord { id: id(&format!("{scope}{}", f[0])), name: f[1].into(), bundle: Some(f[0].into()), version: f.get(2).unwrap_or(&"").to_string(), publisher: format!("Flatpak · {scope}"), source: "Flatpak".into(), scope: Some(scope.into()), size: flatpak_size(f.get(3).unwrap_or(&"")), ..Default::default() });
            }
        }
    }
    Ok(apps)
}
pub fn uninstall(app: &AppRecord) -> R<()> {
    run("flatpak", &["uninstall", "--noninteractive", &format!("--{}", app.scope.clone().unwrap_or_default()), app.bundle.as_deref().unwrap_or("")]).map(|_| ())
}
#[cfg(test)]
mod tests {
    #[test]
    fn parses_flatpak_sizes() { assert_eq!(super::flatpak_size("1.2 GB"), 1_200_000_000); assert_eq!(super::flatpak_size("1,5 MB"), 1_500_000); assert_eq!(super::flatpak_size(""), 0); }
}
