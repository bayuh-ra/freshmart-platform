'use client';

import { toast } from 'sonner';
import { exportCsv, getSetting, num } from '@/src/lib/logic';
import type { Order } from '@/src/lib/types';
import { avg, dayKey, dayLabel, groupBy, stepMinutes } from '@/src/components/reports/analytics';
import { Delta } from '@/src/components/reports/ui';
import { BarRow, C, Card, type Ctx, Kpi, KpiStrip, pct } from './_ui';

const ON_TIME_MINS = 40;
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i); // 7a – 8p
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;

/** Stage times, rates and line problems for a set of orders. */
function opsStats(orders: Order[]) {
  const collect = (from: string[], to: string[]) => orders.map((o) => stepMinutes(o, from, to)).filter((x): x is number => x !== undefined && x > 0);
  const confirm = collect(['placed'], ['confirmed']);
  const prep = collect(['confirmed'], ['ready']);
  const wait = collect(['ready'], ['out_for_delivery']);
  const delivery = collect(['out_for_delivery'], ['delivered']);
  const cancelled = orders.filter((o) => o.status === 'cancelled');
  const items = orders.flatMap((o) => o.items);
  const subs = items.filter((i) => i.substitute || i.pickStatus === 'substituted').length;
  const oos = items.filter((i) => i.pickStatus === 'out_of_stock' || i.pickStatus === 'short').length;
  return {
    confirm, prep, wait, delivery, cancelled, items, subs, oos,
    onTime: delivery.length ? pct(delivery.filter((m) => m <= ON_TIME_MINS).length, delivery.length) : NaN,
    cancelRate: orders.length ? pct(cancelled.length, orders.length) : NaN,
    oosRate: items.length ? pct(oos, items.length) : NaN,
  };
}

function computeOps(ctx: Ctx) {
  const { cur, prev, days, range } = ctx;
  const c = opsStats(cur);
  const p = opsStats(prev);
  const reasons = [...groupBy(c.cancelled, (o) => o.rejectReason ?? 'No reason recorded')].map(([k, l]) => ({ reason: k, count: l.length })).sort((a, b) => b.count - a.count);

  const shortMap = new Map<string, { name: string; reason: string; count: number }>();
  for (const o of cur) for (const i of o.items) {
    const reason = i.pickStatus === 'short' ? 'short by weight' : i.pickStatus === 'out_of_stock' ? 'out of stock' : i.substitute || i.pickStatus === 'substituted' ? 'substituted' : '';
    if (!reason) continue;
    const k = `${i.productId}|${reason}`;
    const e = shortMap.get(k) ?? { name: i.name, reason, count: 0 };
    e.count += 1;
    shortMap.set(k, e);
  }
  const shortLines = [...shortMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 6);

  const byHour = groupBy(cur, (o) => String(new Date(o.placedAt).getHours()));
  const hours = HOURS.map((h) => ({ h, label: hourLabel(h), perDay: (byHour.get(String(h))?.length ?? 0) / range }));
  const top2 = new Set([...hours].sort((a, b) => b.perDay - a.perDay).filter((x) => x.perDay > 0).slice(0, 2).map((x) => x.h));

  const rated = groupBy(cur.filter((o) => o.rating), (o) => dayKey(o.placedAt));
  const ratings = days.map((d) => {
    const l = rated.get(dayKey(d)) ?? [];
    return { key: dayKey(d), day: d.getDate(), label: dayLabel(d), value: l.length ? avg(l.map((o) => o.rating!.order)) : null, n: l.length, rider: avg(l.filter((o) => o.rating?.rider).map((o) => o.rating!.rider!)) };
  });
  return { c, p, reasons, shortLines, hours, top2, ratings };
}

