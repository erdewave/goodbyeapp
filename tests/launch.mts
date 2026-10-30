// CI launch check for a packaged build: starts the app and fails when it dies or the page reports errors.
// Unlike ui-smoke.mts it assumes nothing about the installed apps, so it runs on any CI runner.
// Windows: WebView2 takes a debugging port, so Playwright can open each tab. macOS and Linux have no such port
// (WKWebView, WebKitGTK), so there the check is that the process stays up and writes its start line to the log.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executable = process.env.GOODBYEAPP_EXECUTABLE;
assert.ok(executable, 'GOODBYEAPP_EXECUTABLE is not set');
const port = 9222, windows = process.platform === 'win32';
const child = spawn(executable, [], { stdio: 'ignore', env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } });
let exited: string | null = null;
child.on('exit', (code, signal) => { exited = `code=${code} signal=${signal}`; });
const logFile = path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : windows ? process.env.APPDATA! : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'GoodbyeAPP/logs/app.log');
try {
  if (windows) {
    // The debugging port opens a moment after the window does.
    const browser = await (async () => { for (let i = 0; i < 60; i++) { try { return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 }); } catch { await new Promise(r => setTimeout(r, 1000)); } } throw new Error('WebView2 debugging port did not open'); })();
    const page = browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(60000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => { const n = document.querySelector('#nav-count'); return n && n.textContent !== '—'; });
    for (const view of ['files', 'settings', 'apps']) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator(`#${view}-view`).waitFor({ state: 'visible' });
    }
    const dir = path.join(import.meta.dirname, '../artifacts');
    await fs.mkdir(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `launch-${process.platform}-${process.arch}.png`) });
    assert.deepEqual(errors, []);
  } else {
    await new Promise(r => setTimeout(r, 15000));
    assert.equal(exited, null, `app exited: ${exited}`);
    assert.match(await fs.readFile(logFile, 'utf8'), / start v/);
  }
  console.log(`launch ok: ${process.platform}/${process.arch}`);
} catch (e) {
  console.error(e, exited ? `app exited: ${exited}` : '');
  process.exitCode = 1;
} finally {
  // A quit that never finishes would keep node alive after the check passed; kill the app instead.
  child.kill('SIGKILL');
  process.exit(process.exitCode ?? 0);
}
