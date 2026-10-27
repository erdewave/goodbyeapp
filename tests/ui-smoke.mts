import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
// Flags the test sets inside the Electron main process through instance.evaluate.
declare global { var __uninstallCalls: number; var __cleanCalls: number; var __closeObserved: boolean; }
const __dirname = import.meta.dirname;
(async () => {
  const env = { ...process.env } as Record<string, string>; delete env.ELECTRON_RUN_AS_NODE; // OS environment values are always strings
  const executablePath = process.env.GOODBYEAPP_EXECUTABLE;
  const instance = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: executablePath ? ['--disable-gpu', '--lang=tr'] : ['.', '--disable-gpu', '--lang=tr'], env });
  try {
    const page = await instance.firstWindow();
    page.setDefaultTimeout(15000);
    const errors: string[] = []; page.on('pageerror', e => { errors.push(e.message); console.error('Renderer:', e.message); });
    await page.waitForFunction(() => { const el = document.querySelector('#nav-count'); return el && el.textContent !== '—'; });
    assert.ok(await page.locator('button').count() > 5);
    assert.ok(Number(await page.locator('#nav-count').textContent()) > 0);
    await expect.poll(() => page.locator('#app-list img').count(), { timeout: 30000 }).toBeGreaterThan(0);
    assert.equal(await page.locator('#app-list img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/png;base64,')), true);
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true');
    await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
    const tooltip = async (name: string) => {
      // Right after a reload the titlebar's drag regions are rebuilt and can swallow the first hover.
      await expect(async () => { await page.mouse.move(0, 300); await page.locator('#window-close').hover(); await expect(page.getByRole('tooltip')).toHaveText('Kapat', { timeout: 1000 }); await expect(page.locator('#window-close')).toHaveAttribute('aria-describedby', /.+/, { timeout: 1000 }); }).toPass();
      const box = await page.getByRole('tooltip').evaluate(el => { const r = el.getBoundingClientRect(); return [r.left, r.right, innerWidth]; });
      assert.ok(box[0] >= 0 && box[1] <= box[2], `tooltip taşıyor: ${box}`);
      await page.screenshot({ path: path.join(__dirname, `../artifacts/tooltip-${name}.png`) });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    };
    await page.evaluate(() => localStorage.setItem('theme', 'light')); await page.reload(); await page.waitForFunction(() => document.querySelector('#nav-count')?.textContent !== '—' && document.body.getAttribute('aria-busy') === 'false');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, '../artifacts/light.png') });
    await tooltip('light');
    await page.locator('#window-minimize').focus();
    await expect(page.getByRole('tooltip')).toHaveText('Küçült');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.locator('[data-sort="size"]').click();
    await expect(page.locator('th:has([data-sort="size"])')).toHaveAttribute('aria-sort', 'ascending');
    await page.locator('[data-sort="size"]').click();
    await expect(page.locator('th:has([data-sort="size"])')).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('#window-maximize')).toHaveAttribute('aria-label', 'Pencereyi büyüt');
    await page.locator('#search-button').click();
    await page.getByRole('combobox').fill('zzzz-no-application');
    await expect(page.getByText('Sonuç bulunamadı.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await page.locator('[data-app]').first().click();
    await page.locator('[data-slot=delete-button][data-state=open]').getByRole('button', { name: 'Vazgeç' }).click();
    await expect(page.locator('[data-slot=delete-button][data-state=open]')).toHaveCount(0);
    assert.equal(await instance.evaluate(() => globalThis.__uninstallCalls ?? 0), 0);
    await page.evaluate(() => localStorage.setItem('theme', 'dark')); await page.reload(); await page.waitForFunction(() => document.querySelector('#nav-count')?.textContent !== '—' && document.body.getAttribute('aria-busy') === 'false');
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, '../artifacts/dark.png') });
    await tooltip('dark');
    await page.locator('[data-view="settings"]').click();
    assert.equal(await page.locator('#settings-view').isVisible(), true);
    await page.locator('[data-accent="green"]').click();
    await page.reload();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() === '#5fcf8f');
    await page.evaluate(() => localStorage.setItem('accent', 'purple'));
    await page.waitForFunction(() => document.querySelector('#nav-count')?.textContent !== '—' && document.body.getAttribute('aria-busy') === 'false');
    assert.deepEqual(errors, []);
    // Replace IPC handlers inside this test process only. No real uninstall or cleanup.
    await instance.evaluate(({ ipcMain }) => {
      const fixture = { id: 'fixture', name: 'Test Uygulaması', publisher: 'Test', version: '1.0', source: 'Test', size: 1024 };
      let removed = false;
      globalThis.__uninstallCalls = 0; globalThis.__cleanCalls = 0;
      for (const name of ['load', 'icons', 'scan', 'uninstall', 'clean']) ipcMain.removeHandler(name);
      // The icon is only readable before uninstall, like a real app whose files are gone afterwards.
      ipcMain.handle('icons', () => removed ? {} : { fixture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
      ipcMain.handle('load', () => ({ platform: 'win32', apps: [{ ...fixture, removed }] }));
      ipcMain.handle('scan', () => [{ id: 'fixture-file', kind: 'file', path: 'C:\\TestFixture\\Test Uygulaması', size: 1024, reason: 'Test verisi' }]);
      ipcMain.handle('uninstall', () => { globalThis.__uninstallCalls++; removed = true; return {}; });
      ipcMain.handle('clean', (_event, id, selected) => {
        if (id !== 'fixture' || selected.length !== 1 || selected[0] !== 'fixture-file') throw new Error('Yanlış temizlik seçimi');
        globalThis.__cleanCalls++;
        return { results: [{ path: 'test', ok: true }] };
      });
    });
    await page.reload();
    await page.locator('[data-app="fixture"]').click();
    await page.locator('[data-slot=delete-button]:has([data-app="fixture"])').getByRole('button', { name: 'Kaldırmayı onayla' }).click();
    await page.locator('#next').waitFor();
    await expect(page.getByText('1 kalıntı bulundu')).toBeVisible();
    await page.locator('#close-detail').click();
    await expect(page.locator('#detail')).toHaveCount(0);
    await page.getByRole('button', { name: 'İncele' }).click();
    await page.locator('#next').waitFor();
    await expect(page.locator('#detail-icon img')).toHaveCount(1);
    await expect(page.locator('#step-body')).toContainText('Kayıt defterinde kalıntı bulunamadı');
    await page.locator('#next').click();
    await expect(page.locator('#clean')).toHaveAccessibleName('Seçilenleri temizle');
    await page.locator('#select-all').click();
    await expect(page.locator('#candidate-fixture-file')).toBeChecked();
    await page.locator('#clean').click();
    await expect(page.locator('#summary')).toContainText('1 öğe temizlendi');
    await page.locator('#finish').click();
    await expect(page.locator('#detail')).not.toBeVisible();
    await expect(page.getByText('Kaldırıldı · 1 öğe temizlendi')).toBeVisible();
    assert.equal(await instance.evaluate(() => globalThis.__uninstallCalls), 1);
    await page.waitForFunction(() => document.body.getAttribute('aria-busy') === 'false');
    // Observe the real close event without ending the test runner's window.
    await instance.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].once('close', e => { e.preventDefault(); globalThis.__closeObserved = true; }); });
    await page.locator('#window-close').click();
    await expect.poll(() => instance.evaluate(() => globalThis.__closeObserved)).toBe(true);
    assert.deepEqual(errors, []);
    console.log('Titlebar: loaded');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('#apps-view').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    assert.equal(await page.locator('#titlebar').evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-app-region')), 'drag');
    assert.equal(await page.locator('#window-maximize').evaluate(el => getComputedStyle(el).getPropertyValue('-webkit-app-region')), 'no-drag');
    await page.locator('#window-maximize').click();
    await expect.poll(() => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await expect(page.locator('#window-maximize')).toHaveAttribute('aria-pressed', 'true');
    console.log('Titlebar: maximized');
    await page.locator('#window-maximize').click();
    await expect.poll(() => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(false);
    console.log('Titlebar: restored');
    await page.locator('#window-minimize').click();
    await expect.poll(() => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
    console.log('Titlebar: minimized');
    await instance.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.restore(); w.focus(); });
    await expect.poll(() => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
    console.log('PASS: gerçek envanter, arama, kalıntı inceleme, açık/koyu tema, ayarlar, adım adım kaldırma, kalıcı tema; renderer hatası yok.');
  } finally { await instance.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {}); await instance.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });



