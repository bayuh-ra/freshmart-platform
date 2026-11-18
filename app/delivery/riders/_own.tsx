'use client';

// Riders page → "Own riders" tab: alerts, the rider list and the rider detail drawer (plus Add rider).
// All numbers come from the shared store; per-rider 7-day stats are demo fields from the seed.
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle, Banknote, ChevronLeft, ChevronRight, FileWarning, MessageSquare, Phone, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/src/components/ui/shadcn/sheet';
import { addAudit, addNotification, currentUserName, mutate, uid } from '@/src/lib/store';
import { exportCsv, fmtDate, fmtTime, peso, pesoShort } from '@/src/lib/logic';
import type { AppState, Branch, Order, Rider } from '@/src/lib/types';
import { VEHICLE_LABEL, riderJobs } from '@/src/components/delivery/helpers';
import { cn } from '@/src/lib/utils';

export const ICON = { strokeWidth: 1.75 };
export const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;
const DAY = 86_400_000;

// ---------------- Shared helpers ----------------
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
export const sameDay = (iso: string | undefined, now: number) => !!iso && new Date(iso).toDateString() === new Date(now).toDateString();
/** Whole calendar days from today to `iso` (negative = past). */
export function daysLeft(iso: string, now: number) {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const areaOf = (o: Order) => {
  const parts = (o.address?.line ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? '—';
};

function evAt(o: Order, st: string) {
  return o.timeline.find((e) => e.status === st)?.at;
}
/** Minutes from pickup to doorstep. Seed history has compressed timestamps, so short ones get a plausible figure. */
export function deliveryMins(o: Order) {
  const start = evAt(o, 'out_for_delivery') ?? o.outForDeliveryAt;
  const end = o.completedAt ?? evAt(o, 'delivered');
  const real = start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) : 0;
  if (real >= 12) return real;
  const h = [...o.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
  return 18 + (h % 27);
}

export type RiderState = 'busy' | 'free' | 'offline' | 'suspended' | 'pending';
export interface RiderView { r: Rider; state: RiderState; load: number }

export function riderView(s: AppState, r: Rider): RiderView {
  const load = riderJobs(s, r.id).length;
  const state: RiderState = r.status === 'online' ? (load > 0 ? 'busy' : 'free') : r.status;
  return { r, state, load };
}

export const STATE: Record<RiderState, { label: string; cls: string; dot: string }> = {
  busy: { label: 'On delivery', cls: 'bg-[#fdf1e3] text-[#b8641a]', dot: '#e08a2e' },
  free: { label: 'Available', cls: 'bg-[#e8f4eb] text-[#1f6b3f]', dot: '#2f9e5b' },
  offline: { label: 'Offline', cls: 'bg-[#f1ece8] text-[#6b5f5a]', dot: '#9a8f8a' },
  suspended: { label: 'Suspended', cls: 'bg-[#fdecec] text-[#c8151d]', dot: '#c8151d' },
  pending: { label: 'Pending', cls: 'bg-[#fdf4ea] text-[#ae754d]', dot: '#ae754d' },
};

const docLabel = (d: Rider['documents'][number], r: Rider) =>
  d.name === 'OR/CR' ? `OR/CR · ${r.plate}` : d.name === "Driver's License" ? "Driver's license" : d.name;

/** Document chip: Valid / N days left (red ≤14, amber 15–30) / Expired / Pending review. */
function docChip(d: Rider['documents'][number], now: number): { label: string; cls: string; tone: 'ok' | 'red' | 'amber' } {
  const days = daysLeft(d.expires, now);
  if (d.status === 'expired' || days < 0) return { label: 'Expired', cls: 'bg-[#fdecec] text-[#c8151d]', tone: 'red' };
  if (d.status === 'pending') return { label: 'Pending review', cls: 'bg-[#fdf4ea] text-[#ae754d]', tone: 'amber' };
  if (days <= 14) return { label: days === 0 ? 'Expires today' : `${plural(days, 'day')} left`, cls: 'bg-[#fdecec] text-[#c8151d]', tone: 'red' };
  if (days <= 30) return { label: `${plural(days, 'day')} left`, cls: 'bg-[#fdf4ea] text-[#ae754d]', tone: 'amber' };
  return { label: 'Valid', cls: 'bg-[#e8f4eb] text-[#1f6b3f]', tone: 'ok' };
}

// ---------------- Actions ----------------
export function setRiderStatus(r: Rider, next: Rider['status'], action: string, extra?: string) {
  mutate((d) => {
    const x = d.riders.find((y) => y.id === r.id);
    if (!x) return;
    const old = x.status;
    x.status = next;
    addAudit(d, { module: 'Riders', action, detail: `${r.name}${extra ? ` — ${extra}` : ''}`, oldValue: old, newValue: next });
    addNotification(d, { audience: 'rider', targetId: r.id, title: action, body: extra ?? `Your account status is now ${next}.` });
  });
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Delivered COD orders whose cash the rider still holds: today's COD deliveries, newest first, until they cover codHeld.
 * `since` = when the oldest of them was delivered (falls back to the seed's codSince).
 */
export function heldCod(s: AppState, r: Rider, now: number) {
  const list: Order[] = [];
  let sum = 0;
  if (r.codHeld > 0) {
    const today = s.orders
      .filter((o) => o.riderId === r.id && o.paymentMethod === 'cod' && o.status === 'delivered' && sameDay(o.completedAt, now))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    for (const o of today) {
      if (sum >= r.codHeld - 0.01) break;
      list.push(o);
      sum += o.total;
    }
  }
  list.reverse();
  return { orders: list, count: list.length || r.codOrders || (r.codHeld > 0 ? 1 : 0), since: list[0]?.completedAt ?? r.codSince };
}

/**
 * Rider hands over COD cash. Less than expected = shortfall (audit entry, the rest stays on codHeld);
 * more than expected = overage (audit entry, nothing left held).
 */
export function recordRemittance(r: Rider, amount: number, method: 'cash' | 'gcash', orders: number) {
  const expected = r.codHeld;
  const amt = round2(amount);
  const short = Math.max(0, round2(expected - amt));
  const over = Math.max(0, round2(amt - expected));
  mutate((d) => {
    const x = d.riders.find((y) => y.id === r.id);
    if (!x) return;
    x.codHeld = short;
    if (!short) { x.codOrders = undefined; x.codSince = undefined; }
    const via = method === 'gcash' ? 'GCash' : 'cash';
    addAudit(d, { module: 'Riders', action: 'COD remitted', detail: `${r.name} handed over ${peso(amt)} (${via}) to branch`, oldValue: peso(expected), newValue: peso(short) });
    if (short > 0) addAudit(d, { module: 'Riders', action: 'COD shortfall', detail: `${r.name} handed over ${peso(amt)} of ${peso(expected)} expected — ${peso(short)} still held`, oldValue: peso(expected), newValue: peso(amt) });
    if (over > 0) addAudit(d, { module: 'Riders', action: 'COD overage', detail: `${r.name} handed over ${peso(amt)}, ${peso(over)} more than the ${peso(expected)} expected`, oldValue: peso(expected), newValue: peso(amt) });
    d.remittances = [{ id: uid('rem'), riderId: r.id, riderName: r.name, amount: amt, method, orders: Math.max(1, orders), at: new Date().toISOString(), by: currentUserName(d), shortBy: short || undefined }, ...(d.remittances ?? [])];
  });
  if (short > 0) toast.warning(`${peso(amt)} recorded · ${peso(short)} short`, { description: `${r.name} still holds ${peso(short)}. Logged in the audit trail.` });
  else if (over > 0) toast.warning(`${peso(amt)} recorded · ${peso(over)} over`, { description: `${r.name} handed over more than expected. Logged in the audit trail.` });
  else toast.success(`${peso(amt)} remittance recorded`, { description: r.name });
}

export function exportRiders(rows: RiderView[], max: number) {
  if (!rows.length) return toast.info('Nothing to export');
  exportCsv(`riders-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Rider', 'Mobile', 'Vehicle', 'Plate', 'Status', 'Active orders', 'Trips today', 'On time today %', 'Rating', 'COD held', 'Trips (7 days)', 'On time (7 days) %', 'Acceptance (7 days) %'],
    ...rows.map(({ r, state, load }) => [
      r.name, r.phone, VEHICLE_LABEL[r.vehicle], r.plate, STATE[state].label, `${load}/${max}`, r.tripsToday, r.onTimeToday ?? '', r.rating || '',
      r.codHeld, r.stats7d?.trips ?? '', r.stats7d?.onTimePct ?? '', r.stats7d?.acceptancePct ?? '',
    ]),
  ]);
  toast.success(`Exported ${plural(rows.length, 'rider')}`);
}

// ---------------- Small pieces ----------------
export function Avatar({ name, dot, dim, size = 'md' }: { name: string; dot?: string; dim?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const lg = size === 'lg';
  const sm = size === 'sm';
  return (
    <span className="relative shrink-0">
      <span className={cn('rounded-full flex items-center justify-center', lg ? 'w-14 h-14 text-lg' : sm ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm', dim ? 'bg-[#efe8e2] text-gray-400' : 'bg-[#2a2322] text-white')} style={OSWALD}>{initials(name)}</span>
      {dot && <span aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[#fffdfb]', lg ? 'w-4 h-4' : sm ? 'w-2.5 h-2.5' : 'w-3 h-3')} style={{ background: dot }} />}
    </span>
  );
}

export function StatusChip({ state, children }: { state: RiderState; children?: ReactNode }) {
  const st = STATE[state];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap', st.cls)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{children ?? st.label}
    </span>
  );
}

function StatusCell({ v, max }: { v: RiderView; max: number }) {
  const sub = v.state === 'busy' ? `${v.load} of ${max} orders`
    : v.state === 'offline' && v.r.offlineSince ? `since ${fmtTime(v.r.offlineSince)}` : '';
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusChip state={v.state} />
      {sub && <span className="text-xs text-gray-500 whitespace-nowrap">{sub}</span>}
    </div>
  );
}

const onTimeText = (r: Rider) => (r.onTimeToday == null || !r.tripsToday ? '–' : `${r.onTimeToday}%`);
const onTimeCls = (r: Rider) => (r.onTimeToday != null && r.tripsToday && r.onTimeToday < 80 ? 'text-[#c8151d] font-semibold' : 'text-[#1d1716]');
function Rating({ r }: { r: Rider }) {
  if (!r.rating) return <span className="text-gray-400">–</span>;
  const low = r.rating < 4.5;
  return <span className={cn('whitespace-nowrap font-semibold tabular-nums', low ? 'text-[#b8641a]' : 'text-[#1d1716]')}><span className={low ? 'text-[#e08a2e]' : 'text-[#1d1716]'}>★</span> {r.rating.toFixed(1)}</span>;
}
function Cod({ r }: { r: Rider }) {
  if (!r.codHeld) return <span className="text-gray-400">–</span>;
  return <span className={cn('font-bold tabular-nums whitespace-nowrap', r.status === 'offline' ? 'text-[#c8151d]' : 'text-[#1d1716]')}>{pesoShort(r.codHeld)}</span>;
}

// ---------------- Alerts ----------------
interface Alert { key: string; tone: 'red' | 'amber'; title: string; sub: string; action: string; riderId: string; order: number }

export function buildAlerts(s: AppState, riders: Rider[], now: number): Alert[] {
  const out: Alert[] = [];
  for (const r of riders) {
    if (r.status === 'pending') continue;
    if (r.status === 'offline' && r.codHeld > 0) {
      const held = heldCod(s, r, now);
      out.push({
        key: `cod-${r.id}`, tone: 'red', riderId: r.id, action: 'Collect', order: -1,
        title: `${r.name} went offline holding ${pesoShort(r.codHeld)} COD`,
        sub: `${plural(held.count, 'order')}${held.since ? ` since ${fmtTime(held.since)}` : ''} · not yet remitted`,
      });
    }
    for (const d of r.documents) {
      const days = daysLeft(d.expires, now);
      const chip = docChip(d, now);
      if (chip.tone === 'ok' || d.status === 'pending') continue;
      const expired = chip.label === 'Expired';
      out.push({
        key: `doc-${r.id}-${d.name}`, tone: chip.tone, riderId: r.id, action: 'Open rider', order: days,
        title: `${r.name} · ${docLabel(d, r)} ${expired ? 'has expired' : days === 0 ? 'expires today' : `expires in ${plural(days, 'day')}`}`,
        sub: `${expired ? 'Expired' : 'Expires'} ${fmtDate(d.expires)} · ask for a renewed copy`,
      });
    }
  }
  return out.sort((a, b) => (a.tone === b.tone ? a.order - b.order : a.tone === 'red' ? -1 : 1));
}

function AlertCard({ a, onOpen }: { a: Alert; onOpen: (id: string) => void }) {
  const red = a.tone === 'red';
  const Icon = a.key.startsWith('cod') ? Banknote : red ? AlertTriangle : FileWarning;
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', red ? 'bg-[#fdeeee] border-[#f3c9c9]' : 'bg-[#fdf4ea] border-[#f1dcc4]')}>
      <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', red ? 'bg-[#f9dada] text-[#c8151d]' : 'bg-[#f6e3cc] text-[#ae754d]')}>
        <Icon className="w-[18px] h-[18px]" {...ICON} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1d1716] break-words">{a.title}</p>
        <p className="text-xs text-[#6b5f5a] break-words">{a.sub}</p>
      </div>
      <button type="button" onClick={() => onOpen(a.riderId)}
        className={cn('shrink-0 h-10 px-2 text-sm font-semibold hover:underline underline-offset-2 whitespace-nowrap', red ? 'text-[#c8151d]' : 'text-[#ae754d]')}>{a.action}</button>
    </div>
  );
}

// ---------------- List ----------------
type Sort = 'az' | 'trips' | 'rating' | 'cod';
type Filter = 'all' | 'busy' | 'free' | 'offline' | 'cod';
const SORTS: { key: Sort; label: string }[] = [{ key: 'az', label: 'A–Z' }, { key: 'trips', label: 'Most trips' }, { key: 'rating', label: 'Top rated' }, { key: 'cod', label: 'Most COD' }];
const PAGE_SIZES = [10, 25, 50, 100];

export function OwnRidersTab({ s, views, max, now, onOpen }: { s: AppState; views: RiderView[]; max: number; now: number; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('az');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  const alerts = buildAlerts(s, views.map((v) => v.r), now);
  const t = q.trim().toLowerCase().replace(/\s+/g, '');
  const searched = views.filter((v) => !t || `${v.r.name}${v.r.plate}${v.r.phone}`.toLowerCase().replace(/\s+/g, '').includes(t));
  const match = (v: RiderView, f: Filter) => f === 'all' || (f === 'cod' ? v.r.codHeld > 0 : v.state === f);
  const filters: { key: Filter; label: string; dot: string }[] = [
    { key: 'all', label: 'All', dot: '#2a2322' }, { key: 'busy', label: 'On delivery', dot: '#e08a2e' }, { key: 'free', label: 'Available', dot: '#2f9e5b' },
    { key: 'offline', label: 'Offline', dot: '#9a8f8a' }, { key: 'cod', label: 'Holding COD', dot: '#e08a2e' },
  ];
  const rows = searched.filter((v) => match(v, filter)).sort((a, b) =>
    sort === 'trips' ? b.r.tripsToday - a.r.tripsToday : sort === 'rating' ? b.r.rating - a.r.rating : sort === 'cod' ? b.r.codHeld - a.r.codHeld : 0
    || a.r.name.localeCompare(b.r.name));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * size;
  const shown = rows.slice(start, start + size);

  return (
    <div className="space-y-4">
      {alerts.length > 0 && <div className="space-y-2">{alerts.map((a) => <AlertCard key={a.key} a={a} onOpen={onOpen} />)}</div>}

      <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0">
        <div className="px-3 sm:px-5 pt-4 pb-3 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="relative block w-full md:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" {...ICON} />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, plate, phone" aria-label="Search riders"
                className="h-11 w-full rounded-xl border border-[#eadfd6] bg-white pl-10 pr-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-2 focus:ring-[#c8151d]/10" />
            </label>
            <div className="overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
              <div role="group" aria-label="Sort riders" className="inline-flex gap-1 rounded-xl bg-[#ebe4dd] p-1 min-w-max">
                {SORTS.map((x) => (
                  <button key={x.key} type="button" aria-pressed={sort === x.key} onClick={() => { setSort(x.key); setPage(1); }}
                    className={cn('h-9 px-3 rounded-lg text-sm whitespace-nowrap transition-colors', sort === x.key ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>{x.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div role="group" aria-label="Filter riders" className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const on = filter === f.key;
              const n = searched.filter((v) => match(v, f.key)).length;
              return (
                <button key={f.key} type="button" aria-pressed={on} onClick={() => { setFilter(f.key); setPage(1); }}
                  className={cn('inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm whitespace-nowrap transition-colors',
                    on ? 'bg-[#2a2322] border-[#2a2322] text-white font-semibold' : 'bg-white border-[#eadfd6] text-[#3d3230] hover:border-[#d9cabe]')}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: on && f.key === 'all' ? '#fff' : f.dot }} />{f.label}
                  <span className={cn('tabular-nums', on ? 'text-white/80' : 'text-gray-500')}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500 border-t border-[#f0e8e2]">{t ? 'No riders match your search.' : 'No riders here right now.'}</p>
        ) : (
          <>
            {/* Tablet / desktop: table */}
            <div className="hidden md:block overflow-x-auto border-t border-[#f0e8e2]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                    <th className="pl-5 pr-3 py-2.5 font-semibold">Rider</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Trips today</th>
                    <th className="px-3 py-2.5 font-semibold text-right">On time</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Rating</th>
                    <th className="px-3 py-2.5 font-semibold text-right">COD held</th>
                    <th className="pr-5 py-2.5 w-8"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
                  {shown.map((v) => (
                    <tr key={v.r.id} tabIndex={0} onClick={() => onOpen(v.r.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(v.r.id); }}
                      className="cursor-pointer hover:bg-[#faf6f2] focus-visible:bg-[#faf6f2] outline-none">
                      <td className="pl-5 pr-3 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={v.r.name} dim={v.state === 'offline' || v.state === 'suspended'} dot={STATE[v.state].dot} />
                          <div className="min-w-0">
                            <p className={cn('font-semibold truncate', v.state === 'offline' ? 'text-gray-500' : 'text-[#1d1716]')}>{v.r.name}</p>
                            <p className="text-xs text-gray-500 truncate">{v.r.plate} · {v.r.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><StatusCell v={v} max={max} /></td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-[#1d1716]">{v.r.tripsToday}</td>
                      <td className={cn('px-3 py-3 text-right tabular-nums', onTimeCls(v.r))}>{onTimeText(v.r)}</td>
                      <td className="px-3 py-3 text-right"><Rating r={v.r} /></td>
                      <td className="px-3 py-3 text-right"><Cod r={v.r} /></td>
                      <td className="pr-5 py-3 text-right text-gray-400"><ChevronRight className="w-4 h-4 inline" {...ICON} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone: stacked cards */}
            <ul className="md:hidden divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
              {shown.map((v) => (
                <li key={v.r.id}>
                  <button type="button" onClick={() => onOpen(v.r.id)} className="w-full text-left px-3 py-3 hover:bg-[#faf6f2]">
                    <div className="flex items-center gap-3">
                      <Avatar name={v.r.name} dim={v.state === 'offline' || v.state === 'suspended'} dot={STATE[v.state].dot} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('font-semibold truncate', v.state === 'offline' ? 'text-gray-500' : 'text-[#1d1716]')}>{v.r.name}</p>
                        <p className="text-xs text-gray-500 truncate">{v.r.plate} · {v.r.phone}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" {...ICON} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[52px] text-xs text-gray-600">
                      <StatusChip state={v.state}>{v.state === 'busy' ? `On delivery · ${v.load}/${max}` : undefined}</StatusChip>
                      <span><b className="text-[#1d1716] tabular-nums">{v.r.tripsToday}</b> trips</span>
                      <span className={onTimeCls(v.r)}>{onTimeText(v.r)}{onTimeText(v.r) !== '–' && ' on time'}</span>
                      <Rating r={v.r} />
                      {v.r.codHeld > 0 && <span>COD <Cod r={v.r} /></span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <ListFooter start={start} count={shown.length} total={rows.length} size={size} onSize={(n) => { setSize(n); setPage(1); }} page={cur} pages={pages} onPage={setPage} />
      </section>
    </div>
  );
}

/** "Showing 1–10 of 24 riders", rows per page and the pager (same pattern as Inventory). */
function ListFooter({ start, count, total, size, onSize, page, pages, onPage }: {
  start: number; count: number; total: number; size: number; onSize: (n: number) => void; page: number; pages: number; onPage: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 sm:px-5 py-3 border-t border-[#f0e8e2]">
      <span className="text-sm text-gray-500">{total ? `Showing ${start + 1}–${start + count} of ${total} ${total === 1 ? 'rider' : 'riders'}` : 'No riders'}</span>
      <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Rows per page</span>
          <div className="inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Rows per page">
            {PAGE_SIZES.map((n) => (
              <button key={n} type="button" aria-pressed={size === n} onClick={() => onSize(n)}
                className={cn('h-8 min-w-9 px-2 rounded-lg text-xs tabular-nums', size === n ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{n}</button>
            ))}
          </div>
        </div>
        <Pager page={page} pages={pages} onPage={onPage} />
      </div>
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const list: (number | '…')[] = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1)
    : page <= 4 ? [1, 2, 3, 4, 5, '…', pages]
      : page >= pages - 3 ? [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages]
        : [1, '…', page - 1, page, page + 1, '…', pages];
  const btn = 'h-10 min-w-10 px-2 inline-flex items-center justify-center rounded-xl text-sm tabular-nums';
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={cn(btn, 'border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40')}><ChevronLeft className="w-4 h-4" {...ICON} /></button>
      <span className="sm:hidden px-2 text-sm text-gray-600 tabular-nums">{page} / {pages}</span>
      {list.map((n, i) => (n === '…'
        ? <span key={`gap-${i}`} className="hidden sm:inline-flex w-8 justify-center text-gray-400">…</span>
        : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
            className={cn(btn, 'hidden sm:inline-flex', n === page ? 'bg-[#2a2322] text-white font-semibold' : 'text-[#1d1716] hover:bg-[#f3ece6]')}>{n}</button>))}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className={cn(btn, 'border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40')}><ChevronRight className="w-4 h-4" {...ICON} /></button>
    </nav>
  );
}

// ---------------- Rider detail drawer ----------------
const cardCls = 'rounded-2xl border border-[#eadfd6] bg-white';
const sectionTitle = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500';

export function RiderDrawer({ s, v, max, now, canEdit, onClose, onRemit }: { s: AppState; v: RiderView; max: number; now: number; canEdit: boolean; onClose: () => void; onRemit: () => void }) {
  const { r, state, load } = v;
  const tel = r.phone.replace(/\s+/g, '');
  const st = r.stats7d;
  const since = r.joinedAt ? new Date(r.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
  const chipText = state === 'busy' ? `On delivery · ${load}/${max}` : undefined;
  const trips = s.orders
    .filter((o) => o.riderId === r.id && o.fulfillment === 'delivery' &&
      ((o.status === 'delivered' && sameDay(o.completedAt ?? o.updatedAt, now)) || o.status === 'out_for_delivery' || o.status === 'ready'))
    .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const held = heldCod(s, r, now);

  const perf: { label: string; value: ReactNode; cls?: string }[] = [
    { label: 'Trips', value: st ? st.trips : '–' },
    { label: 'On time', value: st ? `${st.onTimePct}%` : '–', cls: st && st.onTimePct < 80 ? 'text-[#c8151d]' : undefined },
    { label: 'Avg time', value: st ? `${st.avgMins} min` : '–' },
    { label: 'Acceptance', value: st ? `${st.acceptancePct}%` : '–' },
    { label: 'Rating', value: r.rating ? `★ ${r.rating.toFixed(1)}` : '–', cls: r.rating && r.rating < 4.5 ? 'text-[#b8641a]' : undefined },
    { label: 'Today', value: plural(r.tripsToday, 'trip') },
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full max-w-full sm:max-w-[520px] bg-[#fffdfb] border-[#eadfd6] text-[#1d1716] overflow-y-auto">
        <div className="px-4 sm:px-5 pt-5 pb-4 border-b border-[#eadfd6] shrink-0">
          <div className="flex items-start gap-3">
            <Avatar name={r.name} size="lg" dim={state === 'offline' || state === 'suspended'} dot={STATE[state].dot} />
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-2xl sm:text-3xl leading-none uppercase font-normal text-[#1d1716] break-words" style={OSWALD}>{r.name}</SheetTitle>
              <SheetDescription className="mt-1.5 text-[13px] text-[#6b5f5a] break-words">
                {[r.plate, VEHICLE_LABEL[r.vehicle], r.phone, since && `since ${since}`].filter(Boolean).join(' · ')}
              </SheetDescription>
              <div className="mt-2"><StatusChip state={state}>{chipText}</StatusChip></div>
            </div>
            <SheetClose className="w-11 h-11 rounded-lg border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
              <X className="w-5 h-5" {...ICON} />
            </SheetClose>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`tel:${tel}`} className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold hover:bg-[#faf6f2]"><Phone className="w-4 h-4" {...ICON} />Call</a>
            <a href={`sms:${tel}`} className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold hover:bg-[#faf6f2]"><MessageSquare className="w-4 h-4" {...ICON} />Text</a>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4 space-y-4">
          <section>
            <h3 className={sectionTitle}>Performance · last 7 days</h3>
            <div className={cn(cardCls, 'mt-2 grid grid-cols-3 divide-x divide-y divide-[#f0e8e2] overflow-hidden [&>*:nth-child(-n+3)]:border-t-0 [&>*:nth-child(3n+1)]:border-l-0')}>
              {perf.map((p) => (
                <div key={p.label} className="px-3 py-3 min-w-0">
                  <p className="text-xs text-gray-500">{p.label}</p>
                  <p className={cn('mt-0.5 text-lg font-semibold tabular-nums leading-tight truncate', p.cls ?? 'text-[#1d1716]')} style={OSWALD}>{p.value}</p>
                </div>
              ))}
            </div>
          </section>

          {r.codHeld > 0 && (
            <section className="rounded-2xl border border-[#f1dcc4] bg-[#fdf4ea] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-[#f6e3cc] text-[#ae754d] flex items-center justify-center shrink-0"><Banknote className="w-5 h-5" {...ICON} /></span>
                <div className="min-w-0">
                  <p className="font-semibold text-[#1d1716]">{pesoShort(r.codHeld)} COD cash held</p>
                  <p className="text-xs text-[#6b5f5a]">{plural(held.count, 'cash order')}{held.since ? ` since ${fmtTime(held.since)}` : ''}</p>
                </div>
              </div>
              <button type="button" disabled={!canEdit} onClick={onRemit}
                className="h-11 px-4 rounded-lg bg-[#2a2322] text-sm font-semibold text-white hover:bg-[#1d1716] disabled:opacity-50 shrink-0">Record remittance</button>
            </section>
          )}

          <section>
            <h3 className={sectionTitle}>Documents</h3>
            {r.documents.length === 0 ? (
              <p className={cn(cardCls, 'mt-2 px-4 py-4 text-sm text-gray-500')}>No documents on file yet.</p>
            ) : (
              <ul className={cn(cardCls, 'mt-2 divide-y divide-[#f0e8e2]')}>
                {r.documents.map((d) => {
                  const c = docChip(d, now);
                  return (
                    <li key={d.name} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1d1716] truncate">{docLabel(d, r)}</p>
                        <p className="text-xs text-gray-500">{c.label === 'Expired' ? 'Expired' : 'Valid until'} {fmtDate(d.expires)}</p>
                      </div>
                      <span className={cn('rounded-full px-2.5 h-6 inline-flex items-center text-xs font-semibold whitespace-nowrap', c.cls)}>{c.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className={sectionTitle}>Today&apos;s trips</h3>
            {trips.length === 0 ? (
              <p className={cn(cardCls, 'mt-2 px-4 py-4 text-sm text-gray-500')}>No trips yet today.</p>
            ) : (
              <ul className={cn(cardCls, 'mt-2 divide-y divide-[#f0e8e2]')}>
                {trips.map((o) => {
                  const done = o.status === 'delivered';
                  const pay = o.paymentMethod === 'cod' ? 'COD' : 'Paid online';
                  return (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1d1716] truncate">{o.number} · {areaOf(o)}</p>
                        <p className="text-xs text-gray-500">{done ? `Delivered ${fmtTime(o.completedAt ?? o.updatedAt)}` : o.status === 'ready' ? 'Picking up' : 'In progress'} · {pay}</p>
                      </div>
                      {done
                        ? <span className="text-sm font-semibold text-[#1f6b3f] tabular-nums whitespace-nowrap">{deliveryMins(o)} min</span>
                        : <span className="text-sm font-semibold text-[#2c4f9e]">Live</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {canEdit && (state === 'busy' || state === 'free' || state === 'offline') && (
            <section className={cn(cardCls, 'p-4')}>
              <p className="font-semibold text-[#1d1716]">Suspend rider</p>
              <p className="mt-1 text-sm text-[#6b5f5a]">
                {load > 0 ? `They have ${plural(load, 'active order')}. Those finish normally; they just stop getting new jobs.` : 'They stop receiving new jobs until you reinstate them.'}
              </p>
              <button type="button" onClick={() => { setRiderStatus(r, 'suspended', 'Rider suspended', 'Suspended by admin'); toast.success(`${r.name} suspended`); }}
                className="mt-3 h-11 px-4 rounded-xl border border-[#e7b4b6] bg-white text-sm font-semibold text-[#c8151d] hover:bg-[#fdeeee]">Suspend rider</button>
            </section>
          )}
          {canEdit && state === 'suspended' && (
            <section className={cn(cardCls, 'p-4')}>
              <p className="font-semibold text-[#1d1716]">Rider suspended</p>
              <p className="mt-1 text-sm text-[#6b5f5a]">They get no new jobs. Reinstate them to put them back on the roster (they start offline).</p>
              <button type="button" onClick={() => { setRiderStatus(r, 'offline', 'Rider reactivated'); toast.success(`${r.name} reinstated`); }}
                className="mt-3 h-11 px-4 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1f6b3f] hover:bg-[#f2f8f3]">Reinstate rider</button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------- Add rider ----------------
const fieldClass = 'w-full h-11 rounded-xl border border-[#e3d6cc] bg-white px-3 text-[15px] text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10';

export function AddRiderDialog({ branch, onClose, onAdded }: { branch: Branch; onClose: () => void; onAdded: (id: string) => void }) {
  const [f, setF] = useState({ name: '', phone: '', plate: '', vehicle: 'motorcycle' as Rider['vehicle'] });
  const ok = f.name.trim().length > 1 && f.phone.replace(/\D/g, '').length >= 10 && f.plate.trim().length > 1;
  const save = () => {
    if (!ok) return;
    const id = uid('r');
    const name = f.name.trim();
    mutate((d) => {
      d.riders.push({
        id, name, phone: f.phone.trim(), type: 'own', vehicle: f.vehicle, plate: f.plate.trim().toUpperCase(), branchIds: [branch.id], status: 'offline',
        rating: 0, lat: branch.lat, lng: branch.lng, codHeld: 0, tripsToday: 0, earningsToday: 0, documents: [], joinedAt: new Date().toISOString(),
      });
      addAudit(d, { module: 'Riders', action: 'Rider added', branchId: branch.id, detail: `${name} · ${f.plate.trim().toUpperCase()}` });
    });
    toast.success(`${name} added`, { description: 'They appear as offline until they sign in to the Rider App.' });
    onAdded(id);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Add rider</DialogTitle>
          <DialogDescription>One of the shop&apos;s own riders for {branch.name}. Upload their documents from the Rider App.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="block"><span className="text-sm font-medium">Full name</span>
            <input className={cn(fieldClass, 'mt-1')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Juan Dela Cruz" autoFocus /></label>
          <label className="block"><span className="text-sm font-medium">Mobile number</span>
            <input className={cn(fieldClass, 'mt-1')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0917 800 0025" inputMode="tel" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium">Plate</span>
              <input className={cn(fieldClass, 'mt-1')} value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} placeholder="MDA 1234" /></label>
            <label className="block"><span className="text-sm font-medium">Vehicle</span>
              <select className={cn(fieldClass, 'mt-1')} value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value as Rider['vehicle'] })}>
                {(Object.keys(VEHICLE_LABEL) as Rider['vehicle'][]).map((k) => <option key={k} value={k}>{VEHICLE_LABEL[k]}</option>)}
              </select></label>
          </div>
          <DialogFooter className="pt-2 gap-2">
            <button type="button" onClick={onClose} className="h-11 px-4 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold hover:bg-[#faf6f2]">Cancel</button>
            <button type="submit" disabled={!ok} className="h-11 px-4 rounded-xl bg-[#d6202a] text-sm font-semibold text-white hover:bg-[#c8151d] disabled:bg-[#efa4a8]">Add rider</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
