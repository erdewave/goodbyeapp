import { useEffect, useState } from 'react';
import { Tooltip } from '@/components/motion/tooltip';
import type { WindowState } from './types';

const desktop = window.desktopWindow;
const button = 'grid h-full w-9 place-items-center text-muted-foreground transition-soft';
function WindowIcon({ kind }: { kind: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    {kind === 'minimize' ? <path d="M3 8.5h10"/> : kind === 'close' ? <path d="m4 4 8 8m0-8-8 8"/> : kind === 'restore' ? <><path d="M5.5 3.5h7v7"/><rect x="3.5" y="5.5" width="7" height="7" rx="1"/></> : <rect x="3.5" y="3.5" width="9" height="9" rx="1"/>}
  </svg>;
}
export function Titlebar() {
  const [state, setState] = useState<WindowState>({ maximized: false, focused: true });
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    const update = (next: WindowState) => { if (alive) setState(next); };
    const dispose = desktop.onChange(update);
    desktop.getState().then(update).catch(() => {});
    return () => { alive = false; dispose(); };
  }, []);
  async function control(action: 'minimize' | 'maximize' | 'close') {
    try {
      await desktop?.[action]();
    } catch {}
  }
  return <header id="titlebar" className="fixed inset-x-0 top-0 z-100 flex h-(--titlebar-height) items-center pl-[18px] text-foreground [-webkit-app-region:drag]" aria-label="Pencere başlık çubuğu">
    <div className="ml-auto flex h-full shrink-0 [-webkit-app-region:no-drag]" aria-label="Pencere kontrolleri">
      <Tooltip content="Küçült"><button type="button" id="window-minimize" className={`${button} hover:bg-accent`} aria-label="Pencereyi küçült" onClick={() => control('minimize')}><WindowIcon kind="minimize"/></button></Tooltip>
      <Tooltip content={state.maximized ? 'Önceki boyuta dön' : 'Büyüt'}><button type="button" id="window-maximize" className={`${button} hover:bg-accent`} aria-label={state.maximized ? 'Önceki boyuta dön' : 'Pencereyi büyüt'} aria-pressed={state.maximized} onClick={() => control('maximize')}><WindowIcon kind={state.maximized ? 'restore' : 'maximize'}/></button></Tooltip>
      <Tooltip content="Kapat"><button type="button" id="window-close" className={`${button} hover:bg-destructive hover:text-destructive-foreground`} aria-label="Pencereyi kapat" onClick={() => control('close')}><WindowIcon kind="close"/></button></Tooltip>
    </div>
  </header>;
}
