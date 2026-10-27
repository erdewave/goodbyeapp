import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanDrive, report, LIMIT } from '../dist-electron/files.js';
import { runs } from '../dist-electron/mft.js';
test('MFT data runs decode lengths and signed relative offsets', () => {
  // len 0x18 at lcn 0x5634, then len 0x10 at 16 clusters back, then a sparse run (skipped)
  assert.deepEqual(runs(Buffer.from([0x21, 0x18, 0x34, 0x56, 0x11, 0x10, 0xf0, 0x01, 0x05, 0x00]), 0), [[0x5634, 0x18], [0x5624, 0x10]]);
});
test('scan keeps the largest files in order, recurses and counts hard links once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'goodbyeapp-files-'));
  try {
    await fs.mkdir(path.join(root, 'a', 'b'), { recursive: true });
    for (let i = 0; i < LIMIT + 20; i++) await fs.writeFile(path.join(root, i % 2 ? 'a' : 'a/b', 'f' + i), Buffer.alloc(i + 1));
    await fs.link(path.join(root, 'a', 'f' + (LIMIT + 19)), path.join(root, 'link'));
    const job = scanDrive(root, new AbortController().signal);
    await job.promise;
    const r = report(job);
    assert.equal(r.done, true);
    assert.equal(r.scanned, LIMIT + 21);
    assert.equal(r.files.length, LIMIT);
    assert.equal(r.files[0].size, LIMIT + 20);
    assert.notEqual(r.files[1].size, LIMIT + 20);
    assert.deepEqual(r.files.map(f => f.size), [...r.files.map(f => f.size)].sort((a, b) => b - a));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
