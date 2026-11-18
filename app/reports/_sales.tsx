'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { exportCsv, peso, pesoShort } from '@/src/lib/logic';
import type { Order } from '@/src/lib/types';
import { dayKey, dayLabel, groupBy, isSale, lineTotal, netSales, sum } from '@/src/components/reports/analytics';
import { Delta } from '@/src/components/reports/ui';
import { cn } from '@/src/lib/utils';
import {
  C, Card, type Ctx, EmptyRow, Kpi, KpiStrip, Legend, OrderLink, PAY_NAME, PayChip, RANGE_LABEL, Segmented, ShareCell, StatusChip,
  TableWrap, Td, Th, VsPrev, fmtPlaced, gatewayFee, gatewayPct, pct, pesoK,
} from './_ui';

type Row = { key: string; name: string; sales: number; orders: number; prev: number; pending?: number; fees?: number };

function computeSales(ctx: Ctx) {
  const { s, cur, prev, days, range } = ctx;
  const sales = cur.filter(isSale);
  const prevSales = prev.filter(isSale);
  const revenue = sum(sales, netSales);
  const prevRevenue = sum(prevSales, netSales);
  const basket = sales.length ? revenue / sales.length : 0;
  const prevBasket = prevSales.length ? prevRevenue / prevSales.length : 0;
  const cancelled = cur.length - sales.length;
  const prevCancelled = prev.length - prevSales.length;

  // Daily (or hourly for Today) revenue, split delivery / pickup.
  const split = (l: Order[]) => ({ delivery: sum(l.filter((o) => o.fulfillment === 'delivery'), netSales), pickup: sum(l.filter((o) => o.fulfillment === 'pickup'), netSales), orders: l.length });
  let trend: { key: string; label: string; tip: string; delivery: number; pickup: number; orders: number }[];
  if (range === 1) {
    const byHour = groupBy(sales, (o) => String(new Date(o.placedAt).getHours()));
    const hours = [...byHour.keys()].map(Number);
    const from = Math.min(7, ...hours);
    const to = Math.max(20, ...hours);
    trend = Array.from({ length: to - from + 1 }, (_, i) => {
      const h = from + i;
      const lbl = `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
      return { key: String(h), label: lbl, tip: `${lbl}m`, ...split(byHour.get(String(h)) ?? []) };
    });
  } else {
    const byDay = groupBy(sales, (o) => dayKey(o.placedAt));
    trend = days.map((d) => ({ key: dayKey(d), label: dayLabel(d), tip: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), ...split(byDay.get(dayKey(d)) ?? []) }));
  }

  const breakdown = (key: (o: Order) => string, label: (k: string) => string): Row[] => {
    const rows = [...groupBy(sales, key)].map(([k, l]) => ({ key: k, name: label(k), sales: sum(l, netSales), orders: l.length }));
    const prevMap = groupBy(prevSales, key);
    return rows.map((r) => ({ ...r, prev: sum(prevMap.get(r.key) ?? [], netSales) })).sort((a, b) => b.sales - a.sales);
  };
  // Meat shop: sales by top-level product category from the order lines.
  const catName = (pid: string) => {
    const p = s.products.find((x) => x.id === pid);
    let c = s.categories.find((x) => x.id === p?.categoryId);
    while (c?.parentId) c = s.categories.find((x) => x.id === c!.parentId) ?? undefined;
    return c ? c.name : 'Other';
  };
  const catTotals = (list: Order[]) => {
    const m = new Map<string, { sales: number; orders: Set<string> }>();
    for (const o of list) for (const i of o.items) {
      if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
      const k = catName(i.productId);
      const e = m.get(k) ?? { sales: 0, orders: new Set<string>() };
      e.sales += lineTotal(i);
      e.orders.add(o.id);
      m.set(k, e);
    }
    return m;
  };
  const curCats = catTotals(sales);
  const prevCats = catTotals(prevSales);
  const byCategory: Row[] = [...curCats].map(([k, e]) => ({ key: k, name: k, sales: e.sales, orders: e.orders.size, prev: prevCats.get(k)?.sales ?? 0 })).sort((a, b) => b.sales - a.sales);
  const byFul = breakdown((o) => o.fulfillment, (k) => (k === 'delivery' ? 'Delivery' : 'Pickup'));
  const fee = gatewayPct(s, ctx.ids[0]);
  const byPay = breakdown((o) => o.paymentMethod, (k) => PAY_NAME[k as Order['paymentMethod']]).map((r) => {
    const l = sales.filter((o) => o.paymentMethod === r.key);
    return { ...r, pending: sum(l.filter((o) => o.paymentStatus === 'pending'), (o) => o.total), fees: sum(l, (o) => gatewayFee(o, fee)) };
  });

  // Busiest weekdays: average net sales per calendar day of that weekday in the range.
  const dayTotals = new Map(trend.map((t) => [t.key, t.delivery + t.pickup]));
  const wk = new Map<string, { total: number; n: number }>();
  for (const d of days) {
    const name = d.toLocaleDateString('en-US', { weekday: 'long' });
    const e = wk.get(name) ?? { total: 0, n: 0 };
    e.total += range === 1 ? revenue : dayTotals.get(dayKey(d)) ?? 0;
    e.n += 1;
    wk.set(name, e);
  }
  const busiest = [...wk].map(([name, e]) => ({ name, avg: e.total / e.n })).sort((a, b) => b.avg - a.avg).slice(0, 5);

  return { sales, prevSales, revenue, prevRevenue, basket, prevBasket, cancelled, prevCancelled, trend, byCategory, byFul, byPay, busiest };
}

export function salesCsv(ctx: Ctx) {
  const d = computeSales(ctx);
  const rows: (string | number)[][] = [['Sales report', RANGE_LABEL[ctx.range]], [], [ctx.range === 1 ? 'Hour' : 'Day', 'Delivery', 'Pickup', 'Net sales', 'Orders'],
    ...d.trend.map((t) => [t.label, t.delivery.toFixed(2), t.pickup.toFixed(2), (t.delivery + t.pickup).toFixed(2), t.orders]), []];
  for (const [title, list] of [['Category', d.byCategory], ['Fulfillment', d.byFul], ['Payment method', d.byPay]] as const) {
    rows.push([title, 'Net sales', 'Orders', 'Previous period', 'Change %']);
    list.forEach((r) => rows.push([r.name, r.sales.toFixed(2), r.orders, r.prev.toFixed(2), r.prev ? (((r.sales - r.prev) / r.prev) * 100).toFixed(1) : '']));
    rows.push([]);
  }
  rows.push(['Order', 'Placed', 'Customer', 'Channel', 'Status', 'Payment', 'Total']);
  [...ctx.cur].sort((a, b) => b.placedAt.localeCompare(a.placedAt)).forEach((o) => rows.push([o.number, o.placedAt, o.customerName, o.fulfillment, o.status, o.paymentStatus, o.total.toFixed(2)]));
  exportCsv(`sales-report-${dayKey(new Date())}.csv`, rows);
  toast.success('Sales report exported');
}

export function SalesTab({ ctx }: { ctx: Ctx }) {
  const d = computeSales(ctx);
  const delivery = d.sales.filter((o) => o.fulfillment === 'delivery').length;
  const peak = d.trend.reduce((m, t) => (t.delivery + t.pickup > m.delivery + m.pickup ? t : m), d.trend[0]);
  const peakTotal = peak ? peak.delivery + peak.pickup : 0;

  return (
    <div className="space-y-5">
      <KpiStrip cols={4}>
        <Kpi label="Net sales" value={pesoShort(d.revenue)} delta={<Delta cur={d.revenue} prev={d.prevRevenue} />} sub={`${d.sales.length} completed or active orders`} />
        <Kpi label="Orders" value={d.sales.length} delta={<Delta cur={d.sales.length} prev={d.prevSales.length} />} sub={`${delivery} delivery · ${d.sales.length - delivery} pickup`} />
        <Kpi label="Average basket" value={pesoShort(d.basket)} delta={<Delta cur={d.basket} prev={d.prevBasket} />} sub="per order" />
        <Kpi label="Cancelled" value={d.cancelled} delta={<Delta cur={d.cancelled} prev={d.prevCancelled} invert />} sub={`${pct(d.cancelled, ctx.cur.length).toFixed(1)}% of orders`} />
      </KpiStrip>

      <Card title={ctx.range === 1 ? 'Hourly revenue' : 'Daily revenue'}
        sub={peakTotal ? `Peak ${pesoShort(peakTotal)} ${ctx.range === 1 ? 'at' : 'on'} ${peak.label}` : 'No sales yet'}
        action={<Legend items={[{ label: 'Delivery', color: C.red }, { label: 'Pickup', color: C.redLight }]} />}>
        <RevenueBars trend={d.trend} peakKey={peakTotal ? peak.key : ''} every={ctx.range === 30 ? 3 : ctx.range === 1 ? 2 : 1} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <BreakdownCard title="By category" sub={`vs ${ctx.vsLabel}`} rows={d.byCategory} color={C.red} />
        <div className="space-y-5 min-w-0">
          <BreakdownCard title="By fulfillment" sub={`vs ${ctx.vsLabel}`} rows={d.byFul} color={C.brown} />
          <Card title="Busiest days" sub="average net sales by weekday">
            <ul className="divide-y divide-[#f4ede7]">
              {d.busiest.map((b) => (
                <li key={b.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 py-2">
                  <span className="text-sm text-[#1d1716]">{b.name}</span>
                  <div className="h-2 rounded-full bg-[#f3ece6]"><div className="h-2 rounded-full" style={{ width: `${pct(b.avg, d.busiest[0]?.avg ?? 0)}%`, background: C.teal }} /></div>
                  <span className="text-right text-sm font-semibold tabular-nums text-[#1d1716]">{pesoK(b.avg)}</span>
                </li>
              ))}
              {d.busiest.length === 0 && <li className="py-6 text-center text-sm text-gray-400">No sales in this period</li>}
            </ul>
          </Card>
        </div>
      </div>

      <PaymentCard rows={d.byPay} />
      <OrdersCard orders={ctx.cur} />
    </div>
  );
}

function RevenueBars({ trend, peakKey, every }: { trend: ReturnType<typeof computeSales>['trend']; peakKey: string; every: number }) {
  const max = Math.max(1, ...trend.map((t) => t.delivery + t.pickup));
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="min-w-[420px]">
        <div className={cn('flex h-52 items-end border-b border-[#eadfd6] pt-6', trend.length > 20 ? 'gap-[3px]' : 'gap-1.5 sm:gap-2.5')}>
          {trend.map((t) => {
            const total = t.delivery + t.pickup;
            return (
              <div key={t.key} className="relative flex h-full flex-1 flex-col justify-end group"
                title={`${t.tip}\nDelivery ${peso(t.delivery)}\nPickup ${peso(t.pickup)}\n${t.orders} orders`}>
                {t.key === peakKey && (
                  <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-[#1d1716] whitespace-nowrap" style={{ bottom: `calc(${(total / max) * 100}% + 4px)` }}>{pesoK(total, 0)}</span>
                )}
                <div className="w-full rounded-t-[3px] group-hover:opacity-80" style={{ height: `${(t.pickup / max) * 100}%`, background: C.redLight }} />
                <div className={cn('w-full group-hover:opacity-80', !t.pickup && 'rounded-t-[3px]')} style={{ height: `${(t.delivery / max) * 100}%`, background: C.red }} />
              </div>
            );
          })}
        </div>
        <div className={cn('mt-1.5 flex', trend.length > 20 ? 'gap-[3px]' : 'gap-1.5 sm:gap-2.5')}>
          {trend.map((t, i) => (
            <span key={t.key} className="flex-1 text-center text-[10px] sm:text-[11px] text-gray-500 whitespace-nowrap overflow-visible">
              {i % every === 0 ? t.label : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({ title, sub, rows, color }: { title: string; sub: string; rows: Row[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.sales));
  const total = sum(rows, (r) => r.sales);
  return (
    <Card title={title} sub={sub} bodyClass="pb-1">
      <TableWrap minWidth={520}>
        <thead><tr><Th>Name</Th><Th className="w-[30%]">Share</Th><Th right>Net sales</Th><Th right>Orders</Th><Th right>vs prev</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <Td className="font-medium text-[#1d1716] whitespace-nowrap">{r.name}</Td>
              <Td><ShareCell value={r.sales} total={total} max={max} color={color} /></Td>
              <Td right className="font-semibold text-[#1d1716]">{pesoShort(r.sales)}</Td>
              <Td right>{r.orders}</Td>
              <Td right className="text-xs whitespace-nowrap"><VsPrev cur={r.sales} prev={r.prev} /></Td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow cols={5} text="No sales in this period" />}
        </tbody>
      </TableWrap>
    </Card>
  );
}

function PaymentCard({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sales));
  const total = sum(rows, (r) => r.sales);
  return (
    <Card title="By payment method" sub="pending = not yet paid · gateway fees on online payments" bodyClass="pb-1">
      <TableWrap minWidth={760}>
        <thead><tr><Th>Name</Th><Th className="w-[22%]">Share</Th><Th right>Net sales</Th><Th right>Orders</Th><Th right>Pending</Th><Th right>Gateway fees</Th><Th right>vs prev</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <Td className="font-medium text-[#1d1716] whitespace-nowrap">{r.name}</Td>
              <Td><ShareCell value={r.sales} total={total} max={max} color={C.ink} /></Td>
              <Td right className="font-semibold text-[#1d1716]">{pesoShort(r.sales)}</Td>
              <Td right>{r.orders}</Td>
              <Td right className={r.pending ? 'font-semibold text-[#ae754d]' : 'text-gray-400'}>{r.pending ? pesoShort(r.pending) : '–'}</Td>
              <Td right className={r.fees ? 'text-[#1d1716]' : 'text-gray-400'}>{r.fees ? pesoShort(r.fees) : '–'}</Td>
              <Td right className="text-xs whitespace-nowrap"><VsPrev cur={r.sales} prev={r.prev} /></Td>
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow cols={7} text="No sales in this period" />}
        </tbody>
      </TableWrap>
    </Card>
  );
}

type Filter = 'all' | 'completed' | 'progress' | 'cancelled';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'completed', label: 'Completed' }, { value: 'progress', label: 'In progress' }, { value: 'cancelled', label: 'Cancelled' },
];
const DONE = ['delivered', 'collected'];
const STOPPED = ['cancelled', 'failed_delivery'];
const PER_PAGE = 10;

function OrdersCard({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const list = orders
    .filter((o) => filter === 'all' || (filter === 'completed' ? DONE.includes(o.status) : filter === 'cancelled' ? STOPPED.includes(o.status) : !DONE.includes(o.status) && !STOPPED.includes(o.status)))
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const p = Math.min(page, pages);
  const shown = list.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  const sq = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40 disabled:hover:bg-white';
  return (
    <Card title="Orders in period" sub={`${list.length} ${list.length === 1 ? 'order' : 'orders'}`} bodyClass="pb-3"
      action={<Segmented label="Filter orders" value={filter} options={FILTERS} onChange={(v) => { setFilter(v); setPage(1); }} />}>
      <TableWrap minWidth={820}>
        <thead><tr><Th>Order</Th><Th>Placed</Th><Th>Customer</Th><Th>Channel</Th><Th>Status</Th><Th>Payment</Th><Th right>Total</Th></tr></thead>
        <tbody>
          {shown.map((o) => (
            <tr key={o.id}>
              <Td><OrderLink o={o} /></Td>
              <Td className="text-gray-500 whitespace-nowrap">{fmtPlaced(o.placedAt)}</Td>
              <Td className="text-[#1d1716] whitespace-nowrap">{o.customerName}</Td>
              <Td className="text-gray-600">{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</Td>
              <Td><StatusChip status={o.status} /></Td>
              <Td><PayChip status={o.paymentStatus} /></Td>
              <Td right className="font-semibold text-[#1d1716] whitespace-nowrap">{peso(o.total)}</Td>
            </tr>
          ))}
          {shown.length === 0 && <EmptyRow cols={7} text="No orders match this filter" />}
        </tbody>
      </TableWrap>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm text-gray-500">
        <span className="mr-1">Page {p} of {pages}</span>
        <button type="button" className={sq} aria-label="Previous page" disabled={p <= 1} onClick={() => setPage(p - 1)}><ChevronLeft className="w-4 h-4" /></button>
        <button type="button" className={sq} aria-label="Next page" disabled={p >= pages} onClick={() => setPage(p + 1)}><ChevronRight className="w-4 h-4" /></button>
      </div>
    </Card>
  );
}
