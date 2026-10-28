import { app, BrowserWindow, ipcMain, shell, nativeImage, type IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as platform from './platform';
import { loadIcons } from './icons';
import { loadSizes } from './sizes';
import * as files from './files';
import { scanHealth, cleanHealth } from './health';
import { t, setLanguage } from './i18n';
import type { AppRecord, CleanResult, HealthItem, Item } from './types';
import type { TreeNode } from './tree';
let iconPromise: Promise<Record<string, string>> | null, sizePromise: Promise<Record<string, number>> | null, fileScan: AbortController | null = null, found = new Set<string>();
let win: BrowserWindow, catalog = new Map<string, AppRecord>(), plans = new Map<string, Item[]>(), busy = false;
const index = path.join(__dirname, '../dist-ui/index.html');
const dataFile = () => path.join(app.getPath('userData'), 'state.json');
let state: { known: AppRecord[] } = { known: [] };
async function save() { const file = dataFile(); await fs.writeFile(file + '.tmp', JSON.stringify(state)); await fs.rename(file + '.tmp', file); }
const publicApp = (a: AppRecord) => { const { command, registry, iconSource, ...rest } = a; return rest; };
async function refresh() {
  const current = await platform.listApps();
  const ids = new Set(current.map(a => a.id));
  const removed = state.known.filter(a => !ids.has(a.id)).map(a => ({ ...a, removed: true }));
  state.known = [...current, ...removed];
  catalog = new Map(state.known.map(a => [a.id, a]));
  iconPromise = sizePromise = null;
  await save();
  return { apps: state.known.map(publicApp), platform: process.platform, version: app.getVersion() };
}
function getApp(id: unknown) { const a = typeof id === 'string' ? catalog.get(id) : undefined; if (!a) throw new Error(t.appNotFound); return a; }
function checkSender(event: IpcMainInvokeEvent) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame?.url !== pathToFileURL(index).href) throw new Error(t.unauthorized);
}
// Windows keeps the app's own buttons (frameless); macOS gets its traffic lights and Linux the system's overlay buttons.
const windowChrome: Electron.BrowserWindowConstructorOptions = process.platform === 'win32' ? { frame: false } : { titleBarStyle: 'hidden', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 11 } } : { titleBarOverlay: { height: 36 } }) };
const windowState = () => ({ maximized: win.isMaximized(), focused: win.isFocused(), platform: process.platform });
function handle(name: string, fn: (...args: unknown[]) => unknown) {
  ipcMain.handle(name, async (event, ...args) => {
    checkSender(event);
    if (busy) throw new Error(t.busy);
    busy = true;
    try { return await fn(...args); } finally { busy = false; }
  });
}
app.whenReady().then(async () => {
  try { state = JSON.parse(await fs.readFile(dataFile(), 'utf8')); } catch { /* first launch */ }
  win = new BrowserWindow({ width: 1240, height: 820, minWidth: 920, minHeight: 640, ...windowChrome, icon: path.join(__dirname, '../assets/brand/goodbyeapp-icon.' + (process.platform === 'win32' ? 'ico' : 'png')), title: 'GoodbyeAPP', backgroundColor: '#ffffff', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  ipcMain.handle('window:state', event => { checkSender(event); return windowState(); });
  ipcMain.handle('window:control', (event, action) => {
    checkSender(event);
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') {
      if (busy) return { blocked: true };
      win.close();
      return {};
    } else throw new Error(t.invalidWindowAction);
    return windowState();
  });
  const notify = () => { if (!win.webContents.isDestroyed()) win.webContents.send('window:changed', windowState()); };
  win.on('maximize', notify).on('unmaximize', notify).on('focus', notify).on('blur', notify);
  win.on('close', event => { if (busy) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  ipcMain.handle('language', (event, code) => { checkSender(event); setLanguage(code); });
  handle('load', refresh);
  ipcMain.handle('icons', event => { checkSender(event); return iconPromise ||= loadIcons([...catalog.values()], nativeImage); });
  ipcMain.handle('sizes', event => { checkSender(event); return sizePromise ||= loadSizes([...catalog.values()]); });
  const backupDir = () => path.join(app.getPath('userData'), 'registry-backups');
  handle('backups', async () => { await fs.mkdir(backupDir(), { recursive: true }); await shell.openPath(backupDir()); });
  // Disk scan runs outside the busy lock so the window stays usable; reveal and open only accept paths the scan produced.
  ipcMain.handle('drives', event => { checkSender(event); return files.listDrives(); });
  ipcMain.handle('scanFiles', async event => {
    checkSender(event);
    if (fileScan) throw new Error(t.scanRunning);
    const controller = fileScan = new AbortController();
    try {
      const jobs = (await files.listDrives()).map(d => files.scanDrive(d.root, controller.signal));
      // Map tiles can be revealed too: every tree node id is a scanned path (remainder areas end in \0).
      const ids = (n: TreeNode): string[] => [n.id, ...(n.children ?? []).flatMap(ids)];
      const snapshot = (tree = false) => { const reports = jobs.map(j => files.report(j, tree)); found = new Set(reports.flatMap(r => [...r.files.map(f => f.path), ...(r.tree ? ids(r.tree) : [])])); return reports; };
      const timer = setInterval(() => { if (!win.webContents.isDestroyed()) win.webContents.send('files:progress', snapshot()); }, 400);
      try { await Promise.all(jobs.map(j => j.promise)); } finally { clearInterval(timer); }
      return snapshot(true);
    } finally { fileScan = null; }
  });
  ipcMain.handle('cancelFiles', event => { checkSender(event); fileScan?.abort(); });
  ipcMain.handle('reveal', (event, target) => { checkSender(event); if (typeof target !== 'string' || !found.has(target)) throw new Error(t.notInScan); shell.showItemInFolder(target); });
  ipcMain.handle('open', async (event, target) => { checkSender(event); if (typeof target !== 'string' || !found.has(target)) throw new Error(t.notInScan); const error = await shell.openPath(target); if (error) throw new Error(error); });
  const others = (id: string) => [...catalog.values()].filter(o => !o.removed && o.id !== id);
  async function cleanTarget(id: unknown) {
    const target = getApp(id);
    const current = await platform.listApps();
    if (current.some(a => a.id === target.id || a.name.toLocaleLowerCase() === target.name.toLocaleLowerCase() || (target.bundle && a.bundle === target.bundle))) throw new Error(t.installedCopy);
    const plan = plans.get(target.id);
    if (!plan) throw new Error(t.scanFirst);
    return { target, plan };
  }
  // Failed items stay in the plan so the elevated retry works only on them.
  function keepFailed(id: string, items: Item[], results: CleanResult[]) { const left = items.filter(i => results.some(r => !r.ok && r.path === i.path)); if (left.length) plans.set(id, left); else plans.delete(id); }
  handle('scan', async id => { const a = getApp(id); const items = await platform.scan(a, others(a.id)); plans.set(a.id, items); return items; });
  handle('uninstall', async (id, options) => {
    const target = getApp(id);
    if (target.removed) throw new Error(t.alreadyRemoved);
    const restore = (options as { restorePoint?: unknown } | undefined)?.restorePoint === true ? await platform.restorePoint(target.name).catch(e => e.message) : null; // A failed restore point does not block the uninstall.
    await platform.uninstall(target, shell);
    await refresh();
    if (!getApp(id).removed) throw new Error(t.stillInstalled);
    return { restore };
  });
  handle('clean', async (id, selected) => {
    const { target, plan } = await cleanTarget(id);
    if (!Array.isArray(selected) || !selected.length || selected.length > 200) throw new Error(t.selectItems);
    const items = [...new Set(selected)].map(key => { const item = plan.find(i => i.id === key); if (!item) throw new Error(t.invalidSelection); return item; });
    const results: CleanResult[] = [];
    for (const item of items) { try { const backup = await platform.cleanItem(item, backupDir()); results.push({ path: item.path, ok: true, backup }); } catch (e) { results.push({ path: item.path, ok: false, error: (e as Error).message }); } }
    keepFailed(target.id, items, results);
    return { results };
  });
  // Takes no paths from the renderer: only the failed items of the main-process plan.
  handle('cleanElevated', async id => {
    const { target, plan } = await cleanTarget(id);
    const results = await platform.cleanElevated(plan, target, others(target.id), backupDir());
    keepFailed(target.id, plan, results);
    return { results };
  });
  // Health Check: the renderer picks ids from the last scan; paths and keys never come from it.
  // The clean runs outside the busy lock (like the disk scan) so the other tabs stay usable; only a rescan waits for it.
  let health = new Map<string, HealthItem>(), healthCleaning = false;
  handle('healthScan', async () => { if (healthCleaning) throw new Error(t.busy); const items = await scanHealth(); health = new Map(items.map(i => [i.id, i])); return items.map(({ files, dirs, ...rest }) => rest); });
  ipcMain.handle('healthClean', async (event, selected) => {
    checkSender(event);
    if (healthCleaning) throw new Error(t.busy);
    if (!Array.isArray(selected) || !selected.length) throw new Error(t.selectItems);
    const items = [...new Set(selected)].map(key => { const item = health.get(key); if (!item) throw new Error(t.invalidSelection); return item; });
    healthCleaning = true;
    try { return { results: await cleanHealth(items, backupDir(), p => { if (!win.webContents.isDestroyed()) win.webContents.send('health:progress', p); }) }; }
    finally { healthCleaning = false; }
  });
  // Updates come from GitHub Releases. Windows (NSIS) and Linux (AppImage) download in the background and install on the
  // user's go-ahead, or on quit; macOS needs a Developer ID signature to install in place, so it only links to the release.
  // The renderer starts every check (on launch when automatic updates are on, or from Settings), so no event is sent
  // before it listens. Returns the new version, or null when up to date; the toast arrives over 'update'.
  const sendUpdate = (version: string, ready: boolean) => { if (!win.webContents.isDestroyed()) win.webContents.send('update', { version, ready }); };
  autoUpdater.on('error', () => { /* reported by checkUpdate's rejection instead */ });
  ipcMain.handle('checkUpdate', async event => {
    checkSender(event);
    if (!app.isPackaged) return null;
    try {
      if (process.platform === 'darwin') {
        const res = await fetch('https://api.github.com/repos/erdewave/goodbyeapp/releases/latest');
        if (!res.ok) throw new Error();
        // ponytail: "differs from the latest tag" stands in for "older"; packaged builds only come from releases.
        const tag = (await res.json()).tag_name;
        if (typeof tag !== 'string' || tag === 'v' + app.getVersion()) return null;
        sendUpdate(tag.replace(/^v/, ''), false);
        return { version: tag.replace(/^v/, ''), downloading: false };
      }
      const result = await autoUpdater.checkForUpdates();
      if (!result?.isUpdateAvailable) return null;
      const { version } = result.updateInfo; // a repeat check reuses the running or cached download
      result.downloadPromise?.then(() => sendUpdate(version, true), () => {});
      return { version, downloading: true };
    } catch { throw new Error(t.updateFailed); }
  });
  ipcMain.handle('installUpdate', event => {
    checkSender(event);
    if (process.platform === 'darwin') return shell.openExternal('https://github.com/erdewave/goodbyeapp/releases/latest');
    if (busy || healthCleaning) throw new Error(t.busy); // the close handler would block the quit mid-operation anyway
    autoUpdater.quitAndInstall(true, true);
  });
  await win.loadFile(index);
});
app.on('window-all-closed', () => app.quit());
