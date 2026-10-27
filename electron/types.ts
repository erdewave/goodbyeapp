// Main-process records. main.ts strips command/registry/iconSource before an app reaches the renderer.
export type AppRecord = {
  id: string; name: string; version: string; publisher: string; size: number; source: string; removed?: boolean;
  command?: string; registry?: string; iconSource?: string; vendor?: string; installDir?: string;
  location?: string; bundle?: string; scope?: string;
};
export type Item = { id: string; kind: 'file' | 'registry'; path: string; root?: string; size: number };
export type CleanResult = { path: string; ok: boolean; backup?: string; error?: string };
export type FileHit = { path: string; name?: string; size: number; ino: number; modified?: number };
export type Job = { root: string; scanned: number; current: string; done: boolean; top: FileHit[]; min: number; mode: 'mft' | 'walk'; promise?: Promise<Job> };
