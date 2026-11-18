'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { getSetting, num } from '@/src/lib/logic';
import type { AppState, Order, OrderStatus, PaymentMethod, PaymentStatus } from '@/src/lib/types';
import { DAY } from '@/src/components/reports/analytics';
import { cn } from '@/src/lib/utils';

export const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;
export const ICON = { strokeWidth: 1.75 };

export const C = {
  ink: '#2a2322',
  red: '#c8151d',
  redLight: '#f0b4b4',
  copper: '#ae754d',
  brown: '#b5561c',
  teal: '#1e6b63',
  purple: '#7b3fa8',
  blue: '#2c4f9e',
  green: '#1f6b3f',
  greenLight: '#cfe6d6',
  grey: '#9b8f89',
  border: '#eadfd6',
} as const;

export type Range = 1 | 7 | 14 | 30;
export const RANGES: Range[] = [1, 7, 14, 30];
export const RANGE_LABEL: Record<Range, string> = { 1: 'Today', 7: '7 days', 14: '14 days', 30: '30 days' };

export interface Ctx {
  s: AppState;
  cur: Order[]; // orders placed in range, all statuses
  prev: Order[]; // previous equal-length period
  all: Order[]; // all orders in scope (for lifetime metrics)
  days: Date[]; // start of each day in range, oldest first
  range: Range;
  ids: string[]; // branch ids in scope
  start: number; // ms, start of range
  prevStart: number; // ms, start of previous period
  now: number;
  /** "previous 14 days" / "yesterday" */
  vsLabel: string;
}

export function buildCtx(s: AppState, ids: string[], range: Range, now: number): Ctx {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayStart = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() - offset); return d; };
  const start = dayStart(range - 1).getTime();
  const prevStart = dayStart(2 * range - 1).getTime();
  const all = s.orders.filter((o) => ids.includes(o.branchId));
  const cur = all.filter((o) => new Date(o.placedAt).getTime() >= start);
  const prev = all.filter((o) => { const t = new Date(o.placedAt).getTime(); return t >= prevStart && t < start; });
  const days = Array.from({ length: range }, (_, i) => dayStart(range - 1 - i));
  return { s, cur, prev, all, days, range, ids, start, prevStart, now, vsLabel: range === 1 ? 'yesterday' : `previous ${range} days` };
}

// ---------------------------------------------------------------- money & labels
export const PAY_NAME: Record<PaymentMethod, string> = {
  gcash: 'GCash', cod: 'Cash on delivery', card: 'Credit/debit card', pay_at_pickup: 'Pay at pickup', maya: 'Maya', cash: 'Cash',
};
export const ONLINE: PaymentMethod[] = ['gcash', 'maya', 'card'];
const TAKEN: PaymentStatus[] = ['paid', 'partially_refunded', 'refunded'];

/** Gateway fee rate (%) the shop pays on online payments: the Payments setting, else 1.9%. */
export function gatewayPct(s: AppState, branchId?: string) {
  const v = num(getSetting(s, 'gatewayFeePct', branchId));
  return v > 0 ? v : 1.9;
}
/** Gateway fee on one order: rate x amount, only for online payments that went through. */
export function gatewayFee(o: Order, pct: number) {
  return ONLINE.includes(o.paymentMethod) && TAKEN.includes(o.paymentStatus) ? Math.round(o.total * pct) / 100 : 0;
}

export const pesoK = (n: number, digits = 1) => `₱${(n / 1000).toFixed(digits)}k`;
export const fmtNum = (n: number, digits = 0) => n.toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);
export const fmtPlaced = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

/** Eyebrow line: "LAST 14 DAYS · NOV 6–19 · DIGOS · VS PREVIOUS 14 DAYS". */
export function eyebrow(ctx: Ctx, place: string) {
  const first = ctx.days[0];
  const last = ctx.days[ctx.days.length - 1];
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const span = ctx.range === 1 ? `${mon(last)} ${last.getDate()}`
    : mon(first) === mon(last) ? `${mon(first)} ${first.getDate()}–${last.getDate()}`
      : `${mon(first)} ${first.getDate()}–${mon(last)} ${last.getDate()}`;
  return [ctx.range === 1 ? 'Today' : `Last ${ctx.range} days`, span, place, `vs ${ctx.vsLabel}`].join(' · ').toUpperCase();
}

export { DAY };

