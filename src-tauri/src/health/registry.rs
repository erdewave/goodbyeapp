// Health Check registry part (Windows): CCleaner's MRU/history keys, plus Run, MuiCache, SharedDLLs and App Paths
// entries whose target file is gone. PowerShell checks them in one call each; they run only during a scan.
use crate::{types::HealthItem, util::*};
use serde::Deserialize;

// group, category, on, keys: 'KEY' deletes the key, 'KEY|Value' one value, 'KEY|*' every value (subkeys stay)
type RegRule = (&'static str, &'static str, bool, Vec<String>);
const E: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer";
const TRAY: &str = r"HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\TrayNotify";
const WMP: &str = r"HKCU\Software\Microsoft\MediaPlayer";
const USER_ASSIST: [&str; 4] = ["5E6AB780-7743-11CF-A12B-00AA004AE837", "75048700-EF1F-11D0-9888-006097DEACF9", "CEBFF5CD-ACE2-4F4F-9178-9926F41749EA", "F4E57C4B-2036-45F0-A9AB-443BCFE33D9F"];
fn rules() -> Vec<RegRule> {
    let k = |parts: &[&str]| parts.iter().map(|p| p.to_string()).collect::<Vec<_>>();
    vec![
        ("windows", "recentdocs", false, k(&[&format!(r"{E}\RecentDocs")])), ("windows", "runmru", true, k(&[&format!(r"{E}\RunMRU")])), ("windows", "RegEdit", true, k(&[r"HKCU\Software\Microsoft\Windows\CurrentVersion\Applets\Regedit|LastKey"])),
        ("windows", "explorermru", false, ["ComDlg32", "TypedPaths", "WordWheelQuery", r"Wallpaper\MRU", r"Wallpapers\Images", "FindComputerMRU", "Map Network Drive MRU", "PrnPortsMRU"].iter().map(|s| format!(r"{E}\{s}")).chain([r"HKCU\Software\Microsoft\DirectInput\MostRecentApplication".into(), r"HKCU\Software\Microsoft\Direct3D\MostRecentApplication".into()]).collect()),
        ("windows", "MS Management Console", true, k(&[r"HKCU\Software\Microsoft\Microsoft Management Console\Recent File List"])), ("windows", "Remote Desktop", true, k(&[r"HKCU\Software\Microsoft\Terminal Server Client\Default|*"])),
        ("apps", "Adobe Photoshop", true, k(&[r"HKCU\Software\Adobe\MediaBrowser\MRU\Photoshop\FileList"])),
        ("media", "Windows Media Player", true, k(&[&format!(r"{WMP}\Player\RecentFileList"), &format!(r"{WMP}\Player\RecentURLList"), &format!(r"{WMP}\Preferences|LastPlayList"), &format!(r"{WMP}\Preferences|LastPlayListIndex"), &format!(r"{WMP}\Player\Settings|SaveAsDir")])),
        ("utils", "WinRAR", true, k(&[r"HKCU\Software\WinRAR\ArcHistory", r"HKCU\Software\WinRAR\DialogEditHistory\ArcName", r"HKCU\Software\WinRAR\DialogEditHistory\ExtrPath", r"HKCU\Software\WinRAR\General|LastFolder"])),
        ("advanced", "menuorder", false, k(&[&format!(r"{E}\MenuOrder")])), ("advanced", "traynotify", false, k(&[&format!("{TRAY}|IconStreams"), &format!("{TRAY}|PastIconsStream")])),
        ("advanced", "windowsize", false, k(&[&format!(r"{E}\StreamMRU"), &format!(r"{E}\Streams")])), ("advanced", "userassist", false, USER_ASSIST.iter().map(|g| format!(r"{E}\UserAssist\{{{g}}}\Count")).collect()),
    ]
}
// An empty key has nothing to clean and is skipped.
fn rule_script(keys: &[String]) -> String {
    format!(r##"$hits=@(); foreach($r in (ConvertFrom-Json {})){{ $k,$v=$r -split '\|',2; $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue; if(!$i){{ continue }}
  if($v -eq '*'){{ foreach($n in $i.GetValueNames()){{ if($n){{ $hits+=,@($r, "$k|$n") }} }} }} elseif($(if($v){{ $i.GetValueNames() -contains $v }} else {{ $i.ValueCount + $i.SubKeyCount -gt 0 }})){{ $hits+=,@($r, $r) }} }}; ConvertTo-Json -Compress -InputObject @($hits)"##, quote(&serde_json::to_string(keys).unwrap_or_default()))
}
fn item(group: &str, category: &str, on: bool, entry: &str, label: Option<String>, seed: String) -> HealthItem {
    let (key, name) = match entry.split_once('|') { Some((k, n)) => (k, Some(n)), None => (entry, None) };
    HealthItem { id: id(&seed), group: group.into(), category: category.into(), on, kind: if name.is_some() { "value" } else { "key" }.into(), path: name.map_or(key.to_string(), |n| format!(r"{key}\{n}")), key: Some(key.into()), name: name.map(String::from), label, ..Default::default() }
}
pub fn rule_items() -> Vec<HealthItem> {
    let rules = rules();
    let keys: Vec<String> = rules.iter().flat_map(|r| r.3.clone()).collect();
    let hits: Vec<Vec<String>> = ps(&rule_script(&keys)).ok().and_then(|o| serde_json::from_str(&o).ok()).unwrap_or_default();
    rules.iter().flat_map(|(group, category, on, keys)| hits.iter().filter(|h| h.len() == 2 && keys.contains(&h[0])).map(|h| item(group, category, *on, &h[1], None, format!("{group}{category}{}", h[1]))).collect::<Vec<_>>()).collect()
}
// Registry values whose target file is gone. 32-bit entries may name System32 for SysWOW64, so both are checked;
// WindowsApps denies Test-Path even for files that exist, so those entries are never judged.
const STALE: &str = r##"$out=@()
function Exe($c){ $c=[Environment]::ExpandEnvironmentVariables([string]$c).Trim(); if($c -match '^"([^"]+)"'){ $matches[1] } elseif($c -match '^(.+?\.exe)(\s|$)'){ $matches[1] } }
function Gone($p){ $p -and $p -notmatch '\\WindowsApps\\' -and [IO.Path]::IsPathRooted($p) -and !(Test-Path -LiteralPath $p) -and !(Test-Path -LiteralPath ($p -replace '\\System32\\','\SysWOW64\')) }
foreach($k in 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run','HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run','HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'){ $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue; if($i){ foreach($n in $i.GetValueNames()){ $v=[string]$i.GetValue($n); if($n -and (Gone (Exe $v))){ $out+=@{c='run';k=$k;n=$n;d=$v} } } } }
$k='HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache'; $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue
if($i){ foreach($n in $i.GetValueNames()){ $p=$n -replace '\.(FriendlyAppName|ApplicationCompany)$',''; if($p -ne $n -and (Gone $p)){ $out+=@{c='mui';k=$k;n=$n;d=$p} } } }
foreach($k in 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\SharedDLLs','HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\SharedDLLs'){ $i=Get-Item -LiteralPath "Registry::$k" -EA SilentlyContinue; if($i){ foreach($n in $i.GetValueNames()){ if(Gone ([Environment]::ExpandEnvironmentVariables($n))){ $out+=@{c='dlls';k=$k;n=$n;d=$n} } } } }
foreach($k in 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths','HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths'){ foreach($s in Get-ChildItem -LiteralPath "Registry::$k" -EA SilentlyContinue){ $p=[Environment]::ExpandEnvironmentVariables([string]$s.GetValue('')).Trim('"'); if(Gone $p){ $out+=@{c='apppaths';k=($s.Name -replace '^HKEY_LOCAL_MACHINE','HKLM' -replace '^HKEY_CURRENT_USER','HKCU');d=$p} } } }
ConvertTo-Json -Compress -InputObject @($out)"##;
#[derive(Deserialize)]
struct Hit { c: String, k: String, n: Option<String>, d: String }
pub fn stale_items() -> Vec<HealthItem> {
    let hits: Vec<Hit> = ps(STALE).ok().and_then(|o| serde_json::from_str(&o).ok()).unwrap_or_default();
    hits.into_iter().map(|h| { let seed = format!("{}\0{}", h.k, h.n.clone().unwrap_or_default()); let entry = h.n.as_ref().map_or(h.k.clone(), |n| format!("{}|{n}", h.k)); item("registry", &h.c, true, &entry, Some(h.d), seed) }).collect()
}
// [item count, bytes] of the Recycle Bin.
pub fn recycle() -> (u64, u64) {
    let out = ps("$i=@((New-Object -ComObject Shell.Application).NameSpace(10).Items()); $s=0; foreach($x in $i){ $s+=[double]$x.ExtendedProperty('Size') }; ConvertTo-Json -Compress @($i.Count,$s)").unwrap_or_default();
    serde_json::from_str::<Vec<f64>>(&out).ok().filter(|v| v.len() == 2).map_or((0, 0), |v| (v[0] as u64, v[1] as u64))
}
