'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ShoppingBag, Wallet, BellRing, Bike, Users, PackageX, Clock, ArrowRight, Trophy } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { StatCard, Panel, StatusBadge, PaymentBadge, EmptyState } from '@/src/components/common';
import { useStore, useTick } from '@/src/lib/store';
import {
  userBranchIds, branchName, pesoShort, peso, timeAgo, isToday, STATUS_LABEL, CHANNEL_LABEL, PAYMENT_LABEL,
} from '@/src/lib/logic';
import type { OrderStatus } from '@/src/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import {
  BLUE, CHART_COLORS, DAY, avg, dayKey, dayLabel, groupBy, isDelayed, isSale, lowStockList, netSales, startOfDay, sum,
} from '@/src/components/reports/analytics';
import { cn } from '@/src/lib/utils';

const ic = (C: typeof ShoppingBag) => <C className="w-5 h-5" strokeWidth={1.75} />;
const STATUS_ORDER: OrderStatus[] = ['awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper', 'ready', 'out_for_delivery', 'delivered', 'collected', 'cancelled', 'failed_delivery'];
const STATUS_COLOR: Partial<Record<OrderStatus, string>> = {
  awaiting_confirmation: '#dc2626', confirmed: '#1e40af', preparing: '#9333ea', awaiting_shopper: '#f59e0b', ready: '#0891b2',
  out_for_delivery: '#4f46e5', delivered: '#16a34a', collected: '#22c55e', cancelled: '#9ca3af', failed_delivery: '#ea580c',
};

