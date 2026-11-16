import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import assert from 'node:assert/strict';

const server = await preview({ preview: { port: 4187, strictPort: true } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    const state = window as any;
    state.fileCalls = 0;
    state.fileCount = 10000;
    const item = () => ({ id: 'test', group: 'system', category: 'temp', kind: 'files', path: 'C:\\test', count: state.fileCount, size: 100000, on: true });
    state.goodbyeapp = new Proxy({
      load: async () => ({ apps: [], platform: 'win32', version: 'test' }),
      icons: async () => ({}), sizes: async () => ({}), drives: async () => [], scanFiles: async () => [],
      healthScan: async () => [item()],
      healthWebSearch: async (id: string, path: string) => { state.webSearch = { id, path }; },
      healthFiles: () => { state.fileCalls++; return new Promise(resolve => { state.finishFiles = () => resolve(Array.from({ length: state.fileCount }, (_, n) => ['C:\\test\\' + String(n).padStart(5, '0') + '-' + 'long-name-'.repeat(30) + '.tmp', 10])); }); },
    }, { get: (obj, key) => key in obj ? obj[key as keyof typeof obj] : String(key).startsWith('on') ? () => () => {} : async () => null });
  });
  await page.goto('http://localhost:4187');
  await page.locator('[data-view="health"]').click();
  await page.locator('#health-scan').click();
  await page.locator('[data-group="system"] > div').first().click();
  await page.locator('[data-category="temp"] > div').first().click();
  const folder = page.getByRole('button', { name: /C:\\test/ });
  await folder.click();
  const viewport = page.locator('[data-slot="health-file-window"]');
  await expect(viewport).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-slot="file-skeleton"] > div')).toHaveCount(15);
  const skeletonHeight = await viewport.evaluate(el => el.clientHeight);
  assert.equal(skeletonHeight, 42 * 14.5);
  await folder.click();
  await folder.click();
  assert.equal(await page.evaluate(() => (window as any).fileCalls), 1);
  await page.evaluate(() => (window as any).finishFiles());
  await expect(viewport).toHaveAttribute('aria-busy', 'false');
  assert.equal(await viewport.evaluate(el => el.clientHeight), skeletonHeight);
  await expect(page.locator('[data-file-row]')).toHaveCount(21);
  const first = page.locator('[data-file-row] [role="checkbox"]').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-checked', 'false');
  await viewport.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('[data-file-row]').last()).toContainText('09999-');
  assert.ok(await page.locator('[data-file-row]').count() <= 21);
  await viewport.evaluate(el => { el.scrollTop = 0; });
  await expect(page.locator('[data-file-row]').first()).toContainText('00000-');
  await expect(first).toHaveAttribute('aria-checked', 'false');
  assert.equal(await page.locator('[data-file-row] [title]').count(), 0);
  await page.locator('[data-file-row]').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Search the web' }).click();
  const search = await page.evaluate(() => (window as any).webSearch);
  assert.equal(search.id, 'test');
  assert.ok(search.path.startsWith('C:\\test\\00000-'));
  await folder.click();
  await expect(viewport).toHaveCount(0);
  await folder.click();
  await expect(viewport).toHaveAttribute('aria-busy', 'false');
  assert.equal(await page.evaluate(() => (window as any).fileCalls), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { (window as any).fileCount = 2; });
  await page.locator('#health-scan').click();
  await expect(viewport).toHaveCount(0);
  await folder.click();
  await expect(page.locator('[data-slot="file-skeleton"] > div')).toHaveCount(2);
  await page.evaluate(() => (window as any).finishFiles());
  await expect(page.locator('[data-file-row]')).toHaveCount(2);
  assert.equal(await viewport.evaluate(el => el.clientHeight), 84);
  assert.deepEqual(errors, []);
  console.log('PASS: 10,000 long paths, bounded rows, stable skeleton height, request deduplication, selection, cached reopen, rescan and reduced motion.');
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.httpServer.close(() => resolve()));
}
