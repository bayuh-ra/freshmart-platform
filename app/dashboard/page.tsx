'use client';

import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ShoppingBag, Wallet, BellRing, Bike, Users, PackageX, Clock, ArrowRight, Trophy } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { StatCard, Panel, StatusBadge, PaymentBadge, EmptyState } from '@/src/components/common';
import { useStore } from '@/src/lib/store';
import { useNow } from '@/src/components/reports/ui';
import {
  userBranchIds, branchName, pesoShort, peso, timeAgo, isToday, STATUS_LABEL, PAYMENT_LABEL,
} from '@/src/lib/logic';
import type { OrderStatus } from '@/src/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import {
  BLUE, CHART_COLORS, DAY, dayKey, dayLabel, groupBy, isDelayed, isSale, itemQty, lineTotal, lowStockList, netSales, startOfDay, sum,
} from '@/src/components/reports/analytics';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';

const ic = (C: typeof ShoppingBag) => <C className="w-5 h-5" strokeWidth={1.75} />;
const STATUS_ORDER: OrderStatus[] = ['awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper', 'ready', 'out_for_delivery', 'delivered', 'collected', 'cancelled', 'failed_delivery'];
const STATUS_COLOR: Partial<Record<OrderStatus, string>> = {
  awaiting_confirmation: '#dc2626', confirmed: '#c8151d', preparing: '#9333ea', awaiting_shopper: '#f59e0b', ready: '#0891b2',
  out_for_delivery: '#4f46e5', delivered: '#16a34a', collected: '#22c55e', cancelled: '#9ca3af', failed_delivery: '#ea580c',
};

