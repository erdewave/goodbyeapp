import { app, BrowserWindow, ipcMain, shell, nativeImage, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as platform from './platform';
import { loadIcons } from './icons';
import { loadSizes } from './sizes';
import * as files from './files';
import { t, setLanguage } from './i18n';
import type { AppRecord, CleanResult, Item } from './types';
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
  return { apps: state.known.map(publicApp), platform: process.platform };
}
function getApp(id: unknown) { const a = typeof id === 'string' ? catalog.get(id) : undefined; if (!a) throw new Error(t.appNotFound); return a; }
function checkSender(event: IpcMainInvokeEvent) {
  if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame?.url !== pathToFileURL(index).href) throw new Error(t.unauthorized);
}
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
  win = new BrowserWindow({ width: 1240, height: 820, minWidth: 920, minHeight: 640, frame: false, icon: path.join(__dirname, '../assets/brand/goodbyeapp-icon.' + (process.platform === 'win32' ? 'ico' : 'png')), title: 'GoodbyeAPP', backgroundColor: '#ffffff', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
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
  ipcMain.handle('icons', event => { checkSender(event); return iconPromise ||= loadIcons([...catalog.values()], app, nativeImage); });
  ipcMain.handle('sizes', event => { checkSender(event); return sizePromise ||= loadSizes([...catalog.values()]); });
  const backupDir = () => path.join(app.getPath('userData'), 'registry-backups');
  handle('backups', async () => { await fs.mkdir(backupDir(), { recursive: true }); await shell.openPath(backupDir()); });
  // Disk scan runs outside the busy lock so the window stays usable; reveal only accepts paths the scan produced.
  ipcMain.handle('drives', event => { checkSender(event); return files.listDrives(); });
  ipcMain.handle('scanFiles', async event => {
    checkSender(event);
    if (fileScan) throw new Error(t.scanRunning);
    const controller = fileScan = new AbortController();
    try {
      const jobs = (await files.listDrives()).map(d => files.scanDrive(d.root, controller.signal));
      const snapshot = () => { const reports = jobs.map(files.report); found = new Set(reports.flatMap(r => r.files.map(f => f.path))); return reports; };
      const timer = setInterval(() => { if (!win.webContents.isDestroyed()) win.webContents.send('files:progress', snapshot()); }, 400);
      try { await Promise.all(jobs.map(j => j.promise)); } finally { clearInterval(timer); }
      return snapshot();
    } finally { fileScan = null; }
  });
  ipcMain.handle('cancelFiles', event => { checkSender(event); fileScan?.abort(); });
  ipcMain.handle('reveal', (event, target) => { checkSender(event); if (typeof target !== 'string' || !found.has(target)) throw new Error(t.notInScan); shell.showItemInFolder(target); });
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
  await win.loadFile(index);
});
app.on('window-all-closed', () => app.quit());
