import { memo, useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactElement } from 'react';
import { Button } from '@/components/motion/button/base';
import { Treemap, TreemapPlot, TreemapTooltip, type TreemapNode } from '@/components/charts/treemap';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/motion/context-menu';
import { iconBox } from './AppIcon';
import { HardDrive, ChevronRight, ExternalLink, File, FolderOpen, Play, Square } from 'lucide-react';
import type { Drive, DriveReport, FileHit } from './types';
import { t } from './i18n';

const api = window.goodbyeapp;
const note = 'mt-0.5 block truncate text-[10px] text-muted-foreground', bar = 'mt-[5px] block overflow-hidden rounded-[2px] bg-muted', fill = 'block h-full rounded-[2px] bg-primary';
const folder = (p: string) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
// The map item under an event: a file tile or a folder frame (both ids are paths).
const tileAt = (e: { target: EventTarget }) => { const el = (e.target as Element).closest<HTMLElement>('[data-treemap-tile],[data-treemap-frame]'); return el?.dataset.treemapTile ?? el?.dataset.treemapFrame; };
const driveName = (d: Drive) => `${d.label || (d.root === '/' ? t.systemDisk : t.localDisk)} (${d.root.replace(/\\$/, '')})`;
// One accent, Linear-style: folders are outlines, files fill with the app colour by how much of the disk they take,
// and small-file remainders stay faint.
const accent = (p: number) => `color-mix(in oklab, var(--primary) ${p}%, var(--popover))`;
const weight = (n: TreemapNode): number => 'children' in n ? n.children.reduce((s, c) => s + weight(c), 0) : n.value;
const shade = (n: TreemapNode, disk: number): TreemapNode => 'children' in n ? { ...n, children: n.children.map(c => shade(c, disk)) }
  : { ...n, color: accent(n.id.endsWith('\0') ? 18 : n.value >= disk / 100 ? 80 : n.value >= disk / 1000 ? 60 : 42) };
// Memoised: a selection change re-renders only the two rows whose highlight changes, not all 100.
const FileRow = memo(function FileRow({ f, max, size, selected, onSelect }: { f: FileHit; max: number; size: (n: number) => string; selected: boolean; onSelect: (path: string) => void }) {
  return <div data-path={f.path} onClick={() => onSelect(f.path)} className={`grid grid-cols-[14px_minmax(0,1fr)_110px] items-center gap-2.5 rounded-md px-2 py-[7px] text-muted-foreground ${selected ? 'bg-muted' : ''}`}>
    <File size={14}/>
    <div className="min-w-0"><strong className="block truncate text-[12px] font-medium text-muted-foreground">{f.name}</strong><small className={note}>{folder(f.path)}</small></div>
    <div className="text-right text-[12px] text-foreground tabular-nums">{size(f.size)}<span className={`${bar} h-[3px]`}><i className={`${fill} opacity-70`} style={{ width: f.size / max * 100 + '%' }}/></span></div>
  </div>;
});
// Right-click menu shared by the map and the list; the caller records the target path in `menuPath` first.
const PathMenu = ({ menuPath, run, children }: { menuPath: { current: string }; run: (kind: 'open' | 'reveal', path: string) => void; children: ReactElement<HTMLAttributes<HTMLElement>> }) =>
  <ContextMenu><ContextMenuTrigger>{children}</ContextMenuTrigger>
    <ContextMenuContent ariaLabel={t.fileActions} className="min-w-0 p-0.5">
      <ContextMenuItem onSelect={() => run('open', menuPath.current)}><ExternalLink size={14}/>{t.openFile}</ContextMenuItem>
      <ContextMenuItem onSelect={() => run('reveal', menuPath.current)}><FolderOpen size={14}/>{t.revealExplorer}</ContextMenuItem>
    </ContextMenuContent></ContextMenu>;