export default function DashboardPage() {
  const s = useStore();
  const now = useNow(5000);
  // One meat shop branch (Digos). If more branches are added later, the numbers cover every branch the user can see.
  const branchIds = userBranchIds(s);
  const scopeLabel = branchIds.length === 1 ? `${branchName(s, branchIds[0])} branch` : `${branchIds.length} branches`;

  const data = (() => {
    const orders = s.orders.filter((o) => branchIds.includes(o.branchId));
    const today = orders.filter((o) => isToday(o.placedAt));
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
    const coldOut = orders.filter((o) => o.coldChain && o.status === 'out_for_delivery');

    // Sales by meat category and top sellers (kg for weighed items), from order lines.
    const catOf = (pid: string) => {
      const p = s.products.find((x) => x.id === pid);
      return s.categories.find((x) => x.id === p?.categoryId)?.name ?? 'Other';
    };
    const catTotals = new Map<string, number>();
    const prodTotals = new Map<string, { name: string; image: string; sales: number; qty: number; byWeight: boolean; lines: number }>();
    for (const o of last14) {
      for (const i of o.items) {
        if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
        const amt = lineTotal(i);
        const cat = catOf(i.productId);
        catTotals.set(cat, (catTotals.get(cat) ?? 0) + amt);
        const cur = prodTotals.get(i.productId) ?? { name: i.name, image: i.image, sales: 0, qty: 0, byWeight: i.soldByWeight, lines: 0 };
        cur.sales += amt;
        cur.qty += itemQty(i);
        cur.lines += 1;
        prodTotals.set(i.productId, cur);
      }
    }
    const byCategory = [...catTotals].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
    const topProducts = [...prodTotals.values()].sort((a, b) => b.sales - a.sales).slice(0, 8);
    const byFulfillment = pie((o) => o.fulfillment, (k) => (k === 'delivery' ? 'Delivery' : 'Pickup'));
    const byPayment = pie((o) => o.paymentMethod, (k) => PAYMENT_LABEL[k as keyof typeof PAYMENT_LABEL]);

    return {
      today, awaiting, waitingRider, ridersOnline, low, delayed, byStatus, trend, byCategory, byFulfillment, byPayment, topProducts, coldOut,
      salesToday: sum(today, netSales),
      recent: [...orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 8),
    };
  })();

  const maxSales = Math.max(1, ...data.topProducts.map((r) => r.sales));

  return (
    <DashboardLayout title="Dashboard" eyebrow="Overview">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Today at the meat shop</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scopeLabel} · updates every 5 seconds · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {data.coldOut.length > 0 && (
          <Link href="/orders" className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800">
            🧊 {data.coldOut.length} cold-chain order{data.coldOut.length === 1 ? '' : 's'} on the road
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-6">
        <StatCard title="Orders today" value={data.today.length} sub={`${data.today.filter((o) => o.status === 'cancelled').length} cancelled`} icon={ic(ShoppingBag)} href="/orders" />
        <StatCard title="Sales today" value={pesoShort(data.salesToday)} sub="net of refunds" icon={ic(Wallet)} accent="border-l-[#16a34a]" />
        <StatCard
          title="Awaiting confirmation" value={data.awaiting.length} icon={ic(BellRing)} href="/orders"
          accent={data.awaiting.length ? 'border-l-[#dc2626]' : 'border-l-gray-300'} valueClass={data.awaiting.length ? 'text-[#dc2626]' : 'text-gray-400'}
          sub={data.awaiting.length ? `oldest ${timeAgo(data.awaiting.map((o) => o.placedAt).sort()[0])}` : 'all caught up'}
        />
        <StatCard title="Waiting for rider" value={data.waitingRider.length} icon={ic(Bike)} accent="border-l-[#f59e0b]" href="/delivery/dispatch" sub="delivery orders, no rider" />
        <StatCard title="Active riders online" value={data.ridersOnline.length} icon={ic(Users)} accent="border-l-[#0891b2]" sub="own riders" />
        <StatCard title="Low-stock alerts" value={data.low.length} icon={ic(PackageX)} accent="border-l-[#9333ea]" href="/inventory" sub="at or below threshold" />
        <StatCard
          title="Delayed orders" value={data.delayed.length} icon={ic(Clock)} href="/orders"
          accent={data.delayed.length ? 'border-l-[#ea580c]' : 'border-l-gray-300'} valueClass={data.delayed.length ? 'text-[#ea580c]' : 'text-gray-400'}
          sub="past confirm / prep target"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6">
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
                  <YAxis type="category" dataKey="status" width={120} tick={{ fontSize: 11, fill: '#4b5563' }} tickLine={false} axisLine={false} />
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <Donut title="Sales by category" data={data.byCategory} />
        <Donut title="Sales by fulfillment" data={data.byFulfillment} />
        <Donut title="Sales by payment method" data={data.byPayment} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <Panel title={<div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" strokeWidth={1.75} /><h2 className="text-base font-semibold text-gray-900">Top sellers · last 14 days</h2></div>} className="xl:col-span-2" bodyClass="p-0">
          {data.topProducts.length === 0 ? (
            <EmptyState title="No sales in range" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-5 w-10">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Order lines</TableHead>
                  <TableHead className="text-right pr-4 sm:pr-5">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topProducts.map((r, i) => (
                  <TableRow key={r.name}>
                    <TableCell className="pl-4 sm:pl-5 font-semibold text-gray-400">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 whitespace-nowrap"><ProductImage image={r.image} /> {r.name}</div>
                      <div className="h-1.5 mt-1 rounded-full bg-gray-100 w-32 sm:w-40">
                        <div className="h-1.5 rounded-full bg-[#c8151d]" style={{ width: `${(r.sales / maxSales) * 100}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{r.byWeight ? `${r.qty.toFixed(1)} kg` : `${r.qty} pcs`}</TableCell>
                    <TableCell className="text-right">{r.lines}</TableCell>
                    <TableCell className="text-right pr-4 sm:pr-5 font-semibold text-[#c8151d]">{pesoShort(r.sales)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel title="Low-stock alerts" action={<Link href="/inventory" className="text-xs font-medium text-[#c8151d] hover:underline inline-flex items-center gap-1">Inventory <ArrowRight className="w-3 h-3" /></Link>} bodyClass="p-0">
          {data.low.length === 0 ? (
            <EmptyState title="No low-stock items" sub="Every product is above its threshold" />
          ) : (
            <ul className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
              {data.low.slice(0, 12).map((r) => (
                <li key={`${r.productId}-${r.branchId}`}>
                  <Link href="/inventory" className="flex items-center gap-3 px-4 sm:px-5 py-2.5 hover:bg-gray-50">
                    <span className="text-xl"><ProductImage image={r.image} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-400">reorder at {r.threshold}</p>
                    </div>
                    <span className={cn('text-sm font-semibold', r.onHand <= 0 ? 'text-[#dc2626]' : 'text-amber-600')}>{r.onHand <= 0 ? 'Out' : `${r.onHand} left`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent orders" action={<Link href="/orders" className="text-xs font-medium text-[#c8151d] hover:underline inline-flex items-center gap-1">All orders <ArrowRight className="w-3 h-3" /></Link>} bodyClass="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 sm:pl-5">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right pr-5">Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => (window.location.href = `/orders/${o.id}`)}>
                <TableCell className="pl-4 sm:pl-5"><Link href={`/orders/${o.id}`} className="font-medium text-[#c8151d] hover:underline whitespace-nowrap">{o.number}</Link></TableCell>
                <TableCell className="whitespace-nowrap">{o.customerName}</TableCell>
                <TableCell className="text-gray-500 capitalize whitespace-nowrap">{o.fulfillment}{o.coldChain ? ' · 🧊 cold chain' : ''}</TableCell>
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
