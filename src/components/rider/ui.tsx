'use client';

// Small shared pieces for the Rider website (Jovanne’s Meat Shop theme).

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { cn } from '@/src/lib/utils';

/** Oswald for headings and big numbers. Inline style because the global h1–h4 rule is unlayered and beats utility classes. */
export const HEADING = { fontFamily: 'var(--font-oswald)' } as const;

/** Brand colours used across the rider pages. */
export const RC = {
  ink: '#2a2322', red: '#c8151d', cream: '#f5f1ec', card: '#fffdfb', border: '#eadfd6',
  green: '#1f6b3f', blue: '#2c4f9e', blueTint: '#e6ecf8', copper: '#ae754d', copperTint: '#fbf0e3',
} as const;

export const card = 'rounded-xl border border-[#eadfd6] bg-[#fffdfb]';

/** Thumb-friendly buttons (min 48px tall), squarish corners. */
export const btn = {
  primary: 'min-h-12 rounded-lg bg-[#c8151d] px-4 text-base font-semibold text-white hover:bg-[#a3111a] active:bg-[#a3111a] disabled:bg-stone-300 disabled:text-stone-600 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors',
  secondary: 'min-h-12 rounded-lg border border-[#2a2322]/70 bg-white px-4 text-base font-semibold text-[#2a2322] hover:bg-[#f5f1ec] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors',
  dark: 'min-h-12 rounded-lg bg-[#2a2322] px-4 text-base font-semibold text-white hover:bg-black inline-flex items-center justify-center gap-2 transition-colors',
  danger: 'min-h-12 rounded-lg bg-red-700 px-4 text-base font-semibold text-white hover:bg-red-800 disabled:bg-stone-300 disabled:text-stone-600 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-colors',
};

/** Payment pill: amber "COD · collect ₱860" or green "Prepaid". */
export function PayPill({ cod, amount }: { cod: boolean; amount: string }) {
  return cod
    ? <span className="inline-flex rounded-full bg-[#fbf0e3] px-2.5 py-0.5 text-xs font-semibold text-[#8a4b1c]">COD · collect {amount}</span>
    : <span className="inline-flex rounded-full bg-[#e3efe6] px-2.5 py-0.5 text-xs font-semibold text-[#1f6b3f]">Prepaid</span>;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Oswald page title (EARNINGS, PROFILE). */
export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[2rem] font-bold uppercase leading-none tracking-tight text-[#2a2322] sm:text-4xl" style={HEADING}>{children}</h1>;
}

export function SectionTitle({ children, className, as: Tag = 'h2' }: { children: React.ReactNode; className?: string; as?: 'h2' | 'h3' }) {
  return <Tag className={cn('text-2xl font-bold uppercase leading-tight tracking-tight text-[#2a2322] sm:text-[1.75rem]', className)} style={HEADING}>{children}</Tag>;
}

/** Segmented control (Nearest / Best pay, Google Maps / Waze). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg bg-[#efe7df] p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('min-h-10 rounded-md px-3.5 text-sm font-medium transition-colors', value === o.value ? 'bg-white text-[#2a2322] shadow-sm' : 'text-stone-600 hover:text-[#2a2322]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Yes/no confirmation (SOS, End shift, Sign out). */
export function Confirm({ open, onOpenChange, title, body, confirm, onConfirm, tone = 'red' }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: React.ReactNode; confirm: string; onConfirm: () => void; tone?: 'red' | 'dark';
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-[#eadfd6] bg-[#fffdfb] p-5 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-bold uppercase tracking-tight text-[#2a2322]" style={HEADING}>{title}</DialogTitle>
          <DialogDescription asChild><div className="text-sm text-stone-600">{body}</div></DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" className={cn(btn.secondary, 'text-sm')} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={cn(tone === 'red' ? btn.primary : btn.dark, 'text-sm')} onClick={() => { onConfirm(); onOpenChange(false); }}>{confirm}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The job flow's main action. On phones it is pinned to the bottom of the screen (above the
 * home indicator); on tablet/desktop it sits inline at the end of the details column.
 */
export function ActionBar({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadfd6] bg-[#fffdfb]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
      <div className="mx-auto max-w-[1340px]">
        {children}
        {hint && <p className="mt-1.5 text-center text-xs text-stone-600">{hint}</p>}
      </div>
    </div>
  );
}
