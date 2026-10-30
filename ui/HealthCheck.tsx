import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { StatefulButton, type ButtonState } from '@/components/motion/button/stateful';
import { Checkbox } from '@/components/motion/checkbox';
import { Tooltip } from '@/components/motion/tooltip';
import { NumberTicker } from '@/components/motion/number-ticker';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/motion/context-menu';
import type { ToastInput } from '@/components/motion/animated-toast-stack';
import { EASE_OUT } from '@/lib/ease';
import { Globe, AppWindow, ListX, HeartPulse, Play, LayoutGrid, Monitor, Clapperboard, Wrench, ShoppingBag, MessageSquare, Download, SlidersHorizontal, ChevronDown, Copy, FolderOpen } from 'lucide-react';
import { t, locale } from './i18n';
import { rise as riseMotion, collapse as collapseMotion, chevron } from './motion';
import type { HealthItem } from './types';

const api = window.goodbyeapp;
// CCleaner's Custom Clean order: its own groups, then one group per browser, then the registry scan. Browser groups use the globe.
const order = ['windows', 'system', 'apps', 'media', 'utils', 'winstore', 'ai', 'downloads', 'userdownloads', 'advanced', 'internet', 'Google Chrome', 'Edge Chromium', 'Firefox', 'Safari', 'Brave', 'Opera', 'Vivaldi', 'Internet Explorer', 'registry'];
const icons: Record<string, typeof Globe> = { windows: LayoutGrid, system: Monitor, apps: AppWindow, media: Clapperboard, utils: Wrench, winstore: ShoppingBag, ai: MessageSquare, downloads: Download, userdownloads: Download, advanced: SlidersHorizontal, registry: ListX };
const labels = (map: Record<string, string>, key: string) => map[key] ?? key;
// On a Mac, categories carry CCleaner for Mac's own names (its browser cleaner says Caches / Browsing history).
const onMac = navigator.userAgent.includes('Macintosh');
// CSS uppercase follows the page language, so Turkish turns "Windows" into "WİNDOWS"; product names keep English casing.
const BRANDS = /^(windows|store|google|chrome|edge|chromium|firefox|safari|brave|opera|vivaldi|internet|explorer|xcode)$/i;
const caps = (text: string) => text.split(' ').map(w => w.toLocaleUpperCase(BRANDS.test(w) ? 'en' : locale)).join(' ');
// Columns of the results table: checkbox, name, item count, size, expand.
const grid = 'grid grid-cols-[28px_minmax(0,1fr)_96px_88px_32px] items-center gap-2 px-2';
const num = (n: number) => n.toLocaleString(locale);
// The app's own light/dark choice, which can differ from the system's.
export const beamTheme = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';
const bytes = (list: HealthItem[]) => list.reduce((s, i) => s + i.size, 0);
const entries = (list: HealthItem[]) => list.reduce((s, i) => s + (i.count || 1), 0);
// Long paths keep their tail, like CCleaner's detail list.
const short = (p: string) => { const parts = p.split('\\'); return parts.length > 4 ? '…\\' + parts.slice(-3).join('\\') : p; };
function Bar({ value }: { value: number }) {
  // scaleX, not width: the fill stays on the compositor while rows are being deleted.
  return <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted"><motion.i className="block h-full origin-left rounded-full bg-primary" initial={{ transform: 'scaleX(0)' }} animate={{ transform: `scaleX(${value})` }} transition={{ duration: 0.2, ease: EASE_OUT }}/></span>;
}
// Health Check tab, after CCleaner 7: one summary, then a table of categories that open into their locations.
// Cookies start unticked (cleaning signs you out of sites).
// While an app is being uninstalled the scan waits: its app-wide lock would freeze that app's leftover picker.
export function HealthCheck({ size, serial, busy, setBusy, toast, uninstalling, onScan }: { size: (n: number) => string; serial: <T>(fn: () => Promise<T>) => Promise<T>; busy: boolean; setBusy: (on: boolean) => void; toast: (input: ToastInput) => unknown; uninstalling: boolean; onScan: (on: boolean) => void }) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<HealthItem[] | null>(null), [selected, setSelected] = useState<string[]>([]), [open, setOpen] = useState<string[]>([]), [action, setAction] = useState<ButtonState>('idle'), [scanning, setScanning] = useState<ButtonState>('idle');
  async function scan() {
    setBusy(true); setScanning('loading'); onScan(true);
    try { const next = await serial(() => api!.healthScan()); setItems(next); setSelected(next.filter(i => i.on).map(i => i.id)); setScanning('idle'); }
    catch (e) { setScanning('error'); toast({ title: (e as Error).message, status: 'error' }); setTimeout(() => setScanning('idle'), 1500); } finally { setBusy(false); onScan(false); }
  }
  // A disabled button gets no pointer events, so the wrapper carries the tooltip that says why.
  const waiting = uninstalling && scanning !== 'loading';
  const scanButton = (main: boolean) => <Tooltip content={t.health.waitUninstall} disabled={!waiting}><span className="inline-flex"><StatefulButton id="health-scan" size="sm" variant={main ? 'primary' : 'secondary'} className={waiting ? 'pointer-events-none' : undefined} disabled={(busy && scanning !== 'loading') || cleaning || waiting} state={scanning} loadingText={t.health.scanning} successText={t.done} errorText={t.retry} onClick={scan}><Play size={12} className="mr-1.5 inline align-[-1px]"/>{main ? t.health.scan : t.rescan}</StatefulButton></span></Tooltip>;
  // Progress per row being cleaned; a finished row fills its bar, then leaves the list.
  const [progress, setProgress] = useState<Record<string, number>>({}), cleaning = action === 'loading';
  useEffect(() => api?.onHealthProgress(p => {
    setProgress(old => ({ ...old, [p.id]: p.done / p.total }));
    if (p.ok === undefined) return;
    setTimeout(() => {
      setProgress(({ [p.id]: _, ...rest }) => rest);
      if (p.ok) { setItems(old => old && old.filter(i => i.id !== p.id)); setSelected(old => old.filter(id => id !== p.id)); }
    }, 250);
  }), []);
  // Not on the app-wide lock: the other tabs stay usable while files are deleted.
  async function clean() {
    setAction('loading'); setProgress(Object.fromEntries(picked.filter(i => i.count).map(i => [i.id, 0])));
    try {
      const { results } = await api!.healthClean(picked.map(i => i.id)), failed = results.filter(r => !r.ok);
      setAction(failed.length ? 'error' : 'success');
      toast({ title: t.health.result(results.length - failed.length, failed.length), description: failed[0] && `${failed[0].path} · ${failed[0].error}`, status: failed.length ? 'error' : 'success' });
      const next = await serial(() => api!.healthScan()); setItems(next); setSelected(old => old.filter(id => next.some(i => i.id === id)));
    } catch (e) { setAction('error'); toast({ title: (e as Error).message, status: 'error' }); }
    finally { setProgress({}); setTimeout(() => setAction('idle'), 1200); }
  }
  const all = items ?? [], picked = all.filter(i => selected.includes(i.id)), lock = busy || cleaning;
  const toggle = (key: string) => setOpen(old => old.includes(key) ? old.filter(k => k !== key) : [...old, key]);
  const tick = (list: HealthItem[], on: boolean) => { const ids = list.map(i => i.id); setSelected(old => on ? [...new Set([...old, ...ids])] : old.filter(id => !ids.includes(id))); };
  const box = (list: HealthItem[], label: string) => { const n = list.filter(i => selected.includes(i.id)).length; return <span className="flex" onClick={e => e.stopPropagation()}><Checkbox aria-label={label} disabled={lock} checked={n > 0 && n === list.length} indeterminate={n > 0 && n < list.length} onCheckedChange={on => tick(list, on)}/></span>; };
  // The results arrive top-down: summary, column header, then each group.
  const collapse = collapseMotion(reduce), rise = (i: number) => riseMotion(i, reduce);
  const total = bytes(picked.length ? picked : all), gb = total >= 1024 ** 3, scanningNow = scanning === 'loading';
  let shown = 2;
  return <AnimatePresence mode="wait" initial={false}>{!items ? <motion.div key="intro" exit={reduce ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(2px)', transition: { duration: 0.15, ease: EASE_OUT } }} className="flex min-h-[calc(100vh-var(--titlebar-height)-28px)] flex-col items-center justify-center px-6 text-center"><span className={`mb-3.5 grid size-14 place-items-center rounded-2xl bg-foreground/[0.04] transition-colors duration-300 ${scanningNow ? 'text-primary' : 'text-muted-foreground'}`}><HeartPulse size={28}/></span><h3 className="mb-[7px] text-[14px] font-[550]">{t.health.title}</h3><p className="mb-5 max-w-sm text-[12px] text-muted-foreground">{t.health.intro}</p>{scanButton(true)}</motion.div>
  : <motion.div key="results" className="px-2 pb-6">
    <motion.div {...rise(0)} className="flex items-end justify-between gap-6 pt-6 pb-5">
      <div><p className="text-[11px] text-muted-foreground">{t.health.toClean}</p><p id="health-total" className={`mt-0.5 text-[30px] leading-none font-semibold tracking-[-.8px] tabular-nums ${picked.length ? '' : 'text-muted-foreground'}`}>{total ? <NumberTicker value={total / (gb ? 1024 ** 3 : 1024 ** 2)} decimals={1} format={v => v.toLocaleString(locale, { maximumFractionDigits: 1 })} suffix={gb ? ' GB' : ' MB'} duration={0.55} stagger={0.03} blur/> : size(0)}</p></div>
      <div className="flex gap-2">{scanButton(false)}<StatefulButton id="health-clean" size="sm" disabled={scanning === 'loading' || !picked.length} state={action} loadingText={t.cleaning} successText={t.cleanedButton} errorText={t.retry} onClick={clean}>{t.clean}</StatefulButton></div>
    </motion.div>
    {!all.length && <motion.p {...rise(1)} className="px-2 py-2.5 text-[12px] text-muted-foreground">{t.health.clean}</motion.p>}
    <motion.div {...rise(1)} className={`${grid} pb-2 text-[11px] font-medium text-muted-foreground`} hidden={!all.length}>{box(all, t.selectAll)}<span>{t.health.columns.name}</span><span className="text-right">{t.health.columns.count}</span><span className="text-right">{t.health.columns.size}</span><span/></motion.div>
    {[...new Set([...order, ...all.map(i => i.group)])].map(group => {
      const inGroup = all.filter(i => i.group === group), GroupIcon = icons[group] ?? Globe;
      const rows = [...new Set(inGroup.map(i => i.category))].map(category => ({ category, key: group + '/' + category, list: inGroup.filter(i => i.category === category) })).sort((a, b) => bytes(b.list) - bytes(a.list) || entries(b.list) - entries(a.list));
      // A group with nothing left to clean is not shown at all; groups start closed, like CCleaner's results.
      const gkey = 'group:' + group, gopen = open.includes(gkey), gname = labels(t.health.groups, group), grunning = inGroup.filter(i => i.id in progress);
      return rows.length > 0 && <motion.section key={group} data-group={group} {...rise(shown++)}>
        <div className={`${grid} cursor-pointer rounded-xl py-2.5 hover:bg-foreground/[0.03]`} onClick={() => toggle(gkey)}>
          {box(inGroup, gname)}
          <div className="min-w-0"><h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-[.4px] text-muted-foreground"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/[0.05]"><GroupIcon size={13}/></span><span className="truncate">{caps(gname)}</span></h2>{grunning.length > 0 && <Bar value={grunning.reduce((s, i) => s + progress[i.id], 0) / grunning.length}/>}</div>
          <span className="text-right text-[12px] text-muted-foreground tabular-nums">{num(entries(inGroup))}</span>
          <span className="text-right text-[12px] font-medium tabular-nums">{bytes(inGroup) ? size(bytes(inGroup)) : '—'}</span>
          <button type="button" aria-expanded={gopen} aria-label={t.health.details(gname)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><ChevronDown size={15} className={`${chevron} ${gopen ? 'rotate-180' : ''}`}/></button>
        </div>
        <AnimatePresence initial={false}>{gopen && <motion.div key="rows" {...collapse}><div className="ml-[34px] border-l pl-2"><AnimatePresence initial={false}>{rows.map(({ category, key, list }) => {
          const name = labels(onMac ? { ...t.health.categories, ...t.health.macCategories } : t.health.categories, category), expanded = open.includes(key), running = list.filter(i => i.id in progress);
          return <motion.div key={key} {...collapse} data-category={category}>
            <div className={`${grid} cursor-pointer rounded-xl py-2.5 hover:bg-foreground/[0.03]`} onClick={() => toggle(key)}>
              {box(list, name)}
              <div className="min-w-0"><p className="truncate text-[12px] font-medium">{name}</p>{running.length > 0 && <Bar value={running.reduce((s, i) => s + progress[i.id], 0) / running.length}/>}</div>
              <span className="text-right text-[12px] text-muted-foreground tabular-nums">{num(entries(list))}</span>
              <span className="text-right text-[12px] tabular-nums">{bytes(list) ? size(bytes(list)) : '—'}</span>
              <button type="button" aria-expanded={expanded} aria-label={t.health.details(name)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><ChevronDown size={15} className={`${chevron} ${expanded ? 'rotate-180' : ''}`}/></button>
            </div>
            <AnimatePresence initial={false}>{expanded && <motion.div key="list" {...collapse}><div className="mb-1 ml-[34px] border-l pl-2"><AnimatePresence initial={false}>{list.map(i => <motion.div key={i.id} {...collapse}>
              <ContextMenu><ContextMenuTrigger><div className={`${grid} py-1.5`}>
                {box([i], i.path)}
                <div className="min-w-0"><p className="truncate text-[12px]">{short(i.path)}</p>{i.label && <p className="truncate text-[10px] text-muted-foreground">{i.label}</p>}{i.id in progress && <Bar value={progress[i.id]}/>}</div>
                <span className="text-right text-[11px] text-muted-foreground tabular-nums">{num(i.count || 1)}</span>
                <span className="text-right text-[11px] text-muted-foreground tabular-nums">{i.size ? size(i.size) : '—'}</span><span/>
              </div></ContextMenuTrigger>
                <ContextMenuContent ariaLabel={t.health.itemActions} className="min-w-0 p-0.5">
                  {i.kind === 'files' && <ContextMenuItem onSelect={() => api!.healthReveal(i.id).catch((e: Error) => toast({ title: e.message, status: 'error' }))}><FolderOpen size={14}/>{t.revealExplorer}</ContextMenuItem>}
                  <ContextMenuItem onSelect={() => navigator.clipboard.writeText(i.path).then(() => toast({ title: t.pathCopied, status: 'success' }))}><Copy size={14}/>{t.copyPath}</ContextMenuItem>
                </ContextMenuContent></ContextMenu>
            </motion.div>)}</AnimatePresence></div></motion.div>}</AnimatePresence>
          </motion.div>;
        })}</AnimatePresence></div></motion.div>}</AnimatePresence>
      </motion.section>;
    })}
  </motion.div>}</AnimatePresence>;
}
