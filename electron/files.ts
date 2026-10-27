import fs from 'node:fs/promises';
import path from 'node:path';
import { ps } from './platform';
import * as mft from './mft';
import type { Job } from './types';
export const LIMIT = 100;
const PARALLEL = 16;
// Virtual / duplicate trees on macOS and Linux.
const skip = new Set(['/proc', '/sys', '/dev', '/run', '/System/Volumes']);
export async function listDrives() {
  if (process.platform === 'win32') {
    const disks: { DeviceID: string; VolumeName?: string; Size: number; FreeSpace: number }[] = JSON.parse(await ps("ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -in 2,3 -and $_.Size } | Select-Object DeviceID,VolumeName,Size,FreeSpace)") || '[]');
    return disks.map(d => ({ root: d.DeviceID + '\\', label: d.VolumeName || 'Yerel Disk', total: d.Size, free: d.FreeSpace }));
  }
  const s = await fs.statfs('/');
  return [{ root: '/', label: 'Sistem diski', total: s.blocks * s.bsize, free: s.bavail * s.bsize }];
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
  await Promise.all(entries.map(async entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skip.has(full)) queue.push(full); return; }
    if (!entry.isFile()) return; // symlinks and junctions are skipped, so no loops
    const stat = await fs.lstat(full).catch(() => null);
    if (!stat) return;
    job.scanned++;
    if (stat.size > job.min) { job.top.push({ path: full, name: entry.name, size: stat.size, ino: stat.ino, modified: stat.mtimeMs }); if (job.top.length >= LIMIT * 2) trim(job); }
  }));
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
  job.promise = fast.catch(() => { Object.assign(job, { mode: 'walk', scanned: 0, current: root, top: [], min: 0 }); return walk(job, signal); })
    .then(() => { job.done = true; trim(job); return job; });
  return job;
}
export const report = (job: Job) => { trim(job); return { root: job.root, scanned: job.scanned, current: job.current, done: job.done, mode: job.mode, files: job.top }; };
