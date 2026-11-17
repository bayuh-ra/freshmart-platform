'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Clock, CheckCircle2, Plus, Snowflake, Store, Truck } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { useStore } from '@/src/lib/store';
import { useNow } from '@/src/components/reports/ui';
import { userBranchIds, branchName, peso, timeAgo, isToday, PAYMENT_LABEL } from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import type { Order, OrderStatus } from '@/src/lib/types';
import {
  DAY, dayKey, groupBy, isDelayed, isSale, itemQty, lineTotal, lowStockList, netSales, startOfDay, sum,
} from '@/src/components/reports/analytics';
import { ProductImage } from '@/src/components/ProductImage';
import { cn } from '@/src/lib/utils';

// Jovanne's Meat Shop dashboard — matches the approved desktop + phone designs.
const display = { fontFamily: 'var(--font-oswald)' } as const;
const pesoWhole = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

const STAGES: { key: string; label: string; color: string; match: (o: Order) => boolean }[] = [
  { key: 'awaiting', label: 'Awaiting', color: '#d6202a', match: (o) => o.status === 'awaiting_confirmation' || o.status === 'placed' },
  { key: 'confirmed', label: 'Confirmed', color: '#d9822b', match: (o) => o.status === 'confirmed' },
  { key: 'preparing', label: 'Preparing', color: '#8b2f6e', match: (o) => o.status === 'preparing' || o.status === 'awaiting_shopper' },
  { key: 'ready', label: 'Ready', color: '#1f6f6a', match: (o) => o.status === 'ready' },
  { key: 'out', label: 'Out for delivery', color: '#2c4f9e', match: (o) => o.status === 'out_for_delivery' },
  { key: 'delivered', label: 'Delivered', color: '#2e6b3a', match: (o) => o.status === 'delivered' },
  { key: 'collected', label: 'Collected', color: '#5aa469', match: (o) => o.status === 'collected' },
  { key: 'cancelled', label: 'Cancelled', color: '#b5aca8', match: (o) => o.status === 'cancelled' || o.status === 'failed_delivery' },
];

const CAT_COLOR: Record<string, string> = { Pork: '#a8612e', Beef: '#c8151d', Chicken: '#e0a33a', 'Processed Meats': '#8b2f6e', Seafood: '#1f6f6a', Groceries: '#b5aca8' };
const CAT_SHORT: Record<string, string> = { 'Processed Meats': 'Processed' };
const PAY_COLOR: Record<string, string> = { gcash: '#2c4f9e', cod: '#2a2322', card: '#a8612e', pay_at_pickup: '#cfc4bd', maya: '#2e6b3a', cash: '#7a6e6a' };

const STATUS_PILL: Partial<Record<OrderStatus, { label: string; cls: string }>> = {
  awaiting_confirmation: { label: 'Awaiting confirmation', cls: 'bg-red-50 text-[#c8151d]' },
  placed: { label: 'Placed', cls: 'bg-red-50 text-[#c8151d]' },
  confirmed: { label: 'Confirmed', cls: 'bg-orange-50 text-[#b4651c]' },
  preparing: { label: 'Preparing', cls: 'bg-fuchsia-50 text-[#8b2f6e]' },
  awaiting_shopper: { label: 'Calling customer', cls: 'bg-fuchsia-50 text-[#8b2f6e]' },
  ready: { label: 'Ready', cls: 'bg-teal-50 text-[#1f6f6a]' },
  out_for_delivery: { label: 'Out for delivery', cls: 'bg-blue-50 text-[#2c4f9e]' },
  delivered: { label: 'Delivered', cls: 'bg-green-50 text-[#2e6b3a]' },
  collected: { label: 'Collected', cls: 'bg-green-50 text-[#2e6b3a]' },
  cancelled: { label: 'Cancelled', cls: 'bg-stone-100 text-stone-500' },
  failed_delivery: { label: 'Failed delivery', cls: 'bg-orange-50 text-orange-700' },
};

