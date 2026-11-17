// Small shared pieces for the Rider website (Jovanne’s Meat Shop theme).

import { cn } from '@/src/lib/utils';

/** Oswald for headings. Inline style because the global h1–h4 rule is unlayered and beats utility classes. */
export const HEADING = { fontFamily: 'var(--font-oswald)' } as const;

export const card = 'rounded-2xl bg-white border border-stone-200 shadow-sm';

/** Large, thumb-friendly button styles (min 48px tall). */
export const btn = {
  primary: 'min-h-12 rounded-xl bg-[#c8151d] px-4 text-base font-semibold text-white hover:bg-[#a3111a] active:bg-[#a3111a] disabled:bg-stone-300 disabled:text-stone-600 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors',
  secondary: 'min-h-12 rounded-xl border border-stone-300 bg-white px-4 text-base font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors',
  danger: 'min-h-12 rounded-xl bg-red-700 px-4 text-base font-semibold text-white hover:bg-red-800 disabled:bg-stone-300 disabled:text-stone-600 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors',
};

export function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2);
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold uppercase tracking-wide text-[#2a2322]', className)} style={HEADING}>{children}</h2>;
}

/**
 * The job flow's main action. On phones it is pinned to the bottom of the screen (above the
 * home indicator); on tablet/desktop it sits inline at the end of the steps column.
 */
export function ActionBar({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[1100] border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:static md:z-auto md:mt-4 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
      <div className="mx-auto max-w-[1100px]">
        {children}
        {hint && <p className="mt-1.5 text-center text-xs text-stone-600">{hint}</p>}
      </div>
    </div>
  );
}