export function operationsCsv(ctx: Ctx) {
  const { c, reasons, shortLines, hours, ratings } = computeOps(ctx);
  exportCsv(`operations-report-${dayKey(new Date())}.csv`, [
    ['Metric', 'Value', 'Sample size'],
    ['Avg confirmation time (min)', avg(c.confirm).toFixed(1), c.confirm.length],
    ['Avg preparation time (min)', avg(c.prep).toFixed(1), c.prep.length],
    ['Avg wait for rider (min)', avg(c.wait).toFixed(1), c.wait.length],
    ['Avg delivery time (min)', avg(c.delivery).toFixed(1), c.delivery.length],
    [`On-time rate % (within ${ON_TIME_MINS} min of pickup)`, Number.isFinite(c.onTime) ? c.onTime.toFixed(1) : '', c.delivery.length],
    ['Cancellation rate %', Number.isFinite(c.cancelRate) ? c.cancelRate.toFixed(1) : 0, ctx.cur.length],
    ['Substitution rate %', c.items.length ? pct(c.subs, c.items.length).toFixed(1) : 0, c.items.length],
    ['Out-of-stock / short rate %', Number.isFinite(c.oosRate) ? c.oosRate.toFixed(1) : 0, c.items.length],
    [], ['Cancellation reason', 'Count'], ...reasons.map((r) => [r.reason, r.count]),
    [], ['Short or substituted product', 'Reason', 'Lines'], ...shortLines.map((r) => [r.name, r.reason, r.count]),
    [], ['Hour', 'Orders per day'], ...hours.map((h) => [h.label, h.perDay.toFixed(2)]),
    [], ['Day', 'Avg order rating', 'Avg rider rating', 'Ratings'], ...ratings.map((r) => [r.label, r.value?.toFixed(2) ?? '', r.n ? r.rider.toFixed(2) : '', r.n]),
  ]);
  toast.success('Operations report exported');
}

