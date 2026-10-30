// CI launch check for a packaged build: starts the app and fails when it dies or the page never talks to the backend.
// Unlike ui-smoke.mts it assumes nothing about the installed apps, so it runs on any CI runner.
// Release builds have no web inspector (WebView2's debugging port stays shut, WKWebView and WebKitGTK have none), so the
// check reads the app log: the start line, then "ipc load", which only the running page sends.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executable = process.env.GOODBYEAPP_EXECUTABLE;
assert.ok(executable, 'GOODBYEAPP_EXECUTABLE is not set');
const windows = process.platform === 'win32';
// The app's own stderr (GTK or WebKit warnings, a panic) lands in the CI log.
const child = spawn(executable, [], { stdio: ['ignore', 'inherit', 'inherit'] });
let exited: string | null = null;
child.on('exit', (code, signal) => { exited = `code=${code} signal=${signal}`; });
const logFile = path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : windows ? process.env.APPDATA! : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'GoodbyeAPP/logs/app.log');
const readLog = () => fs.readFile(logFile, 'utf8').catch(() => '');
// The log keeps earlier sessions, so only the part from the last start line counts.
const loaded = (log: string) => log.lastIndexOf(' start v') >= 0 && log.slice(log.lastIndexOf(' start v')).includes(' ipc load');
// Windows: what is on screen while the app still runs (the window, or an error dialog), for the CI artifact.
function screenshot(name: string) {
  if (!windows || !process.env.CI) return; // a developer's desktop stays out of it
  const shot = path.join(import.meta.dirname, '../artifacts', `${name}-${process.platform}-${process.arch}.png`);
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `New-Item -ItemType Directory -Force '${path.dirname(shot)}' | Out-Null; Add-Type -AssemblyName System.Windows.Forms, System.Drawing; $b = [Windows.Forms.Screen]::PrimaryScreen.Bounds; $i = New-Object Drawing.Bitmap $b.Width, $b.Height; [Drawing.Graphics]::FromImage($i).CopyFromScreen($b.Location, [Drawing.Point]::Empty, $b.Size); $i.Save('${shot}')`]);
}
try {
  for (let i = 0; i < 60 && !exited && !loaded(await readLog()); i++) await new Promise(r => setTimeout(r, 1000));
  assert.equal(exited, null, `app exited: ${exited}`);
  assert.ok(loaded(await readLog()), 'the page did not load');
  // A page that crashes right after loading would end the process; give it a moment.
  await new Promise(r => setTimeout(r, 5000));
  assert.equal(exited, null, `app exited: ${exited}`);
  screenshot('launch');
  console.log(`launch ok: ${process.platform}/${process.arch}`);
} catch (e) {
  console.error(e);
  console.error((await readLog()) || `no log at ${logFile}`);
  screenshot('launch-failure');
  process.exitCode = 1;
} finally {
  // A quit that never finishes would keep node alive after the check passed; kill the app instead.
  child.kill('SIGKILL');
  process.exit(process.exitCode ?? 0);
}
