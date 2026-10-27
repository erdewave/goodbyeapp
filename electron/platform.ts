import { execFile, type ExecFileOptions } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Shell } from 'electron';
import type { AppRecord, CleanResult, Item } from './types';
// Shape of one Get-ItemProperty row from the Uninstall registry keys.
type UninstallEntry = { DisplayName: string; DisplayVersion?: string; Publisher?: string; EstimatedSize?: number; UninstallString: string; DisplayIcon?: string; InstallLocation?: string; PSPath: string };
type ElevatedJob = { kind: Item['kind']; path: string; backup?: string };
export const defined = <T>(value: T | null | undefined | false | ''): value is T => !!value;
const run = (file: string, args: string[], options: ExecFileOptions = {}) => new Promise<string>((resolve, reject) => execFile(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options, encoding: 'utf8' }, (error, stdout, stderr) => error ? reject(new Error(stderr?.trim() || error.message)) : resolve(stdout.trim())));
export const ps = (script: string) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;" + script, 'utf16le').toString('base64')]);
const quote = (value: unknown) => "'" + String(value).replaceAll("'", "''") + "'";
const id = (value: string) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
export function safeName(name: unknown): name is string { return typeof name === 'string' && name.length >= 3 && name.length < 180 && !/[\\/:*?"<>|\x00-\x1f]/.test(name) && !['.', '..', 'microsoft', 'windows', 'apple', 'google', 'shared', 'common', 'common files', 'software', 'temp', 'classes', 'policies', 'wow6432node', 'programs', 'packages', 'windowsapps', 'windows nt', 'desktop'].includes(name.toLowerCase()); }
export function contained(root: string, target: string) { const rel = path.relative(path.resolve(root), path.resolve(target)); return !!rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); }
// Only <hive>\Software\<Name> or <hive>\Software\<Publisher>\<Name>. HKLM keys need admin rights to delete.
export function registryKeyOk(key: string) { const m = /^(?:HKCU\\Software|HKLM\\SOFTWARE(?:\\WOW6432Node)?)((?:\\[^\\]+){1,2})$/i.exec(key); return !!m && m[1].slice(1).split('\\').every(safeName); }
// flatpak prints GLib's SI sizes such as "1.2 GB", with the locale's decimal separator.
export const flatpakSize = (text: string | undefined) => { const m = /([\d.,]+)\s*([kMGT]?)B/.exec(text || ''); return m ? Math.round(parseFloat(m[1].replace(',', '.')) * 1000 ** ' kMGT'.indexOf(m[2] || ' ')) : 0; };
export async function listApps(): Promise<AppRecord[]> {
  if (process.platform === 'win32') {
    const data = await ps("$roots=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); $a=@(Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.UninstallString -and !$_.SystemComponent -and !$_.ParentKeyName } | Select-Object DisplayName,DisplayVersion,Publisher,EstimatedSize,UninstallString,DisplayIcon,InstallLocation,PSPath); ConvertTo-Json -InputObject $a -Compress");
    return (JSON.parse(data || '[]') as UninstallEntry[]).filter(a => !/^GoodbyeAPP$/i.test(a.DisplayName)).map(a => ({ id: id(a.PSPath), name: a.DisplayName, version: a.DisplayVersion || '', publisher: a.Publisher || 'Bilinmeyen yayıncı', size: Number(a.EstimatedSize || 0) * 1024, source: 'Windows', command: a.UninstallString, registry: a.PSPath, iconSource: a.DisplayIcon || '', vendor: a.Publisher || '', installDir: (a.InstallLocation || '').replace(/^"|"$/g, '') }));
  }
  if (process.platform === 'darwin') {
    const apps: AppRecord[] = [];
    for (const root of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
        if (!entry.isDirectory() || !entry.name.endsWith('.app') || entry.name === 'GoodbyeAPP.app') continue;
        const location = path.join(root, entry.name);
        const plist = path.join(location, 'Contents', 'Info.plist');
        const read = (key: string) => run('/usr/libexec/PlistBuddy', ['-c', 'Print :' + key, plist]).catch(() => '');
        apps.push({ id: id(location), name: entry.name.slice(0, -4), version: await read('CFBundleShortVersionString'), bundle: await read('CFBundleIdentifier'), publisher: 'macOS uygulaması', size: 0, source: 'macOS', location });
      }
    }
    return apps;
  }
  const apps: AppRecord[] = [];
  for (const scope of ['user', 'system']) {
    const result = await run('flatpak', ['list', '--app', '--' + scope, '--columns=application,name,version,size']);
    for (const line of result.split('\n').filter(Boolean)) {
      const [bundle, name, version, size] = line.split('\t');
      if (bundle && name) apps.push({ id: id(scope + bundle), name, bundle, version: version || '', publisher: 'Flatpak · ' + scope, source: 'Flatpak', scope, size: flatpakSize(size) });
    }
  }
  return apps;
}
export async function uninstall(app: AppRecord, shell: Shell) {
  if (process.platform === 'darwin') return shell.trashItem(app.location!);
  if (process.platform === 'linux') return run('flatpak', ['uninstall', '--noninteractive', '--' + app.scope, app.bundle!]);
  // Parse the registered executable without handing the string to a command shell.
  const command = app.command!.trim();
  const match = command.match(/^"([^"]+\.exe)"\s*(.*)$/i) || command.match(/^(.+?\.exe)\s*(.*)$/i);
  if (!match) throw new Error('Bu uygulamanın kaldırma komutu desteklenmiyor. Windows Ayarları üzerinden kaldırıp yeniden tarayın.');
  let [, executable, args] = match;
  if (/(^|[\\/])msiexec\.exe$/i.test(executable)) args = args.replace(/\/I(?=\s|\{)/i, '/X');
  const result = await ps(`$p=Start-Process -FilePath ${quote(executable)} ${args ? '-ArgumentList ' + quote(args) : ''} -PassThru -Wait; $p.ExitCode`);
  if (!['0', '3010', '1641'].includes(result)) throw new Error('Kaldırıcı tamamlanmadı veya iptal edildi (kod ' + result + ').');
}
function roots() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const e = process.env, menu = 'Microsoft\\Windows\\Start Menu\\Programs';
    return [e.APPDATA, e.LOCALAPPDATA, e.PROGRAMDATA, e.TEMP, e.ProgramFiles, e['ProgramFiles(x86)'], e.APPDATA && path.join(e.APPDATA, menu), e.PROGRAMDATA && path.join(e.PROGRAMDATA, menu), path.join(home, 'Desktop'), e.PUBLIC && path.join(e.PUBLIC, 'Desktop')].filter(defined);
  }
  if (process.platform === 'darwin') return ['Library/Application Support', 'Library/Caches', 'Library/Preferences', 'Library/Logs', 'Library/Saved Application State'].map(p => path.join(home, p));
  return [process.env.XDG_CONFIG_HOME || path.join(home, '.config'), process.env.XDG_CACHE_HOME || path.join(home, '.cache'), process.env.XDG_DATA_HOME || path.join(home, '.local/share'), path.join(home, '.var/app')];
}
export async function validatePath(root: string, target: string) {
  if (!contained(root, target) || path.dirname(target) !== root) throw new Error('İzin verilen dizinin dışında.');
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) throw new Error('Sembolik bağlantılar temizlenmez.');
  const realRoot = await fs.realpath(root), realTarget = await fs.realpath(target);
  if (!contained(realRoot, realTarget)) throw new Error('Yönlendirilmiş yol temizlenmez.');
  return stat;
}
async function sizeOf(target: string, budget = { count: 0 }): Promise<number> {
  if (++budget.count > 10000) return 0;
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat || stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;
  let size = 0;
  for (const child of await fs.readdir(target).catch(() => [])) { if (budget.count > 10000) break; size += await sizeOf(path.join(target, child), budget); }
  return size;
}
// The registered install folder is a candidate only inside known install bases and when no installed app shares it.
export function installDirOk(dir: string, others: AppRecord[]) {
  const e = process.env, overlaps = (a: string, b: string) => !path.relative(a, b) || contained(a, b) || contained(b, a);
  return safeName(path.basename(dir)) && [e.ProgramFiles, e['ProgramFiles(x86)'], e.LOCALAPPDATA, e.APPDATA].filter(defined).some(base => contained(base, dir)) && !others.some(o => o.installDir && overlaps(path.resolve(o.installDir), dir));
}
function scanRoots(app: AppRecord) {
  const dirs = new Set(roots());
  if (process.platform === 'win32' && safeName(app.vendor)) for (const root of [...dirs]) dirs.add(path.join(root, app.vendor));
  return dirs;
}
export async function scan(app: AppRecord, others: AppRecord[] = []): Promise<Item[]> {
  const names = [app.name, app.bundle].filter(safeName);
  if (process.platform === 'darwin' && safeName(app.bundle)) names.push(app.bundle + '.plist', app.bundle + '.savedState');
  if (process.platform === 'win32' && safeName(app.name)) names.push(app.name + '.lnk');
  const dirs = scanRoots(app);
  const found = new Map<string, Item>(), add = (item: Omit<Item, 'id'>) => found.set(item.path.toLowerCase(), { id: id(item.path), ...item });
  const addFile = async (root: string, target: string) => { try { await validatePath(root, target); add({ kind: 'file', path: target, root, size: await sizeOf(target) }); } catch { /* absent or unsafe */ } };
  for (const root of dirs) for (const name of new Set(names)) await addFile(root, path.join(root, name));
  const dir = app.installDir && path.resolve(app.installDir);
  if (dir && installDirOk(dir, others)) await addFile(path.dirname(dir), dir);
  if (process.platform === 'win32') for (const hive of ['HKCU\\Software', 'HKLM\\SOFTWARE', 'HKLM\\SOFTWARE\\WOW6432Node']) for (const key of [[app.name], [app.vendor, app.name]]) {
    const target = hive + '\\' + key.join('\\');
    if (registryKeyOk(target)) try { await run('reg.exe', ['query', target]); add({ kind: 'registry', path: target, size: 0 }); } catch { /* absent */ }
  }
  return [...found.values()];
}
export async function cleanItem(item: Item, backupDir: string) {
  // Permanent delete; fs.rm unlinks junctions and symlinks inside the folder instead of following them.
  if (item.kind === 'file') { await validatePath(item.root!, item.path); await fs.rm(item.path, { recursive: true }); return; }
  if (!registryKeyOk(item.path)) throw new Error('Geçersiz kayıt defteri anahtarı.');
  await fs.mkdir(backupDir, { recursive: true });
  const backup = path.join(backupDir, item.id + '-' + Date.now() + '.reg');
  await run('reg.exe', ['export', item.path, backup, '/y']);
  await run('reg.exe', ['delete', item.path, '/f']);
  return backup;
}
// One UAC prompt per call. The script travels inline, so no temp file exists for an unelevated process to swap.
async function elevated(script: string) {
  if (process.platform !== 'win32') throw new Error('Yönetici işlemi yalnızca Windows içindir.');
  const encoded = Buffer.from("$ErrorActionPreference='Stop';" + script, 'utf16le').toString('base64');
  if (encoded.length > 30000) throw new Error('Tek seferde çok fazla öğe var; daha azını seçin.');
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; (Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}').ExitCode`])
    .catch(e => { throw new Error(/cancel|iptal/i.test(e.message) ? 'Yönetici izni verilmedi.' : e.message); });
  return Number(out);
}
// Checkpoint-Computer needs admin. Windows silently skips it when a point exists from the last 24 hours (exit 2).
export async function restorePoint(name: string) {
  const newest = '(Get-ComputerRestorePoint | Measure-Object SequenceNumber -Maximum).Maximum';
  const code = await elevated(`$n=${newest}; Checkpoint-Computer -Description ${quote('GoodbyeAPP: ' + String(name).slice(0, 80))} -RestorePointType APPLICATION_UNINSTALL; if (${newest} -le $n) { exit 2 }`)
    .catch(e => { throw new Error('Sistem geri yükleme noktası oluşturulamadı. ' + e.message); });
  if (code === 2) return 'skipped';
  if (code) throw new Error('Sistem geri yükleme noktası oluşturulamadı (Sistem Koruması kapalı olabilir).');
  return 'created';
}
// Every plan item is re-validated before elevation: scan roots or the registered install folder, Software keys only.
export async function elevatedOk(item: Item, app: AppRecord, others: AppRecord[]) {
  if (item.kind === 'registry') { if (!registryKeyOk(item.path)) throw new Error('Geçersiz kayıt defteri anahtarı.'); return; }
  if (item.kind !== 'file' || !(scanRoots(app).has(item.root!) || installDirOk(path.resolve(item.path), others))) throw new Error('İzin verilen dizinin dışında.');
  await validatePath(item.root!, item.path);
}
const elevatedScript = (jobs: ElevatedJob[]) => `Add-Type -AssemblyName Microsoft.VisualBasic; $fs=[Microsoft.VisualBasic.FileIO.FileSystem]
foreach ($i in (ConvertFrom-Json ${quote(JSON.stringify(jobs))})) { try {
  if ($i.kind -eq 'registry') { reg.exe export $i.path $i.backup /y | Out-Null; if (!$LASTEXITCODE) { reg.exe delete $i.path /f | Out-Null } }
  else { $f = Get-Item -LiteralPath $i.path -Force; if (!($f.Attributes -band [IO.FileAttributes]::ReparsePoint)) { if ($f.PSIsContainer) { $fs::DeleteDirectory($i.path, 'OnlyErrorDialogs', 'DeletePermanently') } else { $fs::DeleteFile($i.path, 'OnlyErrorDialogs', 'DeletePermanently') } } }
} catch {} }`;
const gone = (job: ElevatedJob) => job.kind === 'registry' ? run('reg.exe', ['query', job.path]).then(() => false, () => true) : fs.lstat(job.path).then(() => false, e => e.code === 'ENOENT');
// Results come from re-checking each item afterwards, not from the elevated process's word.
export async function cleanElevated(items: Item[], app: AppRecord, others: AppRecord[], backupDir: string) {
  const results: CleanResult[] = [], jobs: ElevatedJob[] = [];
  for (const item of items) {
    try { await elevatedOk(item, app, others); jobs.push({ kind: item.kind, path: item.path, backup: item.kind === 'registry' ? path.join(backupDir, item.id + '-' + Date.now() + '.reg') : undefined }); }
    catch (e) { results.push({ path: item.path, ok: false, error: (e as Error).message }); }
  }
  if (!jobs.length) return results;
  await fs.mkdir(backupDir, { recursive: true });
  const error = await elevated(elevatedScript(jobs)).then(() => 'Yönetici izniyle de silinemedi.', e => e.message);
  for (const job of jobs) results.push(await gone(job) ? { path: job.path, ok: true, backup: job.backup } : { path: job.path, ok: false, error });
  return results;
}

