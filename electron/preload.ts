import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
// Electron prefixes main-process errors with "Error invoking remote method ..."; keep only the Turkish message.
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args).catch((e: Error) => { throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')); });
contextBridge.exposeInMainWorld('goodbyeapp', {
  ...Object.fromEntries(['load', 'icons', 'sizes', 'scan', 'uninstall', 'clean', 'cleanElevated', 'backups', 'drives', 'scanFiles', 'cancelFiles', 'reveal'].map(method => [method, (...args: unknown[]) => invoke(method, ...args)])),
  onFilesProgress: (callback: (reports: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, reports: unknown) => callback(reports);
    ipcRenderer.on('files:progress', listener);
    return () => ipcRenderer.removeListener('files:progress', listener);
  },
});
contextBridge.exposeInMainWorld('desktopWindow', {
  getState: () => ipcRenderer.invoke('window:state'),
  minimize: () => ipcRenderer.invoke('window:control', 'minimize'),
  maximize: () => ipcRenderer.invoke('window:control', 'maximize'),
  close: () => ipcRenderer.invoke('window:control', 'close'),
  onChange: (callback: (state: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on('window:changed', listener);
    return () => ipcRenderer.removeListener('window:changed', listener);
  },
});
