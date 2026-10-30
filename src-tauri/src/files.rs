// Disk scan behind the Large Files tab: the largest files per drive plus the treemap.
// NTFS volumes are read from the MFT when the app runs as administrator (mft.rs); anything else falls back to the walk.
use crate::{mft, tree::{build_tree, SHARE}, types::*, util::*};
use std::{collections::{HashMap, HashSet}, path::{Path, PathBuf}, sync::{atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering::Relaxed}, Mutex}};

pub const LIMIT: usize = 100;
const PARALLEL: usize = 16;
// Virtual / duplicate trees on macOS and Linux.
const SKIP: [&str; 5] = ["/proc", "/sys", "/dev", "/run", "/System/Volumes"];
#[derive(Default)]
pub struct Data { pub top: Vec<FileHit>, pub min: u64, big: Vec<(String, u64)>, own: HashMap<String, u64>, floor: f64, pub tree: Option<TreeNode> }
pub struct Job { pub root: String, pub scanned: AtomicU64, pub current: Mutex<String>, pub done: AtomicBool, pub mode: Mutex<&'static str>, pub data: Mutex<Data> }
impl Job {
    pub fn new(root: &str) -> Self { Self { root: root.into(), scanned: 0.into(), current: Mutex::new(root.into()), done: false.into(), mode: Mutex::new("mft"), data: Mutex::default() } }
}
// Keeps only the largest files; hard links (same inode) count once.
pub fn trim(d: &mut Data) {
    let mut seen = HashSet::new();
    d.top.sort_by(|a, b| b.size.cmp(&a.size));
    d.top.retain(|f| f.ino == 0 || seen.insert((f.ino, f.size)));
    d.top.truncate(LIMIT);
    d.min = if d.top.len() == LIMIT { d.top[LIMIT - 1].size } else { 0 };
}
#[cfg(windows)]
pub fn disk_space(root: &str) -> Option<(u64, u64)> {
    use windows::{core::PCWSTR, Win32::Storage::FileSystem::GetDiskFreeSpaceExW};
    let wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
    let (mut total, mut free) = (0u64, 0u64);
    unsafe { GetDiskFreeSpaceExW(PCWSTR(wide.as_ptr()), None, Some(&mut total), Some(&mut free)).ok()?; }
    Some((total, free))
}
#[cfg(not(windows))]
pub fn disk_space(root: &str) -> Option<(u64, u64)> {
    let out = run("df", &["-Pk", root]).ok()?;
    let f: Vec<&str> = out.lines().nth(1)?.split_whitespace().collect();
    Some((f.get(1)?.parse::<u64>().ok()? * 1024, f.get(3)?.parse::<u64>().ok()? * 1024))
}
#[cfg(windows)]
pub fn list_drives() -> R<Vec<Drive>> {
    use windows::{core::PCWSTR, Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW}};
    let mut drives = Vec::new();
    for i in 0..26u8 {
        if unsafe { GetLogicalDrives() } & (1 << i) == 0 { continue; }
        let root = format!("{}:\\", (b'A' + i) as char);
        let wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
        if ![2, 3].contains(&unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) }) { continue; }
        let Some((total, free)) = disk_space(&root).filter(|d| d.0 > 0) else { continue };
        let mut name = [0u16; 261];
        let label = unsafe { GetVolumeInformationW(PCWSTR(wide.as_ptr()), Some(&mut name), None, None, None, None) }.map_or(String::new(), |_| String::from_utf16_lossy(&name[..name.iter().position(|&c| c == 0).unwrap_or(0)]));
        drives.push(Drive { root, label, total, free });
    }
    Ok(drives)
}
#[cfg(not(windows))]
pub fn list_drives() -> R<Vec<Drive>> { let (total, free) = disk_space("/").unwrap_or((0, 0)); Ok(vec![Drive { root: "/".into(), label: String::new(), total, free }]) }

