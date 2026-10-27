import fs from 'node:fs/promises';
import path from 'node:path';
import { parseIconLocation } from './icons';
import { defined, installDirOk } from './platform';
import type { AppRecord } from './types';

// Folder sizes for apps whose installer recorded no EstimatedSize; kept for the whole session.
const cache = new Map<string, number>();
// Executables in bin\ or Squirrel's app-1.2.3\ sit one level below the real install folder.
const lift = (dir: string) => /^(bin|bin64|x64|x86|app-[\d.]+)$/i.test(path.basename(dir)) ? path.dirname(dir) : dir;
export function exeOf(command: string | undefined) {
  const m = /^\s*(?:"([^"]+\.exe)"|([a-z]:\\[^"]*?\.exe)(?=\s|$))/i.exec(command || '');
  return m ? m[1] || m[2] : null;
}
const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
// Icon and uninstaller folders can belong to a launcher or package manager (Steam, Zero Install); trust them only
// when their last segments name the app or its publisher. Short words must match whole ("team" is not "steam").
function related(dir: string, app: AppRecord) {
  const tail = words(dir.split(/[\\/]/).slice(-3).join(' '));
  return words(`${app.name} ${app.vendor || ''}`).some(word => tail.some(t => t === word || (word.length >= 5 && t.includes(word))));
}
// Registered install folder, then the icon's folder, then the uninstaller's folder; each must pass the same
// checks as cleanup candidates, so shared folders (Program Files root, another app's folder) are skipped,
// and installer caches named by a {GUID} never stand in for the installed app.
export function appFolder(app: AppRecord, others: AppRecord[]) {
  if (app.location) return app.location;
  const icon = parseIconLocation(app.iconSource)?.file, exe = exeOf(app.command);
  const guessed = [icon, exe].filter(defined).map(file => lift(path.dirname(file))).filter(dir => related(dir, app));
  return [app.installDir, ...guessed].filter(defined).map(dir => path.resolve(dir))
    .find(dir => !/\{[0-9a-f-]{36}\}/i.test(dir) && installDirOk(dir, others)) || null;
}
// ponytail: sequential walk capped at 300k entries; trees beyond that come out low.
export async function folderSize(root: string) {
  let total = 0, count = 0;
  const stack = [root];
  while (stack.length && count < 300000) {
    const dir = stack.pop()!;
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      count++;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue; // junctions and symlinks would count other folders
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) total += (await fs.stat(full).catch(() => null))?.size || 0;
    }
  }
  return total;
}
export async function loadSizes(apps: AppRecord[]) {
  const live = apps.filter(a => !a.removed), result: Record<string, number> = {};
  const dirs = new Map<AppRecord, string | null>(live.filter(a => !a.size).map(a => [a, appFolder(a, live.filter(o => o !== a))]));
  const uses = [...dirs.values()].reduce((m, d) => m.set(d, (m.get(d) || 0) + 1), new Map<string | null, number>());
  for (const [app, dir] of dirs) {
    if (!dir || uses.get(dir)! > 1) continue; // one folder for several apps is shared (e.g. NVIDIA InstallerCore)
    const size = cache.get(dir) ?? await folderSize(dir);
    cache.set(dir, size);
    if (size) result[app.id] = size;
  }
  return result;
}
