// Windows: one UAC prompt per call. The script travels inline, so no temp file exists for an unelevated process to swap.
use super::*;
use super::windows::reg_exists;
use serde::Serialize;

#[derive(Serialize)]
struct Job { kind: Kind, path: String, #[serde(skip_serializing_if = "Option::is_none")] backup: Option<String> }
fn elevated(script: &str) -> R<i32> {
    let encoded = encoded(script);
    if encoded.len() > 30000 { return Err(t().too_many.into()); }
    let out = run("powershell.exe", &["-NoProfile", "-NonInteractive", "-Command", &format!("$ErrorActionPreference='Stop'; (Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','{encoded}').ExitCode")])
        .map_err(|e| if e.to_lowercase().contains("cancel") || e.to_lowercase().contains("iptal") { t().elevation_denied.to_string() } else { e })?;
    out.trim().parse().ctx()
}
// Checkpoint-Computer needs admin. Windows silently skips it when a point exists from the last 24 hours (exit 2).
pub fn restore_point(name: &str) -> R<&'static str> {
    let newest = "(Get-ComputerRestorePoint | Measure-Object SequenceNumber -Maximum).Maximum";
    let description: String = format!("GoodbyeAPP: {name}").chars().take(80 + 12).collect();
    let code = elevated(&format!("$n={newest}; Checkpoint-Computer -Description {} -RestorePointType APPLICATION_UNINSTALL; if ({newest} -le $n) {{ exit 2 }}", quote(&description))).map_err(|e| (t().restore_failed)(&e))?;
    match code { 2 => Ok("skipped"), 0 => Ok("created"), _ => Err(t().restore_protection.into()) }
}
// Every plan item is re-validated before elevation: scan roots or the registered install folder, Software keys only.
pub fn elevated_ok(item: &Item, app: &AppRecord, others: &[AppRecord]) -> R<()> {
    if item.kind == Kind::Registry { return if registry_key_ok(&item.path) { Ok(()) } else { Err(t().invalid_registry.into()) }; }
    let root = item.root.clone().unwrap_or_default();
    if !(scan_roots(app).iter().any(|r| s(r) == root) || install_dir_ok(&resolve(Path::new(&item.path)), others)) { return Err(t().outside_root.into()); }
    validate_path(Path::new(&root), Path::new(&item.path)).map(|_| ())
}
fn script(jobs: &[Job]) -> String {
    format!(r"Add-Type -AssemblyName Microsoft.VisualBasic; $fs=[Microsoft.VisualBasic.FileIO.FileSystem]
foreach ($i in (ConvertFrom-Json {})) {{ try {{
  if ($i.kind -eq 'registry') {{ reg.exe export $i.path $i.backup /y | Out-Null; if (!$LASTEXITCODE) {{ reg.exe delete $i.path /f | Out-Null }} }}
  else {{ $f = Get-Item -LiteralPath $i.path -Force; if (!($f.Attributes -band [IO.FileAttributes]::ReparsePoint)) {{ if ($f.PSIsContainer) {{ $fs::DeleteDirectory($i.path, 'OnlyErrorDialogs', 'DeletePermanently') }} else {{ $fs::DeleteFile($i.path, 'OnlyErrorDialogs', 'DeletePermanently') }} }} }}
}} catch {{}} }}", quote(&serde_json::to_string(jobs).unwrap_or_default()))
}
// Results come from re-checking each item afterwards, not from the elevated process's word.
pub async fn clean_elevated(items: &[Item], app: &AppRecord, others: &[AppRecord], backup_dir: &Path) -> R<Vec<CleanResult>> {
    let (mut results, mut jobs) = (Vec::new(), Vec::new());
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis());
    for item in items {
        match elevated_ok(item, app, others) {
            Ok(()) => jobs.push(Job { kind: item.kind, path: item.path.clone(), backup: (item.kind == Kind::Registry).then(|| s(&backup_dir.join(format!("{}-{stamp}.reg", item.id)))) }),
            Err(e) => results.push(CleanResult::fail(&item.path, e)),
        }
    }
    if jobs.is_empty() { return Ok(results); }
    std::fs::create_dir_all(backup_dir).ctx()?;
    let script = script(&jobs);
    let error = tauri::async_runtime::spawn_blocking(move || elevated(&script)).await.ctx()?.map(|_| t().elevated_failed.to_string()).unwrap_or_else(|e| e);
    for job in jobs {
        let gone = if job.kind == Kind::Registry { !reg_exists(&job.path) } else { std::fs::symlink_metadata(&job.path).is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound) };
        results.push(if gone { CleanResult::ok(&job.path, job.backup) } else { CleanResult::fail(&job.path, error.clone()) });
    }
    Ok(results)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejected_items_never_reach_elevation() {
        let app = AppRecord { name: "Example App".into(), ..Default::default() };
        let reg = |p: &str| Item { id: "r".into(), kind: Kind::Registry, path: p.into(), size: 0, root: None };
        assert!(elevated_ok(&reg(r"HKLM\SOFTWARE\Example App"), &app, &[]).is_ok());
        assert!(elevated_ok(&reg(r"HKLM\SOFTWARE\Microsoft"), &app, &[]).is_err());
        let results = tauri::async_runtime::block_on(clean_elevated(&[reg(r"HKLM\SOFTWARE\Classes\GoodbyeAppTestMissing")], &app, &[], Path::new(""))).unwrap();
        assert_eq!(results.iter().map(|r| r.ok).collect::<Vec<_>>(), [false]);
    }
}