#[cfg(unix)]
fn inode(m: &std::fs::Metadata) -> u64 { std::os::unix::fs::MetadataExt::ino(m) }
// ponytail: Windows reports no file index through std, so hard links there are counted per path.
#[cfg(not(unix))]
fn inode(_: &std::fs::Metadata) -> u64 { 0 }
fn visit(job: &Job, dir: &Path, queue: &Mutex<Vec<PathBuf>>, pending: &AtomicUsize) {
    *job.current.lock().unwrap() = s(dir);
    let (min, floor) = { let d = job.data.lock().unwrap(); (d.min, d.floor) };
    let (mut top, mut big, mut bytes, mut scanned) = (Vec::new(), Vec::new(), 0u64, 0u64);
    for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let Ok(kind) = entry.file_type() else { continue };
        let full = entry.path();
        if kind.is_dir() { if !SKIP.contains(&s(&full).as_str()) { pending.fetch_add(1, Relaxed); queue.lock().unwrap().push(full); } continue; }
        if !kind.is_file() { continue; } // symlinks and junctions are skipped, so no loops
        let Ok(meta) = entry.metadata() else { continue };
        let size = meta.len();
        scanned += 1; bytes += size;
        if size as f64 >= floor { big.push((s(&full), size)); }
        if size > min { top.push(FileHit { path: s(&full), name: Some(entry.file_name().to_string_lossy().into_owned()), size, ino: inode(&meta), modified: meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0) }); }
    }
    let mut d = job.data.lock().unwrap();
    d.own.insert(s(dir), bytes); d.big.extend(big); d.top.extend(top);
    if d.top.len() >= LIMIT * 2 { trim(&mut d); }
    job.scanned.fetch_add(scanned, Relaxed);
}
// Folder-by-folder walk: works everywhere without special rights, but stats every file.
fn walk(job: &Job, cancel: &AtomicBool) {
    let (queue, pending) = (Mutex::new(vec![PathBuf::from(&job.root)]), AtomicUsize::new(1));
    std::thread::scope(|sc| for _ in 0..PARALLEL { sc.spawn(|| while !cancel.load(Relaxed) {
        let next = queue.lock().unwrap().pop();
        match next { Some(dir) => { visit(job, &dir, &queue, &pending); pending.fetch_sub(1, Relaxed); } None if pending.load(Relaxed) == 0 => break, None => std::thread::sleep(std::time::Duration::from_millis(1)) }
    }); });
}
fn parent_of(p: &str) -> String { Path::new(p).parent().map_or(p.to_string(), s) }
fn base_of(p: &str) -> String { Path::new(p).file_name().map_or(String::new(), |n| n.to_string_lossy().into_owned()) }
// Treemap from the walk: folder totals, with every file big enough to be a tile split out on its own.
fn walk_tree(job: &Job, d: &Data) -> TreeNode {
    let mut own = d.own.clone();
    for (path, size) in &d.big { *own.entry(parent_of(path)).or_insert(0) = own.get(&parent_of(path)).copied().unwrap_or(0).saturating_sub(*size); }
    let keys: Vec<String> = own.keys().cloned().chain(d.big.iter().map(|f| f.0.clone())).collect();
    let index: HashMap<&String, usize> = keys.iter().enumerate().map(|(i, k)| (k, i)).collect();
    let root = index.get(&job.root).copied().unwrap_or(0);
    let parent: Vec<u32> = keys.iter().map(|k| index.get(&parent_of(k)).copied().unwrap_or(root) as u32).collect();
    let sizes: Vec<f64> = own.keys().map(|k| own[k] as f64).chain(d.big.iter().map(|f| f.1 as f64)).collect();
    build_tree(&parent, &|i| base_of(&keys[i]), &sizes, root, &job.root)
}
pub fn scan_drive(job: &Job, cancel: &AtomicBool) {
    let fast = if cfg!(windows) && job.root.len() == 3 && job.root.as_bytes()[1] == b':' { mft::scan(job, cancel, LIMIT) } else { Err("NTFS yok".to_string()) };
    if fast.is_err() {
        // The tile floor comes from the volume's used space, so at most ~1/SHARE files are kept for the tree.
        let floor = disk_space(&job.root).map_or(f64::INFINITY, |(total, free)| (total - free) as f64 * SHARE);
        *job.mode.lock().unwrap() = "walk"; job.scanned.store(0, Relaxed); *job.current.lock().unwrap() = job.root.clone();
        *job.data.lock().unwrap() = Data { floor, ..Default::default() };
        walk(job, cancel);
        let mut d = job.data.lock().unwrap();
        trim(&mut d);
        let tree = walk_tree(job, &d);
        (d.tree, d.own, d.big) = (Some(tree), HashMap::new(), Vec::new());
    }
    job.done.store(true, Relaxed);
    trim(&mut job.data.lock().unwrap());
}
// The tree goes out only with the final result, not with every progress snapshot.
pub fn report(job: &Job, tree: bool) -> DriveReport {
    let mut d = job.data.lock().unwrap();
    trim(&mut d);
    DriveReport { root: job.root.clone(), scanned: job.scanned.load(Relaxed), current: job.current.lock().unwrap().clone(), done: job.done.load(Relaxed), mode: *job.mode.lock().unwrap(), files: d.top.clone(), tree: if tree { d.tree.take() } else { None } }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn walk_finds_the_largest_files_and_builds_a_tree() {
        let dir = std::env::temp_dir().join(format!("goodbyeapp-walk-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("small.txt"), [0u8; 10]).unwrap();
        std::fs::write(dir.join("sub").join("big.bin"), vec![0u8; 5000]).unwrap();
        let job = Job::new(&format!("{}{}", dir.display(), std::path::MAIN_SEPARATOR));
        *job.mode.lock().unwrap() = "walk";
        job.data.lock().unwrap().floor = 100.0;
        walk(&job, &AtomicBool::new(false));
        let mut d = job.data.lock().unwrap();
        trim(&mut d);
        assert_eq!(d.top[0].size, 5000);
        assert_eq!(job.scanned.load(Relaxed), 2);
        assert_eq!(d.big.len(), 1);
        let tree = walk_tree(&job, &d);
        assert!(tree.children.is_some());
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn lists_at_least_one_drive() { assert!(!list_drives().unwrap().is_empty()); }
}
