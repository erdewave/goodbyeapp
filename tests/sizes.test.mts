import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { appFolder, folderSize, exeOf } from '../dist-electron/sizes.js';
import { flatpakSize } from '../dist-electron/platform.js';
import type { AppRecord } from '../dist-electron/types.js';
// Fixtures carry only the fields appFolder reads, so they are cast rather than typed in full.
const rec = (fields: object) => fields as AppRecord;

test('size folder falls back from install location to icon and uninstaller folders', { skip: process.platform !== 'win32' }, () => {
  const pf = process.env.ProgramFiles!, app = path.join(pf, 'Example App'), name = 'Example App';
  assert.equal(appFolder(rec({ installDir: app }), []), app);
  assert.equal(appFolder(rec({ name, iconSource: `"${app}\\bin\\example.exe",0` }), []), app);
  assert.equal(appFolder(rec({ name, command: `${app}\\uninstall.exe /S` }), []), app);
  assert.equal(appFolder(rec({ name, installDir: pf, command: `"${app}\\unins000.exe" /SILENT` }), []), app);
  assert.equal(appFolder(rec({ name, command: 'MsiExec.exe /X{00000000-0000-0000-0000-000000000000}' }), []), null);
  assert.equal(appFolder(rec({ name, iconSource: 'C:\\ProgramData\\Package Cache\\{x}\\setup.exe' }), []), null);
  assert.equal(appFolder(rec({ name, iconSource: `${app}\\example.exe` }), [rec({ installDir: path.join(app, 'Games') })]), null);
  assert.equal(appFolder(rec({ name: 'DeepL', iconSource: `${pf}\\Zero Install\\0install.exe` }), []), null);
  assert.equal(appFolder(rec({ name, iconSource: `${pf}\\Example App\\Installer2\\Driver.{BE1FBEE0-77EA-416C-A57D-AF2C2034D71A}\\x.exe` }), []), null);
  assert.equal(exeOf('"C:\\A B\\u.exe" /S'), 'C:\\A B\\u.exe');
});
test('folder size sums files and skips links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'goodbyeapp-size-'));
  try {
    await fs.mkdir(path.join(root, 'sub'));
    await fs.writeFile(path.join(root, 'a.bin'), Buffer.alloc(1000));
    await fs.writeFile(path.join(root, 'sub', 'b.bin'), Buffer.alloc(24));
    await fs.symlink(path.join(root, 'sub'), path.join(root, 'link'), 'junction').catch(() => {});
    assert.equal(await folderSize(root), 1024);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('flatpak sizes parse SI units and comma decimals', () => {
  assert.equal(flatpakSize('1.5 GB'), 1.5e9);
  assert.equal(flatpakSize('345,6\u00a0kB'), 345600);
  assert.equal(flatpakSize(''), 0);
});
