// Shapes returned by the preload bridge (electron/preload.cjs → electron/main.cjs).
export type InstalledApp = { id: string; name: string; publisher: string; version: string; source: string; size: number; removed?: boolean };
export type Candidate = { id: string; kind: 'registry' | 'file'; path: string; size?: number; reason?: string };
export type CleanResult = { path: string; ok: boolean; error?: string; backup?: string };
export type Drive = { root: string; label: string; total: number; free: number };
export type FileHit = { path: string; name: string; size: number };
export type DriveReport = { root: string; scanned: number; current: string; done: boolean; mode: 'mft' | 'walk'; files: FileHit[] };
export type WindowState = { maximized: boolean; focused: boolean; platform?: string };
type Api = {
  load(): Promise<{ apps: InstalledApp[]; platform: string }>;
  icons(): Promise<Record<string, string>>;
  sizes(): Promise<Record<string, number>>;
  scan(id: string): Promise<Candidate[]>;
  uninstall(id: string, options: { restorePoint: boolean }): Promise<{ restore: string | null }>;
  clean(id: string, selected: string[]): Promise<{ results: CleanResult[] }>;
  cleanElevated(id: string): Promise<{ results: CleanResult[] }>;
  backups(): Promise<void>;
  drives(): Promise<Drive[]>;
  scanFiles(): Promise<DriveReport[]>;
  cancelFiles(): Promise<void>;
  reveal(path: string): Promise<void>;
  language(code: string): Promise<void>;
  onFilesProgress(callback: (reports: DriveReport[]) => void): () => void;
};
type DesktopWindow = {
  getState(): Promise<WindowState>;
  minimize(): Promise<unknown>;
  maximize(): Promise<unknown>;
  close(): Promise<unknown>;
  onChange(callback: (state: WindowState) => void): () => void;
};
// Optional: the bridge is missing when the UI is opened outside Electron.
declare global { interface Window { goodbyeapp?: Api; desktopWindow?: DesktopWindow } }
