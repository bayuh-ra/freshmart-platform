'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from 'recharts';
import { CalendarClock, X } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, StatusBadge, PaymentBadge, EmptyState, Pill, selectClass, inputClass } from '@/src/components/common';
import { mutate, addAudit, useStore } from '@/src/lib/store';
import {
  can, userBranchIds, branchName, cityName, peso, pesoShort, fmtDateTime, exportCsv, CHANNEL_LABEL, PAYMENT_LABEL,
} from '@/src/lib/logic';
import type { AppState, Order } from '@/src/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import {
  BLUE, CHART_COLORS, DAY, avg, dayKey, dayLabel, groupBy, isSale, itemQty, lineTotal, netSales, startOfDay, stepMinutes, sum,
} from '@/src/components/reports/analytics';
import { Delta, ExportButtons, KpiCard, ShareBar } from '@/src/components/reports/ui';
import { cn } from '@/src/lib/utils';

type Range = 1 | 7 | 14;
const RANGE_LABEL: Record<Range, string> = { 1: 'Today', 7: 'Last 7 days', 14: 'Last 14 days' };
const tip = { contentStyle: { borderRadius: 8, fontSize: 12 } };

interface Ctx {
  s: AppState;
  cur: Order[]; // orders placed in range, all statuses
  prev: Order[]; // previous equal-length period
  all: Order[]; // all orders in scope (for lifetime metrics)
  days: Date[];
  range: Range;
  ids: string[]; // branch ids in scope
}

