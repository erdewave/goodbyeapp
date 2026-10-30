// The desktop bridge: window.goodbyeapp and window.desktopWindow forward to the Rust commands in src-tauri
// (camelCase method -> snake_case command, positional arguments -> named ones, events -> Tauri events).
type Tauri = { core: { invoke(cmd: string, args?: object): Promise<unknown> }; event: { listen(name: string, callback: (event: { payload: never }) => void): Promise<() => void> } };
const tauri = (window as unknown as { __TAURI__?: Tauri }).__TAURI__;
if (tauri && !window.goodbyeapp) {
  const argNames: Record<string, string[]> = { scan: ['id'], uninstall: ['id', 'options'], clean: ['id', 'selected'], cleanElevated: ['id'], reveal: ['target'], open: ['target'], language: ['code'], healthReveal: ['key'], healthClean: ['selected'] };
  // Rust errors arrive as plain strings.
  const invoke = (command: string, args?: object) => tauri.core.invoke(command, args).catch((e: unknown) => { throw new Error(String(e)); });
  const call = (method: string) => (...values: unknown[]) => invoke(method.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), Object.fromEntries((argNames[method] ?? []).map((name, i) => [name, values[i]])));
  const listen = (name: string) => (callback: (payload: never) => void) => { const off = tauri.event.listen(name, e => callback(e.payload)); return () => { off.then(stop => stop()); }; };
  const methods = ['load', 'icons', 'sizes', 'scan', 'uninstall', 'clean', 'cleanElevated', 'backups', 'drives', 'scanFiles', 'cancelFiles', 'reveal', 'open', 'language', 'healthScan', 'healthReveal', 'healthClean', 'checkUpdate', 'installUpdate'];
  window.goodbyeapp = { ...Object.fromEntries(methods.map(m => [m, call(m)])), onFilesProgress: listen('files:progress'), onHealthProgress: listen('health:progress'), onUpdate: listen('update') } as never;
  const control = (action: string) => invoke('window_control', { action });
  window.desktopWindow = { getState: () => invoke('window_state_get') as never, minimize: () => control('minimize'), maximize: () => control('maximize'), close: () => control('close'), onChange: listen('window:changed') };
}
