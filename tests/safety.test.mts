import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { safeName, contained, validatePath, cleanItem, registryKeyOk, installDirOk, elevatedOk, cleanElevated } from '../dist-electron/platform.js';
import type { AppRecord, Item } from '../dist-electron/types.js';
// Fixtures are partial or deliberately invalid records, so they are cast rather than typed in full.
const rec = (fields: object) => fields as AppRecord, item = (fields: object) => fields as Item;
test('shared names and traversal cannot become cleanup candidates', () => {
  for (const name of ['..', '../escape', 'Windows', 'Microsoft', 'Software', 'a/b', 'a\\b', 'C:', '']) assert.equal(safeName(name), false, name);
  assert.equal(safeName('Example App'), true);
  assert.equal(safeName('org.example.App'), true);
});
test('containment rejects roots, siblings and traversal', () => {
  const root = path.resolve('sandbox');
  assert.equal(contained(root, root), false);
  assert.equal(contained(root, root + '-other'), false);
  assert.equal(contained(root, path.join(root, '..', 'other')), false);
  assert.equal(contained(root, path.join(root, 'App')), true);
});
test('cleanup permanently deletes validated direct children without following links inside', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'goodbyeapp-test-')), outside = root + '-outside';
  const target = path.join(root, 'Example App');
  await fs.mkdir(path.join(target, 'sub'), { recursive: true });
  await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'keep.txt'), 'x');
  await fs.symlink(outside, path.join(target, 'sub', 'link'), 'junction');
  try {
    await validatePath(root, target);
    await assert.rejects(validatePath(root, root));
    await assert.rejects(validatePath(root, path.join(target, 'nested')));
    await cleanItem(item({ kind: 'file', path: target, root }), '');
    await assert.rejects(fs.access(target));
    await fs.access(path.join(outside, 'keep.txt'));
    await assert.rejects(cleanItem(item({ kind: 'registry', path: 'HKCU\\Software' }), ''));
    await assert.rejects(cleanItem(item({ kind: 'registry', path: 'HKLM\\SOFTWARE\\Microsoft\\Windows' }), ''));
    await assert.rejects(cleanItem(item({ kind: 'registry', path: 'HKCU\\Software\\Microsoft' }), ''));
  } finally { await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }); }
});
test('registry candidates stay under Software\\<Name> or Software\\<Publisher>\\<Name>', () => {
  for (const key of ['HKCU\\Software\\Example App', 'HKLM\\SOFTWARE\\Example App', 'HKLM\\SOFTWARE\\WOW6432Node\\Vendor\\Example App']) assert.equal(registryKeyOk(key), true, key);
  for (const key of ['HKCU\\Software', 'HKLM\\SOFTWARE\\WOW6432Node', 'HKLM\\SOFTWARE\\Classes\\Example', 'HKLM\\SOFTWARE\\Microsoft\\Windows', 'HKLM\\SOFTWARE\\Policies\\Example', 'HKLM\\SYSTEM\\Example', 'HKLM\\SOFTWARE\\a\\b\\Example', 'HKCU\\Software\\..']) assert.equal(registryKeyOk(key), false, key);
});
test('install folder must sit inside an install base and not be shared', () => {
  const base = path.resolve('PF'), saved = process.env.ProgramFiles;
  process.env.ProgramFiles = base;
  try {
    assert.equal(installDirOk(path.join(base, 'Example App'), []), true);
    assert.equal(installDirOk(base, []), false);
    assert.equal(installDirOk(path.join(base, 'Common Files'), []), false);
    assert.equal(installDirOk(path.resolve('elsewhere', 'Example App'), []), false);
    assert.equal(installDirOk(path.join(base, 'Vendor'), [rec({ installDir: path.join(base, 'Vendor', 'Other') })]), false);
    assert.equal(installDirOk(path.join(base, 'Vendor', 'Example App'), [rec({ installDir: path.join(base, 'Vendor') })]), false);
  } finally { process.env.ProgramFiles = saved; }
});
test('elevated cleanup re-validates plan items and never elevates rejected ones', async () => {
  const keys = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA', 'APPDATA'], saved = keys.map(k => process.env[k]);
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'goodbyeapp-pf-')), other = await fs.mkdtemp(path.join(os.tmpdir(), 'goodbyeapp-other-'));
  Object.assign(process.env, { ProgramFiles: base, LOCALAPPDATA: path.resolve('nowhere'), APPDATA: path.resolve('nowhere') });
  delete process.env['ProgramFiles(x86)'];
  const app = rec({ name: 'Example App' });
  try {
    await fs.mkdir(path.join(base, 'Example App'));
    await fs.mkdir(path.join(other, 'Example App'));
    await fs.symlink(other, path.join(base, 'Linked'), 'junction');
    await elevatedOk(item({ kind: 'file', root: base, path: path.join(base, 'Example App') }), app, []);
    await elevatedOk(item({ kind: 'registry', path: 'HKLM\\SOFTWARE\\Example App' }), app, []);
    await assert.rejects(elevatedOk(item({ kind: 'file', root: other, path: path.join(other, 'Example App') }), app, []));
    await assert.rejects(elevatedOk(item({ kind: 'file', root: base, path: path.join(base, 'Example App', 'nested') }), app, []));
    await assert.rejects(elevatedOk(item({ kind: 'file', root: base, path: path.join(base, 'Linked') }), app, []));
    await assert.rejects(elevatedOk(item({ kind: 'registry', path: 'HKLM\\SOFTWARE\\Microsoft' }), app, []));
    await assert.rejects(elevatedOk(item({ kind: 'script', path: path.join(base, 'Example App'), root: base }), app, []));
    // Only rejected items: results come back without any UAC prompt.
    const results = await cleanElevated([item({ kind: 'registry', path: 'HKLM\\SOFTWARE\\Classes\\GoodbyeAppTestMissing' }), item({ kind: 'file', root: other, path: path.join(other, 'Example App') })], app, [], path.join(other, 'backups'));
    assert.deepEqual(results.map(r => r.ok), [false, false]);
  } finally {
    keys.forEach((k, i) => saved[i] === undefined ? delete process.env[k] : process.env[k] = saved[i]);
    await fs.rm(base, { recursive: true }); await fs.rm(other, { recursive: true });
  }
});