// ---------------------------------------------------------------- layout primitives
export function Card({ title, sub, action, children, className, bodyClass }: {
  title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-[#eadfd6] bg-[#fffdfb] shadow-[0_1px_2px_rgba(42,35,34,0.04)]', className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 sm:px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1d1716] leading-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={cn('px-4 sm:px-5 pb-4', bodyClass)}>{children}</div>
    </section>
  );
}

/** One white card split into equal cells. */
export function KpiStrip({ children, cols }: { children: ReactNode; cols: 4 | 6 }) {
  return (
    <div className={cn('mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#eadfd6] bg-[#f0e8e2]',
      cols === 4 ? 'lg:grid-cols-4' : 'md:grid-cols-3 xl:grid-cols-6')}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, delta, sub }: { label: string; value: ReactNode; delta?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3.5">
      <p className="text-xs text-gray-500 truncate">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-2xl sm:text-[26px] leading-tight font-semibold tabular-nums text-[#1d1716]" style={OSWALD}>{value}</span>
        {delta}
      </div>
      {sub && <p className="mt-0.5 text-xs text-gray-500 truncate">{sub}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-[#f3ece6] p-1 [scrollbar-width:none]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={cn('h-8 whitespace-nowrap rounded-md px-3 text-sm transition-colors',
              on ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal bar on a light track. */
export function HBar({ value, max, color, className }: { value: number; max: number; color: string; className?: string }) {
  const w = max > 0 && value > 0 ? Math.max(1.5, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn('h-2 w-full rounded-full bg-[#f3ece6]', className)}>
      <div className="h-2 rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** Row for the bar lists (label + grey sub-line, bar, value on the right). */
export function BarRow({ label, sub, value, max, color, right, title }: {
  label: ReactNode; sub?: ReactNode; value: number; max: number; color: string; right: ReactNode; title?: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 py-2" title={title}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#1d1716] truncate">{label}</p>
        {sub && <p className="text-xs text-gray-500 truncate">{sub}</p>}
      </div>
      <HBar value={value} max={max} color={color} />
      <span className="text-sm font-semibold tabular-nums text-[#1d1716] text-right whitespace-nowrap">{right}</span>
    </li>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

/** Change vs previous period as a coloured "▲ 4.2%" (– when there is no prior data). */
export function VsPrev({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="text-gray-400">–</span>;
  const p = ((cur - prev) / prev) * 100;
  const good = invert ? p <= 0 : p >= 0;
  return <span className={cn('font-medium tabular-nums', good ? 'text-[#1f6b3f]' : 'text-[#c8151d]')}>{p >= 0 ? '▲' : '▼'} {Math.abs(p).toFixed(1)}%</span>;
}

// ---------------------------------------------------------------- tables
export function TableWrap({ children, minWidth = 560 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-4 sm:-mx-5 overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>{children}</table>
    </div>
  );
}
export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={cn('whitespace-nowrap border-y border-[#f0e8e2] bg-[#faf6f2] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5',
      right ? 'text-right' : 'text-left', className)}>{children}</th>
  );
}
export function Td({ children, right, className, colSpan }: { children?: ReactNode; right?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('border-b border-[#f4ede7] px-3 py-2.5 align-middle first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5', right && 'text-right tabular-nums', className)}>{children}</td>
  );
}
export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="px-5 py-8 text-center text-sm text-gray-400">{text}</td></tr>;
}
export const OrderLink = ({ o }: { o: Order }) => (
  <Link href={`/orders/${o.id}`} className="font-semibold text-[#c8151d] hover:underline whitespace-nowrap">{o.number}</Link>
);

/** Share cell: coloured bar + percentage. */
export function ShareCell({ value, total, max, color }: { value: number; total: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[7rem]">
      <HBar value={value} max={max} color={color} />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-gray-500">{Math.round(pct(value, total))}%</span>
    </div>
  );
}

// ---------------------------------------------------------------- chips
const CHIP = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold';
const STATUS_CHIP: Record<OrderStatus, [string, string]> = {
  placed: ['Awaiting', 'bg-amber-50 text-amber-700'],
  awaiting_confirmation: ['Awaiting', 'bg-amber-50 text-amber-700'],
  awaiting_shopper: ['Awaiting', 'bg-amber-50 text-amber-700'],
  confirmed: ['Confirmed', 'bg-[#f3ecf8] text-[#7b3fa8]'],
  preparing: ['Preparing', 'bg-[#f3ecf8] text-[#7b3fa8]'],
  ready: ['Ready', 'bg-[#e8f3ec] text-[#1f6b3f]'],
  out_for_delivery: ['Out for delivery', 'bg-[#e9eef8] text-[#2c4f9e]'],
  delivered: ['Delivered', 'bg-[#e8f3ec] text-[#1f6b3f]'],
  collected: ['Collected', 'bg-[#e8f3ec] text-[#1f6b3f]'],
  cancelled: ['Cancelled', 'bg-[#fbeaea] text-[#a3161c]'],
  failed_delivery: ['Failed', 'bg-[#fbeaea] text-[#a3161c]'],
};
export function StatusChip({ status }: { status: OrderStatus }) {
  const [label, cls] = STATUS_CHIP[status];
  return <span className={cn(CHIP, cls)}>{label}</span>;
}
const PAY_CHIP: Record<PaymentStatus, [string, string]> = {
  pending: ['Pending', 'bg-amber-50 text-amber-700'],
  paid: ['Paid', 'bg-[#e8f3ec] text-[#1f6b3f]'],
  refunded: ['Refunded', 'bg-[#f1ece8] text-[#6b5f5a]'],
  partially_refunded: ['Part refunded', 'bg-[#f1ece8] text-[#6b5f5a]'],
  failed: ['Failed', 'bg-[#fbeaea] text-[#a3161c]'],
  expired: ['Expired', 'bg-[#f1ece8] text-[#6b5f5a]'],
};
export function PayChip({ status }: { status: PaymentStatus }) {
  const [label, cls] = PAY_CHIP[status];
  return <span className={cn(CHIP, cls)}>{label}</span>;
}
