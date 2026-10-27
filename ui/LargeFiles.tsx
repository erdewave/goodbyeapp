import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/motion/button/base';
import { Tooltip } from '@/components/motion/tooltip';
import { iconBox } from './AppIcon';
import { HardDrive, ChevronRight, File, FolderOpen, Play, Square } from 'lucide-react';
import type { Drive, DriveReport, FileHit } from './types';
import { t } from './i18n';

const api = window.goodbyeapp;
const note = 'mt-0.5 block truncate text-[10px] text-muted-foreground', bar = 'mt-[5px] block overflow-hidden rounded-[2px] bg-muted', fill = 'block h-full rounded-[2px] bg-primary';
const folder = (p: string) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
// Tree tab: each disk is a node, its largest files are the leaves.
export function LargeFiles({ active, size, onFiles, onError }: { active: boolean; size: (n: number) => string; onFiles: (files: FileHit[]) => void; onError: (text: string) => void }) {
  const [drives, setDrives] = useState<Drive[]>([]), [reports, setReports] = useState<DriveReport[]>([]), [scanning, setScanning] = useState(false), started = useRef(false);
  useEffect(() => api?.onFilesProgress(setReports), []);
  useEffect(() => onFiles(reports.flatMap(r => r.files)), [reports]);
  async function scan() {
    setScanning(true);
    try { setDrives(await api!.drives()); setReports(await api!.scanFiles()); } catch (e) { onError((e as Error).message); } finally { setScanning(false); }
  }
  useEffect(() => { if (active && api && !started.current) { started.current = true; scan(); } }, [active]);
  const byRoot = Object.fromEntries(reports.map(r => [r.root, r])), total = reports.reduce((n, r) => n + r.scanned, 0);
  return <>
    <div className="flex h-14 items-center justify-between gap-5">
      <span id="files-status" className="text-[12px] text-muted-foreground tabular-nums">{scanning ? t.scanningFiles(total) : reports.length ? t.scannedFiles(drives.length, total) : t.notScanned}</span>
      {scanning ? <Button id="files-cancel" variant="secondary" size="sm" onClick={() => api!.cancelFiles()}><Square size={12}/>{t.stop}</Button> : <Button id="files-scan" size="sm" onClick={scan}><Play size={12}/>{reports.length ? t.rescan : t.scan}</Button>}
    </div>
    <div>{drives.map(d => {
      const r = byRoot[d.root], used = d.total - d.free, max = r?.files[0]?.size || 1;
      return <details className="group/drive border-t" key={d.root} open>
        <summary className="grid cursor-pointer list-none grid-cols-[14px_30px_minmax(0,1fr)_190px] items-center gap-2.5 rounded-md px-2 py-3 hover:bg-[color-mix(in_srgb,var(--muted)_65%,transparent)] [&::-webkit-details-marker]:hidden"><ChevronRight className="text-muted-foreground transition-transform duration-150 group-open/drive:rotate-90" size={14}/><span className={`${iconBox} size-[30px]`}><HardDrive size={16}/></span>
          <div className="min-w-0"><strong className="block text-[12px] font-medium">{d.label || (d.root === '/' ? t.systemDisk : t.localDisk)} ({d.root.replace(/\\$/, '')})</strong><small className={note}>{!r ? t.waiting : r.done ? t.driveDone(r.files.length, r.scanned) + (r.mode === 'walk' && /^[a-z]:\\$/i.test(d.root) ? t.fastScanHint : '') : t.scanningAt(r.current)}</small></div>
          <div className="text-right"><small className={note}>{size(used)} / {size(d.total)}</small><span className={`${bar} h-1`}><i className={fill} style={{ width: used / d.total * 100 + '%' }}/></span></div>
        </summary>
        <div className="mb-2.5 ml-[15px] border-l pl-3.5">{r?.files.map(f => <div className="grid grid-cols-[14px_minmax(0,1fr)_110px_30px] items-center gap-2.5 rounded-md px-2 py-[7px] text-muted-foreground hover:bg-[color-mix(in_srgb,var(--muted)_65%,transparent)]" key={f.path}>
          <File size={14}/>
          <div className="min-w-0"><Tooltip content={f.name}><strong className="block truncate text-[12px] font-medium text-foreground">{f.name}</strong></Tooltip><Tooltip content={f.path}><small className={note}>{folder(f.path)}</small></Tooltip></div>
          <div className="text-right text-[12px] text-foreground tabular-nums">{size(f.size)}<span className={`${bar} h-[3px]`}><i className={`${fill} opacity-70`} style={{ width: f.size / max * 100 + '%' }}/></span></div>
          <Tooltip content={t.reveal}><Button variant="ghost" size="icon" className="size-7" aria-label={t.revealFile(f.name)} onClick={() => api!.reveal(f.path).catch((e: Error) => onError(e.message))}><FolderOpen size={14}/></Button></Tooltip>
        </div>)}</div>
      </details>;
    })}</div>
  </>;
}
