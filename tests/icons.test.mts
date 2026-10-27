import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App, nativeImage } from 'electron';
import { parseIconLocation, loadIcons } from '../dist-electron/icons.js';
import type { AppRecord } from '../dist-electron/types.js';

test('registered icon paths preserve quotes, commas, negative resource indices and environment variables', () => {
  assert.deepEqual(parseIconLocation('"C:\\Program Files\\App, Inc\\app.exe",-12'), { file: 'C:\\Program Files\\App, Inc\\app.exe', index: -12 });
  assert.deepEqual(parseIconLocation('C:\\Apps\\app.exe,0'), { file: 'C:\\Apps\\app.exe', index: 0 });
  assert.deepEqual(parseIconLocation('%localappdata%\\App\\app.ico', { LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' }), { file: 'C:\\Users\\Test\\AppData\\Local\\App\\app.ico', index: 0 });
});
test('icon locations cannot be remote URLs, UNC paths, commands or alternate streams', () => {
  for (const value of ['', null, '\\\\server\\app.exe', 'https://example.com/app.ico', 'cmd /c app.exe', 'C:\\Apps\\app.exe && evil', 'C:\\Apps\\app.exe:stream.ico', '\\\\?\\C:\\App.exe']) assert.equal(parseIconLocation(value), null);
});
test('missing icon metadata returns an empty map for the UI fallback', async () => {
  assert.deepEqual(await loadIcons([{ id: 'missing', name: 'Test' } as AppRecord], {} as App, {} as typeof nativeImage), {});
});
