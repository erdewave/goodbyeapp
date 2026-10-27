import fs from 'node:fs/promises';
import path from 'node:path';
import { ps } from './platform';
import * as mft from './mft';
import { buildTree, SHARE } from './tree';
import type { Job } from './types';
export const LIMIT = 100;
const PARALLEL = 16;
// Virtual / duplicate trees on macOS and Linux.
const skip = new Set(['/proc', '/sys', '/dev', '/run', '/System/Volumes']);
export async function listDrives() {
  if (process.platform === 'win32') {
    const disks: { DeviceID: string; VolumeName?: string; Size: number; FreeSpace: number }[] = JSON.parse(await ps("ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -in 2,3 -and $_.Size } | Select-Object DeviceID,VolumeName,Size,FreeSpace)") || '[]');
    return disks.map(d => ({ root: d.DeviceID + '\\', label: d.VolumeName || '', total: d.Size, free: d.FreeSpace }));
  }
  const s = await fs.statfs('/');
  return [{ root: '/', label: '', total: s.blocks * s.bsize, free: s.bavail * s.bsize }];
}
// Keeps only the largest files; hard links (same inode) count once.
function trim(job: Job) {
  const seen = new Set();
  job.top = job.top.sort((a, b) => b.size - a.size).filter(f => { const key = f.ino + ':' + f.size; if (!f.ino || !seen.has(key)) { seen.add(key); return true; } return false; }).slice(0, LIMIT);
  job.min = job.top.length === LIMIT ? job.top.at(-1)!.size : 0;
}
async function visit(job: Job, dir: string, queue: string[]) {
  job.current = dir;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let bytes = 0;
  await Promise.all(entries.map(async entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(full)) queue.push(full); return; }
    if (!entry.isFile()) return; // symlinks and junctions are skipped, so no loops
    const stat = await fs.lstat(full).catch(() => null);
    if (!stat) return;
    job.scanned++; bytes += stat.size;
    if (stat.size >= job.floor!) job.big!.push({ path: full, size: stat.size, ino: stat.ino });
    if (stat.size > job.min) { job.top.push({ path: full, name: entry.name, size: stat.size, ino: stat.ino, modified: stat.mtimeMs }); if (job.top.length >= LIMIT * 2) trim(job); }
  }));
  job.own!.set(dir, bytes);
}
// Treemap from the walk: folder totals, with every file big enough to be a tile split out on its own.
function walkTree(job: Job) {
  const own = new Map(job.own);
  for (const f of job.big!) own.set(path.dirname(f.path), (own.get(path.dirname(f.path)) || 0) - f.size);
  const keys = [...own.keys(), ...job.big!.map(f => f.path)], index = new Map(keys.map((k, i) => [k, i])), root = index.get(job.root) ?? 0;
  return buildTree(keys.map(k => index.get(path.dirname(k)) ?? root), i => path.basename(keys[i]), [...own.values(), ...job.big!.map(f => f.size)], root, job.root);
}
// Folder-by-folder walk: works everywhere without special rights, but stats every file.
function walk(job: Job, signal: AbortSignal) {
  const queue = [job.root];
  let active = 0;
  return new Promise<void>(resolve => {
    const next = () => {
      while (!signal.aborted && active < PARALLEL && queue.length) { active++; visit(job, queue.pop()!, queue).finally(() => { active--; next(); }); }
      if (!active && (signal.aborted || !queue.length)) resolve();
    };
    next();
  });
}
// NTFS volumes are read from the MFT when the app runs as administrator; anything else falls back to the walk.
export function scanDrive(root: string, signal: AbortSignal) {
  const job: Job = { root, scanned: 0, current: root, done: false, top: [], min: 0, mode: 'mft' };
  const fast: Promise<unknown> = process.platform === 'win32' && /^[a-z]:\\$/i.test(root) ? mft.scan(job, signal, LIMIT) : Promise.reject(new Error('NTFS yok'));
  // The tile floor comes from the volume's used space, so at most ~1/SHARE files are kept for the tree.
  job.promise = fast.catch(async () => {
    const s = await fs.statfs(root).catch(() => null);
    Object.assign(job, { mode: 'walk', scanned: 0, current: root, top: [], min: 0, own: new Map(), big: [], floor: s ? (s.blocks - s.bfree) * s.bsize * SHARE : Infinity });
    await walk(job, signal);
    trim(job); job.tree = walkTree(job); job.own = job.big = undefined;
  })
    .then(() => { job.done = true; trim(job); return job; });
  return job;
}
// The tree goes out only with the final result, not with every progress snapshot.
export const report = (job: Job, tree = false) => { trim(job); return { root: job.root, scanned: job.scanned, current: job.current, done: job.done, mode: job.mode, files: job.top, tree: tree ? job.tree : undefined }; };
