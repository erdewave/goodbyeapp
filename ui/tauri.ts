// The desktop bridge: window.goodbyeapp forwards to the Rust commands in src-tauri (camelCase method -> snake_case
// command, positional arguments -> named ones, events -> Tauri events); window.desktopWindow is Tauri's window API.
import type { WindowState } from './types';
type Off = Promise<() => void>;
type Win = { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean>; isFocused(): Promise<boolean>; onResized(cb: () => void): Off; onFocusChanged(cb: () => void): Off };
type Tauri = { core: { invoke(cmd: string, args?: object): Promise<unknown> }; event: { listen(name: string, callback: (event: { payload: never }) => void): Off }; window: { getCurrentWindow(): Win } };
const tauri = (window as unknown as { __TAURI__?: Tauri }).__TAURI__;
if (tauri && !window.goodbyeapp) {
  const argNames: Record<string, string[]> = { scan: ['id'], uninstall: ['id', 'options'], clean: ['id', 'selected'], cleanElevated: ['id'], reveal: ['target'], open: ['target'], language: ['code'], healthReveal: ['key'], healthClean: ['selected'] };
  // Rust errors arrive as plain strings.
  const invoke = (command: string, args?: object) => tauri.core.invoke(command, args).catch((e: unknown) => { throw new Error(String(e)); });
  const call = (method: string) => (...values: unknown[]) => invoke(method.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), Object.fromEntries((argNames[method] ?? []).map((name, i) => [name, values[i]])));
  const listen = (name: string) => (callback: (payload: never) => void) => { const off = tauri.event.listen(name, e => callback(e.payload)); return () => { off.then(stop => stop()); }; };
  const methods = ['load', 'icons', 'sizes', 'scan', 'uninstall', 'clean', 'cleanElevated', 'backups', 'drives', 'scanFiles', 'cancelFiles', 'reveal', 'open', 'language', 'healthScan', 'healthReveal', 'healthClean', 'checkUpdate', 'installUpdate'];
  window.goodbyeapp = { ...Object.fromEntries(methods.map(m => [m, call(m)])), onFilesProgress: listen('files:progress'), onHealthProgress: listen('health:progress'), onUpdate: listen('update') } as never;
  // Closing waits while an operation runs: the Rust side holds the close request.
  const win = tauri.window.getCurrentWindow(), platform = navigator.userAgent.includes('Windows') ? 'win32' : undefined;
  const getState = async (): Promise<WindowState> => ({ maximized: await win.isMaximized(), focused: await win.isFocused(), platform });
  const onChange = (callback: (state: WindowState) => void) => { const update = () => { getState().then(callback); }, offs = [win.onResized(update), win.onFocusChanged(update)]; return () => offs.forEach(off => off.then(stop => stop())); };
  window.desktopWindow = { getState, minimize: () => win.minimize(), maximize: () => win.toggleMaximize(), close: () => win.close(), onChange };
}
