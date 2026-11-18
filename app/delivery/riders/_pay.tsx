'use client';

// Riders page → "Payout statements" tab (master–detail). Weekly statements run Monday–Sunday and are paid the
// following Monday. Per-day figures are deterministic demo data per rider and date (today uses the rider's live
// trips-today count); totals are always the sum of the rows.
import { useRef, useState } from 'react';
import { Download, Info } from 'lucide-react';
import { toast } from 'sonner';
import { exportCsv, getSetting, num, peso, pesoShort } from '@/src/lib/logic';
import type { AppState, Rider } from '@/src/lib/types';
import { ownRiders, PAY_RULES } from '@/src/components/delivery/helpers';
import { cn } from '@/src/lib/utils';
import { Avatar, ICON, OSWALD, STATE, riderView } from './_own';
import { scrollToDetail, selRowCls, smallCaps } from './_cod';

type Week = 'this' | 'last';
const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface PayDay { label: string; trips: number; km: number; tipTrips: number; late: number; future: boolean }
interface PayRow { r: Rider; days: PayDay[]; trips: number; km: number; base: number; distance: number; tips: number; late: number; penalties: number; net: number; hold: boolean }

/** FNV-1a string hash → stable pseudo-random numbers per rider and day. */
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };
/** Monday 00:00 of this week (0) or last week (-1). */
function monday(now: number, offset: number) {
  const d = startOfDay(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}
const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
function range(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() ? `${md(a)}–${b.getDate()}` : `${md(a)}–${md(b)}`;
}

export function payRates(s: AppState) {
  return {
    base: num(getSetting(s, 'riderBasePay')) || PAY_RULES.own.base,
    perKm: num(getSetting(s, 'riderPerKm')) || PAY_RULES.own.perKm,
    late: num(getSetting(s, 'riderLatePenalty')) || 20,
    tip: 20,
  };
}

/** One rider's week, day by day. */
function riderDays(r: Rider, start: Date, now: number): PayDay[] {
  const today = startOfDay(now).getTime();
  const joined = r.joinedAt ? startOfDay(Date.parse(r.joinedAt)).getTime() : 0;
  return DAY_LABEL.map((label, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const t = d.getTime();
    const future = t > today;
    if (future || t < joined) return { label, trips: 0, km: 0, tipTrips: 0, late: 0, future };
    const h = hash(`${r.id}|${d.toLocaleDateString('en-CA')}`);
    const trips = t === today ? r.tripsToday : h % 100 < 15 ? 0 : 2 + ((h >>> 8) % 4);
    if (!trips) return { label, trips: 0, km: 0, tipTrips: 0, late: 0, future };
    const km = Math.round(trips * (1.6 + ((h >>> 12) % 15) / 10) * 10) / 10;
    const tipTrips = Math.min(trips, (h >>> 16) % 4);
    const lateOdds = (r.stats7d?.onTimePct ?? 90) < 80 ? 3 : 1;
    const late = (h >>> 20) % 10 < lateOdds ? 1 : 0;
    return { label, trips, km, tipTrips, late, future };
  });
}

export function payWeek(s: AppState, now: number, week: Week) {
  const start = monday(now, week === 'this' ? 0 : -1);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const payDay = new Date(start); payDay.setDate(start.getDate() + 7);
  const rate = payRates(s);
  const rows: PayRow[] = ownRiders(s).filter((r) => r.status !== 'pending').map((r) => {
    const days = riderDays(r, start, now);
    const trips = days.reduce((t, d) => t + d.trips, 0);
    const km = Math.round(days.reduce((t, d) => t + d.km, 0) * 10) / 10;
    const tips = days.reduce((t, d) => t + d.tipTrips, 0) * rate.tip;
    const late = days.reduce((t, d) => t + d.late, 0);
    const base = trips * rate.base;
    const distance = Math.round(km * rate.perKm);
    const penalties = late * rate.late;
    // On hold: the rider went off shift still holding COD cash.
    const hold = r.status === 'offline' && r.codHeld > 0;
    return { r, days, trips, km, base, distance, tips, late, penalties, net: base + distance + tips - penalties, hold };
  }).sort((a, b) => b.net - a.net || a.r.name.localeCompare(b.r.name));
  return { rows, rate, start, end, payDay, label: range(start, end) };
}

export function PayTab({ s, now, onCod }: { s: AppState; now: number; onCod: (riderId: string) => void }) {
  const [week, setWeek] = useState<Week>('last');
  const [selId, setSelId] = useState<string | null>(null);
  const [showZero, setShowZero] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const { rows, rate, start, payDay, label } = payWeek(s, now, week);
  const withTrips = rows.filter((x) => x.trips > 0);
  const zero = rows.filter((x) => x.trips === 0);
  const visible = showZero ? rows : withTrips;
  const holds = rows.filter((x) => x.hold && x.trips > 0).length;
  const sel = visible.find((x) => x.r.id === selId) ?? visible[0];
  const totalTrips = rows.reduce((t, x) => t + x.trips, 0);
  const totalNet = rows.reduce((t, x) => t + x.net, 0);
  const payText = `${week === 'last' ? 'Paid' : 'Pays'} ${payDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

  const pick = (id: string) => { setSelId(id); scrollToDetail(detailRef.current); };
  const exportStatement = () => {
    const stamp = start.toLocaleDateString('en-CA');
    exportCsv(`rider-payouts-week-${stamp}.csv`, [
      ['Rider', 'Plate', 'Week', 'Trips', 'Distance (km)', `Base (${pesoShort(rate.base)}/trip)`, `Distance pay (${pesoShort(rate.perKm)}/km)`, 'Tips', 'Late deliveries', 'Penalties', 'Net payout', 'Status'],
      ...rows.map((x) => [x.r.name, x.r.plate, label, x.trips, x.km, x.base, x.distance, x.tips, x.late, x.penalties, x.net, x.hold ? 'On hold' : week === 'last' ? 'Paid' : 'Pending']),
      ['Total', '', label, totalTrips, Math.round(rows.reduce((t, x) => t + x.km, 0) * 10) / 10, rows.reduce((t, x) => t + x.base, 0), rows.reduce((t, x) => t + x.distance, 0), rows.reduce((t, x) => t + x.tips, 0), rows.reduce((t, x) => t + x.late, 0), rows.reduce((t, x) => t + x.penalties, 0), totalNet, ''],
    ]);
    toast.success('Payout statement exported', { description: `${week === 'last' ? 'Last' : 'This'} week · ${label}` });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] gap-4 lg:gap-6 items-start">
      {/* LEFT: statement list */}
      <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#1d1716]">{week === 'last' ? 'Last week' : 'This week'} · {label}</h2>
            <p className="mt-0.5 text-xs font-medium text-[#ae754d]">
              {payText}{week === 'this' ? ' · running total' : ''}{holds > 0 && <span className="text-[#c8151d]"> · {holds} on hold</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Statement week" className="inline-flex gap-1 rounded-lg bg-[#ebe4dd] p-1">
              {([['this', 'This week'], ['last', 'Last week']] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={week === k} onClick={() => setWeek(k)}
                  className={cn('h-8 px-3 rounded-md text-sm whitespace-nowrap transition-colors', week === k ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={exportStatement} aria-label="Export statement CSV" title="Export statement CSV"
              className="w-10 h-10 rounded-lg border border-[#e3d6cc] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2]">
              <Download className="w-4 h-4" {...ICON} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_6.5rem] gap-2 px-4 sm:px-5 py-2 border-t border-[#f0e8e2] text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          <span>Rider</span><span className="text-right">Trips</span><span className="text-right">Net</span>
        </div>
        <ul className="divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
          {visible.map((x) => (
            <li key={x.r.id}>
              <button type="button" onClick={() => pick(x.r.id)} aria-current={sel?.r.id === x.r.id ? 'true' : undefined}
                className={cn(selRowCls(sel?.r.id === x.r.id), 'grid grid-cols-[minmax(0,1fr)_3.5rem_6.5rem] gap-2 items-center px-4 sm:px-5 py-2.5 text-sm')}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.hold ? '#e08a2e' : x.trips ? '#2f9e5b' : '#c9bdb4' }} aria-label={x.hold ? 'On hold' : week === 'last' ? 'Paid' : 'Ready'} />
                  <span className={cn('truncate font-medium', x.trips ? 'text-[#1d1716]' : 'text-gray-400')}>{x.r.name}</span>
                </span>
                <span className="text-right tabular-nums text-[#3d3230]">{x.trips}</span>
                <span className="text-right tabular-nums font-semibold text-[#1d1716]">{peso(x.net)}</span>
              </button>
            </li>
          ))}
        </ul>
        {zero.length > 0 && (
          <div className="border-t border-[#f0e8e2] py-2 text-center">
            <button type="button" onClick={() => setShowZero((v) => !v)} className="h-9 px-3 text-sm font-medium text-[#c8151d] hover:underline underline-offset-2">
              {showZero ? 'Hide riders with no trips' : `Show ${zero.length} ${zero.length === 1 ? 'rider' : 'riders'} with no trips`}
            </button>
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_6.5rem] gap-2 px-4 sm:px-5 py-3 border-t border-[#eadfd6] bg-[#faf6f2] text-sm font-semibold text-[#1d1716]">
          <span>Total · {withTrips.length} {withTrips.length === 1 ? 'rider' : 'riders'}</span>
          <span className="text-right tabular-nums">{totalTrips}</span>
          <span className="text-right tabular-nums">{peso(totalNet)}</span>
        </div>
      </section>

      {/* RIGHT: selected rider's statement */}
      <div ref={detailRef} className="min-w-0 scroll-mt-20">
        {sel ? <PayDetail s={s} x={sel} week={week} rate={rate} onCod={onCod} /> : (
          <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] px-5 py-12 text-center text-sm text-gray-500">No trips in this week yet.</section>
        )}
      </div>
    </div>
  );
}

function PayDetail({ s, x, week, rate, onCod }: { s: AppState; x: PayRow; week: Week; rate: ReturnType<typeof payRates>; onCod: (id: string) => void }) {
  const { r } = x;
  const v = riderView(s, r);
  const chip = x.hold ? { label: 'On hold', cls: 'bg-[#fdf1e3] text-[#b8641a]', dot: '#e08a2e' }
    : week === 'last' ? { label: 'Paid', cls: 'bg-[#e8f4eb] text-[#1f6b3f]', dot: '#2f9e5b' }
      : { label: 'Pending', cls: 'bg-[#f1ece8] text-[#6b5f5a]', dot: '#9a8f8a' };
  const lines: { label: string; sub: string; amount: string; cls?: string }[] = [
    { label: 'Base', sub: `${x.trips} ${x.trips === 1 ? 'trip' : 'trips'} × ${pesoShort(rate.base)}`, amount: peso(x.base) },
    { label: 'Distance', sub: `${x.km} km × ${pesoShort(rate.perKm)}`, amount: peso(x.distance) },
    { label: 'Tips', sub: 'Passed in full', amount: `+${peso(x.tips)}`, cls: 'text-[#1f6b3f]' },
    { label: 'Late deliveries', sub: `${x.late} × ${pesoShort(rate.late)}`, amount: x.penalties ? `−${peso(x.penalties)}` : peso(0), cls: x.penalties ? 'text-[#c8151d]' : undefined },
  ];
  const maxTrips = Math.max(1, ...x.days.map((d) => d.trips));

  return (
    <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0">
      <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
        <Avatar name={r.name} dim={v.state === 'offline' || v.state === 'suspended'} dot={STATE[v.state].dot} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#1d1716] truncate">{r.name}</p>
          <p className="text-xs text-gray-500 truncate">{r.plate} · {x.trips} {x.trips === 1 ? 'trip' : 'trips'} · {x.km} km</p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap shrink-0', chip.cls)}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: chip.dot }} />{chip.label}
        </span>
      </div>

      <ul className="mx-4 sm:mx-5 divide-y divide-[#f0e8e2] border-y border-[#f0e8e2]">
        {lines.map((l) => (
          <li key={l.label} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1d1716]">{l.label}</p>
              <p className="text-xs text-gray-500">{l.sub}</p>
            </div>
            <span className={cn('text-sm font-semibold tabular-nums', l.cls ?? 'text-[#1d1716]')}>{l.amount}</span>
          </li>
        ))}
      </ul>
      <div className="mx-4 sm:mx-5 flex items-end justify-between gap-3 py-3">
        <span className="text-sm font-semibold text-[#1d1716]">Net payout</span>
        <span className="text-3xl leading-none font-semibold tabular-nums text-[#1d1716]" style={OSWALD}>{peso(x.net)}</span>
      </div>
      {x.hold && (
        <div className="mx-4 sm:mx-5 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#fdf4ea] border border-[#f1dcc4] px-3 py-2.5 text-sm text-[#8a5a37]">
          <Info className="w-4 h-4 shrink-0 text-[#ae754d]" {...ICON} />
          <span className="flex-1 min-w-0">On hold until {pesoShort(r.codHeld)} COD is remitted</span>
          <button type="button" onClick={() => onCod(r.id)} className="font-semibold text-[#c8151d] hover:underline underline-offset-2">Go to COD remittance</button>
        </div>
      )}

      <div className="px-4 sm:px-5 pt-4 pb-5">
        <p className={smallCaps}>By day</p>
        <div className="mt-3 grid grid-cols-7 gap-2 items-end h-36" role="img" aria-label={`Trips per day: ${x.days.map((d) => `${d.label} ${d.trips}`).join(', ')}`}>
          {x.days.map((d) => (
            <div key={d.label} className="flex flex-col items-center justify-end h-full min-w-0">
              <span className={cn('text-xs tabular-nums mb-1', d.future ? 'text-gray-300' : 'text-[#3d3230] font-semibold')}>{d.future ? '' : d.trips}</span>
              <div className="w-full max-w-9 rounded-t-md bg-[#2a2322]" style={{ height: `${(d.trips / maxTrips) * 96}px`, minHeight: d.trips ? 4 : 0 }} />
              <div className="w-full max-w-9 h-px bg-[#e3d6cc]" />
              <span className={cn('mt-1.5 text-xs', d.future ? 'text-gray-300' : 'text-gray-500')}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
