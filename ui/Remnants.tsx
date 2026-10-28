import type { Dispatch, SetStateAction } from 'react';
import { Checkbox } from '@/components/motion/checkbox';
import { CircleCheck } from 'lucide-react';
import { t } from './i18n';
import type { Candidate } from './types';

export function Remnants({ items, selected, setSelected, busy, empty }: { items: Candidate[]; selected: string[]; setSelected: Dispatch<SetStateAction<string[]>>; busy: boolean; empty: string }) {
  if (!items.length) return <div className="flex flex-col items-center py-8 text-center"><span className="mb-3 grid size-12 place-items-center rounded-full bg-foreground/[0.04] text-muted-foreground"><CircleCheck size={22}/></span><h3 className="text-sm font-medium">{empty}</h3><p className="mt-1 text-xs text-muted-foreground">{t.nothingHere}</p></div>;
  const ids = items.map(c => c.id), count = ids.filter(id => selected.includes(id)).length;
  return <div id="candidates">
    <div className="mb-2 flex items-center gap-3 px-1"><Checkbox id="select-all" disabled={busy} checked={count === ids.length} onCheckedChange={on => setSelected(old => on ? [...new Set([...old, ...ids])] : old.filter(id => !ids.includes(id)))}/><label htmlFor="select-all" className="flex-1 cursor-pointer text-xs font-medium">{t.selectAll}</label><span className="text-xs text-muted-foreground tabular-nums">{t.selected(count, ids.length)}</span></div>
    <div className="flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto">{items.map(c => <div key={c.id} className="flex items-start gap-3 rounded-2xl bg-foreground/[0.04] px-4 py-3"><Checkbox id={'candidate-' + c.id} disabled={busy} checked={selected.includes(c.id)} onCheckedChange={on => setSelected(old => on ? [...old, c.id] : old.filter(id => id !== c.id))}/><label htmlFor={'candidate-' + c.id} className="min-w-0 flex-1 cursor-pointer text-xs leading-5 wrap-anywhere">{c.path}{c.reason && <span className="block text-muted-foreground">{c.reason}</span>}</label></div>)}</div>
  </div>;
}
