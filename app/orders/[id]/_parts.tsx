'use client';

// Presentational building blocks for the staff Order details page (app/orders/[id]/page.tsx).
// No store access here: the page passes data and callbacks in.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export const ICON = { strokeWidth: 1.75 };
export const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;

/** "Ana Cruz" → "AC". */
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/** Seconds → "m:ss" (or "h:mm:ss" past an hour). */
export function clock(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Sentence-case payment method names for pills and chips. */
export const PAY_SHORT: Record<PaymentMethod, string> = {
  gcash: 'GCash', maya: 'Maya', card: 'Card', cod: 'Cash on delivery', pay_at_pickup: 'Pay at pickup', cash: 'Cash',
};
/** Longer method line for the Payment card. */
export const PAY_LINE: Record<PaymentMethod, string> = {
  gcash: 'GCash (online)', maya: 'Maya (online)', card: 'Credit/debit card (online)',
  cod: 'Cash on delivery — rider collects', pay_at_pickup: 'Pay at pickup — cash, GCash or card', cash: 'Cash at the counter',
};
export const PAY_STATE: Record<PaymentStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-800 border-green-200' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 border-red-200' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  refunded: { label: 'Refunded', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  partially_refunded: { label: 'Partly refunded', cls: 'bg-gray-100 text-gray-700 border-gray-200' },
};

/** Header status pill: tinted background + coloured dot. */
export const STATUS_PILL: Record<OrderStatus, { cls: string; dot: string }> = {
  placed: { cls: 'bg-red-50 text-[#c8151d]', dot: 'bg-[#d6202a]' },
  awaiting_confirmation: { cls: 'bg-red-50 text-[#c8151d]', dot: 'bg-[#d6202a]' },
  confirmed: { cls: 'bg-red-50 text-[#a3121a]', dot: 'bg-[#c8151d]' },
  preparing: { cls: 'bg-purple-50 text-purple-800', dot: 'bg-purple-500' },
  awaiting_shopper: { cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  ready: { cls: 'bg-teal-50 text-teal-800', dot: 'bg-teal-500' },
  out_for_delivery: { cls: 'bg-indigo-50 text-indigo-800', dot: 'bg-indigo-500' },
  delivered: { cls: 'bg-green-50 text-green-800', dot: 'bg-green-600' },
  collected: { cls: 'bg-green-50 text-green-800', dot: 'bg-green-600' },
  cancelled: { cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  failed_delivery: { cls: 'bg-orange-50 text-orange-800', dot: 'bg-orange-500' },
};

// ---------------- Light surface ----------------
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0', className)}>{children}</section>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-2xl leading-tight text-[#1d1716]', className)} style={OSWALD}>{children}</h2>;
}

/** Small rounded pill used in the header and item rows. */
export function Tag({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap', className)}>
      {children}
    </span>
  );
}

/** Outline button on light cards (44px tall on phones, compact from sm up). */
export function LightButton({ className, tone = 'default', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'danger' | 'success' | 'ghost' }) {
  return (
    <button type="button" {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 h-11 sm:h-9 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        tone === 'danger' && 'border-[#eadfd6] bg-white text-[#c8151d] hover:bg-red-50 hover:border-red-200',
        tone === 'success' && 'border-green-200 bg-white text-green-700 hover:bg-green-50',
        tone === 'ghost' && 'border-transparent bg-transparent text-gray-500 hover:bg-[#f3ece6]',
        tone === 'default' && 'border-[#eadfd6] bg-white text-[#1d1716] hover:bg-[#faf6f2]',
        className,
      )} />
  );
}

/** Solid brand-red button (light or dark surfaces). */
export function RedButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl bg-[#d6202a] px-5 h-11 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#c8151d] disabled:opacity-45 disabled:pointer-events-none', className)} />
  );
}

// ---------------- Dark stage banner ----------------
export function Banner({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'blue' | 'green' }) {
  return (
    <section className={cn('rounded-2xl p-4 sm:p-5 lg:px-6 shadow-sm', tone === 'green' ? 'border-2 border-[#bfe0cb] bg-[#e4f2e9] text-[#1d4d33]' : tone === 'blue' ? 'border-4 border-[#172c5a] bg-[#1f3b78] text-white' : 'border-4 border-[#1d1716] bg-[#2a2322] text-white')}>
      {children}
    </section>
  );
}

