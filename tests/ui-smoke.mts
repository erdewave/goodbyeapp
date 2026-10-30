// Windows UI smoke test: starts the app with a WebView2 debugging port and walks the real window with Playwright.
// It only reads and cancels; nothing is uninstalled or cleaned. Run it on a machine with installed apps.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const __dirname = import.meta.dirname, port = 9223;
const executable = process.env.GOODBYEAPP_EXECUTABLE ?? path.join(__dirname, '../src-tauri/target/debug/goodbyeapp.exe');
const child = spawn(executable, [], { stdio: 'ignore', env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --lang=tr` } });
(async () => {
  try {
    // The debugging port opens a moment after the window does.
    const browser = await (async () => { for (let i = 0; i < 60; i++) { try { return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 }); } catch { await new Promise(r => setTimeout(r, 1000)); } } throw new Error('WebView2 debugging port did not open'); })();
    const page = browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(15000);
    const errors: string[] = []; page.on('pageerror', e => { errors.push(e.message); console.error('Renderer:', e.message); });
    const ready = () => page.waitForFunction(() => document.querySelector('#nav-count')?.textContent !== '—' && document.body.getAttribute('aria-busy') === 'false');
    await ready();
    assert.ok(await page.locator('button').count() > 5);
    assert.ok(Number(await page.locator('#nav-count').textContent()) > 0);
    await expect.poll(() => page.locator('#app-list img').count(), { timeout: 30000 }).toBeGreaterThan(0);
    assert.equal(await page.locator('#app-list img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/png;base64,')), true);
    await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => localStorage.setItem('theme', t), theme); await page.reload(); await ready();
      await page.waitForFunction(t => document.documentElement.classList.contains('dark') === (t === 'dark'), theme);
      await page.screenshot({ path: path.join(__dirname, `../artifacts/${theme}.png`) });
      await expect(async () => { await page.mouse.move(0, 300); await page.locator('#window-close').hover(); await expect(page.getByRole('tooltip')).toHaveText('Kapat', { timeout: 1000 }); }).toPass();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-sort="size"]').click();
    await expect(page.locator('th:has([data-sort="size"])')).toHaveAttribute('aria-sort', 'ascending');
    await page.locator('#search-button').click();
    await page.getByRole('combobox').fill('zzzz-no-application');
    await expect(page.getByText('Sonuç bulunamadı.')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('[data-app]').first().click();
    await page.locator('[data-slot=delete-button][data-state=open]').getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.locator('[data-slot=delete-button][data-state=open]')).toHaveCount(0);
    await page.locator('[data-view="settings"]').click();
    await page.locator('[data-accent="green"]').click();
    await page.reload();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() === '#5fcf8f');
    await page.evaluate(() => localStorage.setItem('accent', 'blue'));
    await page.locator('[data-view="health"]').click();
    await expect(page.locator('#health-view')).toBeVisible();
    // Title bar: the Rust window events reach the buttons.
    assert.equal(await page.locator('#titlebar').getAttribute('data-tauri-drag-region') !== null, true);
    await page.locator('#window-maximize').click();
    await expect(page.locator('#window-maximize')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#window-maximize').click();
    await expect(page.locator('#window-maximize')).toHaveAttribute('aria-pressed', 'false');
    assert.deepEqual(errors, []);
    console.log('PASS: gerçek envanter, ikonlar, arama, tema, ayarlar, sağlık sekmesi, başlık çubuğu; renderer hatası yok.');
  } catch (e) { console.error(e); process.exitCode = 1; }
  finally { child.kill('SIGKILL'); process.exit(process.exitCode ?? 0); }
})();