export default function ReportsPage() {
  const s = useStore();
  const [range, setRange] = useState<Range>(14);
  const [branch, setBranch] = useState<string>('all');
  const [tab, setTab] = useState('sales');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const allowed = userBranchIds(s);
  const ctx: Ctx = (() => {
    const ids = branch === 'all' ? allowed : [branch];
    const all = s.orders.filter((o) => ids.includes(o.branchId));
    const start = startOfDay(range - 1).getTime();
    const prevStart = start - range * DAY;
    const cur = all.filter((o) => new Date(o.placedAt).getTime() >= start);
    const prev = all.filter((o) => { const t = new Date(o.placedAt).getTime(); return t >= prevStart && t < start; });
    const days = Array.from({ length: range }, (_, i) => startOfDay(range - 1 - i));
    return { s, cur, prev, all, days, range, ids };
  })();

  if (!can(s, 'reports.view')) {
    return <DashboardLayout title="Reports" eyebrow="Analytics"><AccessDenied permission="reports.view" /></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Reports" eyebrow="Analytics" hideBranch>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {RANGE_LABEL[range]} · {branch === 'all' ? `${allowed.length} branches in your scope` : branchName(s, branch)} · compared with the previous {range === 1 ? 'day' : `${range} days`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {([1, 7, 14] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={cn('px-3 py-1.5 text-sm rounded-md font-medium', range === r ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <select className={selectClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">All my branches</option>
            {allowed.map((id) => <option key={id} value={id}>{branchName(s, id)}</option>)}
          </select>
          <Button variant="outline" onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="w-4 h-4" strokeWidth={1.75} /> Schedule report
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 print:hidden">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
        </TabsList>
        <TabsContent value="sales"><SalesTab ctx={ctx} /></TabsContent>
        <TabsContent value="products"><ProductsTab ctx={ctx} /></TabsContent>
        <TabsContent value="customers"><CustomersTab ctx={ctx} /></TabsContent>
        <TabsContent value="operations"><OperationsTab ctx={ctx} /></TabsContent>
        <TabsContent value="finance"><FinanceTab ctx={ctx} /></TabsContent>
      </Tabs>

      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} defaultReport={tab} />
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------- Sales
function SalesTab({ ctx }: { ctx: Ctx }) {
  const { s, cur, prev, days } = ctx;
  const [drill, setDrill] = useState<string | null>(null);
  const sales = cur.filter(isSale);
  const prevSales = prev.filter(isSale);
  const revenue = sum(sales, netSales);
  const prevRevenue = sum(prevSales, netSales);
  const basket = sales.length ? revenue / sales.length : 0;
  const prevBasket = prevSales.length ? prevRevenue / prevSales.length : 0;

  const byDay = groupBy(sales, (o) => dayKey(o.placedAt));
  const trend = days.map((d) => { const l = byDay.get(dayKey(d)) ?? []; return { day: dayLabel(d), sales: Math.round(sum(l, netSales)), orders: l.length }; });

  const breakdown = (key: (o: Order) => string, label: (k: string) => string) => {
    const rows = [...groupBy(sales, key)].map(([k, l]) => ({ key: k, name: label(k), sales: sum(l, netSales), orders: l.length }));
    const prevMap = groupBy(prevSales, key);
    return rows.map((r) => ({ ...r, prev: sum(prevMap.get(r.key) ?? [], netSales) })).sort((a, b) => b.sales - a.sales);
  };
  const byBranch = breakdown((o) => o.branchId, (k) => branchName(s, k));
  const byCity = breakdown((o) => s.branches.find((b) => b.id === o.branchId)?.cityId ?? '', (k) => cityName(s, k));
  const byChannel = breakdown((o) => o.channel, (k) => CHANNEL_LABEL[k as Order['channel']]);
  const byFul = breakdown((o) => o.fulfillment, (k) => (k === 'delivery' ? 'Delivery' : 'Pickup'));
  const byPay = breakdown((o) => o.paymentMethod, (k) => PAYMENT_LABEL[k as Order['paymentMethod']]);

  const drillOrders = (drill ? cur.filter((o) => o.branchId === drill) : cur).slice().sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  const csv = () => {
    const rows: (string | number)[][] = [['Sales report', RANGE_LABEL[ctx.range]], [], ['Day', 'Net sales', 'Orders'], ...trend.map((t) => [t.day, t.sales, t.orders]), []];
    for (const [title, list] of [['Branch', byBranch], ['City', byCity], ['Channel', byChannel], ['Fulfillment', byFul], ['Payment method', byPay]] as const) {
      rows.push([title, 'Net sales', 'Orders', 'Previous period', 'Change %']);
      list.forEach((r) => rows.push([r.name, r.sales.toFixed(2), r.orders, r.prev.toFixed(2), r.prev ? (((r.sales - r.prev) / r.prev) * 100).toFixed(1) : '']));
      rows.push([]);
    }
    exportCsv(`sales-report-${dayKey(new Date())}.csv`, rows);
    toast.success('Sales report exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><ExportButtons onCsv={csv} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Net sales" value={pesoShort(revenue)} sub={<Delta cur={revenue} prev={prevRevenue} />} />
        <KpiCard title="Completed / active orders" value={sales.length} sub={<Delta cur={sales.length} prev={prevSales.length} />} accent="border-l-[#0891b2]" />
        <KpiCard title="Average basket" value={pesoShort(basket)} sub={<Delta cur={basket} prev={prevBasket} />} accent="border-l-[#16a34a]" />
        <KpiCard title="Cancelled orders" value={cur.length - sales.length} sub={<Delta cur={cur.length - sales.length} prev={prev.length - prevSales.length} invert />} accent="border-l-[#dc2626]" />
      </div>

      <Panel title="Daily revenue">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ left: 8, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="rSales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.25} /><stop offset="100%" stopColor={BLUE} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} />
              <Tooltip {...tip} formatter={(v, n) => (n === 'sales' ? [peso(Number(v)), 'Net sales'] : [v, 'Orders'])} />
              <Area type="monotone" dataKey="sales" stroke={BLUE} strokeWidth={2} fill="url(#rSales)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BreakdownPanel title="By branch (click to drill down)" rows={byBranch} onRowClick={(k) => setDrill(drill === k ? null : k)} activeKey={drill} />
        <BreakdownPanel title="By city" rows={byCity} />
        <BreakdownPanel title="By channel" rows={byChannel} />
        <BreakdownPanel title="By fulfillment" rows={byFul} />
        <BreakdownPanel title="By payment method" rows={byPay} className="xl:col-span-2" />
      </div>

      <Panel
        title={drill ? `Orders · ${branchName(s, drill)}` : 'Orders in period'}
        action={drill ? <Button variant="ghost" size="sm" onClick={() => setDrill(null)}><X className="w-4 h-4" /> Clear branch filter</Button> : <span className="text-xs text-gray-400">Click a branch row above to filter</span>}
        bodyClass="p-0"
      >
        <OrdersTable orders={drillOrders.slice(0, 60)} s={s} />
        {drillOrders.length > 60 && <p className="text-xs text-gray-400 px-5 py-3 border-t border-gray-100">Showing 60 of {drillOrders.length} orders — export CSV for the full list.</p>}
      </Panel>
    </div>
  );
}

function BreakdownPanel({ title, rows, onRowClick, activeKey, className }: {
  title: string; rows: { key: string; name: string; sales: number; orders: number; prev: number }[]; onRowClick?: (k: string) => void; activeKey?: string | null; className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.sales));
  const total = rows.reduce((a, b) => a + b.sales, 0);
  return (
    <Panel title={title} bodyClass="p-0" className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Name</TableHead>
            <TableHead className="w-1/4">Share</TableHead>
            <TableHead className="text-right">Net sales</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead className="text-right pr-5">vs prev.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const ch = r.prev ? ((r.sales - r.prev) / r.prev) * 100 : null;
            return (
              <TableRow key={r.key} onClick={onRowClick ? () => onRowClick(r.key) : undefined} className={cn(onRowClick && 'cursor-pointer', activeKey === r.key && 'bg-blue-50/70')}>
                <TableCell className="pl-5 font-medium text-gray-900">{r.name}</TableCell>
                <TableCell><div className="flex items-center gap-2"><ShareBar value={r.sales} max={max} /><span className="text-xs text-gray-400 w-9 text-right">{total ? Math.round((r.sales / total) * 100) : 0}%</span></div></TableCell>
                <TableCell className="text-right font-semibold text-[#1e40af]">{pesoShort(r.sales)}</TableCell>
                <TableCell className="text-right">{r.orders}</TableCell>
                <TableCell className={cn('text-right pr-5 text-xs font-medium', ch === null ? 'text-gray-400' : ch >= 0 ? 'text-green-600' : 'text-[#dc2626]')}>
                  {ch === null ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%`}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && <TableRow><TableCell colSpan={5}><EmptyState title="No sales in this period" /></TableCell></TableRow>}
        </TableBody>
      </Table>
    </Panel>
  );
}

function OrdersTable({ orders, s }: { orders: Order[]; s: AppState }) {
  if (!orders.length) return <EmptyState title="No orders" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-5">Order</TableHead>
          <TableHead>Placed</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead className="text-right pr-5">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="pl-5"><Link href={`/orders/${o.id}`} className="font-medium text-[#1e40af] hover:underline">{o.number}</Link></TableCell>
            <TableCell className="text-gray-500">{fmtDateTime(o.placedAt)}</TableCell>
            <TableCell>{o.customerName}</TableCell>
            <TableCell className="text-gray-500">{branchName(s, o.branchId)}</TableCell>
            <TableCell className="text-gray-500">{CHANNEL_LABEL[o.channel]} · {o.fulfillment}</TableCell>
            <TableCell><StatusBadge status={o.status} /></TableCell>
            <TableCell><PaymentBadge status={o.paymentStatus} /></TableCell>
            <TableCell className="text-right pr-5 font-medium">{peso(o.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------- Products
function ProductsTab({ ctx }: { ctx: Ctx }) {
  const { s, cur } = ctx;
  const sales = cur.filter(isSale);
  const map = new Map<string, { id: string; name: string; image: string; revenue: number; qty: number; cost: number; orders: number }>();
  let itemCount = 0;
  for (const o of sales) {
    for (const i of o.items) {
      if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
      const pid = i.substitute?.status === 'accepted' ? i.substitute.productId : i.productId;
      const p = s.products.find((x) => x.id === pid);
      const q = itemQty(i);
      itemCount += i.soldByWeight ? 1 : i.qty;
      const row = map.get(pid) ?? { id: pid, name: p?.name ?? i.name, image: p?.image ?? i.image, revenue: 0, qty: 0, cost: 0, orders: 0 };
      row.revenue += lineTotal(i);
      row.qty += q;
      row.cost += (p?.costPrice ?? 0) * q;
      row.orders += 1;
      map.set(pid, row);
    }
  }
  const [metric, setMetric] = useState<'revenue' | 'qty'>('revenue');
  const rows = [...map.values()].map((r) => ({ ...r, margin: r.revenue - r.cost, marginPct: r.revenue ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 }));
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const best = sorted.slice(0, 10);
  const worst = sorted.slice(-10).reverse();
  const unsold = s.products.filter((p) => p.status === 'active' && !map.has(p.id));

  const catOf = (pid: string) => {
    const p = s.products.find((x) => x.id === pid);
    let c = s.categories.find((x) => x.id === p?.categoryId);
    while (c?.parentId) c = s.categories.find((x) => x.id === c!.parentId) ?? undefined;
    return c;
  };
  const catMap = new Map<string, { name: string; revenue: number; margin: number; qty: number }>();
  for (const r of rows) {
    const c = catOf(r.id);
    const key = c?.id ?? 'other';
    const e = catMap.get(key) ?? { name: c ? `${c.icon} ${c.name}` : 'Other', revenue: 0, margin: 0, qty: 0 };
    e.revenue += r.revenue; e.margin += r.margin; e.qty += r.qty;
    catMap.set(key, e);
  }
  const cats = [...catMap.values()].sort((a, b) => b.revenue - a.revenue).map((c) => ({ ...c, revenue: Math.round(c.revenue), margin: Math.round(c.margin) }));
  const totalRev = sum(rows, (r) => r.revenue);
  const totalMargin = sum(rows, (r) => r.margin);
  const promoOrders = sales.filter((o) => o.voucherCode || o.discount > 0);

  const csv = () => {
    exportCsv(`product-report-${dayKey(new Date())}.csv`, [
      ['Product', 'Qty sold', 'Revenue', 'Cost', 'Margin', 'Margin %', 'Orders'],
      ...[...rows].sort((a, b) => b.revenue - a.revenue).map((r) => [r.name, r.qty.toFixed(2), r.revenue.toFixed(2), r.cost.toFixed(2), r.margin.toFixed(2), r.marginPct.toFixed(1), r.orders]),
      [], ['Category', 'Revenue', 'Margin', 'Qty'], ...cats.map((c) => [c.name, c.revenue, c.margin, c.qty.toFixed(1)]),
    ]);
    toast.success('Product report exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm print:hidden">
          {(['revenue', 'qty'] as const).map((m) => (
            <button key={m} onClick={() => setMetric(m)} className={cn('px-3 py-1.5 text-sm rounded-md font-medium', metric === m ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}>
              Rank by {m === 'revenue' ? 'revenue' : 'quantity'}
            </button>
          ))}
        </div>
        <ExportButtons onCsv={csv} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Product revenue" value={pesoShort(totalRev)} sub={<span className="text-xs text-gray-400">{rows.length} SKUs sold</span>} />
        <KpiCard title="Gross margin" value={pesoShort(totalMargin)} sub={<span className="text-xs text-gray-400">{totalRev ? ((totalMargin / totalRev) * 100).toFixed(1) : 0}% of revenue (cost price)</span>} accent="border-l-[#16a34a]" />
        <KpiCard title="Items per order" value={sales.length ? (itemCount / sales.length).toFixed(1) : '0'} sub={<span className="text-xs text-gray-400">avg basket {pesoShort(sales.length ? sum(sales, (o) => o.subtotal) / sales.length : 0)}</span>} accent="border-l-[#0891b2]" />
        <KpiCard title="Promo orders" value={promoOrders.length} sub={<span className="text-xs text-gray-400">{pesoShort(sum(promoOrders, (o) => o.discount))} discounts · {sales.length ? Math.round((promoOrders.length / sales.length) * 100) : 0}% of orders</span>} accent="border-l-[#f59e0b]" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ProductTable list={best} title={`Best sellers (by ${metric === 'revenue' ? 'revenue' : 'quantity'})`} />
        <ProductTable list={worst} title={`Worst sellers (by ${metric === 'revenue' ? 'revenue' : 'quantity'})`} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Category performance" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cats} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `₱${Math.round(v / 1000)}k`} />
                <Tooltip {...tip} formatter={(v, n) => [peso(Number(v)), n === 'revenue' ? 'Revenue' : 'Margin']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" name="revenue" fill={BLUE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="margin" name="margin" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Not sold in this period" bodyClass="p-0">
          {unsold.length === 0 ? <EmptyState title="Every active product sold at least once" /> : (
            <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {unsold.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2 text-sm"><span>{p.image}</span><span className="flex-1 truncate">{p.name}</span><span className="text-xs text-gray-400">{p.sku}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

type ProductRow = { id: string; name: string; image: string; revenue: number; qty: number; cost: number; orders: number; margin: number; marginPct: number };

function ProductTable({ list, title }: { list: ProductRow[]; title: string }) {
  return (
    <Panel title={title} bodyClass="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Product</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right pr-5">Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-5"><span className="mr-2">{r.image}</span><span className="font-medium text-gray-900">{r.name}</span></TableCell>
              <TableCell className="text-right">{Number.isInteger(r.qty) ? r.qty : r.qty.toFixed(1)}</TableCell>
              <TableCell className="text-right font-semibold text-[#1e40af]">{pesoShort(r.revenue)}</TableCell>
              <TableCell className={cn('text-right pr-5 text-sm', r.marginPct < 15 ? 'text-[#dc2626]' : 'text-green-700')}>{pesoShort(r.margin)} · {r.marginPct.toFixed(0)}%</TableCell>
            </TableRow>
          ))}
          {list.length === 0 && <TableRow><TableCell colSpan={4}><EmptyState title="No product sales in this period" /></TableCell></TableRow>}
        </TableBody>
      </Table>
    </Panel>
  );
}

// ---------------------------------------------------------------- Customers
function CustomersTab({ ctx }: { ctx: Ctx }) {
  const { s, cur, all, prev } = ctx;
  const sales = cur.filter(isSale);
  const firstOrder = new Map<string, number>();
  for (const o of all) {
    const t = new Date(o.placedAt).getTime();
    if (!firstOrder.has(o.customerId) || t < firstOrder.get(o.customerId)!) firstOrder.set(o.customerId, t);
  }
  const start = ctx.days[0].getTime();
  const buyers = [...groupBy(sales, (o) => o.customerId)];
  const newC = buyers.filter(([id]) => (firstOrder.get(id) ?? 0) >= start);
  const repeat = buyers.filter(([id]) => (firstOrder.get(id) ?? 0) < start);
  const prevBuyers = new Set(prev.filter(isSale).map((o) => o.customerId)).size;

  const lifetime = [...groupBy(all.filter(isSale), (o) => o.customerId)].map(([id, list]) => {
    const c = s.customers.find((x) => x.id === id);
    const last = list.reduce((m, o) => (o.placedAt > m ? o.placedAt : m), '');
    const inRange = list.filter((o) => new Date(o.placedAt).getTime() >= start);
    return { id, name: c?.name ?? list[0].customerName, city: cityName(s, c?.cityId), ltv: sum(list, netSales), orders: list.length, rangeSpend: sum(inRange, netSales), rangeOrders: inRange.length, last };
  });
  const top = [...lifetime].sort((a, b) => b.rangeSpend - a.rangeSpend).filter((x) => x.rangeOrders).slice(0, 10);
  const avgLtv = avg(lifetime.map((x) => x.ltv));
  const freq = [
    { bucket: '1 order', count: buyers.filter(([, l]) => l.length === 1).length },
    { bucket: '2 orders', count: buyers.filter(([, l]) => l.length === 2).length },
    { bucket: '3–4 orders', count: buyers.filter(([, l]) => l.length >= 3 && l.length <= 4).length },
    { bucket: '5+ orders', count: buyers.filter(([, l]) => l.length >= 5).length },
  ];
  const churn = lifetime.filter((x) => Date.now() - new Date(x.last).getTime() > 7 * DAY).length;
  const byCity = [...groupBy(sales, (o) => s.customers.find((c) => c.id === o.customerId)?.cityId ?? '')].map(([k, l]) => ({ name: cityName(s, k), value: new Set(l.map((o) => o.customerId)).size }));

  const csv = () => {
    exportCsv(`customer-report-${dayKey(new Date())}.csv`, [
      ['Customer', 'City', 'Orders (period)', 'Spend (period)', 'Lifetime orders', 'Lifetime value', 'Last order'],
      ...[...lifetime].sort((a, b) => b.ltv - a.ltv).map((x) => [x.name, x.city, x.rangeOrders, x.rangeSpend.toFixed(2), x.orders, x.ltv.toFixed(2), x.last.slice(0, 10)]),
    ]);
    toast.success('Customer report exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><ExportButtons onCsv={csv} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Active customers" value={buyers.length} sub={<Delta cur={buyers.length} prev={prevBuyers} />} />
        <KpiCard title="New vs repeat" value={<span>{newC.length} <span className="text-gray-300 font-normal">/</span> {repeat.length}</span>} sub={<span className="text-xs text-gray-400">{buyers.length ? Math.round((repeat.length / buyers.length) * 100) : 0}% repeat customers</span>} accent="border-l-[#16a34a]" />
        <KpiCard title="Avg lifetime value" value={pesoShort(avgLtv)} sub={<span className="text-xs text-gray-400">{lifetime.length} customers with orders</span>} accent="border-l-[#0891b2]" />
        <KpiCard title="Churn risk" value={churn} sub={<span className="text-xs text-gray-400">no order in 7+ days</span>} accent="border-l-[#dc2626]" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Order frequency (period)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={freq}>
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={28} />
                <Tooltip {...tip} formatter={(v) => [v, 'Customers']} />
                <Bar dataKey="count" fill={BLUE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="New vs repeat">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{ name: 'New', value: newC.length }, { name: 'Repeat', value: repeat.length }]} dataKey="value" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">
                  <Cell fill="#16a34a" /><Cell fill={BLUE} />
                </Pie>
                <Tooltip {...tip} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Customers by area">
          <ul className="space-y-3">
            {byCity.sort((a, b) => b.value - a.value).map((c, i) => (
              <li key={c.name}>
                <div className="flex justify-between text-sm mb-1"><span className="text-gray-700">{c.name}</span><span className="font-semibold text-[#1e40af]">{c.value}</span></div>
                <ShareBar value={c.value} max={Math.max(...byCity.map((x) => x.value))} color={CHART_COLORS[i % CHART_COLORS.length]} />
              </li>
            ))}
            {byCity.length === 0 && <EmptyState title="No customers in this period" />}
          </ul>
        </Panel>
      </div>
      <Panel title="Top customers" bodyClass="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">#</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>City</TableHead>
              <TableHead className="text-right">Orders (period)</TableHead>
              <TableHead className="text-right">Spend (period)</TableHead>
              <TableHead className="text-right">Lifetime orders</TableHead>
              <TableHead className="text-right pr-5">Lifetime value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((x, i) => (
              <TableRow key={x.id}>
                <TableCell className="pl-5 text-gray-400 font-semibold">{i + 1}</TableCell>
                <TableCell className="font-medium text-gray-900">{x.name}</TableCell>
                <TableCell className="text-gray-500">{x.city}</TableCell>
                <TableCell className="text-right">{x.rangeOrders}</TableCell>
                <TableCell className="text-right font-semibold text-[#1e40af]">{pesoShort(x.rangeSpend)}</TableCell>
                <TableCell className="text-right">{x.orders}</TableCell>
                <TableCell className="text-right pr-5">{pesoShort(x.ltv)}</TableCell>
              </TableRow>
            ))}
            {top.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState title="No customers in this period" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- Operations
function OperationsTab({ ctx }: { ctx: Ctx }) {
  const { cur, days } = ctx;
  const collect = (from: string[], to: string[]) => cur.map((o) => stepMinutes(o, from, to)).filter((x): x is number => x !== undefined && x > 0);
  const confirm = collect(['placed'], ['confirmed']);
  const prep = collect(['confirmed'], ['ready']);
  const delivery = collect(['out_for_delivery'], ['delivered']);
  const completed = cur.filter((o) => o.status === 'delivered' || o.status === 'collected');
  const late = completed.filter((o) => {
    if (o.rating?.tags.includes('Late')) return true;
    if (!o.completedAt) return false;
    const mins = (new Date(o.completedAt).getTime() - new Date(o.placedAt).getTime()) / 60000;
    return mins > (o.prepMinutes || 20) + (o.fulfillment === 'delivery' ? 60 : 30);
  });
  const onTime = completed.length ? ((completed.length - late.length) / completed.length) * 100 : 0;
  const cancelled = cur.filter((o) => o.status === 'cancelled');
  const reasons = [...groupBy(cancelled, (o) => o.rejectReason ?? 'No reason recorded')].map(([k, l]) => ({ reason: k, count: l.length })).sort((a, b) => b.count - a.count);
  const items = cur.flatMap((o) => o.items);
  const subs = items.filter((i) => i.substitute || i.pickStatus === 'substituted').length;
  const oos = items.filter((i) => i.pickStatus === 'out_of_stock' || i.pickStatus === 'short').length;
  const byDay = groupBy(cur.filter((o) => o.rating), (o) => dayKey(o.placedAt));
  const ratingTrend = days.map((d) => {
    const l = byDay.get(dayKey(d)) ?? [];
    return { day: dayLabel(d), order: l.length ? +avg(l.map((o) => o.rating!.order)).toFixed(2) : null, rider: l.filter((o) => o.rating?.rider).length ? +avg(l.filter((o) => o.rating?.rider).map((o) => o.rating!.rider!)).toFixed(2) : null };
  });
  const m = (arr: number[]) => (arr.length ? `${avg(arr).toFixed(1)} min` : '—');

  const csv = () => {
    exportCsv(`operations-report-${dayKey(new Date())}.csv`, [
      ['Metric', 'Value', 'Sample size'],
      ['Avg confirmation time (min)', avg(confirm).toFixed(1), confirm.length],
      ['Avg preparation time (min)', avg(prep).toFixed(1), prep.length],
      ['Avg delivery time (min)', avg(delivery).toFixed(1), delivery.length],
      ['On-time rate %', onTime.toFixed(1), completed.length],
      ['Cancellation rate %', cur.length ? ((cancelled.length / cur.length) * 100).toFixed(1) : 0, cur.length],
      ['Substitution rate %', items.length ? ((subs / items.length) * 100).toFixed(1) : 0, items.length],
      ['Out-of-stock rate %', items.length ? ((oos / items.length) * 100).toFixed(1) : 0, items.length],
      [], ['Cancellation reason', 'Count'], ...reasons.map((r) => [r.reason, r.count]),
      [], ['Day', 'Avg order rating', 'Avg rider rating'], ...ratingTrend.map((r) => [r.day, r.order ?? '', r.rider ?? '']),
    ]);
    toast.success('Operations report exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><ExportButtons onCsv={csv} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Avg confirmation time" value={m(confirm)} sub={<span className="text-xs text-gray-400">{confirm.length} orders timed</span>} />
        <KpiCard title="Avg preparation time" value={m(prep)} sub={<span className="text-xs text-gray-400">confirmed → ready · {prep.length} orders</span>} accent="border-l-[#9333ea]" />
        <KpiCard title="Avg delivery time" value={m(delivery)} sub={<span className="text-xs text-gray-400">rider pickup → delivered · {delivery.length} trips</span>} accent="border-l-[#0891b2]" />
        <KpiCard title="On-time rate" value={`${onTime.toFixed(1)}%`} sub={<span className="text-xs text-gray-400">{late.length} late of {completed.length} completed</span>} accent={onTime >= 90 ? 'border-l-[#16a34a]' : 'border-l-[#f59e0b]'} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard title="Cancellation rate" value={`${cur.length ? ((cancelled.length / cur.length) * 100).toFixed(1) : 0}%`} sub={<span className="text-xs text-gray-400">{cancelled.length} of {cur.length} orders</span>} accent="border-l-[#dc2626]" />
        <KpiCard title="Substitution rate" value={`${items.length ? ((subs / items.length) * 100).toFixed(1) : 0}%`} sub={<span className="text-xs text-gray-400">{subs} of {items.length} order lines</span>} accent="border-l-[#f59e0b]" />
        <KpiCard title="Out-of-stock / short rate" value={`${items.length ? ((oos / items.length) * 100).toFixed(1) : 0}%`} sub={<span className="text-xs text-gray-400">{oos} lines short or unavailable</span>} accent="border-l-gray-400" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Rating trend" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ratingTrend} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis domain={[1, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={28} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="order" name="Order rating" stroke={BLUE} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="rider" name="Rider rating" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Cancellation & rejection reasons" bodyClass="p-0">
          {reasons.length === 0 ? <EmptyState title="No cancellations in this period" /> : (
            <ul className="divide-y divide-gray-100">
              {reasons.map((r) => (
                <li key={r.reason} className="px-5 py-3">
                  <div className="flex justify-between text-sm mb-1.5"><span className="text-gray-700">{r.reason}</span><span className="font-semibold text-[#dc2626]">{r.count}</span></div>
                  <ShareBar value={r.count} max={reasons[0].count} color="#dc2626" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Finance
function FinanceTab({ ctx }: { ctx: Ctx }) {
  const { s, cur } = ctx;
  const paid = cur.filter((o) => ['paid', 'partially_refunded', 'refunded'].includes(o.paymentStatus));
  const byMethod = [...groupBy(cur, (o) => o.paymentMethod)].map(([k, l]) => ({
    key: k, name: PAYMENT_LABEL[k as Order['paymentMethod']], count: l.length,
    collected: sum(l.filter((o) => o.paymentStatus !== 'pending' && o.paymentStatus !== 'failed' && o.paymentStatus !== 'expired'), (o) => o.total),
    pending: sum(l.filter((o) => o.paymentStatus === 'pending'), (o) => o.total), fees: sum(l, (o) => o.serviceFee),
  })).sort((a, b) => b.collected - a.collected);
  const refunds = cur.filter((o) => (o.refundedAmount ?? 0) > 0);
  const refundTotal = sum(refunds, (o) => o.refundedAmount);
  const gatewayFees = sum(cur.filter((o) => o.status !== 'cancelled'), (o) => o.serviceFee);
  const delivered = cur.filter((o) => o.fulfillment === 'delivery' && o.status === 'delivered');
  const feeIncome = sum(delivered, (o) => o.deliveryFee);
  const riderCost = sum(delivered, (o) => 60 + Math.round(o.deliveryFee * 0.5));
  const discounts = sum(cur.filter((o) => o.status !== 'cancelled'), (o) => o.discount);
  const codRiders = s.riders.filter((r) => r.codHeld > 0 && r.branchIds.some((b) => ctx.ids.includes(b)));
  const codTotal = sum(codRiders, (r) => r.codHeld);

  const csv = () => {
    exportCsv(`finance-report-${dayKey(new Date())}.csv`, [
      ['Payment method', 'Orders', 'Collected', 'Pending', 'Gateway fees'], ...byMethod.map((m) => [m.name, m.count, m.collected.toFixed(2), m.pending.toFixed(2), m.fees.toFixed(2)]),
      [], ['Refunds', refunds.length, refundTotal.toFixed(2)],
      ['Gateway fees', '', gatewayFees.toFixed(2)], ['Delivery fee income', delivered.length, feeIncome.toFixed(2)], ['Rider cost (est.)', delivered.length, riderCost.toFixed(2)], ['Discounts given', '', discounts.toFixed(2)],
      [], ['Rider', 'COD held'], ...codRiders.map((r) => [r.name, r.codHeld.toFixed(2)]),
      [], ['Refunded order', 'Branch', 'Method', 'Amount', 'Status'], ...refunds.map((o) => [o.number, branchName(s, o.branchId), PAYMENT_LABEL[o.paymentMethod], o.refundedAmount.toFixed(2), o.paymentStatus]),
    ]);
    toast.success('Finance report exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><ExportButtons onCsv={csv} /></div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Payments collected" value={pesoShort(sum(paid, (o) => o.total))} sub={<span className="text-xs text-gray-400">{paid.length} transactions</span>} />
        <KpiCard title="Refunds" value={pesoShort(refundTotal)} sub={<span className="text-xs text-gray-400">{refunds.length} orders</span>} accent="border-l-[#dc2626]" />
        <KpiCard title="COD outstanding" value={pesoShort(codTotal)} sub={<span className="text-xs text-gray-400">held by {codRiders.length} riders</span>} accent="border-l-[#f59e0b]" />
        <KpiCard title="Gateway fees" value={pesoShort(gatewayFees)} sub={<span className="text-xs text-gray-400">fee line charged to shopper</span>} accent="border-l-[#0891b2]" />
        <KpiCard title="Discounts given" value={pesoShort(discounts)} sub={<span className="text-xs text-gray-400">vouchers & pickup discounts</span>} accent="border-l-[#9333ea]" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="Payments by method" className="xl:col-span-2" bodyClass="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Method</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right pr-5">Gateway fees</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byMethod.map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="pl-5 font-medium text-gray-900">{m.name}</TableCell>
                  <TableCell className="text-right">{m.count}</TableCell>
                  <TableCell className="text-right font-semibold text-[#1e40af]">{peso(m.collected)}</TableCell>
                  <TableCell className={cn('text-right', m.pending ? 'text-amber-600' : 'text-gray-400')}>{peso(m.pending)}</TableCell>
                  <TableCell className="text-right pr-5">{peso(m.fees)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Delivery fee income vs rider cost">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: 'Fee income', value: feeIncome }, { name: 'Rider cost (est.)', value: riderCost }]}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip {...tip} formatter={(v) => [peso(Number(v)), '']} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11, formatter: (v: unknown) => pesoShort(Number(v)) }}>
                  <Cell fill={BLUE} /><Cell fill="#f59e0b" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={cn('text-sm font-medium mt-2', feeIncome - riderCost >= 0 ? 'text-green-700' : 'text-[#dc2626]')}>
            Net delivery {feeIncome - riderCost >= 0 ? 'margin' : 'subsidy'}: {peso(Math.abs(feeIncome - riderCost))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{delivered.length} delivered orders · rider cost = ₱60 base + 50% of fee</p>
        </Panel>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="COD outstanding by rider" bodyClass="p-0">
          {codRiders.length === 0 ? <EmptyState title="No cash waiting for remittance" /> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-5">Rider</TableHead><TableHead>Type</TableHead><TableHead>Branches</TableHead><TableHead className="text-right pr-5">Cash held</TableHead></TableRow></TableHeader>
              <TableBody>
                {codRiders.sort((a, b) => b.codHeld - a.codHeld).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-5 font-medium text-gray-900">{r.name}</TableCell>
                    <TableCell><Pill className="capitalize">{r.type}</Pill></TableCell>
                    <TableCell className="text-gray-500 text-xs">{r.branchIds.map((b) => branchName(s, b)).join(', ')}</TableCell>
                    <TableCell className="text-right pr-5 font-semibold text-amber-600">{peso(r.codHeld)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel title="Refunds" bodyClass="p-0">
          {refunds.length === 0 ? <EmptyState title="No refunds in this period" /> : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-5">Order</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead className="text-right pr-5">Refunded</TableHead></TableRow></TableHeader>
                <TableBody>
                  {refunds.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="pl-5"><Link href={`/orders/${o.id}`} className="font-medium text-[#1e40af] hover:underline">{o.number}</Link><div className="text-xs text-gray-400">{o.rejectReason ?? branchName(s, o.branchId)}</div></TableCell>
                      <TableCell className="text-gray-500">{PAYMENT_LABEL[o.paymentMethod]}</TableCell>
                      <TableCell><PaymentBadge status={o.paymentStatus} /></TableCell>
                      <TableCell className="text-right pr-5 font-semibold text-[#dc2626]">{peso(o.refundedAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Schedule dialog
function ScheduleDialog({ open, onOpenChange, defaultReport }: { open: boolean; onOpenChange: (v: boolean) => void; defaultReport: string }) {
  const [email, setEmail] = useState('');
  const [freq, setFreq] = useState('Daily at 9:00 PM');
  const [report, setReport] = useState(defaultReport);
  const [format, setFormat] = useState('CSV + PDF');
  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error('Enter a valid email address'); return; }
    const name = `${report[0].toUpperCase()}${report.slice(1)} report`;
    mutate((d) => addAudit(d, { module: 'Settings', action: 'Report scheduled', detail: `${name} → ${email} (${freq}, ${format})` }));
    toast.success(`${name} scheduled`, { description: `${freq} to ${email}` });
    onOpenChange(false);
    setEmail('');
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) setReport(defaultReport); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule report</DialogTitle>
          <DialogDescription>Send this report automatically by email (e.g. daily sales to branch managers).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Report</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={report} onChange={(e) => setReport(e.target.value)}>
              {['sales', 'products', 'customers', 'operations', 'finance'].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Recipient email</span>
            <input className={cn(inputClass, 'w-full mt-1')} type="email" placeholder="manager@freshmart.ph" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-gray-600">Frequency</span>
              <select className={cn(selectClass, 'w-full mt-1')} value={freq} onChange={(e) => setFreq(e.target.value)}>
                {['Daily at 9:00 PM', 'Daily at 7:00 AM', 'Weekly (Monday 8:00 AM)', 'Monthly (1st, 8:00 AM)'].map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-xs font-medium text-gray-600">Format</span>
              <select className={cn(selectClass, 'w-full mt-1')} value={format} onChange={(e) => setFormat(e.target.value)}>
                {['CSV + PDF', 'CSV only', 'PDF only'].map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