export function BannerTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[28px] sm:text-4xl leading-none uppercase tracking-wide break-words" style={OSWALD}>{children}</h2>;
}

/**
 * Banner content: title + chips (+ optional body) on the left, controls on the right.
 * Phones/tablets: everything stacks (title, chips, body, then controls).
 */
export function BannerLayout({ title, chips, children, aside }: { title: ReactNode; chips?: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
      <div className="min-w-0 flex-1">
        <BannerTitle>{title}</BannerTitle>
        {chips && <div className="mt-3 flex flex-wrap gap-2">{chips}</div>}
        {children}
      </div>
      {aside && <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start gap-3 sm:gap-4 shrink-0">{aside}</div>}
    </div>
  );
}

/** Row of banner buttons: stacked full-width on small phones, side by side from 400px, inline from sm. */
export function BannerActions({ children, alignWithStepper }: { children: ReactNode; alignWithStepper?: boolean }) {
  return (
    <div className={cn('grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto min-[400px]:[&>*:only-child]:col-span-2',
      alignWithStepper && 'sm:pt-[23px]')}>
      {children}
    </div>
  );
}

/** Label/value row in the Payment card. */
export function PayRow({ k, v, sub, cls }: { k: string; v: string; sub?: string; cls?: string }) {
  return (
    <div>
      <div className={cn('flex justify-between gap-3', cls)}><dt className="text-[#5b4f4b]">{k}</dt><dd className="font-medium text-right">{v}</dd></div>
      {sub && <p className="text-[11px] text-gray-400 text-right">{sub}</p>}
    </div>
  );
}

/** Chip on the dark banner. tone: red (alert), amber, green, copper, sky (cold chain), default (white/10). */
export function DarkChip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'red' | 'amber' | 'green' | 'copper' | 'sky' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold',
      tone === 'red' && 'bg-[#d6202a] text-white',
      tone === 'amber' && 'bg-amber-400/15 text-amber-200',
      tone === 'green' && 'bg-green-400/15 text-green-200',
      tone === 'copper' && 'bg-[#e3ad8c] text-[#2a2322]',
      tone === 'sky' && 'bg-white/10 text-sky-200',
      tone === 'default' && 'bg-white/10 text-white/90',
    )}>{children}</span>
  );
}

/** Outline button on the dark banner. */
export function DarkButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 h-11 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-45 disabled:pointer-events-none', className)} />
  );
}

export const darkInput = 'h-11 rounded-xl border border-white/15 bg-[#1d1716] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40 disabled:opacity-60';

/** "PREP TIME  [ − 25 min + ]  Ready by 6:58 PM". Buttons hidden when the user can’t edit. `footer` replaces the "Ready by" line. */
export function PrepStepper({ minutes, readyBy, onChange, editable, label = 'PREP TIME', footer }: {
  minutes: number; readyBy?: string; onChange: (delta: number) => void; editable: boolean; label?: string; footer?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-white/60 mb-1.5">{label}</p>
      <div className="flex items-center h-11 rounded-xl border border-white/10 bg-[#1d1716] w-full sm:w-auto">
        {editable && (
          <button type="button" onClick={() => onChange(-5)} aria-label="Decrease prep time" disabled={minutes <= 5}
            className="w-11 h-11 flex items-center justify-center text-white/80 hover:text-white disabled:opacity-40 text-xl leading-none">−</button>
        )}
        <span className={cn('flex-1 text-center text-xl whitespace-nowrap', editable ? 'sm:w-24' : 'px-4')} style={OSWALD}>{minutes} min</span>
        {editable && (
          <button type="button" onClick={() => onChange(5)} aria-label="Increase prep time"
            className="w-11 h-11 flex items-center justify-center text-white/80 hover:text-white text-xl leading-none">+</button>
        )}
      </div>
      {footer ?? (readyBy && <p className="text-xs text-white/60 mt-1.5">Ready by {readyBy}</p>)}
    </div>
  );
}

// ---------------- Timeline ----------------
export interface TimelineRow {
  key: string;
  title: string;
  sub?: string;
  time?: string;
  kind: 'done' | 'alert' | 'warn' | 'now' | 'next' | 'end';
  /** Colour of the "now" ring (red by default, purple while picking). */
  tone?: 'red' | 'purple' | 'teal';
  /** Extra content under the sub line (e.g. an expandable list). */
  extra?: ReactNode;
}