export function OperationsTab({ ctx }: { ctx: Ctx }) {
  const { c, p, reasons, shortLines, hours, top2, ratings } = computeOps(ctx);
  const coldLimit = num(getSetting(ctx.s, 'meatMaxDeliveryMins', ctx.ids[0])) || 60;
  const mins = (arr: number[]) => (arr.length ? `${avg(arr).toFixed(1)} min` : '—');
  const prevAvg = (arr: number[]) => (arr.length ? avg(arr) : 0);
  const rate = (v: number) => (Number.isFinite(v) ? `${v < 10 ? v.toFixed(1) : Math.round(v)}%` : '—');
  const stages = [
    { label: 'Placed → confirmed', sub: 'staff accepts', v: avg(c.confirm), color: C.brown },
    { label: 'Confirmed → ready', sub: 'pick, cut, pack', v: avg(c.prep), color: C.purple },
    { label: 'Ready → rider pickup', sub: 'waiting for rider', v: avg(c.wait), color: C.teal },
    { label: 'Pickup → delivered', sub: 'on the road', v: avg(c.delivery), color: C.blue },
  ];
  const maxStage = Math.max(1, ...stages.map((x) => x.v));
  const maxHour = Math.max(0.1, ...hours.map((h) => h.perDay));
  const maxShort = Math.max(1, ...shortLines.map((x) => x.count));

  return (
    <div className="space-y-5">
      <KpiStrip cols={6}>
        <Kpi label="Confirm time" value={mins(c.confirm)} delta={<Delta cur={avg(c.confirm)} prev={prevAvg(p.confirm)} invert />} sub={`${c.confirm.length} orders timed`} />
        <Kpi label="Prep time" value={mins(c.prep)} delta={<Delta cur={avg(c.prep)} prev={prevAvg(p.prep)} invert />} sub="confirmed → ready" />
        <Kpi label="Delivery time" value={mins(c.delivery)} delta={<Delta cur={avg(c.delivery)} prev={prevAvg(p.delivery)} invert />} sub="pickup → door" />
        <Kpi label="On-time rate" value={rate(c.onTime)} delta={<Delta cur={c.onTime} prev={p.onTime} points />} sub={`within ${ON_TIME_MINS} min of pickup`} />
        <Kpi label="Cancellation" value={rate(c.cancelRate)} delta={<Delta cur={c.cancelRate} prev={p.cancelRate} points invert />} sub={`${c.cancelled.length} of ${ctx.cur.length} orders`} />
        <Kpi label="Out of stock" value={rate(c.oosRate)} delta={<Delta cur={c.oosRate} prev={p.oosRate} points invert />} sub={`${c.oos} of ${c.items.length} lines short`} />
      </KpiStrip>

      <Card title="Where the time goes" sub={`average minutes per stage · cold-chain limit ${coldLimit} min from packing`}>
        <ul className="divide-y divide-[#f4ede7]">
          {stages.map((x) => (
            <li key={x.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem] items-center gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#1d1716] truncate">{x.label}</p>
                <p className="text-xs text-gray-500">{x.sub}</p>
              </div>
              <div className="h-3 rounded-[3px] bg-[#f3ece6]"><div className="h-3 rounded-[3px]" style={{ width: `${x.v ? Math.max(1.5, pct(x.v, maxStage)) : 0}%`, background: x.color }} /></div>
              <span className="text-right text-sm font-semibold tabular-nums text-[#1d1716]">{x.v ? `${x.v.toFixed(1)} min` : '—'}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-5 items-start">
        <Card title="Orders by hour" sub="average per day · plan staff around the peaks">
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="min-w-[380px]">
              <div className="flex h-56 items-end gap-1.5 sm:gap-2 border-b border-[#eadfd6] pt-6">
                {hours.map((h) => {
                  const hot = top2.has(h.h);
                  return (
                    <div key={h.h} className="relative flex h-full flex-1 flex-col justify-end" title={`${h.label}m: ${h.perDay.toFixed(1)} orders per day`}>
                      {hot && <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-[#c8151d]" style={{ bottom: `calc(${(h.perDay / maxHour) * 100}% + 4px)` }}>{h.perDay.toFixed(1)}</span>}
                      <div className="w-full rounded-t-[3px]" style={{ height: `${(h.perDay / maxHour) * 100}%`, minHeight: h.perDay ? 2 : 0, background: hot ? C.red : C.ink }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex gap-1.5 sm:gap-2">
                {hours.map((h, i) => <span key={h.h} className="flex-1 text-center text-[11px] text-gray-500">{i % 2 === 0 ? h.label : ''}</span>)}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5 min-w-0">
          <Card title="Cancellation reasons" sub={`${c.cancelled.length} cancelled`}>
            <ul className="divide-y divide-[#f4ede7]">
              {reasons.map((r) => <BarRow key={r.reason} label={r.reason} title={r.reason} value={r.count} max={reasons[0].count} color={C.grey} right={r.count} />)}
              {reasons.length === 0 && <li className="py-6 text-center text-sm text-gray-400">No cancellations in this period</li>}
            </ul>
          </Card>
          <Card title="Short or substituted lines" sub="items staff couldn't fill as ordered">
            <ul className="divide-y divide-[#f4ede7]">
              {shortLines.map((r) => <BarRow key={`${r.name}|${r.reason}`} label={r.name} sub={r.reason} value={r.count} max={maxShort} color={C.brown} right={r.count} />)}
              {shortLines.length === 0 && <li className="py-6 text-center text-sm text-gray-400">Every line was filled as ordered</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Card title="Ratings by day" sub="order rating · scale starts at 4.0">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className={ratings.length > 14 ? 'min-w-[560px]' : 'min-w-[320px]'}>
            <div className="flex h-44 items-end gap-1.5 sm:gap-2.5 border-b border-[#eadfd6] pt-6">
              {ratings.map((r) => {
                const h = r.value === null ? 0 : Math.max(0.03, Math.min(1, r.value - 4));
                return (
                  <div key={r.key} className="relative flex h-full flex-1 flex-col justify-end"
                    title={r.value === null ? `${r.label}: no ratings` : `${r.label}: ${r.value.toFixed(2)} from ${r.n} rating${r.n === 1 ? '' : 's'}`}>
                    <span className="absolute left-1/2 -translate-x-1/2 text-[10px] sm:text-[11px] font-semibold tabular-nums text-[#1d1716]" style={{ bottom: `calc(${h * 100}% + 3px)` }}>
                      {r.value === null ? '–' : r.value.toFixed(1)}
                    </span>
                    <div className="w-full rounded-t-[3px]" style={{ height: `${h * 100}%`, background: r.value !== null && r.value < 4.5 ? C.brown : C.green }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-1.5 sm:gap-2.5">
              {ratings.map((r) => <span key={r.key} className="flex-1 text-center text-[11px] text-gray-500">{r.day}</span>)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