// Tree tab: each disk is a node, its largest files are the leaves. The scan starts in the background at app launch.
export function LargeFiles({ size, spot, onFiles, onError }: { size: (n: number) => string; spot: { path: string } | null; onFiles: (files: FileHit[]) => void; onError: (text: string) => void }) {
  const [drives, setDrives] = useState<Drive[]>([]), [reports, setReports] = useState<DriveReport[]>([]), [scanning, setScanning] = useState(false), started = useRef(false);
  useEffect(() => api?.onFilesProgress(setReports), []);
  useEffect(() => onFiles(reports.flatMap(r => r.files)), [reports]);
  async function scan() {
    setScanning(true);
    try { setDrives(await api!.drives()); setReports(await api!.scanFiles()); } catch (e) { onError((e as Error).message); } finally { setScanning(false); }
  }
  useEffect(() => { if (api && !started.current) { started.current = true; scan(); } }, []);
  // One selection shared by the map and the list; tile ids are full paths, so a file tile matches its row.
  // The right-clicked item is a ref: state would re-render the whole map just to open the menu.
  const [selected, setSelected] = useState<string | null>(null), menuPath = useRef('');
  useEffect(() => { if (selected) document.querySelector(`[data-path="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selected]);
  // Palette pick: select the file (map tile and row) and bring its row to the middle of the view.
  useEffect(() => { if (!spot) return; setSelected(spot.path); document.querySelector(`[data-path="${CSS.escape(spot.path)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [spot]);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  // Map remainder areas end in \0; they stand for their folder.
  const run = useCallback((kind: 'open' | 'reveal', p: string) => api![kind](p.replace(/\0$/, '')).catch((e: Error) => errorRef.current(e.message)), []);
  const byRoot = Object.fromEntries(reports.map(r => [r.root, r]));
  // Built once per scan: a fresh data array on every render would rebuild and relayout the whole map on each hover.
  const maps = useMemo(() => Object.fromEntries(drives.flatMap(d => {
    const tree = reports.find(r => r.root === d.root)?.tree;
    return tree?.children ? [[d.root, [{ ...shade(tree, weight(tree)), label: driveName(d), color: 'transparent', textColor: 'var(--muted-foreground)' }]]] : [];
  })), [drives, reports]);
  return <>
    <div className="flex h-14 items-center justify-end gap-5">
      {scanning ? <Button id="files-cancel" variant="secondary" size="sm" onClick={() => api!.cancelFiles()}><Square size={12}/>{t.stop}</Button> : <Button id="files-scan" size="sm" onClick={scan}><Play size={12}/>{reports.length ? t.rescan : t.scan}</Button>}
    </div>
    <div>{drives.map(d => {
      const r = byRoot[d.root], used = d.total - d.free, max = r?.files[0]?.size || 1, name = driveName(d);
      return <details className="group/drive" key={d.root} open>
        <summary className="grid cursor-pointer list-none grid-cols-[14px_30px_minmax(0,1fr)_190px] items-center gap-2.5 rounded-md px-2 py-3 [&::-webkit-details-marker]:hidden"><ChevronRight className="text-muted-foreground transition-transform duration-150 group-open/drive:rotate-90" size={14}/><span className={`${iconBox} size-[30px]`}><HardDrive size={16}/></span>
          <div className="min-w-0"><strong className="block text-[12px] font-medium">{name}</strong><small className={note}>{!r ? t.waiting : r.done ? t.driveDone(r.files.length, r.scanned) + (r.mode === 'walk' && /^[a-z]:\\$/i.test(d.root) ? t.fastScanHint : '') : t.scanningAt(r.current)}</small></div>
          <div className="text-right"><small className={note}>{size(used)} / {size(d.total)}</small><span className={`${bar} h-1`}><i className={fill} style={{ width: used / d.total * 100 + '%' }}/></span></div>
        </summary>
        {maps[d.root] && <Treemap className="mb-3 ml-[15px] pl-3.5" data={maps[d.root]} label={t.diskMap} formatValue={size} activeId={selected} onActiveChange={setSelected}>
          <PathMenu menuPath={menuPath} run={run}><div className="overflow-hidden rounded-2xl border bg-popover p-1.5" onContextMenu={e => { const id = tileAt(e); if (id) { menuPath.current = id; setSelected(id); } else e.preventDefault(); }} onKeyDown={e => { const id = tileAt(e); if (id) menuPath.current = id; }}><TreemapPlot className="h-96 rounded-xl"/></div></PathMenu>
          <TreemapTooltip>{item => item.label || item.path.at(-2)}</TreemapTooltip></Treemap>}
        <PathMenu menuPath={menuPath} run={run}><div className="mb-2.5 ml-[15px] pl-3.5" onContextMenu={e => { const path = (e.target as Element).closest<HTMLElement>('[data-path]')?.dataset.path; if (path) { menuPath.current = path; setSelected(path); } else e.preventDefault(); }}>{r?.files.map(f => <FileRow key={f.path} f={f} max={max} size={size} selected={f.path === selected} onSelect={setSelected}/>)}</div></PathMenu>
      </details>;
    })}</div>
  </>;
}