export function Timeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ol className="relative">
      {rows.map((r, i) => {
        const last = i === rows.length - 1;
        return (
          <li key={r.key} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!last && <span aria-hidden className={cn('absolute left-[6px] top-4 bottom-0 w-px', r.kind === 'next' ? 'bg-[#eadfd6]' : 'bg-[#d9ccc1]')} />}
            <span aria-hidden className={cn('relative z-[1] mt-1 w-[13px] h-[13px] rounded-full shrink-0',
              r.kind === 'done' && 'bg-[#2a2322]',
              r.kind === 'end' && 'bg-green-600',
              r.kind === 'alert' && 'bg-[#d6202a]',
              r.kind === 'warn' && 'bg-orange-400',
              r.kind === 'now' && (r.tone === 'purple' ? 'bg-white border-[3px] border-purple-500 ring-4 ring-purple-100'
                : r.tone === 'teal' ? 'bg-white border-[3px] border-teal-500 ring-4 ring-teal-100'
                  : 'bg-white border-[3px] border-[#d6202a] ring-4 ring-red-100'),
              r.kind === 'next' && 'bg-[#fffdfb] border-2 border-[#d9ccc1]',
            )} />
            <div className="flex-1 min-w-0 flex flex-wrap items-baseline justify-between gap-x-3">
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium break-words',
                  r.kind === 'alert' ? 'text-[#c8151d]' : r.kind === 'next' ? 'text-gray-400 font-normal' : 'text-[#1d1716]')}>{r.title}</p>
                {r.sub && <p className="text-xs text-gray-500 mt-0.5 break-words">{r.sub}</p>}
                {r.extra}
              </div>
              {r.time && <p className={cn('text-xs whitespace-nowrap', r.kind === 'now' ? (r.tone === 'purple' ? 'text-purple-700 font-medium' : 'text-[#c8151d] font-medium') : 'text-gray-400')}>{r.time}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------- Picking progress ----------------
/** One segment per item (green when done), item name under each segment. */
export function SegmentedProgress({ items }: { items: { name: string; done: boolean; dropped?: boolean }[] }) {
  return (
    <div className="grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <div className={cn('h-1.5 rounded-full', it.done ? 'bg-green-500' : 'bg-white/15')} />
          <p title={it.name} className={cn('mt-1.5 text-[11px] leading-tight truncate', it.done ? 'text-white font-medium' : 'text-white/50', it.dropped && 'line-through')}>{it.name}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------- Pickup handover ----------------
/** Closing time from branch hours like "6:00 AM – 8:00 PM", on the same day as `ref`. */
export function closingTime(hours: string | undefined, ref: Date): Date | undefined {
  const last = hours?.split(/[–—-]/).pop()?.trim();
  const m = last?.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  const d = new Date(ref);
  d.setHours(h, Number(m[2] ?? 0), 0, 0);
  return d;
}

/** One numbered step of the handover (active / locked / done) on the dark banner. */
export function StepPanel({ n, title, state, lockedText, children }: {
  n: number; title: ReactNode; state: 'active' | 'locked' | 'done'; lockedText?: string; children?: ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border min-w-0',
      state === 'active' && 'border-white/25 bg-white/[0.07] p-4 sm:p-5',
      state === 'done' && 'border-green-400/25 bg-green-400/[0.06] p-4 sm:p-5',
      state === 'locked' && 'border-white/[0.07] bg-white/[0.02] px-4 py-3 sm:p-5')}
      aria-disabled={state === 'locked' || undefined}>
      <div className="flex items-center gap-3">
        <span className={cn('w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shrink-0',
          state === 'active' && 'bg-[#d6202a] text-white', state === 'done' && 'bg-green-600 text-white', state === 'locked' && 'bg-white/10 text-white/40')}>
          {state === 'done' ? <Check className="w-4 h-4" strokeWidth={2.5} /> : n}
        </span>
        <h3 className={cn('font-semibold min-w-0', state === 'locked' ? 'text-white/45' : 'text-white')}>{title}</h3>
      </div>
      {state === 'locked'
        ? <p className="mt-1.5 sm:mt-2 text-xs text-white/35 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />{lockedText}</p>
        : children && <div className="mt-3">{children}</div>}
    </section>
  );
}
