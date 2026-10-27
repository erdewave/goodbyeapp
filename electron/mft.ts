// Reads the NTFS Master File Table straight from the volume (needs administrator rights).
// Written from the public NTFS on-disk format: boot sector, FILE records, $FILE_NAME (0x30), $DATA (0x80).
import fs from 'node:fs/promises';
import type { Job } from './types';
type Table = { kind: Uint8Array; parent: Uint32Array; size: Float64Array; name: (string | undefined)[] };
const CHUNK = 8 * 1024 * 1024, ROOT = 5;
const u64 = (buf: Buffer, at: number) => buf.readUInt32LE(at) + buf.readUInt32LE(at + 4) * 2 ** 32;
// Decodes a data-run list into [lcn, clusterCount] pairs; offsets are signed and relative.
export function runs(buf: Buffer, at: number) {
  const out: [number, number][] = []; let lcn = 0;
  while (buf[at]) {
    const lenSize = buf[at] & 15, offSize = buf[at] >> 4; at++;
    let len = 0, delta = 0;
    for (let i = lenSize - 1; i >= 0; i--) len = len * 256 + buf[at + i];
    at += lenSize;
    for (let i = offSize - 1; i >= 0; i--) delta = delta * 256 + buf[at + i];
    if (offSize && buf[at + offSize - 1] & 0x80) delta -= 2 ** (8 * offSize);
    at += offSize;
    if (offSize) { lcn += delta; out.push([lcn, len]); }
  }
  return out;
}
// Applies the update-sequence fixup (NTFS stride is 512 bytes); returns false for torn or non-FILE records.
function fixup(buf: Buffer, at: number, recSize: number, sector = 512) {
  if (buf.readUInt32LE(at) !== 0x454c4946) return false;
  const usa = at + buf.readUInt16LE(at + 4), n = buf.readUInt16LE(at + 6);
  for (let i = 1; i < n && i * sector <= recSize; i++) {
    const end = at + i * sector - 2;
    if (buf[end] !== buf[usa] || buf[end + 1] !== buf[usa + 1]) return false;
    buf[end] = buf[usa + i * 2]; buf[end + 1] = buf[usa + i * 2 + 1];
  }
  return true;
}
function parse(buf: Buffer, at: number, recSize: number, index: number, t: Table) {
  if (!fixup(buf, at, recSize)) return;
  const flags = buf.readUInt16LE(at + 0x16);
  if (!(flags & 1)) return;
  const base = buf.readUInt32LE(at + 0x20), owner = base || index;
  if (!base) t.kind[index] = flags & 2 ? 2 : 1;
  for (let a = at + buf.readUInt16LE(at + 0x14); a + 24 <= at + recSize;) {
    const type = buf.readUInt32LE(a), len = buf.readUInt32LE(a + 4);
    if (type === 0xffffffff || !len) break;
    if (type === 0x30 && !buf[a + 8] && owner < t.kind.length && t.name[owner] === undefined) {
      const v = a + buf.readUInt16LE(a + 0x14);
      if (buf[v + 0x41] !== 2) { t.parent[owner] = buf.readUInt32LE(v); t.name[owner] = buf.toString('utf16le', v + 0x42, v + 0x42 + buf[v + 0x40] * 2); }
    } else if (type === 0x80 && !buf[a + 9] && owner < t.kind.length) {
      if (!buf[a + 8]) t.size[owner] = buf.readUInt32LE(a + 0x10);
      else if (!u64(buf, a + 0x10)) t.size[owner] = u64(buf, a + 0x30);
    }
    a += len;
  }
}
// Fills job.top with the largest files; throws when the volume cannot be opened or is not NTFS.
export async function scan(job: Job, signal: AbortSignal, limit: number) {
  const drive = job.root.slice(0, 2), fh = await fs.open('\\\\.\\' + drive, 'r');
  try {
    const boot = Buffer.alloc(4096); await fh.read(boot, 0, 4096, 0);
    if (boot.toString('ascii', 3, 7) !== 'NTFS') throw new Error('NTFS değil');
    const sector = boot.readUInt16LE(0x0b), cluster = sector * boot[0x0d], c = boot.readInt8(0x40);
    const recSize = c > 0 ? c * cluster : 2 ** -c, first = Buffer.alloc(Math.max(recSize, sector));
    await fh.read(first, 0, first.length, u64(boot, 0x30) * cluster);
    if (!fixup(first, 0, recSize)) throw new Error('$MFT okunamadı');
    let a = first.readUInt16LE(0x14);
    while (first.readUInt32LE(a) !== 0x80) a += first.readUInt32LE(a + 4);
    // ponytail: only the $MFT runs in record 0; an $MFT fragmented into an attribute list ends early.
    const count = Math.floor(u64(first, a + 0x30) / recSize), list = runs(first, a + first.readUInt16LE(a + 0x20));
    const t: Table = { kind: new Uint8Array(count), parent: new Uint32Array(count), size: new Float64Array(count), name: new Array(count) };
    const buf = Buffer.alloc(CHUNK);
    let index = 0;
    job.current = drive + '\\$MFT';
    for (const [lcn, len] of list) {
      for (let pos = lcn * cluster, left = len * cluster; left > 0 && index < count; ) {
        if (signal.aborted) return;
        const n = Math.min(CHUNK, left);
        await fh.read(buf, 0, n, pos);
        for (let o = 0; o + recSize <= n && index < count; o += recSize, index++) parse(buf, o, recSize, index, t);
        pos += n; left -= n; job.scanned = index;
      }
    }
    const top: number[] = []; let files = 0, min = 0;
    for (let i = 0; i < count; i++) {
      if (t.kind[i] !== 1) continue;
      files++;
      if (t.size[i] > min) { top.push(i); if (top.length >= limit * 2) { top.sort((x, y) => t.size[y] - t.size[x]).length = limit; min = t.size[top.at(-1)!]; } }
    }
    top.sort((x, y) => t.size[y] - t.size[x]).splice(limit);
    const path = (i: number) => { const parts = []; for (let p = i, depth = 0; p !== ROOT && depth < 512; p = t.parent[p], depth++) parts.unshift(t.name[p] ?? '?'); return drive + '\\' + parts.join('\\'); };
    job.top = top.map(i => ({ path: path(i), name: t.name[i], size: t.size[i], ino: i }));
    job.scanned = files;
  } finally { await fh.close(); }
}