export default function DashboardPage() {
  const s = useStore();
  useTick(5000);
  const [scope, setScope] = useState<'all' | 'branch'>('all');
  const allowed = userBranchIds(s);
  const branchIds = scope === 'branch' && allowed.includes(s.session.branchId) ? [s.session.branchId] : allowed;
  const scopeLabel = branchIds.length === 1 ? branchName(s, branchIds[0]) : `${branchIds.length} branches`;

  const data = (() => {
    const orders = s.orders.filter((o) => branchIds.includes(o.branchId));
    const today = orders.filter((o) => isToday(o.placedAt));
    const now = Date.now();
    const awaiting = orders.filter((o) => o.status === 'awaiting_confirmation');
    const waitingRider = orders.filter((o) => o.fulfillment === 'delivery' && !o.riderId && ['confirmed', 'preparing', 'ready'].includes(o.status));
    const ridersOnline = s.riders.filter((r) => r.status === 'online' && r.branchIds.some((b) => branchIds.includes(b)));
    const low = lowStockList(s, branchIds);
    const delayed = orders.filter((o) => isDelayed(s, o, now));

    const byStatus = STATUS_ORDER.map((st) => ({ status: STATUS_LABEL[st], key: st, count: today.filter((o) => o.status === st).length })).filter((x) => x.count > 0);

    const days = Array.from({ length: 14 }, (_, i) => startOfDay(13 - i));
    const byDay = groupBy(orders.filter((o) => new Date(o.placedAt).getTime() >= days[0].getTime()), (o) => dayKey(o.placedAt));
    const trend = days.map((d) => {
      const list = byDay.get(dayKey(d)) ?? [];
      return { day: dayLabel(d), sales: Math.round(sum(list, netSales)), orders: list.filter(isSale).length };
    });

    const last14 = orders.filter((o) => new Date(o.placedAt).getTime() >= now - 14 * DAY && isSale(o));
    const pie = (key: (o: (typeof orders)[number]) => string, label: (k: string) => string) =>
      [...groupBy(last14, key)].map(([k, list]) => ({ name: label(k), value: Math.round(sum(list, netSales)) })).sort((a, b) => b.value - a.value);
    const byChannel = pie((o) => o.channel, (k) => CHANNEL_LABEL[k as keyof typeof CHANNEL_LABEL]);
    const byFulfillment = pie((o) => o.fulfillment, (k) => (k === 'delivery' ? 'Delivery' : 'Pickup'));
    const byPayment = pie((o) => o.paymentMethod, (k) => PAYMENT_LABEL[k as keyof typeof PAYMENT_LABEL]);

    const branchRows = branchIds
      .map((bid) => {
        const list = last14.filter((o) => o.branchId === bid);
        const rated = list.filter((o) => o.rating).map((o) => o.rating!.order);
        const todayList = today.filter((o) => o.branchId === bid && isSale(o));
        const sales = sum(list, netSales);
        return { bid, name: branchName(s, bid), sales, orders: list.length, basket: list.length ? sales / list.length : 0, rating: avg(rated), todaySales: sum(todayList, netSales) };
      })
      .sort((a, b) => b.sales - a.sales);

    return {
      today, awaiting, waitingRider, ridersOnline, low, delayed, byStatus, trend, byChannel, byFulfillment, byPayment, branchRows,
      salesToday: sum(today, netSales),
      recent: [...orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 8),
    };
  })();

  const maxSales = Math.max(1, ...data.branchRows.map((r) => r.sales));

  return (
    <DashboardLayout title="Dashboard" eyebrow="Overview">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scopeLabel} · updates every 5 seconds · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          {(['all', 'branch'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={cn('px-3 py-1.5 text-sm rounded-md font-medium transition-colors', scope === k ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}
            >
              {k === 'all' ? `All my branches (${allowed.length})` : `This branch · ${branchName(s, s.session.branchId)}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
        <StatCard title="Orders today" value={data.today.length} sub={`${data.today.filter((o) => o.status === 'cancelled').length} cancelled`} icon={ic(ShoppingBag)} href="/orders" />
        <StatCard title="Sales today" value={pesoShort(data.salesToday)} sub="net of refunds" icon={ic(Wallet)} accent="border-l-[#16a34a]" />
        <StatCard
          title="Awaiting confirmation" value={data.awaiting.length} icon={ic(BellRing)} href="/orders"
          accent={data.awaiting.length ? 'border-l-[#dc2626]' : 'border-l-gray-300'} valueClass={data.awaiting.length ? 'text-[#dc2626]' : 'text-gray-400'}
          sub={data.awaiting.length ? `oldest ${timeAgo(data.awaiting.map((o) => o.placedAt).sort()[0])}` : 'all caught up'}
        />
        <StatCard title="Waiting for rider" value={data.waitingRider.length} icon={ic(Bike)} accent="border-l-[#f59e0b]" href="/delivery/dispatch" sub="delivery orders, no rider" />
        <StatCard title="Active riders online" value={data.ridersOnline.length} icon={ic(Users)} accent="border-l-[#0891b2]" sub={`${data.ridersOnline.filter((r) => r.type === 'own').length} own fleet`} />
        <StatCard title="Low-stock alerts" value={data.low.length} icon={ic(PackageX)} accent="border-l-[#9333ea]" href="/inventory" sub="at or below threshold" />
        <StatCard
          title="Delayed orders" value={data.delayed.length} icon={ic(Clock)} href="/orders"
          accent={data.delayed.length ? 'border-l-[#ea580c]' : 'border-l-gray-300'} valueClass={data.delayed.length ? 'text-[#ea580c]' : 'text-gray-400'}
          sub="past confirm / prep target"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel title="Sales — last 14 days" className="xl:col-span-2" action={<span className="text-xs text-gray-400">net sales, ₱</span>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ left: 8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} width={48} />
                <Tooltip formatter={(v, n) => (n === 'sales' ? [peso(Number(v)), 'Sales'] : [v, 'Orders'])} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="sales" stroke={BLUE} strokeWidth={2} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Orders today by status">
          {data.byStatus.length === 0 ? (
            <EmptyState title="No orders yet today" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byStatus} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="status" width={140} tick={{ fontSize: 11, fill: '#4b5563' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#374151' }}>
                    {data.byStatus.map((d) => <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? BLUE} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Donut title="Sales by channel" data={data.byChannel} />
        <Donut title="Sales by fulfillment" data={data.byFulfillment} />
        <Donut title="Sales by payment method" data={data.byPayment} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel title={<div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" strokeWidth={1.75} /><h2 className="text-base font-semibold text-gray-900">Branch comparison · last 14 days</h2></div>} className="xl:col-span-2" bodyClass="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 w-10">#</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Avg basket</TableHead>
                <TableHead className="text-right">Avg rating</TableHead>
                <TableHead className="text-right pr-5">Today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.branchRows.map((r, i) => (
                <TableRow key={r.bid}>
                  <TableCell className="pl-5 font-semibold text-gray-400">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="h-1.5 mt-1 rounded-full bg-gray-100 w-40">
                      <div className="h-1.5 rounded-full bg-[#1e40af]" style={{ width: `${(r.sales / maxSales) * 100}%` }} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-[#1e40af]">{pesoShort(r.sales)}</TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right">{pesoShort(r.basket)}</TableCell>
                  <TableCell className="text-right">{r.rating ? `★ ${r.rating.toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="text-right pr-5">{pesoShort(r.todaySales)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Low-stock alerts" action={<Link href="/inventory" className="text-xs font-medium text-[#1e40af] hover:underline inline-flex items-center gap-1">Inventory <ArrowRight className="w-3 h-3" /></Link>} bodyClass="p-0">
          {data.low.length === 0 ? (
            <EmptyState title="No low-stock items" sub="Every product is above its threshold" />
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
              {data.low.slice(0, 12).map((r) => (
                <li key={`${r.productId}-${r.branchId}`}>
                  <Link href="/inventory" className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
                    <span className="text-xl">{r.image}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">{branchName(s, r.branchId)} · reorder at {r.threshold}</p>
                    </div>
                    <span className={cn('text-sm font-semibold', r.onHand <= 0 ? 'text-[#dc2626]' : 'text-amber-600')}>{r.onHand <= 0 ? 'Out' : `${r.onHand} left`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent orders" action={<Link href="/orders" className="text-xs font-medium text-[#1e40af] hover:underline inline-flex items-center gap-1">All orders <ArrowRight className="w-3 h-3" /></Link>} bodyClass="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right pr-5">Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => (window.location.href = `/orders/${o.id}`)}>
                <TableCell className="pl-5"><Link href={`/orders/${o.id}`} className="font-medium text-[#1e40af] hover:underline">{o.number}</Link></TableCell>
                <TableCell>{o.customerName}</TableCell>
                <TableCell className="text-gray-500">{branchName(s, o.branchId)}</TableCell>
                <TableCell className="text-gray-500">{CHANNEL_LABEL[o.channel]} · {o.fulfillment}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
                <TableCell><PaymentBadge status={o.paymentStatus} /></TableCell>
                <TableCell className="text-right font-medium">{peso(o.total)}</TableCell>
                <TableCell className="text-right pr-5 text-gray-500">{timeAgo(o.placedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </DashboardLayout>
  );
}

function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <Panel title={title} action={<span className="text-xs text-gray-400">14 days</span>}>
      {total === 0 ? (
        <EmptyState title="No sales in range" />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">
                {data.map((d, i) => <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${pesoShort(Number(v))} (${Math.round((Number(v) / total) * 100)}%)`, '']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
