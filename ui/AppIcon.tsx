import { useState } from 'react';
import { Package } from 'lucide-react';
import type { InstalledApp } from './types';
import { t } from './i18n';

export const iconBox = 'grid shrink-0 place-items-center rounded-[7px] border bg-muted text-muted-foreground has-[img]:border-transparent has-[img]:bg-transparent';
export function AppIcon({ app, icons, id, large, small }: { app: InstalledApp | null; icons: Record<string, string>; id?: string; large?: boolean; small?: boolean }) {
  const src = app ? icons[app.id] : undefined;
  const [failed, setFailed] = useState('');
  return <div id={id} className={`${iconBox} ${large ? 'size-12 [&_img]:size-10' : small ? 'size-5 [&_img]:size-[18px]' : 'size-[30px] [&_img]:size-[25px]'} [&_img]:object-contain`}>
    {src && failed !== src ? <img src={src} alt={t.logo(app?.name ?? '')} width="32" height="32" draggable="false" onError={() => setFailed(src)}/> : <Package size={small ? 13 : 21} strokeWidth={1.5} aria-label={t.noIcon}/>}
  </div>;
}
