// CI launch check for a packaged build: starts the app, opens each tab and fails on renderer errors.
// Unlike ui-smoke.mts it assumes nothing about the installed apps, so it runs on any CI runner.
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const executablePath = process.env.GOODBYEAPP_EXECUTABLE;
assert.ok(executablePath, 'GOODBYEAPP_EXECUTABLE is not set');
const env = { ...process.env } as Record<string, string>; delete env.ELECTRON_RUN_AS_NODE; env.ELECTRON_ENABLE_LOGGING = '1';
const app = await electron.launch({ executablePath, args: ['--disable-gpu', '--no-sandbox', '--lang=en'], env });
app.process().on('exit', (code, signal) => console.error(`app exited: code=${code} signal=${signal}`));
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => console.error('page:', m.text()));
  await page.waitForFunction(() => { const n = document.querySelector('#nav-count'); return n && n.textContent !== '—'; }).catch(async e => { console.error('page text:', await page.locator('body').innerText().catch(() => '(page gone)')); throw e; });
  for (const view of ['files', 'settings', 'apps']) {
    await page.locator(`[data-view="${view}"]`).click();
    await page.locator(`#${view}-view`).waitFor({ state: 'visible' });
  }
  const dir = path.join(import.meta.dirname, '../artifacts');
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `launch-${process.platform}-${process.arch}.png`) });
  assert.deepEqual(errors, []);
  console.log(`launch ok: ${process.platform}/${process.arch}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  // A quit that never finishes (seen on macos-15-intel) would keep node alive after the check passed; kill the app instead.
  const quit = await Promise.race([app.close().then(() => true), new Promise<boolean>(r => setTimeout(r, 15000, false))]);
  if (!quit) { console.error('app did not quit in 15s, killing it'); app.process().kill('SIGKILL'); }
  process.exit(process.exitCode ?? 0);
}
