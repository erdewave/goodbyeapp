import './tauri';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { DeleteButton } from './components/Controls';
import { Button } from '@/components/motion/button/base';
import { StatefulButton, type ButtonState } from '@/components/motion/button/stateful';
import { Switch } from '@/components/motion/switch';
import { RadioGroup, RadioGroupItem } from '@/components/motion/radio';
import { DEFAULT_THEMES, ThemeSelector } from '@/components/motion/theme-selector';
import { CenterMorphModal, CenterMorphModalContent } from '@/components/motion/center-morph-modal';
import { Tooltip, TooltipProvider } from '@/components/motion/tooltip';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT, SPRING_LAYOUT, SPRING_SWAP } from '@/lib/ease';
import { AnimatedToastStack, useAnimatedToastStack } from '@/components/motion/animated-toast-stack';
import { Titlebar } from './Titlebar';
import { AppIcon } from './AppIcon';
import { LargeFiles } from './LargeFiles';
import { Remnants } from './Remnants';
import { HealthCheck } from './HealthCheck';
import { CommandPalette, type CommandItem } from '@/components/motion/command-palette';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/motion/select';
import { Grid2X2, HardDrive, Settings2, Search, Sun, Moon, Monitor, Palette, File as FileIcon, ChevronRight, Package, Minus, FolderOpen, Check, ArrowUp, HeartPulse, ArrowDown, ChevronsUpDown, Languages } from 'lucide-react';
import { t, locale, language as savedLanguage, languages, setLanguage, type Language } from './i18n';
import './index.css';
import type { Candidate, CleanResult, FileHit, InstalledApp } from './types';

