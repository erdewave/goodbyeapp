import { memo, useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactElement } from 'react';
import { StatefulButton } from '@/components/motion/button/stateful';
import { Treemap, TreemapPlot, TreemapTooltip, type TreemapNode } from '@/components/charts/treemap';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/motion/context-menu';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '@/lib/ease';
import { iconBox } from './AppIcon';
import { rise, collapse, chevron } from './motion';
import { HardDrive, ChevronRight, Copy, ExternalLink, File, FolderOpen, Play } from 'lucide-react';
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
// Bars scale on the compositor; a CSS transition retargets smoothly when a bigger file arrives mid-scan and changes `max`.
const scaleBar = 'origin-left transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]';
// Memoised: a selection change re-renders only the two rows whose highlight changes, not all 100.
// Rows stream in during the scan, so a new row only fades in: no stagger, no movement, nothing that lags the data.
const FileRow = memo(function FileRow({ f, max, size, selected, onSelect }: { f: FileHit; max: number; size: (n: number) => string; selected: boolean; onSelect: (path: string) => void }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: EASE_OUT }} data-path={f.path} onClick={() => onSelect(f.path)} className={`grid grid-cols-[14px_minmax(0,1fr)_110px] items-center gap-2.5 rounded-md px-2 py-[7px] text-muted-foreground transition-colors duration-150 ${selected ? 'bg-muted' : ''}`}>
    <File size={14}/>
    <div className="min-w-0"><strong className="block truncate text-[12px] font-medium text-muted-foreground">{f.name}</strong><small className={note}>{folder(f.path)}</small></div>
    <div className="text-right text-[12px] text-foreground tabular-nums">{size(f.size)}<span className={`${bar} h-[3px]`}><i className={`${fill} ${scaleBar} opacity-70`} style={{ transform: `scaleX(${f.size / max})` }}/></span></div>
  </motion.div>;
});
// Right-click menu shared by the map and the list; the caller records the target path in `menuPath` first.
const PathMenu = ({ menuPath, run, copy, children }: { menuPath: { current: string }; run: (kind: 'open' | 'reveal', path: string) => void; copy: (path: string) => void; children: ReactElement<HTMLAttributes<HTMLElement>> }) =>
  <ContextMenu><ContextMenuTrigger>{children}</ContextMenuTrigger>
    <ContextMenuContent ariaLabel={t.fileActions} className="min-w-0 p-0.5">
      <ContextMenuItem onSelect={() => run('open', menuPath.current)}><ExternalLink size={14}/>{t.openFile}</ContextMenuItem>
      <ContextMenuItem onSelect={() => run('reveal', menuPath.current)}><FolderOpen size={14}/>{t.revealExplorer}</ContextMenuItem>
      <ContextMenuItem onSelect={() => copy(menuPath.current)}><Copy size={14}/>{t.copyPath}</ContextMenuItem>
    </ContextMenuContent></ContextMenu>;
