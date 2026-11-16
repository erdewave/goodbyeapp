// Opt-in debug smoke test inside the actual native webview, with the real desktop bridge.
// It scans and navigates only: it never uninstalls apps or cleans the user's files.
window.addEventListener('DOMContentLoaded', async () => {
  const errors = [], checks = [];
  window.addEventListener('error', e => errors.push(e.message));
  window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
  const wait = async (test, timeout = 120000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const result = test(); if (result) return result; await new Promise(r => setTimeout(r, 100)); }
    throw new Error('Timed out: ' + String(test));
  };
  const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  const click = selector => { const el = document.querySelector(selector); if (!el) throw new Error('Missing: ' + selector); el.click(); };
  try {
    await wait(() => window.goodbyeapp && document.querySelector('#nav-count')?.textContent !== '—' && document.body.getAttribute('aria-busy') === 'false');
    check(document.querySelectorAll('#app-list [data-row]').length > 0, 'Native app inventory rendered');
    await wait(() => [...document.querySelectorAll('#app-list img')].some(img => img.complete && img.naturalWidth > 0));
    checks.push('Native app icons decoded');
    click('[data-view="settings"]');
    await wait(() => !document.querySelector('#settings-view').hidden);
    check(document.querySelector('#app-version')?.textContent.includes('0.4.2'), 'Settings/version rendered');
    click('[data-view="files"]');
    await wait(() => document.querySelector('[data-drive]'));
    await wait(() => document.querySelector('#files-scan')?.getAttribute('aria-busy') === 'false', 240000);
    check(document.querySelectorAll('[data-drive]').length > 0, 'Native disk scan completed');
    click('[data-view="health"]');
    await wait(() => document.querySelector('#health-scan') && !document.querySelector('#health-scan').disabled);
    click('#health-scan');
    await wait(() => document.querySelector('#health-total') && !document.querySelector('#health-scan').disabled);
    checks.push('Native health scan completed');
    const group = document.querySelector('#health-view [data-group] > div');
    if (group) {
      group.click();
      const category = await wait(() => document.querySelector('#health-view [data-category] > div'));
      category.click();
      const folder = await wait(() => [...document.querySelectorAll('#health-view button[aria-expanded]')].find(el => el.getAttribute('aria-label')?.includes('/')));
      folder.click();
      await wait(() => document.querySelector('[data-slot="health-file-window"][aria-busy="false"]'));
      check(document.querySelectorAll('[data-file-row]').length <= 21, 'Native file list bounded');
      const viewport = document.querySelector('[data-slot="health-file-window"]');
      viewport.scrollTop = viewport.scrollHeight;
      await new Promise(r => setTimeout(r, 400));
      check(document.querySelectorAll('[data-file-row]').length <= 21, 'File list scroll remains bounded');
      folder.click();
      await wait(() => !document.querySelector('[data-slot="health-file-window"]'));
      folder.click();
      await wait(() => document.querySelector('[data-slot="health-file-window"][aria-busy="false"]'));
      checks.push('Cached file list reopened');
    }
    for (let i = 0; i < 3; i++) {
      for (const tab of ['apps', 'files', 'health', 'settings']) {
        click('[data-view="' + tab + '"]');
        await wait(() => !document.querySelector('#' + tab + '-view').hidden);
      }
    }
    checks.push('Repeated tab navigation completed');
    click('[data-view="health"]');
    click('#health-scan');
    await wait(() => !document.querySelector('#health-scan').disabled);
    checks.push('Health rescan completed');
    await new Promise(r => setTimeout(r, 5000));
    check(errors.length === 0, 'No webview errors or rejected promises: ' + errors.join('; '));
    await window.__TAURI__.event.emit('goodbyeapp:smoke', { ok: true, checks, agent: navigator.userAgent });
  } catch (error) {
    await window.__TAURI__.event.emit('goodbyeapp:smoke', { ok: false, checks, error: String(error), errors });
  }
}, { once: true });