type Tab = 'all' | 'action' | 'delivery' | 'pickup';

export default function DashboardPage() {
  const s = useStore();
  const now = useNow(1000);
  const branchIds = userBranchIds(s);
  const scopeLabel = branchIds.length === 1 ? `${branchName(s, branchIds[0])} branch` : `${branchIds.length} branches`;

  // "Live · updated Ns ago": the time the shared data last changed.
  const lastChange = useRef(0);
  const [changedAt, setChangedAt] = useState(0);
  useEffect(() => {
    lastChange.current = Date.now();
    const t = setTimeout(() => setChangedAt(lastChange.current), 0);
    return () => clearTimeout(t);
  }, [s]);
  const updatedAgo = changedAt ? Math.max(0, Math.round((now - changedAt) / 1000)) : 0;

  const [tab, setTab] = useState<Tab>('all');

  const orders = s.orders.filter((o) => branchIds.includes(o.branchId));
  const today = orders.filter((o) => isToday(o.placedAt));
  const awaiting = orders.filter((o) => o.status === 'awaiting_confirmation');
  const waitingRider = orders.filter((o) => o.fulfillment === 'delivery' && !o.riderId && ['confirmed', 'preparing', 'ready'].includes(o.status));
  const delayed = orders.filter((o) => isDelayed(s, o, now));
  const low = lowStockList(s, branchIds);
  const ridersOnline = s.riders.filter((r) => r.status === 'online' && r.branchIds.some((b) => branchIds.includes(b)));
  const coldOut = orders.filter((o) => o.coldChain && o.status === 'out_for_delivery');
  const salesToday = sum(today, netSales);
  const cancelledToday = today.filter((o) => o.status === 'cancelled').length;

  // Orders by stage (today)
  const stages = STAGES.map((st) => ({ ...st, count: today.filter(st.match).length }));
  const stageTotal = Math.max(1, stages.reduce((a, b) => a + b.count, 0));

  // Sales — last 14 days (13 past days + today)
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(13 - i));
  const byDay = groupBy(orders.filter((o) => new Date(o.placedAt).getTime() >= days[0].getTime()), (o) => dayKey(o.placedAt));
  const trend = days.map((d, i) => ({ day: d.getDate(), today: i === 13, sales: Math.round(sum(byDay.get(dayKey(d)) ?? [], netSales)) }));
  const trendTotal = trend.reduce((a, b) => a + b.sales, 0);
  const step = 8000;
  const yMax = Math.max(step, Math.ceil(Math.max(...trend.map((t) => t.sales)) / step) * step);
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => yMax - i * step);

  // Sales mix + top sellers (last 14 days)
  const last14 = orders.filter((o) => new Date(o.placedAt).getTime() >= now - 14 * DAY && isSale(o));
  const product = (id: string) => s.products.find((p) => p.id === id);
  const catName = (pid: string) => s.categories.find((c) => c.id === product(pid)?.categoryId)?.name ?? 'Other';
  const catTotals = new Map<string, number>();
  const prod = new Map<string, { id: string; name: string; image: string; cat: string; sales: number; qty: number; byWeight: boolean; orders: Set<string> }>();
  for (const o of last14) {
    for (const i of o.items) {
      if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
      const amt = lineTotal(i);
      const cat = catName(i.productId);
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + amt);
      const cur = prod.get(i.productId) ?? { id: i.productId, name: i.name, image: product(i.productId)?.image ?? i.image, cat, sales: 0, qty: 0, byWeight: i.soldByWeight, orders: new Set<string>() };
      cur.sales += amt;
      cur.qty += itemQty(i);
      cur.orders.add(o.id);
      prod.set(i.productId, cur);
    }
  }
  const share = (entries: [string, number][]) => {
    const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
    return entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, value: v, pct: Math.round((v / total) * 100) }));
  };
  const mixCategory = share([...catTotals]);
  const mixFulfillment = share([...groupBy(last14, (o) => o.fulfillment)].map(([k, l]) => [k, sum(l, netSales)] as [string, number]));
  const mixPayment = share([...groupBy(last14, (o) => o.paymentMethod)].map(([k, l]) => [k, sum(l, netSales)] as [string, number]));
  const top = [...prod.values()].sort((a, b) => b.sales - a.sales).slice(0, 8);
  const topMax = Math.max(1, ...top.map((t) => t.sales));

  // Recent orders
  const recentAll = [...orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 8);
  const needsAction = (o: Order) => o.status === 'awaiting_confirmation' || (o.fulfillment === 'delivery' && !o.riderId && o.status === 'ready');
  const tabs: { key: Tab; label: string; list: Order[] }[] = [
    { key: 'all', label: 'All', list: recentAll },
    { key: 'action', label: 'Needs action', list: recentAll.filter(needsAction) },
    { key: 'delivery', label: 'Delivery', list: recentAll.filter((o) => o.fulfillment === 'delivery') },
    { key: 'pickup', label: 'Pickup', list: recentAll.filter((o) => o.fulfillment === 'pickup') },
  ];
  const recent = tabs.find((t) => t.key === tab)!.list;

  const queues = [
    { n: awaiting.length, title: 'Awaiting confirmation', sub: awaiting.length ? `Oldest placed ${timeAgo([...awaiting].sort((a, b) => a.placedAt.localeCompare(b.placedAt))[0].placedAt)}` : 'All caught up', cta: 'Review', href: '/orders', tone: 'bg-[#fdeeee] text-[#c8151d]', btn: 'text-[#c8151d] border-red-200' },
    { n: waitingRider.length, title: 'Waiting for a rider', sub: 'Delivery orders, no rider yet', cta: 'Assign', href: '/delivery/dispatch', tone: 'bg-[#fbf1e3] text-[#8a4b12]', btn: 'text-[#8a4b12] border-amber-200' },
    { n: delayed.length, title: 'Delayed order', sub: 'Past confirm / prep target', cta: 'View', href: '/orders', tone: 'bg-[#f8eef4] text-[#8b2f6e]', btn: 'text-[#8b2f6e] border-fuchsia-200' },
    { n: low.length, title: 'Low-stock products', sub: 'At or below reorder point', cta: 'Restock', href: '/inventory', tone: 'bg-[#f2ede9] text-[#2a2322]', btn: 'text-[#2a2322] border-stone-300' },
  ];
  const queueTotal = queues.reduce((a, q) => a + q.n, 0);
  const dateLine = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <DashboardLayout title="Dashboard" eyebrow="Overview">
      <div className="space-y-5 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{dateLine} · {scopeLabel}</p>
            <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={display}>Today at the shop</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[#eadfd6] text-sm text-gray-700">
              <span className="w-2 h-2 rounded-full bg-green-500 ring-4 ring-green-100" /> Live · updated {updatedAgo}s ago
            </span>
            {coldOut.length > 0 && (
              <Link href="/delivery/dispatch" className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-sky-50 border border-sky-100 text-sm font-medium text-[#1f5f78]">
                <Snowflake className="w-4 h-4" /> {coldOut.length} cold-chain order{coldOut.length === 1 ? '' : 's'} on the road
              </Link>
            )}
            {moduleOn(s, 'walkin') && (
              <Link href="/orders/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#d6202a] hover:bg-[#c8151d] text-white text-sm font-semibold shadow-sm">
                <Plus className="w-4 h-4" /> New order
              </Link>
            )}
          </div>
        </div>

        {/* Sales today + Needs your attention */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 md:gap-5">
          <div className="rounded-2xl bg-[#2a2322] border-4 border-[#1d1716] p-5 md:p-6 text-white shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="uppercase tracking-[0.15em] text-sm text-[#e0b38c]" style={display}>Sales today</p>
              <p className="text-xs text-white/70">net of refunds</p>
            </div>
            <p className="mt-3 text-6xl md:text-7xl font-bold text-[#ec1b26] leading-none tabular-nums" style={display}>{pesoWhole(salesToday)}</p>
            <div className="mt-6 grid grid-cols-2 border-t border-white/10 pt-4">
              <div className="pr-4 border-r border-white/10">
                <p className="text-sm text-white/80">Orders today</p>
                <p className="mt-1 flex items-baseline gap-2"><span className="text-4xl font-bold" style={display}>{today.length}</span><span className="text-xs text-white/60">{cancelledToday} cancelled</span></p>
              </div>
              <div className="pl-4">
                <p className="text-sm text-white/80">Riders online</p>
                <p className="mt-1 flex items-baseline gap-2"><span className="text-4xl font-bold" style={display}>{ridersOnline.length}</span><span className="text-xs text-white/60">own riders</span></p>
              </div>
            </div>
          </div>

          <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] p-4 md:p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-2xl md:text-[26px] font-medium leading-tight text-[#1d1716]" style={display}>Needs your attention</h2>
              <p className="text-sm text-gray-500 text-right mt-1">{queueTotal} items across 4 queues</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {queues.map((q) => (
                <div key={q.title} className={cn('rounded-xl p-4 flex items-center gap-4', q.tone.split(' ')[0])}>
                  <span className={cn('text-5xl font-bold w-10 text-center shrink-0', q.tone.split(' ')[1])} style={display}>{q.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#1d1716] leading-snug">{q.title}</p>
                    <p className="text-sm text-gray-500 leading-snug">{q.sub}</p>
                  </div>
                  <Link href={q.href} className={cn('shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-white border text-sm font-semibold hover:shadow-sm', q.btn)}>
                    {q.cta} <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Orders by stage */}
        <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
            <h2 className="text-2xl md:text-[26px] font-medium text-[#1d1716]" style={display}>Today&apos;s orders by stage</h2>
            <Link href="/orders" className="text-sm font-medium text-[#c8151d] hover:underline inline-flex items-center gap-1.5">Open order board <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="flex gap-1 h-2.5 rounded-full overflow-hidden">
            {stages.map((st) => (
              <span key={st.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ background: st.color, flexGrow: Math.max(st.count, 0.35) / stageTotal }} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-4 lg:grid-cols-8 gap-x-2 gap-y-4 lg:gap-x-0">
            {stages.map((st, i) => (
              <div key={st.key} className={cn('min-w-0 pr-1 border-[#eadfd6]', i !== 0 && 'lg:pl-3 lg:border-l')}>
                <p className="text-[13px] sm:text-sm text-gray-600 flex items-start gap-1.5 min-h-10 leading-tight break-words"><span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />{st.label}</p>
                <p className="text-4xl font-bold text-[#1d1716]" style={display}>{st.count}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sales last 14 days + Sales mix */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 md:gap-5">
          <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h2 className="text-2xl md:text-[26px] font-medium text-[#1d1716]" style={display}>Sales — last 14 days</h2>
                <p className="text-sm text-gray-500">Net sales · <b className="text-[#1d1716]">{pesoWhole(trendTotal)}</b> total</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#4a3f3d]" /> Past days</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#d6202a]" /> Today, so far</span>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <div className="flex flex-col justify-between text-right text-[11px] text-gray-400 h-56 md:h-64 pb-0 -mt-1.5 w-10 shrink-0">
                {ticks.map((t) => <span key={t}>₱{t / 1000 === 0 ? '0' : `${t / 1000}k`}</span>)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="relative h-56 md:h-64 flex items-end gap-1.5 md:gap-3 border-b border-[#eadfd6]">
                  {ticks.slice(0, -1).map((t) => <span key={t} className="absolute inset-x-0 border-t border-dashed border-[#eee5de]" style={{ bottom: `${(t / yMax) * 100}%` }} aria-hidden />)}
                  {trend.map((d) => (
                    <div key={d.day} className="relative flex-1 h-full flex items-end" title={`${d.today ? 'Today' : `Day ${d.day}`}: ${peso(d.sales)}`}>
                      <div className="w-full rounded-t-[4px]" style={{
                        height: `${Math.max(1, (d.sales / yMax) * 100)}%`,
                        background: d.today ? 'repeating-linear-gradient(135deg,#d6202a 0 6px,#ec5a60 6px 9px)' : '#4a3f3d',
                      }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 md:gap-3 mt-2">
                  {trend.map((d, i) => (
                    <span key={d.day} className={cn('flex-1 text-center text-[11px]', d.today ? 'font-semibold text-[#c8151d]' : 'text-gray-500', !d.today && i % 2 === 1 && 'invisible sm:visible')}>
                      {d.today ? <><span className="hidden sm:inline">Today</span><span className="sm:hidden">{d.day}</span></> : d.day}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] p-4 md:p-6">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-2xl md:text-[26px] font-medium text-[#1d1716]" style={display}>Sales mix</h2>
              <span className="text-sm text-gray-500 mt-1">14 days</span>
            </div>
            <Mix title="By category" rows={mixCategory.map((m) => ({ label: CAT_SHORT[m.key] ?? m.key, pct: m.pct, color: CAT_COLOR[m.key] ?? '#b5aca8' }))} />
            <Mix title="By fulfillment" rows={mixFulfillment.map((m) => ({ label: m.key === 'delivery' ? 'Delivery' : 'Pickup', pct: m.pct, color: m.key === 'delivery' ? '#2a2322' : '#cfc4bd' }))} />
            <Mix title="By payment" rows={mixPayment.map((m) => ({ label: PAYMENT_LABEL[m.key as keyof typeof PAYMENT_LABEL] ?? m.key, pct: m.pct, color: PAY_COLOR[m.key] ?? '#b5aca8' }))} />
          </section>
        </div>

        {/* Top sellers + Low stock */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 md:gap-5 items-start">
          <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] overflow-hidden">
            <div className="flex items-start justify-between gap-2 p-4 md:px-6 md:pt-6 md:pb-4">
              <h2 className="text-2xl md:text-[26px] font-medium text-[#1d1716]" style={display}>Top sellers</h2>
              <span className="text-sm text-gray-500 mt-1">Last 14 days · by sales</span>
            </div>
            {/* desktop / tablet table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="text-left font-semibold py-2.5 pl-6 w-10">#</th>
                  <th className="text-left font-semibold py-2.5">Product</th>
                  <th className="text-right font-semibold py-2.5">Sold</th>
                  <th className="text-right font-semibold py-2.5">Orders</th>
                  <th className="text-right font-semibold py-2.5 pr-6">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0e8e2]">
                {top.map((t, i) => (
                  <tr key={t.id}>
                    <td className={cn('pl-6 py-3 text-xl font-bold', i === 0 ? 'text-[#c8151d]' : 'text-gray-400')} style={display}>{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Thumb image={t.image} />
                        <div className="min-w-0 flex-1 max-w-[260px]">
                          <p className="font-semibold text-[#1d1716] truncate">{t.name} <span className="text-xs font-normal text-gray-400">{CAT_SHORT[t.cat] ?? t.cat}</span></p>
                          <Bar pct={(t.sales / topMax) * 100} color={i === 0 ? '#d6202a' : '#3b3130'} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-right tabular-nums">{t.byWeight ? `${t.qty.toFixed(1)} kg` : `${t.qty} pcs`}</td>
                    <td className="py-3 text-right tabular-nums text-gray-600">{t.orders.size}</td>
                    <td className="py-3 pr-6 text-right font-bold tabular-nums">{pesoWhole(t.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* phone list */}
            <ul className="md:hidden divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
              {top.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('w-5 text-xl font-bold shrink-0', i === 0 ? 'text-[#c8151d]' : 'text-gray-400')} style={display}>{i + 1}</span>
                  <Thumb image={t.image} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold text-[#1d1716] truncate">{t.name}</p>
                      <p className="font-bold tabular-nums shrink-0">{pesoWhole(t.sales)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Bar pct={(t.sales / topMax) * 100} color={i === 0 ? '#d6202a' : '#3b3130'} className="flex-1 max-w-[150px]" />
                      <p className="text-xs text-gray-500 shrink-0">{t.byWeight ? `${t.qty.toFixed(1)} kg` : `${t.qty} pcs`} · {t.orders.size} orders</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] p-4 md:p-6">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h2 className="text-2xl md:text-[26px] font-medium text-[#1d1716]" style={display}>Low stock</h2>
              <Link href="/inventory" className="text-sm font-medium text-[#c8151d] hover:underline inline-flex items-center gap-1.5 mt-1">Inventory <ArrowRight className="w-4 h-4" /></Link>
            </div>
            {low.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">Every product is above its reorder point.</p>
            ) : (
              <ul className="divide-y divide-[#f0e8e2]">
                {low.slice(0, 6).map((r) => {
                  const pct = Math.min(100, (Math.max(0, r.onHand) / Math.max(1, r.threshold)) * 100);
                  const out = r.onHand <= 0;
                  return (
                    <li key={`${r.productId}-${r.branchId}`} className="flex items-center gap-3 py-3">
                      <Thumb image={r.image} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="font-semibold text-[#1d1716] truncate">{r.name}</p>
                          <p className={cn('text-sm font-semibold shrink-0', out ? 'text-[#c8151d]' : pct < 50 ? 'text-[#b4510f]' : 'text-[#8a6a10]')}>{out ? 'Out of stock' : `${r.onHand} left`}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Bar pct={Math.max(pct, out ? 4 : 0)} color={out ? '#c8151d' : pct < 50 ? '#b4510f' : '#8a6a10'} className="flex-1" />
                          <p className="text-xs text-gray-400 shrink-0">reorder at {r.threshold}</p>
                        </div>
                      </div>
                      <Link href="/inventory" className="shrink-0 h-11 px-4 rounded-lg border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] inline-flex items-center hover:bg-[#faf6f2]">Reorder</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Recent orders */}
        <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 md:px-6 md:pt-6 md:pb-4">
            <h2 className="text-2xl md:text-[26px] font-medium text-[#1d1716]" style={display}>Recent orders</h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
              <div className="flex gap-1 rounded-xl bg-[#f3ece6] p-1 overflow-x-auto max-w-full">
                {tabs.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={cn('h-9 px-3.5 rounded-lg text-sm whitespace-nowrap', tab === t.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>
                    {t.label} <span className="text-gray-400 ml-0.5">{t.list.length}</span>
                  </button>
                ))}
              </div>
              <Link href="/orders" className="text-sm font-medium text-[#c8151d] hover:underline inline-flex items-center gap-1.5 shrink-0">All orders <ArrowRight className="w-4 h-4" /></Link>
            </div>
          </div>

          {recent.length === 0 && <p className="text-sm text-gray-500 py-8 text-center border-t border-[#f0e8e2]">No orders here right now.</p>}

          {/* desktop / tablet table */}
          {recent.length > 0 && (
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="text-left font-semibold py-2.5 pl-6">Order</th>
                    <th className="text-left font-semibold py-2.5">Customer</th>
                    <th className="text-left font-semibold py-2.5">Fulfillment</th>
                    <th className="text-left font-semibold py-2.5">Status</th>
                    <th className="text-left font-semibold py-2.5">Payment</th>
                    <th className="text-right font-semibold py-2.5">Total</th>
                    <th className="text-right font-semibold py-2.5 pr-6">Placed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0e8e2]">
                  {recent.map((o) => (
                    <tr key={o.id} className="hover:bg-[#fbf7f3] cursor-pointer" onClick={() => (window.location.href = `/orders/${o.id}`)}>
                      <td className="py-3.5 pl-6"><Link href={`/orders/${o.id}`} className="font-bold text-[#c8151d] hover:underline">{o.number}</Link></td>
                      <td className="py-3.5 text-[#1d1716]">{o.customerName}</td>
                      <td className="py-3.5"><span className="inline-flex items-center gap-2"><FulfillIcon f={o.fulfillment} /> <span className="capitalize text-gray-700">{o.fulfillment}</span> {o.coldChain && <ColdPill />}</span></td>
                      <td className="py-3.5"><StatusPill status={o.status} /></td>
                      <td className="py-3.5"><PayStatus paid={o.paymentStatus === 'paid'} refunded={o.paymentStatus === 'refunded'} /></td>
                      <td className="py-3.5 text-right font-bold tabular-nums">{peso(o.total)}</td>
                      <td className="py-3.5 pr-6 text-right text-gray-500 whitespace-nowrap">{timeAgo(o.placedAt)} <ChevronRight className="inline w-4 h-4 text-gray-300" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* phone / tablet cards */}
          {recent.length > 0 && (
            <ul className="lg:hidden divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="block px-4 py-3.5 hover:bg-[#fbf7f3]">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0"><span className="font-bold text-[#c8151d]">{o.number}</span> <span className="text-sm text-gray-500 ml-1">{timeAgo(o.placedAt)}</span></p>
                      <p className="font-bold tabular-nums shrink-0">{peso(o.total)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="font-medium text-[#1d1716] truncate">{o.customerName}</p>
                      <PayStatus paid={o.paymentStatus === 'paid'} refunded={o.paymentStatus === 'refunded'} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <StatusPill status={o.status} />
                      <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#f3ece6] text-xs font-medium text-gray-700"><FulfillIcon f={o.fulfillment} small /> <span className="capitalize">{o.fulfillment}</span></span>
                      {o.coldChain && <ColdPill />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

function Mix({ title, rows }: { title: string; rows: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{title}</p>
      <div className="mt-2 flex gap-0.5 h-3 rounded-full overflow-hidden bg-[#f3ece6]">
        {rows.map((r) => <span key={r.label} className="h-full" style={{ width: `${r.pct}%`, background: r.color }} title={`${r.label} ${r.pct}%`} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
            <span className="truncate text-gray-700">{r.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ pct, color, className }: { pct: number; color: string; className?: string }) {
  return (
    <div className={cn('h-1.5 mt-1.5 rounded-full bg-[#f0e8e2]', className)}>
      <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

function Thumb({ image }: { image: string }) {
  return (
    <span className="relative w-11 h-11 md:w-10 md:h-10 rounded-lg overflow-hidden shrink-0 bg-[#f8e7da] border border-[#eadfd6] flex items-center justify-center text-xl">
      <ProductImage image={image} fill />
    </span>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const p = STATUS_PILL[status] ?? { label: status, cls: 'bg-stone-100 text-stone-600' };
  return <span className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap', p.cls)}><span className="w-1.5 h-1.5 rounded-full bg-current" />{p.label}</span>;
}

function ColdPill() {
  return <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-sky-50 text-xs font-medium text-[#1f5f78] whitespace-nowrap"><Snowflake className="w-3.5 h-3.5" /> Cold chain</span>;
}

function FulfillIcon({ f, small }: { f: 'delivery' | 'pickup'; small?: boolean }) {
  const C = f === 'delivery' ? Truck : Store;
  return <C className={cn(small ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-gray-500')} strokeWidth={1.75} />;
}

function PayStatus({ paid, refunded }: { paid: boolean; refunded: boolean }) {
  if (refunded) return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500">Refunded</span>;
  return paid
    ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2e6b3a]"><CheckCircle2 className="w-4 h-4" /> Paid</span>
    : <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#a0620f]"><Clock className="w-4 h-4" /> Pending</span>;
}