const api = window.goodbyeapp!; // load() reports a missing bridge before anything else calls it
const views = ['apps', 'files', 'health', 'settings'] as const;
const viewIcons = { apps: Grid2X2, files: HardDrive, health: HeartPulse, settings: Settings2 };
// Remnant picker tabs are t.steps (steps 1-2); step 3 is the summary, both tabs show as done.
// Background uninstall: one job per app, run through the serial queue, mirrored as a minimizable toast.
type Phase = 'queued' | 'uninstalling' | 'scanning' | 'review' | 'cleaning' | 'done' | 'failed';
type Job = { app: InstalledApp; phase: Phase; candidates: Candidate[]; results: CleanResult[]; restore: string | null; error?: string };
const running = (job?: Job) => !!job && job.phase !== 'done' && job.phase !== 'failed';
function jobText(job: Job) {
  const failed = job.results.filter(r => !r.ok).length, cleaned = job.results.length - failed;
  if (job.phase === 'review') return t.found(job.candidates.length);
  if (job.phase === 'failed') return job.error || t.phase.failed;
  return t.phase[job.phase] + (job.phase !== 'done' ? '' : (cleaned ? t.cleanedTail(cleaned) : '') + (failed ? t.leftTail(failed) : '') + (job.restore === 'created' ? t.restoreTail : ''));
}
const columns = ['name', 'publisher', 'size'] as const;
const publisher = (a: InstalledApp | null) => a?.publisher || (a?.source === 'macOS' ? t.macApp : t.unknownPublisher);
const compare: Record<string, (a: InstalledApp, b: InstalledApp) => number> = { name: (a, b) => a.name.localeCompare(b.name, locale), publisher: (a, b) => publisher(a).localeCompare(publisher(b), locale), size: (a, b) => a.size - b.size };
// [key, light, dark]: light values stay dark enough for white button text.
const accents = [['purple', '#6e6bd5', '#9390ee'], ['blue', '#2f6fdb', '#6aa2f5'], ['teal', '#0e8494', '#4cc3d4'], ['green', '#2e8b57', '#5fcf8f'], ['amber', '#a8730f', '#e6b450'], ['orange', '#c45a16', '#f29a5c'], ['pink', '#c2417a', '#ee82b4'], ['graphite', '#55555c', '#b4b4bc']] as const;
const [darkTheme, lightTheme] = DEFAULT_THEMES;
const themeOptions = () => [{ ...lightTheme, label: t.themes.light }, { ...darkTheme, label: t.themes.dark }, { value: 'system', label: t.themes.system, colors: lightTheme.colors, alt: darkTheme.colors }];
const languageLabel = (l: Language) => ({ system: t.systemLanguage, tr: 'Türkçe', en: 'English' })[l];
const widths = ['w-[44%]', 'w-[28%]', 'w-[14%]'];
const emptyState = 'text-center text-muted-foreground [&_h3]:mb-[7px] [&_h3]:text-[14px] [&_h3]:font-[550] [&_h3]:text-foreground [&>svg]:mx-auto [&>svg]:mb-3.5 [&>svg]:block';
const settingRow = 'flex items-center justify-between gap-6 border-b py-[19px] [&_h3]:text-[12px] [&_h3]:font-medium';
const size = (n: number) => !n ? '—' : (n / (n >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2)).toLocaleString(locale, { maximumFractionDigits: 1 }) + (n >= 1024 ** 3 ? ' GB' : ' MB');
// Animates its height to the measured height of its content, so the dialog grows and shrinks smoothly between steps.
function AutoHeight({ className, children }: { className?: string; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null), [height, setHeight] = useState<number | 'auto'>('auto'), reduce = useReducedMotion();
  useLayoutEffect(() => { const el = inner.current!, observer = new ResizeObserver(() => setHeight(el.offsetHeight)); observer.observe(el); return () => observer.disconnect(); }, []);
  return <motion.div className={`overflow-hidden ${className ?? ''}`} initial={false} animate={{ height }} transition={reduce ? { duration: 0 } : SPRING_LAYOUT}><div ref={inner}>{children}</div></motion.div>;
}
function App() {
  const reduce = useReducedMotion();
  const [apps, setApps] = useState<InstalledApp[]>([]), [loaded, setLoaded] = useState(false);
  const [icons, setIcons] = useState<Record<string, string>>({}), iconGeneration = useRef(0);
  const [view, setView] = useState('apps'), [sort, setSort] = useState({ key: 'name', dir: 1 }), [scrolled, setScrolled] = useState(false), scroller = useRef<HTMLDivElement>(null), scrollAt = useRef<Record<string, number>>({});
  // One scroll container serves every tab, so each tab's offset is saved and restored on switch.
  useLayoutEffect(() => { if (scroller.current) scroller.current.scrollTop = scrollAt.current[view] ?? 0; }, [view]);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const toast = useAnimatedToastStack({ defaultDuration: 8000 }), [busy, setBusy] = useState(false), queue = useRef<Promise<unknown>>(Promise.resolve());
  const [jobs, setJobs] = useState<Record<string, Job>>({}), [review, setReview] = useState<string | null>(null), [step, setStep] = useState(1), [selected, setSelected] = useState<string[]>([]), [action, setAction] = useState<ButtonState>('idle'), shown = useRef<Record<string, string>>({}), [mini, setMini] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false), [spot, setSpot] = useState<string | null>(null), [fileSpot, setFileSpot] = useState<{ path: string } | null>(null), [bigFiles, setBigFiles] = useState<FileHit[]>([]);
  const [restorePoint, setRestorePoint] = useState(() => localStorage.getItem('restorePoint') === '1');
  useEffect(() => { localStorage.setItem('restorePoint', restorePoint ? '1' : '0'); }, [restorePoint]);
  const [autoUpdate, setAutoUpdate] = useState(() => localStorage.getItem('autoUpdate') !== '0'), [version, setVersion] = useState(''), [updateCheck, setUpdateCheck] = useState<ButtonState>('idle'), updateReady = useRef(false), [updatePending, setUpdatePending] = useState(false);
  const installUpdate = () => { api.installUpdate().catch((e: Error) => toast.showToast({ title: e.message, status: 'error' })); };
  useEffect(() => { localStorage.setItem('autoUpdate', autoUpdate ? '1' : '0'); }, [autoUpdate]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    localStorage.setItem('theme', theme); apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  const [language, setLanguageState] = useState(savedLanguage);
  const changeLanguage = (next: Language) => { setLanguage(next); setLanguageState(next); };
  const [accent, setAccent] = useState(() => localStorage.getItem('accent') || 'blue');
  useEffect(() => {
    const [, light, dark] = accents.find(([key]) => key === accent) || accents[1], root = document.documentElement.style;
    root.setProperty('--pick', light); root.setProperty('--pick-dark', dark); localStorage.setItem('accent', accent);
  }, [accent]);
  useEffect(() => { document.body.setAttribute('aria-busy', String(busy)); }, [busy]);
  // The main process runs one locked call at a time, so every locked call goes through this queue.
  function serial<T>(fn: () => Promise<T>) { const run = queue.current.then(fn); queue.current = run.catch(() => {}); return run; }
  async function task(fn: () => Promise<unknown>) { setBusy(true); try { await serial(fn); } catch (e) { toast.showToast({ title: (e as Error).message, status: 'error' }); setReview(null); } finally { setBusy(false); } }
  const patch = (id: string, next: Partial<Job>) => setJobs(old => ({ ...old, [id]: { ...old[id], ...next } }));
  function remove(app: InstalledApp) {
    if (running(jobs[app.id])) return;
    setJobs(old => ({ ...old, [app.id]: { app, phase: 'queued', candidates: [], results: [], restore: null } }));
    serial(async () => {
      patch(app.id, { phase: 'uninstalling' });
      const { restore } = await api.uninstall(app.id, { restorePoint: app.source === 'Windows' && restorePoint });
      patch(app.id, { phase: 'scanning', restore: restore ?? null });
      await load();
      const candidates = await api.scan(app.id);
      patch(app.id, { phase: candidates.length ? 'review' : 'done', candidates });
      if (candidates.length) setReview(open => open ?? app.id); // remnants found: open the picker unless another is showing
    }).catch((e: Error) => patch(app.id, { phase: 'failed', error: e.message }));
  }
  useEffect(() => { setStep(1); setSelected([]); }, [review]);
  useEffect(() => {
    for (const [id, job] of Object.entries(jobs)) {
      const key = job.phase + job.results.length + !!mini[id];
      if (shown.current[id] === key) continue;
      shown.current[id] = key;
      const next = { title: job.app.name, description: jobText(job), dismissible: false, minimized: !!mini[id], onMinimizeChange: (m: boolean) => setMini(old => ({ ...old, [id]: m })), status: job.phase === 'done' ? 'success' as const : job.phase === 'failed' ? 'error' as const : job.phase === 'review' ? 'info' as const : 'loading' as const,
        duration: job.phase === 'done' ? 6000 : job.phase === 'failed' ? 10000 : 0, action: job.phase === 'review' ? { label: t.review, onClick: () => setReview(id) } : undefined };
      if (toast.toasts.some(t => t.id === 'job-' + id)) toast.updateToast('job-' + id, next); else toast.showToast({ id: 'job-' + id, ...next });
    }
  }, [jobs, mini, toast]);
  async function load() {
    if (!api) throw new Error(t.noBridge);
    const result = await api.load(); setApps(result.apps); setVersion(result.version); setLoaded(true);
    const generation = ++iconGeneration.current;
    // Merge: an uninstalled app's icon file is gone on refresh, but its wizard still shows the logo read earlier.
    api.icons().then(next => { if (generation === iconGeneration.current) setIcons(old => ({ ...old, ...next })); }).catch(() => {});
    api.sizes().then(next => { if (generation === iconGeneration.current) setApps(old => old.map(a => next[a.id] ? { ...a, size: next[a.id] } : a)); }).catch(() => {});
    return result.apps;
  }
  useEffect(() => { task(load); }, []);
  useEffect(() => {
    if (!api) return;
    const off = api.onUpdate(({ ready }) => { updateReady.current = ready; toast.dismissToast('update');
      toast.showToast({ id: 'update', title: t.update.title, description: ready ? t.update.ready : t.update.available, status: 'info', duration: 0,
        action: { primary: true, label: ready ? t.update.install : t.update.download, onClick: () => { api.installUpdate().catch((e: Error) => toast.showToast({ title: e.message, status: 'error' })); } },
        ...(ready && { secondaryAction: { label: t.update.later, onClick: () => { toast.dismissToast('update'); setUpdatePending(true); } } }) }); });
    if (autoUpdate) api.checkUpdate().catch(() => {}); // a failed launch check stays silent; the next launch retries
    return off;
  }, []);
  const job = review ? jobs[review] : undefined, detail = job?.app ?? null, candidates = job?.candidates ?? [], results = job?.results ?? [];
  // Manual check from Settings. Downloads show a progress toast until the 'update' event (ready) replaces it.
  async function checkUpdate() {
    setUpdateCheck('loading');
    try {
      const found = await api.checkUpdate();
      setUpdateCheck(found ? 'idle' : 'success');
      if (!found) toast.showToast({ title: t.update.upToDateToast, status: 'success' });
      else if (found.downloading && !updateReady.current) { toast.dismissToast('update'); toast.showToast({ id: 'update', title: t.update.title, description: t.update.downloading, status: 'loading', duration: 0 }); }
    } catch (e) { setUpdateCheck('error'); toast.showToast({ title: (e as Error).message, status: 'error' }); }
    setTimeout(() => setUpdateCheck('idle'), 1500);
  }
  async function act(fn: () => Promise<void>, after?: () => void) {
    setBusy(true); setAction('loading');
    try { await serial(fn); setAction('success'); setTimeout(() => { setAction('idle'); after?.(); }, 700); }
    catch (e) { setAction('error'); toast.showToast({ title: (e as Error).message, status: 'error' }); setTimeout(() => setAction('idle'), 1500); }
    finally { setBusy(false); }
  }
  async function clean() { const id = review!; patch(id, { phase: 'cleaning' }); try { patch(id, { phase: 'done', results: selected.length ? (await api.clean(id, selected)).results : [] }); } catch (e) { patch(id, { phase: 'review' }); throw e; } }
  async function elevate() { const id = review!, retried = (await api.cleanElevated(id)).results; patch(id, { results: [...results.filter(r => r.ok), ...retried] }); }
  // Palette pick: scroll the app's row into view, focus it and highlight it briefly.
  useEffect(() => {
    if (!spot || view !== 'apps') return;
    const row = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(spot)}"]`);
    row?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    row?.focus({ preventScroll: true });
    const timer = setTimeout(() => setSpot(null), 1800);
    return () => clearTimeout(timer);
  }, [spot, view]);
  const installed = apps.filter(a => !a.removed);
  const rows = [...installed].sort((a, b) => compare[sort.key](a, b) * sort.dir);
  const registry = candidates.filter(c => c.kind === 'registry'), files = candidates.filter(c => c.kind !== 'registry'), failed = results.filter(r => !r.ok), windows = detail?.source === 'Windows';
  const restoreNote = job?.restore ?? null;
  const badge = (text: string) => <span className="text-[11px] text-muted-foreground tabular-nums">{text}</span>;
  const commands: CommandItem[] = [
    ...views.map(key => ({ id: 'go-' + key, group: t.go, label: t.nav[key], icon: viewIcons[key], onSelect: () => setView(key) })),
    ...themeOptions().map((o, i) => ({ id: 'theme-' + o.value, group: t.nav.settings, label: `${t.appearance}: ${o.label}`, icon: [Sun, Moon, Monitor][i], onSelect: () => setTheme(o.value) })),
    ...languages.map(l => ({ id: 'language-' + l, group: t.nav.settings, label: `${t.language}: ${languageLabel(l)}`, icon: Languages, onSelect: () => changeLanguage(l) })),
    ...accents.map(([key, light]) => ({ id: 'accent-' + key, group: t.nav.settings, label: `${t.accent}: ${t.accents[key]}`, icon: Palette, badge: <span className="block size-3 rounded-full" style={{ background: light }}/>, onSelect: () => setAccent(key) })),
    { id: 'backups', group: t.nav.settings, label: t.openBackupsCommand, icon: FolderOpen, onSelect: () => task(() => api.backups()) },
    ...installed.map(a => ({ id: 'app-' + a.id, group: t.nav.apps, label: a.name, keywords: [publisher(a)], leading: <AppIcon app={a} icons={icons} small/>, badge: badge(size(a.size)), onSelect: () => { setView('apps'); setSpot(a.id); } })),
    ...bigFiles.map(f => ({ id: 'file-' + f.path, group: t.fileGroup, label: f.name, keywords: [f.path], icon: FileIcon, badge: badge(size(f.size)), onSelect: () => { setView('files'); setFileSpot({ path: f.path }); } })),
  ];
  return <>
    <Titlebar/>
    <aside className="fixed top-(--titlebar-height) bottom-0 left-0 flex w-(--sidebar-width) flex-col items-center bg-sidebar pt-4 pb-4">
      <Tooltip content={t.searchHint} side="right"><button type="button" id="search-button" aria-label={t.search} className="mb-1 grid size-10 place-items-center rounded-xl text-muted-foreground hover:text-foreground [&_svg]:size-[19px] [&_svg]:stroke-[1.65]" onClick={() => setPaletteOpen(true)}><Search size={17}/></button></Tooltip>
      <nav className="flex flex-1 flex-col items-center gap-1" aria-label={t.mainMenu}>{views.map(key => { const label = t.nav[key], Icon = viewIcons[key]; return <Tooltip key={key} content={label} side="right"><button type="button" disabled={busy} aria-current={view === key ? 'page' : undefined} className={`relative grid size-10 place-items-center rounded-xl text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:relative [&_svg]:size-[19px] [&_svg]:stroke-[1.65] ${key === 'settings' ? 'mt-auto' : ''} ${view === key ? 'font-medium [&_svg]:text-primary' : '[&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'}`} data-view={key} onClick={() => setView(key)}>{view === key && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-primary/15" transition={reduce ? { duration: 0 } : SPRING_LAYOUT}/>}<Icon size={17}/><span className="sr-only">{label}</span>{key === 'settings' && updatePending && <span id="update-dot" role="img" aria-label={t.update.title} className="absolute top-2 right-2 size-2 rounded-full bg-orange-500 ring-2 ring-background"/>}{key === 'apps' && <b id="nav-count" className="sr-only">{loaded ? installed.length : '—'}</b>}</button></Tooltip>; })}</nav>
    </aside>
    <main className="fixed inset-y-0 right-0 left-(--sidebar-width) rounded-l-2xl border-l bg-background pt-(--titlebar-height)">
      <div ref={scroller} onScroll={e => { scrollAt.current[view] = e.currentTarget.scrollTop; setScrolled(e.currentTarget.scrollTop > 240); }} className="h-full overflow-y-auto px-5 pb-7 max-[1050px]:px-4 max-[1050px]:pb-6"><h1 id="page-title" className="sr-only">{t.nav[view as typeof views[number]]}</h1>
      <section id="apps-view" className="animate-content-in pt-3" hidden={view !== 'apps'}>
        <div className="overflow-hidden"><table className="w-full table-fixed border-collapse text-left"><thead><tr className="[&_th]:px-2 [&_th]:pt-[5px] [&_th]:pb-[11px] [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-muted-foreground">{columns.map((key, i) => { const dir = sort.key === key ? sort.dir : 0; const Icon = dir > 0 ? ArrowUp : dir < 0 ? ArrowDown : ChevronsUpDown; return <th key={key} className={widths[i]} aria-sort={dir > 0 ? 'ascending' : dir < 0 ? 'descending' : 'none'}><Tooltip content={dir > 0 ? t.sortDesc : t.sortAsc}><button type="button" className={`inline-flex items-center gap-[5px] ${dir ? 'text-primary' : 'hover:text-foreground [&_svg]:opacity-45'}`} data-sort={key} onClick={() => setSort({ key, dir: dir > 0 ? -1 : 1 })}>{t.columns[key]}<Icon size={12}/></button></Tooltip></th>; })}<th><span className="sr-only">{t.actions}</span></th></tr></thead><tbody id="app-list" className="[&_td]:border-t [&_td]:border-[color-mix(in_srgb,var(--border)_55%,transparent)] [&_td]:px-2 [&_td]:py-[11px] [&_td]:text-[12px] [&_td]:wrap-anywhere [&_tr:first-child_td]:border-t-transparent">{!loaded ? Array.from({length:5},(_,i) => <tr className="[&_td]:h-[65px]" key={i}><td><div className="h-[17px] w-3/4 animate-skeleton rounded-[4px] bg-muted"/></td><td><div className="h-[17px] w-3/4 animate-skeleton rounded-[4px] bg-muted"/></td><td className="text-muted-foreground">—</td><td/></tr>) : rows.map(a => <tr key={a.id} data-row={a.id} tabIndex={-1} className={`transition-colors duration-500 ${spot === a.id ? 'bg-primary/10' : ''}`}><td><div className="flex items-center gap-2.5"><AppIcon app={a} icons={icons}/><div><strong className="block text-[12px] leading-[1.35] font-medium">{a.name}</strong><small className="mt-0.5 block text-[10px] text-muted-foreground">{a.version || a.source}</small></div></div></td><td className="text-muted-foreground">{publisher(a)}</td><td className="whitespace-nowrap text-muted-foreground tabular-nums">{size(a.size)}</td><td className="text-right"><DeleteButton disabled={running(jobs[a.id])} data-app={a.id} aria-label={t.uninstallApp(a.name)} onConfirm={() => remove(a)}/></td></tr>)}</tbody></table><div id="empty" className={`${emptyState} px-6 py-[72px]`} hidden={rows.length > 0 || !loaded}><Package size={30}/><h3>{t.noApps}</h3></div></div>
      </section>
      <section id="files-view" className="animate-content-in" hidden={view !== 'files'}><LargeFiles size={size} spot={fileSpot} onFiles={setBigFiles} onError={text => toast.showToast({ title: text, status: 'error' })} onCopied={() => toast.showToast({ title: t.pathCopied, status: 'success' })}/></section>
      <section id="health-view" className="animate-content-in" hidden={view !== 'health'}><HealthCheck size={size} serial={serial} busy={busy} setBusy={setBusy} toast={toast.showToast}/></section>
      <section id="settings-view" className="animate-content-in" hidden={view !== 'settings'}><div className="px-2 py-6"><h2 className="mb-[18px] text-[13px] font-medium tracking-[-.3px]">{t.preferences}</h2><div className="border-b pt-[19px] pb-6 [&_h3]:text-[12px] [&_h3]:font-medium"><h3 id="theme-label">{t.appearance}</h3><ThemeSelector aria-labelledby="theme-label" className="mt-4" themes={themeOptions()} value={theme} onChange={setTheme}/></div><div className={settingRow}><div><h3 id="accent-label">{t.accent}</h3></div><RadioGroup orientation="horizontal" aria-labelledby="accent-label" value={accent} onValueChange={setAccent} className="gap-3">{accents.map(([key, light, dark]) => <Tooltip key={key} content={t.accents[key]}><span className="inline-flex" data-accent={key}><RadioGroupItem value={key} aria-label={t.accents[key]} className="p-1" controlClassName="border-transparent bg-(--swatch) hover:border-transparent dark:bg-(--swatch-dark)" indicatorClassName="-inset-1 border-2 border-foreground bg-transparent" style={{ '--swatch': light, '--swatch-dark': dark } as CSSProperties}/></span></Tooltip>)}</RadioGroup></div><div className={settingRow}><div><h3>{t.language}</h3></div><Select value={language} onValueChange={l => changeLanguage(l as Language)} className="w-44"><SelectTrigger className="py-1.5 text-[12px]"><SelectValue/></SelectTrigger><SelectContent>{languages.map(l => <SelectItem key={l} value={l} className="text-[12px]">{languageLabel(l)}</SelectItem>)}</SelectContent></Select></div><div className={settingRow}><div><h3>{t.restorePoint}</h3><p className="mt-1 text-[11px] text-muted-foreground">{t.restorePointNote}</p></div><Switch ariaLabel={t.restorePointToggle} checked={restorePoint} onCheckedChange={setRestorePoint}/></div><div className={settingRow}><div><h3>{t.backups}</h3></div><Button disabled={busy} id="backups" variant="secondary" size="sm" onClick={() => task(() => api.backups())}><FolderOpen size={15}/>{t.openBackups}</Button></div><div className={settingRow}><div><h3>{t.update.auto}</h3><p className="mt-1 text-[11px] text-muted-foreground">{t.update.autoNote}</p></div><Switch ariaLabel={t.update.autoToggle} checked={autoUpdate} onCheckedChange={setAutoUpdate}/></div><div className={settingRow}><div><h3>{t.update.version}</h3><p id="app-version" className="mt-1 text-[11px] text-muted-foreground">GoodbyeAPP {version}</p></div><div className="flex items-center gap-2">{updatePending && <Button id="update-restart" size="sm" pressScale={1} onClick={installUpdate}>{t.update.install}</Button>}<StatefulButton id="check-update" variant="secondary" size="sm" state={updateCheck} loadingText={t.update.checking} successText={t.update.upToDate} errorText={t.retry} onClick={checkUpdate}>{t.update.check}</StatefulButton></div></div></div></section>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center"><AnimatePresence>{scrolled && <motion.div key="to-top" className="pointer-events-auto rounded-full border bg-popover p-1 shadow-lg" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }} transition={reduce ? { duration: 0.1 } : SPRING_LAYOUT}><Button variant="ghost" size="sm" className="rounded-full" onClick={() => scroller.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })}><ArrowUp size={14}/>{t.toTop}</Button></motion.div>}</AnimatePresence></div>
    </main>
    <CenterMorphModal open={!!detail} onOpenChange={next => { if (!next && !busy) setReview(null); }}><CenterMorphModalContent ariaLabel={detail?.name ?? ''} ariaDescribedBy="detail-subtitle" dismissible={!busy} showCloseButton={false} className="max-w-[440px] bg-popover"><div id="detail" className="p-5">
      <div className="flex items-center gap-3"><AppIcon app={detail} icons={icons} id="detail-icon" large/><div className="min-w-0 flex-1"><h2 id="detail-name" className="truncate text-base font-semibold tracking-[-.3px]">{detail?.name}</h2><p id="detail-subtitle" className="truncate text-xs text-muted-foreground">{publisher(detail)} · {detail?.version || detail?.source}</p></div><Tooltip content={t.minimizeHint}><button type="button" disabled={busy} id="close-detail" aria-label={t.minimize} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50" onClick={() => setReview(null)}><Minus size={16}/></button></Tooltip></div>
      <ol className="mt-4 flex rounded-full bg-foreground/[0.04] p-1 text-xs" aria-label={t.stepsLabel}>{t.steps.map((label, i) => { const n = i + 1; return <li key={label} aria-current={n === step ? 'step' : undefined} className={`relative flex flex-1 items-center justify-center rounded-full py-1.5 transition-colors ${n === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{n === step && <motion.span layoutId="review-step" className="absolute inset-0 rounded-full bg-background shadow-[0_1px_3px_#0000001a]" transition={reduce ? { duration: 0 } : SPRING_LAYOUT}/>}<span className="relative flex items-center gap-1.5">{n < step && <Check size={12} strokeWidth={3} className="text-primary"/>}{label}</span></li>; })}</ol>
      <AutoHeight className="mt-4"><div id="step-body" data-step={step}><AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.24, ease: EASE_OUT } }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.16, ease: EASE_OUT } }}>
        {step === 1 && <Remnants items={registry} selected={selected} setSelected={setSelected} busy={busy} empty={t.noRegistry}/>}
        {step === 2 && <Remnants items={files} selected={selected} setSelected={setSelected} busy={busy} empty={t.noDisk}/>}
        {step === 3 && <div id="summary" className="flex flex-col items-center py-6 text-center"><motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_SWAP} className="mb-3 grid size-12 place-items-center rounded-full bg-primary/15 text-primary"><Check size={22} strokeWidth={2.5}/></motion.span><h3 className="text-base font-semibold">{t.removed(detail?.name ?? '')}</h3><p className="mt-1 text-xs text-muted-foreground">{t.cleaned(results.length - failed.length)}{failed.length ? t.notCleaned(failed.length) : ''}</p>{failed.length > 0 && <div className="mt-4 flex max-h-[30vh] w-full flex-col gap-1.5 overflow-y-auto">{failed.map(r => <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-left text-xs wrap-anywhere text-destructive" key={r.path}>{r.path} · {r.error}</p>)}</div>}{restoreNote && <p className="mt-3 text-xs text-muted-foreground" id="restore-note">{restoreNote === 'created' ? t.restoreCreated : restoreNote === 'skipped' ? t.restoreSkipped : restoreNote}</p>}</div>}
      </motion.div></AnimatePresence></div></AutoHeight>
      <div className="mt-5 flex gap-2 [&>button]:flex-1">
        {step === 1 && <Button id="next" onClick={() => setStep(2)}>{t.next}<ChevronRight size={16}/></Button>}
        {step === 2 && <><Button id="back" variant="secondary" className="border-0 bg-foreground/[0.06] hover:bg-foreground/[0.1]" disabled={busy} onClick={() => setStep(1)}>{t.back}</Button><StatefulButton id="clean" state={action} loadingText={t.cleaning} successText={t.cleanedButton} errorText={t.retry} onClick={() => act(clean, () => setStep(3))}>{t.clean}</StatefulButton></>}
        {step === 3 && windows && failed.length > 0 && <StatefulButton id="elevate" variant="secondary" className="border-0 bg-foreground/[0.06] hover:bg-foreground/[0.1]" state={action} loadingText={t.trying} successText={t.done} errorText={t.retry} onClick={() => act(elevate)}>{t.elevate}</StatefulButton>}
        {step === 3 && <Button id="finish" onClick={() => setReview(null)}>{t.close}</Button>}
      </div>
    </div></CenterMorphModalContent></CenterMorphModal>
    <CommandPalette items={commands} open={paletteOpen} onOpenChange={setPaletteOpen} placeholder={t.paletteSearch} emptyMessage={t.noResults}/>
    <AnimatedToastStack toasts={toast.toasts} onDismiss={toast.dismissToast} position="bottom-right" fixed/>
  </>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider delay={600}><App/></TooltipProvider>);
