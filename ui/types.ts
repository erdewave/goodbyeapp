import type { TreemapGroup } from '@/components/charts/treemap';
// Shapes returned by the desktop bridge (ui/tauri.ts → the Rust commands in src-tauri/src/commands.rs).
export type InstalledApp = { id: string; name: string; publisher: string; version: string; source: string; size: number; removed?: boolean; lastUsed?: string };
export type Candidate = { id: string; kind: 'registry' | 'file'; path: string; size?: number; reason?: string };
export type CleanResult = { path: string; ok: boolean; error?: string; backup?: string };
export type Drive = { root: string; label: string; total: number; free: number };
export type FileHit = { path: string; name: string; size: number };
export type DriveReport = { root: string; scanned: number; current: string; done: boolean; mode: 'mft' | 'walk'; files: FileHit[]; tree?: TreemapGroup };
export type HealthItem = { id: string; group: string; category: string; on: boolean; kind: 'files' | 'recycle' | 'value' | 'key' | 'sql'; path: string; label?: string; size: number; count?: number };
export type WindowState = { maximized: boolean; focused: boolean; platform?: string };
type Api = {
  load(): Promise<{ apps: InstalledApp[]; platform: string; version: string; fullDiskAccess: boolean }>;
  openPrivacy(): Promise<void>;
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
  open(path: string): Promise<void>;
  // Hashes the file and opens its VirusTotal page; resolves once the browser is opened.
  virustotal(path: string): Promise<void>;
  webSearch(path: string): Promise<void>;
  healthWebSearch(id: string, file?: string): Promise<void>;
  language(code: string): Promise<void>;
  healthScan(): Promise<HealthItem[]>;
  // file: one of the item's files (default: its first, or for VirusTotal its only one).
  healthReveal(id: string, file?: string): Promise<void>;
  healthVirustotal(id: string, file?: string): Promise<void>;
  healthFiles(id: string): Promise<[path: string, size: number][]>;
  // skip: files unticked inside a picked item, by item id.
  healthClean(selected: string[], skip: Record<string, string[]>): Promise<{ results: CleanResult[] }>;
  onFilesProgress(callback: (reports: DriveReport[]) => void): () => void;
  onHealthProgress(callback: (progress: { id: string; done: number; total: number; ok?: boolean }) => void): () => void;
  checkUpdate(): Promise<{ version: string; downloading: boolean } | null>;
  installUpdate(): Promise<void>;
  // ready: downloaded and installable now; false on macOS, where installUpdate opens the release page instead.
  onUpdate(callback: (update: { version: string; ready: boolean }) => void): () => void;
};
type DesktopWindow = {
  getState(): Promise<WindowState>;
  minimize(): Promise<unknown>;
  maximize(): Promise<unknown>;
  close(): Promise<unknown>;
  onChange(callback: (state: WindowState) => void): () => void;
};
// Optional: the bridge is missing when the UI is opened outside the desktop shell.
declare global { interface Window { goodbyeapp?: Api; desktopWindow?: DesktopWindow } }
