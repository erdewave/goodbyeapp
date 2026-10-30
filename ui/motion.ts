import { EASE_OUT } from '@/lib/ease';

// The app's shared motion language for content pages (Health Check, Files).

// Content arriving top-down: block i rises 8px and fades in 40ms after the one before (capped so long lists don't drag).
// Transform strings, not x/y, keep it on the compositor while React is busy; the transform is cleared once settled
// so the text isn't left on its own layer.
export const rise = (i: number, reduce: boolean | null) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' },
  animate: { opacity: 1, transform: 'translateY(0px)', transitionEnd: { transform: 'none' } },
  transition: { duration: 0.32, ease: EASE_OUT, delay: Math.min(i, 12) * 0.04 },
});

// Sections open on a critically damped spring (interruptible mid-flight, no overshoot) and close faster than they open.
export const collapse = (reduce: boolean | null) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: reduce ? { duration: 0.15 } : { type: 'spring' as const, bounce: 0, duration: 0.3 } },
  exit: reduce ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, height: 0, transition: { duration: 0.2, ease: EASE_OUT } },
  className: 'overflow-hidden',
});

// Rotating chevrons: on-screen movement, so a strong ease-in-out.
export const chevron = 'transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)]';