// Tree tab: each disk is a node, its largest files are the leaves. The scan starts in the background at app launch.
export function LargeFiles({ size, spot, visible, onFiles, onError, onCopied }: { size: (n: number) => string; spot: { path: string } | null; visible: boolean; onFiles: (files: FileHit[]) => void; onError: (text: string) => void; onCopied: () => void }) {
  // The scan runs while the tab is still hidden; the drives mount on the first visit so their arrival plays where it can be seen.
  // Later visits don't replay it: tab switches are frequent.
  const [seen, setSeen] = useState(visible);
  useEffect(() => { if (visible) setSeen(true); }, [visible]);
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
  const [selected, setSelected] = useState<string | null>(null), menuPath = useRef(''), reduce = useReducedMotion(), behavior = reduce ? 'auto' : 'smooth';
  // Drives start open; this holds the ones the user folded.
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => { if (selected) document.querySelector(`[data-path="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', behavior }); }, [selected]);
  // Palette pick: select the file (map tile and row) and bring its row to the middle of the view.
  useEffect(() => { if (!spot) return; setSelected(spot.path); document.querySelector(`[data-path="${CSS.escape(spot.path)}"]`)?.scrollIntoView({ block: 'center', behavior }); }, [spot]);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  // Map remainder areas end in \0; they stand for their folder.
  const run = useCallback((kind: 'open' | 'reveal', p: string) => api![kind](p.replace(/\0$/, '')).catch((e: Error) => errorRef.current(e.message)), []);
  const copy = useCallback((p: string) => navigator.clipboard.writeText(p.replace(/\0$/, '')).then(onCopied), []);
  const byRoot =Object.fromEntries(reports.map(r => [r.root, r]));
  // Built once per scan: a fresh data array on every render would rebuild and relayout the whole map on each hover.
  const maps = useMemo(() => Object.fromEntries(drives.flatMap(d => {
    const tree = reports.find(r => r.root === d.root)?.tree;
    return tree?.children ? [[d.root, [{ ...shade(tree, weight(tree)), label: driveName(d), color: 'transparent', textColor: 'var(--muted-foreground)' }]]] : [];
  })), [drives, reports]);
  return <>
    {/* Scan works like Health Check's: it rolls to a spinner and stays disabled while the scan runs. */}
    <div className="flex h-14 items-center justify-end">
      <StatefulButton id="files-scan" size="sm" state={scanning ? 'loading' : 'idle'} loadingText={t.health.scanning} onClick={scan}><Play size={12} className="mr-1.5 inline align-[-1px]"/>{reports.length ? t.rescan : t.scan}</StatefulButton>
    </div>
    <div>{(seen || visible) && drives.map((d, i) => {
      const r = byRoot[d.root], used = d.total - d.free, max = r?.files[0]?.size || 1, name = driveName(d), open = !folded.includes(d.root);
      return <motion.section key={d.root} data-drive={d.root} {...rise(i, reduce)}>
        <button type="button" aria-expanded={open} onClick={() => setFolded(old => open ? [...old, d.root] : old.filter(k => k !== d.root))} className="grid w-full cursor-pointer grid-cols-[14px_30px_minmax(0,1fr)_190px] items-center gap-2.5 rounded-md px-2 py-3 text-left"><ChevronRight className={`text-muted-foreground ${chevron} ${open ? 'rotate-90' : ''}`} size={14}/><span className={`${iconBox} size-[30px]`}><HardDrive size={16}/></span>
          <span className="block min-w-0"><strong className="block text-[12px] font-medium">{name}</strong><small className={note}>{!r ? t.waiting : r.done ? t.driveDone(r.scanned) + (r.mode === 'walk' && /^[a-z]:\\$/i.test(d.root) ? t.fastScanHint : '') : t.scanningAt(r.scanned, r.current)}</small></span>
          {/* The usage bar fills once on arrival: it explains the number beside it. */}
          <span className="block text-right"><small className={note}>{size(used)} / {size(d.total)}</small><span className={`${bar} h-1`}><motion.i className={`${fill} origin-left`} initial={{ transform: reduce ? `scaleX(${used / d.total})` : 'scaleX(0)' }} animate={{ transform: `scaleX(${used / d.total})` }} transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 + i * 0.04 }}/></span></span>
        </button>
        <AnimatePresence initial={false}>{open && <motion.div key="body" {...collapse(reduce)}>
          {/* The map lands when the scan finishes; it opens like a section instead of shoving the list down in one frame. */}
          <AnimatePresence initial={false}>{maps[d.root] && <motion.div key="map" {...collapse(reduce)}><Treemap className="mb-3 ml-[15px] w-auto pl-3.5" data={maps[d.root]} label={t.diskMap} formatValue={size} activeId={selected} onActiveChange={setSelected}>
            <PathMenu menuPath={menuPath} run={run} copy={copy}><div className="overflow-hidden rounded-2xl border bg-popover p-1.5" onContextMenu={e => { const id = tileAt(e); if (id) { menuPath.current = id; setSelected(id); } else e.preventDefault(); }} onKeyDown={e => { const id = tileAt(e); if (id) menuPath.current = id; }}><TreemapPlot className="h-96 rounded-xl"/></div></PathMenu>
            <TreemapTooltip>{item => item.label || item.path.at(-2)}</TreemapTooltip></Treemap></motion.div>}</AnimatePresence>
          <PathMenu menuPath={menuPath} run={run} copy={copy}><div className="mb-2.5 ml-[15px] pl-3.5" onContextMenu={e => { const path = (e.target as Element).closest<HTMLElement>('[data-path]')?.dataset.path; if (path) { menuPath.current = path; setSelected(path); } else e.preventDefault(); }}>{r?.files.map(f => <FileRow key={f.path} f={f} max={max} size={size} selected={f.path === selected} onSelect={setSelected}/>)}</div></PathMenu>
        </motion.div>}</AnimatePresence>
      </motion.section>;
    })}</div>
  </>;
}
