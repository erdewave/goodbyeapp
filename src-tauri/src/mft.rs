// Reads the NTFS Master File Table straight from the volume (needs administrator rights).
// Written from the public NTFS on-disk format: boot sector, FILE records, $FILE_NAME (0x30), $DATA (0x80).
use crate::{files::{trim, Job}, tree::build_tree, types::*, util::*};
use std::{fs::File, io::{Read, Seek, SeekFrom}, sync::atomic::{AtomicBool, Ordering::Relaxed}};

const CHUNK: usize = 8 * 1024 * 1024;
const ROOT: usize = 5;
// Bounds-safe little-endian reads: corrupt records give zeros instead of panics.
fn b(buf: &[u8], at: usize) -> u8 { buf.get(at).copied().unwrap_or(0) }
fn u16le(buf: &[u8], at: usize) -> usize { b(buf, at) as usize | (b(buf, at + 1) as usize) << 8 }
fn u32le(buf: &[u8], at: usize) -> u32 { u16le(buf, at) as u32 | (u16le(buf, at + 2) as u32) << 16 }
fn u64le(buf: &[u8], at: usize) -> u64 { u32le(buf, at) as u64 | (u32le(buf, at + 4) as u64) << 32 }
// Decodes a data-run list into (lcn, clusterCount) pairs; offsets are signed and relative.
pub fn runs(buf: &[u8], mut at: usize) -> Vec<(u64, u64)> {
    let (mut out, mut lcn) = (Vec::new(), 0i64);
    while b(buf, at) != 0 && at < buf.len() {
        let (len_size, off_size) = ((b(buf, at) & 15) as usize, (b(buf, at) >> 4) as usize);
        at += 1;
        let len = (0..len_size).rev().fold(0u64, |n, i| n << 8 | b(buf, at + i) as u64);
        at += len_size;
        let mut delta = (0..off_size).rev().fold(0i64, |n, i| n << 8 | b(buf, at + i) as i64);
        if off_size > 0 && off_size < 8 && b(buf, at + off_size - 1) & 0x80 != 0 { delta -= 1 << (8 * off_size); }
        at += off_size;
        if off_size > 0 { lcn += delta; out.push((lcn as u64, len)); }
    }
    out
}
// Applies the update-sequence fixup (NTFS stride is 512 bytes); returns false for torn or non-FILE records.
fn fixup(buf: &mut [u8], at: usize, rec_size: usize) -> bool {
    if u32le(buf, at) != 0x454c_4946 || at + rec_size > buf.len() { return false; }
    let (usa, n) = (at + u16le(buf, at + 4), u16le(buf, at + 6));
    for i in 1..n {
        if i * 512 > rec_size { break; }
        let end = at + i * 512 - 2;
        if buf[end] != b(buf, usa) || buf[end + 1] != b(buf, usa + 1) { return false; }
        buf[end] = b(buf, usa + i * 2); buf[end + 1] = b(buf, usa + i * 2 + 1);
    }
    true
}
// Names live in one UTF-16 arena; each record keeps (offset, length), length 0 meaning "no name yet".
struct Table { kind: Vec<u8>, parent: Vec<u32>, size: Vec<f64>, name_at: Vec<(u32, u8)>, arena: Vec<u16> }
impl Table {
    fn name(&self, i: usize) -> Option<String> { let (o, l) = self.name_at[i]; (l > 0).then(|| String::from_utf16_lossy(&self.arena[o as usize..o as usize + l as usize])) }
}
fn parse(buf: &mut [u8], at: usize, rec_size: usize, index: usize, t: &mut Table) {
    if !fixup(buf, at, rec_size) { return; }
    let flags = u16le(buf, at + 0x16);
    if flags & 1 == 0 { return; }
    let base = u32le(buf, at + 0x20) as usize;
    let owner = if base != 0 { base } else { index };
    if base == 0 { t.kind[index] = if flags & 2 != 0 { 2 } else { 1 }; }
    let mut a = at + u16le(buf, at + 0x14);
    while a + 24 <= at + rec_size {
        let (kind, len) = (u32le(buf, a), u32le(buf, a + 4) as usize);
        if kind == 0xffff_ffff || len == 0 { break; }
        if kind == 0x30 && b(buf, a + 8) == 0 && owner < t.kind.len() && t.name_at[owner].1 == 0 {
            let v = a + u16le(buf, a + 0x14);
            let n = b(buf, v + 0x40) as usize;
            if b(buf, v + 0x41) != 2 && n > 0 && v + 0x42 + n * 2 <= buf.len() {
                t.parent[owner] = u32le(buf, v);
                t.name_at[owner] = (t.arena.len() as u32, n as u8);
                t.arena.extend((0..n).map(|k| u16le(buf, v + 0x42 + k * 2) as u16));
            }
        } else if kind == 0x80 && b(buf, a + 9) == 0 && owner < t.kind.len() {
            if b(buf, a + 8) == 0 { t.size[owner] = u32le(buf, a + 0x10) as f64; } else if u64le(buf, a + 0x10) == 0 { t.size[owner] = u64le(buf, a + 0x30) as f64; }
        }
        a += len;
    }
}
// Fills the job with the largest files and the tree; fails when the volume cannot be opened or is not NTFS.
pub fn scan(job: &Job, cancel: &AtomicBool, limit: usize) -> R<()> {
    let drive = job.root[..2].to_string();
    let mut fh = File::open(format!(r"\\.\{drive}")).ctx()?;
    let mut boot = vec![0u8; 4096];
    fh.read_exact(&mut boot).ctx()?;
    if &boot[3..7] != b"NTFS" { return Err("NTFS değil".into()); }
    let (sector, cluster, c) = (u16le(&boot, 0x0b), u16le(&boot, 0x0b) * boot[0x0d] as usize, boot[0x40] as i8);
    let rec_size = if c > 0 { c as usize * cluster } else { 1usize << (-(c as i32)) };
    let mut first = vec![0u8; rec_size.max(sector)];
    fh.seek(SeekFrom::Start(u64le(&boot, 0x30) * cluster as u64)).ctx()?;
    fh.read_exact(&mut first).ctx()?;
    if !fixup(&mut first, 0, rec_size) { return Err("$MFT okunamadı".into()); }
    let mut a = u16le(&first, 0x14);
    while u32le(&first, a) != 0x80 { let len = u32le(&first, a + 4) as usize; if len == 0 || a >= first.len() { return Err("$MFT okunamadı".into()); } a += len; }
    // ponytail: only the $MFT runs in record 0; an $MFT fragmented into an attribute list ends early.
    let count = (u64le(&first, a + 0x30) / rec_size as u64) as usize;
    let list = runs(&first, a + u16le(&first, a + 0x20));
    let mut t = Table { kind: vec![0; count], parent: vec![0; count], size: vec![0.0; count], name_at: vec![(0, 0); count], arena: Vec::new() };
    let mut buf = vec![0u8; CHUNK];
    let mut index = 0;
    *job.current.lock().unwrap() = format!(r"{drive}\$MFT");
    for (lcn, len) in list {
        let (mut pos, mut left) = (lcn * cluster as u64, len as usize * cluster);
        while left > 0 && index < count {
            if cancel.load(Relaxed) { return Ok(()); }
            let n = left.min(CHUNK);
            fh.seek(SeekFrom::Start(pos)).ctx()?;
            fh.read_exact(&mut buf[..n]).ctx()?;
            let mut o = 0;
            while o + rec_size <= n && index < count { parse(&mut buf[..n], o, rec_size, index, &mut t); o += rec_size; index += 1; }
            pos += n as u64; left -= n;
            job.scanned.store(index as u64, Relaxed);
        }
    }
    let (mut top, mut files, mut min) = (Vec::<usize>::new(), 0u64, 0f64);
    for i in 0..count {
        if t.kind[i] != 1 { continue; }
        files += 1;
        if t.size[i] > min {
            top.push(i);
            if top.len() >= limit * 2 { top.sort_by(|&x, &y| t.size[y].total_cmp(&t.size[x])); top.truncate(limit); min = t.size[*top.last().unwrap()]; }
        }
    }
    top.sort_by(|&x, &y| t.size[y].total_cmp(&t.size[x]));
    top.truncate(limit);
    let path = |i: usize| { let (mut parts, mut p) = (Vec::new(), i); for _ in 0..512 { if p == ROOT || p >= count { break; } parts.push(t.name(p).unwrap_or("?".into())); p = t.parent[p] as usize; } parts.reverse(); format!(r"{drive}\{}", parts.join("\\")) };
    let mut d = job.data.lock().unwrap();
    d.top = top.iter().map(|&i| FileHit { path: path(i), name: t.name(i), size: t.size[i] as u64, ino: i as u64, modified: None }).collect();
    trim(&mut d);
    job.scanned.store(files, Relaxed);
    d.tree = Some(build_tree(&t.parent, &|i| t.name(i).unwrap_or("?".into()), &t.size, ROOT, &format!(r"{drive}\")));
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decodes_data_runs_with_signed_offsets() {
        // run 1: 2 clusters at lcn 0x10; run 2: 3 clusters, offset -1 (0xff) => lcn 0x0f
        assert_eq!(runs(&[0x11, 0x02, 0x10, 0x11, 0x03, 0xff, 0x00], 0), [(0x10, 2), (0x0f, 3)]);
    }
    // Needs administrator rights (raw volume read); without them it only reports that it was skipped.
    #[test]
    fn scans_the_real_c_drive_mft() {
        let job = Job::new(r"C:\");
        let started = std::time::Instant::now();
        if let Err(e) = scan(&job, &AtomicBool::new(false), 100) { eprintln!("MFT skipped: {e}"); return; }
        let d = job.data.lock().unwrap();
        eprintln!("MFT: {} files, {} top, {:?}, tree={}", job.scanned.load(Relaxed), d.top.len(), started.elapsed(), d.tree.is_some());
        assert!(job.scanned.load(Relaxed) > 100_000 && d.top.len() == 100 && d.tree.is_some());
        assert!(d.top.windows(2).all(|w| w[0].size >= w[1].size));
        // The biggest entries must be real files of that size on disk (system files that deny metadata are skipped).
        let checked = d.top.iter().take(30).filter_map(|f| std::fs::metadata(&f.path).ok().map(|m| (f, m.len()))).collect::<Vec<_>>();
        eprintln!("MFT: {} of the top 30 readable; first: {:?}", checked.len(), d.top.first().map(|f| (&f.path, f.size)));
        assert!(checked.len() >= 10 && checked.iter().all(|(f, len)| f.size.abs_diff(*len) <= 4096.max(len / 100)), "{checked:?}");
    }
    #[test]
    fn scanning_a_missing_volume_fails_instead_of_panicking() {
        let job = Job::new(r"Q:\");
        assert!(scan(&job, &AtomicBool::new(false), 100).is_err());
    }
}
