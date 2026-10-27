import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import type { nativeImage } from 'electron';
import type { AppRecord } from './types';

// Registry icon locations are data, never commands. Reject remote/device paths.
export function parseIconLocation(value: unknown, env = process.env) {
  if (typeof value !== 'string') return null;
  const expanded = value.replace(/%([^%]+)%/g, (_, name) => Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || `%${name}%`).trim();
  const match = expanded.match(/^(?:"([^"]+)"|(.+?))(?:,\s*(-?\d+))?$/);
  if (!match) return null;
  const file = (match[1] || match[2]).trim();
  const index = Number(match[3] || 0);
  if (!/^[a-z]:[\\/]/i.test(file) || file.includes('\0') || file.slice(2).includes(':') || !/\.(exe|dll|ico)$/i.test(file) || !Number.isSafeInteger(index)) return null;
  return { file, index };
}
async function windowsIcons(apps: AppRecord[]): Promise<Record<string, string>> {
  const sources = apps.map(a => ({ id: a.id, ...parseIconLocation(a.iconSource) })).filter(a => a.file);
  if (!sources.length) return {};
  const input = Buffer.from(JSON.stringify(sources)).toString('base64');
  return new Promise(resolve => {
    // The script is not compiled, so it stays in electron/ beside the TypeScript sources.
    const script = path.join(__dirname, '../electron/icons.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve({});
      try { resolve(JSON.parse(stdout.trim() || '{}')); } catch { resolve({}); }
    });
    child.stdin!.on('error', () => {});
    child.stdin!.end(input);
  });
}
// app.getFileIcon crashed the main process on macOS 26 (SIGTRAP in a thread-pool worker), so the icon is
// read from the bundle's own .icns instead. Apps that only ship an asset catalog get the UI's fallback.
const plist = (file: string) => new Promise<Record<string, unknown>>(resolve => execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], (error, stdout) => { try { resolve(error ? {} : JSON.parse(stdout)); } catch { resolve({}); } }));
async function bundleIcon(app: string) {
  const name = (await plist(path.join(app, 'Contents', 'Info.plist'))).CFBundleIconFile;
  if (typeof name !== 'string' || !/^[^/\\]+$/.test(name)) return null;
  return path.join(app, 'Contents', 'Resources', path.extname(name) ? name : name + '.icns');
}
export async function loadIcons(apps: AppRecord[], images: typeof nativeImage) {
  if (process.platform === 'win32') return windowsIcons(apps);
  const result: Record<string, string> = {};
  // Bounded concurrency keeps native icon decoding from flooding the main process.
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < apps.length) {
      const entry = apps[cursor++];
      try {
        if (process.platform === 'darwin' && entry.location?.endsWith('.app')) {
          const file = await bundleIcon(entry.location);
          const icon = file && images.createFromPath(file);
          if (icon && !icon.isEmpty()) result[entry.id] = icon.resize({ width: 48, height: 48 }).toDataURL();
        } else if (process.platform === 'linux' && /^[a-z0-9._-]+$/i.test(entry.bundle || '')) {
          const root = entry.scope === 'user' ? path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'flatpak/exports/share/icons/hicolor') : '/var/lib/flatpak/exports/share/icons/hicolor';
          for (const size of [64, 48, 128, 32, 256]) {
            const file = path.join(root, `${size}x${size}`, 'apps', entry.bundle + '.png');
            const stat = await fs.stat(file).catch(() => null);
            if (!stat?.isFile() || stat.size > 4 * 1024 * 1024) continue;
            const icon = images.createFromPath(file);
            if (!icon.isEmpty()) { result[entry.id] = icon.resize({ width: 48, height: 48 }).toDataURL(); break; }
          }
        }
      } catch { /* A missing application logo uses the UI's package fallback. */ }
    }
  }));
  return result;
}
