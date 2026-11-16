// Windows: the Uninstall registry keys, the registered uninstaller, and registry backup + delete through reg.exe.
use crate::{i18n::t, types::*, util::*};
use std::{os::windows::{io::AsRawHandle, process::CommandExt}, path::Path, process::{Command, Stdio}};
use windows::{core::{BOOL, PCWSTR}, Win32::{Foundation::*, System::JobObjects::*, UI::WindowsAndMessaging::*}};
use winreg::{enums::*, RegKey};

const UNINSTALL: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
// PowerShell expanded REG_EXPAND_SZ values for us; the registry API hands them back raw.
fn text(key: &RegKey, name: &str) -> Option<String> { key.get_value::<String, _>(name).ok().map(|v| expand(&v)).filter(|v| !v.is_empty()) }
pub fn list_apps() -> R<Vec<AppRecord>> {
    let mut apps = Vec::new();
    let roots = [(HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE", UNINSTALL.to_string()), (HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE", UNINSTALL.replace("SOFTWARE", r"SOFTWARE\WOW6432Node")), (HKEY_CURRENT_USER, "HKEY_CURRENT_USER", UNINSTALL.to_string())];
    for (hive, hive_name, path) in roots {
        let Ok(root) = RegKey::predef(hive).open_subkey_with_flags(&path, KEY_READ) else { continue };
        for name in root.enum_keys().flatten() {
            let Ok(key) = root.open_subkey_with_flags(&name, KEY_READ) else { continue };
            let (Some(display), Some(command)) = (text(&key, "DisplayName"), text(&key, "UninstallString")) else { continue };
            if key.get_value::<u32, _>("SystemComponent").unwrap_or(0) != 0 || text(&key, "ParentKeyName").is_some() || display.eq_ignore_ascii_case("GoodbyeAPP") { continue; }
            let kb = key.get_value::<u32, _>("EstimatedSize").ok().or_else(|| text(&key, "EstimatedSize").and_then(|v| v.parse().ok())).unwrap_or(0);
            let ps_path = format!(r"Microsoft.PowerShell.Core\Registry::{hive_name}\{path}\{name}");
            let publisher = text(&key, "Publisher").unwrap_or_default();
            apps.push(AppRecord {
                id: id(&ps_path), name: display, version: text(&key, "DisplayVersion").unwrap_or_default(), size: kb as u64 * 1024, source: "Windows".into(),
                command: Some(command), registry: Some(ps_path), icon_source: Some(text(&key, "DisplayIcon").unwrap_or_default()), vendor: Some(publisher.clone()), publisher,
                install_dir: Some(text(&key, "InstallLocation").unwrap_or_default().trim_start_matches('"').trim_end_matches('"').to_string()), ..Default::default()
            });
        }
    }
    Ok(apps)
}
pub fn uninstall(app: &AppRecord) -> R<()> {
    let Some((exe, mut args)) = split_command(app.command.as_deref().unwrap_or("")) else { return Err(t().unsupported_uninstall.into()) };
    if exe.to_lowercase().trim_end_matches(".exe").ends_with("msiexec") {
        if let Some(i) = args.to_ascii_lowercase().match_indices("/i").map(|(i, _)| i).find(|&i| args[i + 2..].chars().next().is_some_and(|c| c.is_whitespace() || c == '{')) { args.replace_range(i..i + 2, "/X"); }
    }
    let list = if args.is_empty() { String::new() } else { format!("-ArgumentList {}", quote(&args)) };
    let script = encoded(&format!("$p=Start-Process -FilePath {} {list} -PassThru -Wait; $p.ExitCode", quote(&exe)));
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &script]).creation_flags(0x0800_0000).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().ctx()?;
    // The job holds PowerShell and everything it starts, even when the uninstaller hands off to a copy of itself and exits.
    let job = unsafe { CreateJobObjectW(None, PCWSTR::null()) }.ctx()?;
    unsafe {
        let mut limit = JOBOBJECT_BASIC_LIMIT_INFORMATION { LimitFlags: JOB_OBJECT_LIMIT_BREAKAWAY_OK, ..Default::default() };
        let _ = SetInformationJobObject(job, JobObjectBasicLimitInformation, &mut limit as *mut _ as _, size_of_val(&limit) as u32);
        let _ = AssignProcessToJobObject(job, HANDLE(child.as_raw_handle()));
    }
    while child.try_wait().ctx()?.is_none() { raise(job); std::thread::sleep(std::time::Duration::from_millis(300)); }
    unsafe { let _ = CloseHandle(job); }
    let code = finish(child.wait_with_output().ctx()?)?;
    if ["0", "3010", "1641"].contains(&code.as_str()) { Ok(()) } else { Err((t().uninstaller_failed)(&code)) }
}
// While the user is looking at this app, keeps the uninstaller's window in front of it so it cannot hide behind other windows.
// Never takes focus from another program (a game, say); it waits until the user comes back here.
fn raise(job: HANDLE) {
    #[repr(C)]
    struct Ids { assigned: u32, listed: u32, ids: [usize; 64] }
    unsafe extern "system" fn pick(hwnd: HWND, ids: LPARAM) -> BOOL {
        let ids = &*(ids.0 as *const Vec<u32>);
        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if !ids.contains(&pid) || !IsWindowVisible(hwnd).as_bool() || GetWindowTextLengthW(hwnd) == 0 { return true.into(); }
        if IsIconic(hwnd).as_bool() { let _ = ShowWindow(hwnd, SW_RESTORE); }
        let _ = SetForegroundWindow(hwnd);
        false.into()
    }
    unsafe {
        let mut fg = 0;
        GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut fg));
        if fg != std::process::id() { return; }
        let mut list = Ids { assigned: 0, listed: 0, ids: [0; 64] };
        if QueryInformationJobObject(Some(job), JobObjectBasicProcessIdList, &mut list as *mut _ as _, size_of_val(&list) as u32, None).is_err() { return; }
        let ids: Vec<u32> = list.ids[..list.listed.min(64) as usize].iter().map(|&id| id as u32).collect();
        let _ = EnumWindows(Some(pick), LPARAM(&ids as *const _ as isize));
    }
}
fn open(path: &str) -> Option<RegKey> {
    let (hive, sub) = path.split_once('\\')?;
    RegKey::predef(if hive.eq_ignore_ascii_case("HKCU") { HKEY_CURRENT_USER } else { HKEY_LOCAL_MACHINE }).open_subkey_with_flags(sub, KEY_READ).ok()
}
pub fn reg_exists(path: &str) -> bool { open(path).is_some() }
// Exports the key to a .reg backup first, then deletes the key (or one value of it).
pub fn reg_backup_delete(key: &str, value: Option<&str>, id: &str, backup_dir: &Path) -> R<String> {
    std::fs::create_dir_all(backup_dir).ctx()?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis());
    let backup = s(&backup_dir.join(format!("{id}-{stamp}.reg")));
    run("reg.exe", &["export", key, &backup, "/y"])?;
    match value { Some(name) => run("reg.exe", &["delete", key, "/v", name, "/f"])?, None => run("reg.exe", &["delete", key, "/f"])? };
    Ok(backup)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lists_installed_apps() { assert!(!list_apps().unwrap().is_empty()); }
    #[test]
    fn registry_keys_are_backed_up_before_they_are_deleted() {
        let path = r"Software\GoodbyeAppRegistryTest";
        let key = RegKey::predef(HKEY_CURRENT_USER).create_subkey(path).unwrap().0;
        key.set_value("Keep", &"x").unwrap(); key.set_value("Drop", &"y").unwrap();
        let (full, dir) = (format!(r"HKCU\{path}"), std::env::temp_dir().join(format!("goodbyeapp-reg-{}", std::process::id())));
        assert!(reg_exists(&full));
        reg_backup_delete(&full, Some("Drop"), "t", &dir).unwrap();
        assert!(key.get_value::<String, _>("Drop").is_err() && key.get_value::<String, _>("Keep").is_ok());
        let backup = reg_backup_delete(&full, None, "t", &dir).unwrap();
        assert!(!reg_exists(&full) && std::fs::metadata(&backup).is_ok_and(|m| m.len() > 0));
        let _ = std::fs::remove_dir_all(dir);
    }
}
