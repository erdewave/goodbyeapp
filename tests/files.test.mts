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
test('walk builds a folder tree whose sizes add up to the scanned bytes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'goodbyeapp-tree-'));
  try {
    await fs.mkdir(path.join(root, 'big', 'inner'), { recursive: true });
    await fs.writeFile(path.join(root, 'big', 'inner', 'a.bin'), Buffer.alloc(6000));
    await fs.writeFile(path.join(root, 'small.txt'), Buffer.alloc(4000));
    const job = scanDrive(root, new AbortController().signal);
    await job.promise;
    const tree = report(job, true).tree!;
    const sum = (n: any): number => n.children ? n.children.reduce((s: number, c: any) => s + sum(c), 0) : n.value;
    assert.equal(sum(tree), 10000);
    assert.equal(tree.children!.find(c => c.label === 'big')!.children![0].label, 'inner');
    assert.equal(report(job).tree, undefined);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('small files fold into an unlabelled remainder of their folder', async () => {
  const { buildTree } = await import('../dist-electron/tree.js');
  // 0 = root, 1 = folder "Lib", 2 = big.iso, 3.. = small files folded into the remainder
  const names = ['C:', 'Lib', 'big.iso', ...Array.from({ length: 30 }, (_, i) => `a${i}.log`)];
  const parent = names.map((_, i) => i < 2 ? 0 : 1), own = names.map((_, i) => i < 2 ? 0 : i === 2 ? 1e6 : 50);
  const folder = buildTree(parent, (i: number) => names[i], own, 0, 'C:/').children!.find(c => c.label === 'Lib')!;
  const rest = folder.children!.find(c => c.label === '')!;
  assert.equal(rest.value, 1500);
  assert.ok(rest.id.endsWith('\0') && folder.children!.some(c => c.label === 'big.iso'));
});
test('a folder of many files just under the tile size keeps them as tiles instead of one big remainder', async () => {
  const { buildTree, SHARE } = await import('../dist-electron/tree.js');
  // 0 = root, 1 = folder "csgo" with 500 packs at 80% of a tile each, 2 = a huge file elsewhere setting the disk size
  const disk = 1e9, pack = disk * SHARE * 0.8, names = ['C:', 'csgo', 'big.iso', ...Array.from({ length: 500 }, (_, i) => `pak${i}.vpk`)];
  const parent = names.map((_, i) => i < 3 ? 0 : 1), own = names.map((_, i) => i < 2 ? 0 : i === 2 ? disk - 500 * pack : pack);
  const csgo = buildTree(parent, (i: number) => names[i], own, 0, 'C:/').children!.find(c => c.label === 'csgo')!;
  const rest = csgo.children!.find(c => c.label === '')?.value ?? 0;
  assert.ok(csgo.children!.length > 400 && rest < disk * SHARE, `${csgo.children!.length} tiles, remainder ${rest}`);
});
