// Appends synchronously so the last line survives a crash; the file keeps its tail across launches.
use std::{fs, io::Write, path::PathBuf, sync::OnceLock, time::{SystemTime, UNIX_EPOCH}};

static FILE: OnceLock<PathBuf> = OnceLock::new();
pub fn log(line: &str) {
    let Some(file) = FILE.get() else { return };
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    // logging never breaks the app
    let _ = fs::OpenOptions::new().create(true).append(true).open(file).and_then(|mut f| writeln!(f, "{secs} {line}"));
}
pub fn start(data_dir: &std::path::Path, version: &str) {
    let dir = data_dir.join("logs");
    let _ = fs::create_dir_all(&dir);
    let file = dir.join("app.log");
    let previous = fs::read_to_string(&file).unwrap_or_default();
    let keep: String = previous.chars().rev().take(200_000).collect::<Vec<_>>().into_iter().rev().collect();
    let _ = fs::write(&file, &keep);
    let _ = FILE.set(file);
    if keep.trim_end().lines().last().is_some_and(|l| !l.ends_with(" quit")) { log("previous session ended without a clean quit (crash or kill)"); }
    log(&format!("start v{version} {}/{} logs={}", std::env::consts::OS, std::env::consts::ARCH, dir.display()));
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| { log(&format!("panic {info}")); previous_hook(info); }));
}
