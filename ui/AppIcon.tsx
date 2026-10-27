import { useState } from 'react';
import { Package } from 'lucide-react';
import type { InstalledApp } from './types';

export const iconBox = 'grid shrink-0 place-items-center rounded-[7px] border bg-muted text-muted-foreground has-[img]:border-transparent has-[img]:bg-transparent';
export function AppIcon({ app, icons, id, large }: { app: InstalledApp | null; icons: Record<string, string>; id?: string; large?: boolean }) {
  const src = app ? icons[app.id] : undefined;
  const [failed, setFailed] = useState('');
  return <div id={id} className={`${iconBox} ${large ? 'size-12 [&_img]:size-10' : 'size-[30px] [&_img]:size-[25px]'} [&_img]:object-contain`}>
    {src && failed !== src ? <img src={src} alt={`${app?.name} logosu`} width="32" height="32" draggable="false" onError={() => setFailed(src)}/> : <Package size={21} strokeWidth={1.5} aria-label="Uygulama simgesi bulunamadı"/>}
  </div>;
}
