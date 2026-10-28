import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
// Electron prefixes main-process errors with "Error invoking remote method ..."; keep only the message.
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args).catch((e: Error) => { throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')); });
const listen = (channel: string) => (callback: (payload: unknown) => void) => {
  const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('goodbyeapp', {
  ...Object.fromEntries(['load', 'icons', 'sizes', 'scan', 'uninstall', 'clean', 'cleanElevated', 'backups', 'drives', 'scanFiles', 'cancelFiles', 'reveal', 'open', 'language', 'healthScan', 'healthReveal', 'healthClean', 'checkUpdate', 'installUpdate'].map(method => [method, (...args: unknown[]) => invoke(method, ...args)])),
  onFilesProgress: listen('files:progress'),
  onHealthProgress: listen('health:progress'),
  onUpdate: listen('update'),
});
contextBridge.exposeInMainWorld('desktopWindow', {
  getState: () => ipcRenderer.invoke('window:state'),
  minimize: () => ipcRenderer.invoke('window:control', 'minimize'),
  maximize: () => ipcRenderer.invoke('window:control', 'maximize'),
  close: () => ipcRenderer.invoke('window:control', 'close'),
  onChange: listen('window:changed'),
});
