import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { DeleteButton } from './components/Controls';
import { Button } from '@/components/motion/button/base';
import { StatefulButton, type ButtonState } from '@/components/motion/button/stateful';
import { Checkbox } from '@/components/motion/checkbox';
import { Switch } from '@/components/motion/switch';
import { DEFAULT_THEMES, ThemeSelector } from '@/components/motion/theme-selector';
import { CenterMorphModal, CenterMorphModalContent } from '@/components/motion/center-morph-modal';
import { Tooltip, TooltipProvider } from '@/components/motion/tooltip';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT, SPRING_LAYOUT, SPRING_SWAP } from '@/lib/ease';
import { AnimatedToastStack, useAnimatedToastStack } from '@/components/motion/animated-toast-stack';
import { Titlebar } from './Titlebar';
import { AppIcon } from './AppIcon';
import { LargeFiles } from './LargeFiles';
import { CommandPalette, type CommandItem } from '@/components/motion/command-palette';
import { Grid2X2, HardDrive, Settings2, Search, Sun, Moon, Monitor, Palette, File as FileIcon, ChevronRight, Package, Minus, FolderOpen, Check, CircleCheck, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import './index.css';
import type { Candidate, CleanResult, FileHit, InstalledApp } from './types';

const api = window.goodbyeapp!; // load() reports a missing bridge before anything else calls it
const labels: Record<string, string> = { apps: 'Uygulamalar', files: 'Büyük dosyalar', settings: 'Ayarlar' };
const steps = ['Kayıt defteri', 'Disk']; // remnant picker tabs (steps 1-2); step 3 is the summary, both tabs show as done
// Background uninstall: one job per app, run through the serial queue, mirrored as a minimizable toast.
type Phase = 'queued' | 'uninstalling' | 'scanning' | 'review' | 'cleaning' | 'done' | 'failed';
type Job = { app: InstalledApp; phase: Phase; candidates: Candidate[]; results: CleanResult[]; restore: string | null; error?: string };
const running = (job?: Job) => !!job && job.phase !== 'done' && job.phase !== 'failed';
function jobText(job: Job) {
  const failed = job.results.filter(r => !r.ok).length, cleaned = job.results.length - failed;
  return { queued: 'Sırada bekliyor', uninstalling: 'Kaldırıcı çalışıyor…', scanning: 'Kalıntılar taranıyor…', review: `${job.candidates.length} kalıntı bulundu`, cleaning: 'Kalıntılar temizleniyor…', failed: job.error || 'Kaldırılamadı',
    done: 'Kaldırıldı' + (cleaned ? ` · ${cleaned} öğe temizlendi` : '') + (failed ? ` · ${failed} öğe kaldı` : '') + (job.restore === 'created' ? ' · Geri yükleme noktası oluşturuldu' : '') }[job.phase];
}
const columns = [['name', 'Uygulama'], ['publisher', 'Yayıncı'], ['size', 'Boyut']];
const compare: Record<string, (a: InstalledApp, b: InstalledApp) => number> = { name: (a, b) => a.name.localeCompare(b.name, 'tr'), publisher: (a, b) => a.publisher.localeCompare(b.publisher, 'tr'), size: (a, b) => a.size - b.size };
// [key, label, light, dark]: light values stay dark enough for white button text.
const accents = [['purple', 'Mor', '#6e6bd5', '#9390ee'], ['blue', 'Mavi', '#2f6fdb', '#6aa2f5'], ['teal', 'Turkuaz', '#0e8494', '#4cc3d4'], ['green', 'Yeşil', '#2e8b57', '#5fcf8f'], ['amber', 'Kehribar', '#a8730f', '#e6b450'], ['orange', 'Turuncu', '#c45a16', '#f29a5c'], ['pink', 'Pembe', '#c2417a', '#ee82b4'], ['graphite', 'Grafit', '#55555c', '#b4b4bc']] as const;
const [darkTheme, lightTheme] = DEFAULT_THEMES;
const themeOptions = [{ ...lightTheme, label: 'Açık' }, { ...darkTheme, label: 'Koyu' }, { value: 'system', label: 'Otomatik', colors: lightTheme.colors, alt: darkTheme.colors }];
const widths = ['w-[44%]', 'w-[28%]', 'w-[14%]'];
const emptyState = 'text-center text-muted-foreground [&_h3]:mb-[7px] [&_h3]:text-[14px] [&_h3]:font-[550] [&_h3]:text-foreground [&>svg]:mx-auto [&>svg]:mb-3.5 [&>svg]:block';
const settingRow = 'flex items-center justify-between gap-6 border-b py-[19px] [&_h3]:text-[12px] [&_h3]:font-medium';
const size = (n: number) => !n ? '—' : (n / (n >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2)).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + (n >= 1024 ** 3 ? ' GB' : ' MB');
// Animates its height to the measured height of its content, so the dialog grows and shrinks smoothly between steps.
function AutoHeight({ className, children }: { className?: string; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null), [height, setHeight] = useState<number | 'auto'>('auto'), reduce = useReducedMotion();
  useLayoutEffect(() => { const el = inner.current!, observer = new ResizeObserver(() => setHeight(el.offsetHeight)); observer.observe(el); return () => observer.disconnect(); }, []);
  return <motion.div className={`overflow-hidden ${className ?? ''}`} initial={false} animate={{ height }} transition={reduce ? { duration: 0 } : SPRING_LAYOUT}><div ref={inner}>{children}</div></motion.div>;
}
function Remnants({ items, selected, setSelected, busy, empty }: { items: Candidate[]; selected: string[]; setSelected: Dispatch<SetStateAction<string[]>>; busy: boolean; empty: string }) {
  if (!items.length) return <div className="flex flex-col items-center py-8 text-center"><span className="mb-3 grid size-12 place-items-center rounded-full bg-foreground/[0.04] text-muted-foreground"><CircleCheck size={22}/></span><h3 className="text-sm font-medium">{empty}</h3><p className="mt-1 text-xs text-muted-foreground">Bu adımda temizlenecek bir şey yok.</p></div>;
  const ids = items.map(c => c.id), count = ids.filter(id => selected.includes(id)).length;
  return <div id="candidates">
    <div className="mb-2 flex items-center gap-3 px-1"><Checkbox id="select-all" disabled={busy} checked={count === ids.length} onCheckedChange={on => setSelected(old => on ? [...new Set([...old, ...ids])] : old.filter(id => !ids.includes(id)))}/><label htmlFor="select-all" className="flex-1 cursor-pointer text-xs font-medium">Tümünü seç</label><span className="text-xs text-muted-foreground tabular-nums">{count} / {ids.length} seçili</span></div>
    <div className="flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto">{items.map(c => <div key={c.id} className="flex items-start gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3"><Checkbox id={'candidate-' + c.id} disabled={busy} checked={selected.includes(c.id)} onCheckedChange={on => setSelected(old => on ? [...old, c.id] : old.filter(id => id !== c.id))}/><label htmlFor={'candidate-' + c.id} className="min-w-0 flex-1 cursor-pointer text-xs leading-5 wrap-anywhere">{c.path}{c.reason && <span className="block text-muted-foreground">{c.reason}</span>}</label></div>)}</div>
  </div>;
}
function App() {
  const reduce = useReducedMotion();
  const [apps, setApps] = useState<InstalledApp[]>([]), [loaded, setLoaded] = useState(false);
  const [icons, setIcons] = useState<Record<string, string>>({}), iconGeneration = useRef(0);
  const [view, setView] = useState('apps'), [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const toast = useAnimatedToastStack({ defaultDuration: 8000 }), [busy, setBusy] = useState(false), queue = useRef<Promise<unknown>>(Promise.resolve());
  const [jobs, setJobs] = useState<Record<string, Job>>({}), [review, setReview] = useState<string | null>(null), [step, setStep] = useState(1), [selected, setSelected] = useState<string[]>([]), [action, setAction] = useState<ButtonState>('idle'), shown = useRef<Record<string, string>>({}), [mini, setMini] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false), [bigFiles, setBigFiles] = useState<FileHit[]>([]);
  const [restorePoint, setRestorePoint] = useState(() => localStorage.getItem('restorePoint') === '1');
  useEffect(() => { localStorage.setItem('restorePoint', restorePoint ? '1' : '0'); }, [restorePoint]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    localStorage.setItem('theme', theme); apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  const [accent, setAccent] = useState(() => localStorage.getItem('accent') || 'purple');
  useEffect(() => {
    const [, , light, dark] = accents.find(([key]) => key === accent) || accents[0], root = document.documentElement.style;
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
        duration: job.phase === 'done' ? 6000 : job.phase === 'failed' ? 10000 : 0, action: job.phase === 'review' ? { label: 'İncele', onClick: () => setReview(id) } : undefined };
      if (toast.toasts.some(t => t.id === 'job-' + id)) toast.updateToast('job-' + id, next); else toast.showToast({ id: 'job-' + id, ...next });
    }
  }, [jobs, mini, toast]);
  async function load() {
    if (!api) throw new Error('Masaüstü bağlantısı yok. Uygulamayı npm start ile aç.');
    const result = await api.load(); setApps(result.apps); setLoaded(true);
    const generation = ++iconGeneration.current;
    // Merge: an uninstalled app's icon file is gone on refresh, but its wizard still shows the logo read earlier.
    api.icons().then(next => { if (generation === iconGeneration.current) setIcons(old => ({ ...old, ...next })); }).catch(() => {});
    api.sizes().then(next => { if (generation === iconGeneration.current) setApps(old => old.map(a => next[a.id] ? { ...a, size: next[a.id] } : a)); }).catch(() => {});
    return result.apps;
  }
  useEffect(() => { task(load); }, []);
  const job = review ? jobs[review] : undefined, detail = job?.app ?? null, candidates = job?.candidates ?? [], results = job?.results ?? [];
  async function act(fn: () => Promise<void>, after?: () => void) {
    setBusy(true); setAction('loading');
    try { await serial(fn); setAction('success'); setTimeout(() => { setAction('idle'); after?.(); }, 700); }
    catch (e) { setAction('error'); toast.showToast({ title: (e as Error).message, status: 'error' }); setTimeout(() => setAction('idle'), 1500); }
    finally { setBusy(false); }
  }
  async function clean() { const id = review!; patch(id, { phase: 'cleaning' }); try { patch(id, { phase: 'done', results: selected.length ? (await api.clean(id, selected)).results : [] }); } catch (e) { patch(id, { phase: 'review' }); throw e; } }
  async function elevate() { const id = review!, retried = (await api.cleanElevated(id)).results; patch(id, { results: [...results.filter(r => r.ok), ...retried] }); }
  const installed = apps.filter(a => !a.removed);
  const rows = [...installed].sort((a, b) => compare[sort.key](a, b) * sort.dir);
  const registry = candidates.filter(c => c.kind === 'registry'), files = candidates.filter(c => c.kind !== 'registry'), failed = results.filter(r => !r.ok), windows = detail?.source === 'Windows';
  const restoreNote = job?.restore ?? null;
  const badge = (text: string) => <span className="text-[11px] text-muted-foreground tabular-nums">{text}</span>;
  const commands: CommandItem[] = [
    ...Object.entries(labels).map(([key, label], i) => ({ id: 'go-' + key, group: 'Git', label, icon: [Grid2X2, HardDrive, Settings2][i], onSelect: () => setView(key) })),
    ...themeOptions.map((t, i) => ({ id: 'theme-' + t.value, group: 'Ayarlar', label: 'Görünüm: ' + t.label, icon: [Sun, Moon, Monitor][i], onSelect: () => setTheme(t.value) })),
    ...accents.map(([key, label, light]) => ({ id: 'accent-' + key, group: 'Ayarlar', label: 'Uygulama rengi: ' + label, icon: Palette, badge: <span className="block size-3 rounded-full" style={{ background: light }}/>, onSelect: () => setAccent(key) })),
    { id: 'backups', group: 'Ayarlar', label: 'Kayıt defteri yedek klasörünü aç', icon: FolderOpen, onSelect: () => task(() => api.backups()) },
    ...installed.map(a => ({ id: 'app-' + a.id, group: 'Uygulamalar', label: a.name, keywords: [a.publisher], icon: Package, badge: badge(size(a.size)), onSelect: () => { setView('apps'); requestAnimationFrame(() => document.querySelector(`[data-app="${CSS.escape(a.id)}"]`)?.scrollIntoView({ block: 'center' })); } })),
    ...bigFiles.map(f => ({ id: 'file-' + f.path, group: 'Dosyalar', label: f.name, keywords: [f.path], icon: FileIcon, badge: badge(size(f.size)), onSelect: () => { api.reveal(f.path).catch((e: Error) => toast.showToast({ title: e.message, status: 'error' })); } })),
  ];
  return <>
    <Titlebar/>
    <aside className="fixed top-(--titlebar-height) bottom-0 left-0 flex w-(--sidebar-width) flex-col items-center bg-sidebar pt-4 pb-4">
      <Tooltip content="Ara · Ctrl K" side="right"><button type="button" id="search-button" aria-label="Ara" className="mb-1 grid size-10 place-items-center rounded-xl text-muted-foreground hover:text-foreground [&_svg]:size-[19px] [&_svg]:stroke-[1.65]" onClick={() => setPaletteOpen(true)}><Search size={17}/></button></Tooltip>
      <nav className="flex flex-1 flex-col items-center gap-1" aria-label="Ana menü">{Object.entries(labels).map(([key, label], i) => { const Icon = [Grid2X2, HardDrive, Settings2][i]; return <Tooltip key={key} content={label} side="right"><button type="button" disabled={busy} aria-current={view === key ? 'page' : undefined} className={`relative grid size-10 place-items-center rounded-xl text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:relative [&_svg]:size-[19px] [&_svg]:stroke-[1.65] ${key === 'settings' ? 'mt-auto' : ''} ${view === key ? 'font-medium [&_svg]:text-primary' : '[&_svg]:text-muted-foreground hover:[&_svg]:text-foreground'}`} data-view={key} onClick={() => setView(key)}>{view === key && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-primary/15" transition={reduce ? { duration: 0 } : SPRING_LAYOUT}/>}<Icon size={17}/><span className="sr-only">{label}</span>{key === 'apps' && <b id="nav-count" className="sr-only">{loaded ? installed.length : '—'}</b>}</button></Tooltip>; })}</nav>
    </aside>
    <main className="fixed inset-y-0 right-0 left-(--sidebar-width) rounded-l-2xl border-l bg-background pt-(--titlebar-height)">
      <div className="h-full overflow-y-auto px-5 pb-7 max-[1050px]:px-4 max-[1050px]:pb-6"><h1 id="page-title" className="sr-only">{labels[view]}</h1>
      <section id="apps-view" className="animate-content-in pt-3" hidden={view !== 'apps'}>
        <div className="overflow-hidden"><table className="w-full table-fixed border-collapse text-left"><thead><tr className="[&_th]:px-2 [&_th]:pt-[5px] [&_th]:pb-[11px] [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-muted-foreground">{columns.map(([key, label], i) => { const dir = sort.key === key ? sort.dir : 0; const Icon = dir > 0 ? ArrowUp : dir < 0 ? ArrowDown : ChevronsUpDown; return <th key={key} className={widths[i]} aria-sort={dir > 0 ? 'ascending' : dir < 0 ? 'descending' : 'none'}><Tooltip content={dir > 0 ? 'Büyükten küçüğe sırala' : 'Küçükten büyüğe sırala'}><button type="button" className={`inline-flex items-center gap-[5px] ${dir ? 'text-primary' : 'hover:text-foreground [&_svg]:opacity-45'}`} data-sort={key} onClick={() => setSort({ key, dir: dir > 0 ? -1 : 1 })}>{label}<Icon size={12}/></button></Tooltip></th>; })}<th><span className="sr-only">İşlemler</span></th></tr></thead><tbody id="app-list" className="[&_td]:border-t [&_td]:border-[color-mix(in_srgb,var(--border)_55%,transparent)] [&_td]:px-2 [&_td]:py-[11px] [&_td]:text-[12px] [&_td]:wrap-anywhere [&_tr:first-child_td]:border-t-transparent">{!loaded ? Array.from({length:5},(_,i) => <tr className="[&_td]:h-[65px]" key={i}><td><div className="h-[17px] w-3/4 animate-skeleton rounded-[4px] bg-muted"/></td><td><div className="h-[17px] w-3/4 animate-skeleton rounded-[4px] bg-muted"/></td><td className="text-muted-foreground">—</td><td/></tr>) : rows.map(a => <tr key={a.id}><td><div className="flex items-center gap-2.5"><AppIcon app={a} icons={icons}/><div><strong className="block text-[12px] leading-[1.35] font-medium">{a.name}</strong><small className="mt-0.5 block text-[10px] text-muted-foreground">{a.version || a.source}</small></div></div></td><td className="text-muted-foreground">{a.publisher}</td><td className="whitespace-nowrap text-muted-foreground tabular-nums">{size(a.size)}</td><td className="text-right"><DeleteButton disabled={running(jobs[a.id])} data-app={a.id} aria-label={`${a.name} uygulamasını kaldır`} onConfirm={() => remove(a)}/></td></tr>)}</tbody></table><div id="empty" className={`${emptyState} px-6 py-[72px]`} hidden={rows.length > 0 || !loaded}><Package size={30}/><h3>Uygulama bulunamadı</h3></div></div>
      </section>
      <section id="files-view" className="animate-content-in" hidden={view !== 'files'}><LargeFiles active={view === 'files'} size={size} onFiles={setBigFiles} onError={text => toast.showToast({ title: text, status: 'error' })}/></section>
      <section id="settings-view" className="animate-content-in" hidden={view !== 'settings'}><div className="px-2 py-6"><h2 className="mb-[18px] text-[13px] font-medium tracking-[-.3px]">Tercihler</h2><div className="border-b pt-[19px] pb-6 [&_h3]:text-[12px] [&_h3]:font-medium"><h3 id="theme-label">Görünüm</h3><ThemeSelector aria-labelledby="theme-label" className="mt-4" themes={themeOptions} value={theme} onChange={setTheme}/></div><div className={settingRow}><div><h3 id="accent-label">Uygulama rengi</h3></div><div className="flex gap-2.5" role="radiogroup" aria-labelledby="accent-label">{accents.map(([key, label, light, dark]) => <Tooltip key={key} content={label}><label className="size-5 cursor-pointer rounded-full bg-(--swatch) has-checked:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)] dark:bg-(--swatch-dark)" data-accent={key} style={{ '--swatch': light, '--swatch-dark': dark } as CSSProperties}><input className="sr-only" type="radio" name="accent" aria-label={label} checked={accent === key} onChange={() => setAccent(key)}/></label></Tooltip>)}</div></div><div className={settingRow}><div><h3>Kaldırmadan önce geri yükleme noktası</h3><p className="mt-1 text-[11px] text-muted-foreground">Windows uygulamalarını kaldırmadan önce sistem geri yükleme noktası oluşturur.</p></div><Switch ariaLabel="Kaldırmadan önce geri yükleme noktası oluştur" checked={restorePoint} onCheckedChange={setRestorePoint}/></div><div className={settingRow}><div><h3>Kayıt defteri yedekleri</h3></div><Button disabled={busy} id="backups" variant="secondary" size="sm" onClick={() => task(() => api.backups())}><FolderOpen size={15}/>Yedek klasörünü aç</Button></div></div></section>
      </div>
    </main>
    <CenterMorphModal open={!!detail} onOpenChange={next => { if (!next && !busy) setReview(null); }}><CenterMorphModalContent ariaLabel={detail?.name ?? ''} ariaDescribedBy="detail-subtitle" dismissible={!busy} showCloseButton={false} className="max-w-[440px] bg-popover"><div id="detail" className="p-5">
      <div className="flex items-center gap-3"><AppIcon app={detail} icons={icons} id="detail-icon" large/><div className="min-w-0 flex-1"><h2 id="detail-name" className="truncate text-base font-semibold tracking-[-.3px]">{detail?.name}</h2><p id="detail-subtitle" className="truncate text-xs text-muted-foreground">{detail?.publisher} · {detail?.version || detail?.source}</p></div><Tooltip content="Küçült · sağ altta devam eder"><button type="button" disabled={busy} id="close-detail" aria-label="Küçült" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50" onClick={() => setReview(null)}><Minus size={16}/></button></Tooltip></div>
      <ol className="mt-4 flex rounded-full bg-foreground/[0.04] p-1 text-xs" aria-label="Adımlar">{steps.map((label, i) => { const n = i + 1; return <li key={label} aria-current={n === step ? 'step' : undefined} className={`relative flex flex-1 items-center justify-center rounded-full py-1.5 transition-colors ${n === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{n === step && <motion.span layoutId="review-step" className="absolute inset-0 rounded-full bg-background shadow-[0_1px_3px_#0000001a]" transition={reduce ? { duration: 0 } : SPRING_LAYOUT}/>}<span className="relative flex items-center gap-1.5">{n < step && <Check size={12} strokeWidth={3} className="text-primary"/>}{label}</span></li>; })}</ol>
      <AutoHeight className="mt-4"><div id="step-body" data-step={step}><AnimatePresence mode="wait" initial={false}><motion.div key={step} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.24, ease: EASE_OUT } }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.16, ease: EASE_OUT } }}>
        {step === 1 && <Remnants items={registry} selected={selected} setSelected={setSelected} busy={busy} empty="Kayıt defterinde kalıntı bulunamadı"/>}
        {step === 2 && <Remnants items={files} selected={selected} setSelected={setSelected} busy={busy} empty="Diskte kalıntı bulunamadı"/>}
        {step === 3 && <div id="summary" className="flex flex-col items-center py-6 text-center"><motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_SWAP} className="mb-3 grid size-12 place-items-center rounded-full bg-primary/15 text-primary"><Check size={22} strokeWidth={2.5}/></motion.span><h3 className="text-base font-semibold">{detail?.name} kaldırıldı</h3><p className="mt-1 text-xs text-muted-foreground">{results.length - failed.length} öğe temizlendi.{failed.length ? ` ${failed.length} öğe temizlenemedi.` : ''}</p>{failed.length > 0 && <div className="mt-4 flex max-h-[30vh] w-full flex-col gap-1.5 overflow-y-auto">{failed.map(r => <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-left text-xs wrap-anywhere text-destructive" key={r.path}>{r.path} · {r.error}</p>)}</div>}{restoreNote && <p className="mt-3 text-xs text-muted-foreground" id="restore-note">{restoreNote === 'created' ? 'Sistem geri yükleme noktası oluşturuldu.' : restoreNote === 'skipped' ? 'Son 24 saatte oluşturulmuş bir geri yükleme noktası olduğu için Windows yenisini oluşturmadı.' : restoreNote}</p>}</div>}
      </motion.div></AnimatePresence></div></AutoHeight>
      <div className="mt-5 flex gap-2 [&>button]:flex-1">
        {step === 1 && <Button id="next" onClick={() => setStep(2)}>İleri<ChevronRight size={16}/></Button>}
        {step === 2 && <><Button id="back" variant="secondary" className="border-0 bg-foreground/[0.06] hover:bg-foreground/[0.1]" disabled={busy} onClick={() => setStep(1)}>Geri</Button><StatefulButton id="clean" state={action} loadingText="Temizleniyor" successText="Temizlendi" errorText="Tekrar dene" onClick={() => act(clean, () => setStep(3))}>Seçilenleri temizle</StatefulButton></>}
        {step === 3 && windows && failed.length > 0 && <StatefulButton id="elevate" variant="secondary" className="border-0 bg-foreground/[0.06] hover:bg-foreground/[0.1]" state={action} loadingText="Deneniyor" successText="Tamamlandı" errorText="Tekrar dene" onClick={() => act(elevate)}>Yönetici olarak dene</StatefulButton>}
        {step === 3 && <Button id="finish" onClick={() => setReview(null)}>Kapat</Button>}
      </div>
    </div></CenterMorphModalContent></CenterMorphModal>
    <CommandPalette items={commands} open={paletteOpen} onOpenChange={setPaletteOpen} placeholder="Uygulama, dosya veya ayar ara…" emptyMessage="Sonuç bulunamadı."/>
    <AnimatedToastStack toasts={toast.toasts} onDismiss={toast.dismissToast} position="bottom-right" fixed/>
  </>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider delay={600}><App/></TooltipProvider>);
