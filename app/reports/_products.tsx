'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { exportCsv, pesoShort } from '@/src/lib/logic';
import type { AppState, Order } from '@/src/lib/types';
import { dayKey, isSale, itemQty, lineTotal, onHandMap, sum } from '@/src/components/reports/analytics';
import { Delta } from '@/src/components/reports/ui';
import { cn } from '@/src/lib/utils';
import { C, Card, type Ctx, EmptyRow, Kpi, KpiStrip, Legend, Segmented, TableWrap, Td, Th, fmtNum, pct } from './_ui';

type ProductRow = { id: string; name: string; sku: string; weighed: boolean; revenue: number; qty: number; cost: number; orders: number; margin: number; marginPct: number };

/** Per-product revenue, quantity and cost (at the product's cost price) for a set of orders. */
function productStats(s: AppState, orders: Order[]) {
  const sales = orders.filter(isSale);
  const map = new Map<string, Omit<ProductRow, 'margin' | 'marginPct'>>();
  let itemCount = 0;
  for (const o of sales) {
    for (const i of o.items) {
      if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
      const pid = i.substitute?.status === 'accepted' ? i.substitute.productId : i.productId;
      const p = s.products.find((x) => x.id === pid);
      const q = itemQty(i);
      itemCount += i.soldByWeight ? 1 : i.qty;
      const row = map.get(pid) ?? { id: pid, name: p?.name ?? i.name, sku: p?.sku ?? '', weighed: i.soldByWeight, revenue: 0, qty: 0, cost: 0, orders: 0 };
      row.revenue += lineTotal(i);
      row.qty += q;
      row.cost += (p?.costPrice ?? 0) * q;
      row.orders += 1;
      map.set(pid, row);
    }
  }
  const rows: ProductRow[] = [...map.values()].map((r) => ({ ...r, margin: r.revenue - r.cost, marginPct: r.revenue ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 }));
  const revenue = sum(rows, (r) => r.revenue);
  const margin = sum(rows, (r) => r.margin);
  const promo = sales.filter((o) => o.voucherCode || o.discount > 0);
  return {
    sales, rows, map, revenue, margin, promo,
    itemsPerOrder: sales.length ? itemCount / sales.length : 0,
    basket: sales.length ? sum(sales, (o) => o.subtotal) / sales.length : 0,
  };
}

function computeProducts(ctx: Ctx) {
  const { s } = ctx;
  const cur = productStats(s, ctx.cur);
  const prev = productStats(s, ctx.prev);
  const unsold = s.products.filter((p) => p.status === 'active' && !cur.map.has(p.id));

  const catOf = (pid: string) => {
    const p = s.products.find((x) => x.id === pid);
    let c = s.categories.find((x) => x.id === p?.categoryId);
    while (c?.parentId) c = s.categories.find((x) => x.id === c!.parentId) ?? undefined;
    return c;
  };
  const catMap = new Map<string, { name: string; revenue: number; margin: number; qty: number }>();
  for (const r of cur.rows) {
    const c = catOf(r.id);
    const key = c?.id ?? 'other';
    const e = catMap.get(key) ?? { name: c ? c.name : 'Other', revenue: 0, margin: 0, qty: 0 };
    e.revenue += r.revenue; e.margin += r.margin; e.qty += r.qty;
    catMap.set(key, e);
  }
  const cats = [...catMap.values()].sort((a, b) => b.revenue - a.revenue);
  return { cur, prev, unsold, cats };
}

export function productsCsv(ctx: Ctx) {
  const { cur, cats, unsold } = computeProducts(ctx);
  exportCsv(`product-report-${dayKey(new Date())}.csv`, [
    ['Product', 'SKU', 'Qty sold', 'Revenue', 'Cost', 'Margin', 'Margin %', 'Order lines'],
    ...[...cur.rows].sort((a, b) => b.revenue - a.revenue).map((r) => [r.name, r.sku, r.qty.toFixed(2), r.revenue.toFixed(2), r.cost.toFixed(2), r.margin.toFixed(2), r.marginPct.toFixed(1), r.orders]),
    [], ['Category', 'Revenue', 'Margin', 'Qty'], ...cats.map((c) => [c.name, c.revenue.toFixed(2), c.margin.toFixed(2), c.qty.toFixed(1)]),
    [], ['Not sold this period', 'SKU'], ...unsold.map((p) => [p.name, p.sku]),
  ]);
  toast.success('Product report exported');
}

export function ProductsTab({ ctx }: { ctx: Ctx }) {
  const { s } = ctx;
  const { cur, prev, unsold, cats } = computeProducts(ctx);
  const [metric, setMetric] = useState<'revenue' | 'qty'>('revenue');
  const sorted = [...cur.rows].sort((a, b) => b[metric] - a[metric]);
  const best = sorted.slice(0, 10);
  const slowest = sorted.slice(-10).reverse();
  const oh = onHandMap(s);
  const onHand = (pid: string) => sum(ctx.ids, (b) => oh.get(`${pid}|${b}`) ?? 0);
  const maxCat = Math.max(1, ...cats.map((c) => c.revenue));
  const options = [{ value: 'revenue' as const, label: 'By revenue' }, { value: 'qty' as const, label: 'By quantity' }];

  return (
    <div className="space-y-5">
      <KpiStrip cols={4}>
        <Kpi label="Product revenue" value={pesoShort(cur.revenue)} delta={<Delta cur={cur.revenue} prev={prev.revenue} />} sub={`${cur.rows.length} SKUs sold`} />
        <Kpi label="Gross margin" value={pesoShort(cur.margin)} delta={<Delta cur={cur.margin} prev={prev.margin} />} sub={`${pct(cur.margin, cur.revenue).toFixed(1)}% of revenue at cost`} />
        <Kpi label="Items per order" value={cur.itemsPerOrder.toFixed(1)} delta={<Delta cur={cur.itemsPerOrder} prev={prev.itemsPerOrder} />} sub={`avg basket ${pesoShort(cur.basket)}`} />
        <Kpi label="Promo orders" value={cur.promo.length} delta={cur.promo.length ? <Delta cur={cur.promo.length} prev={prev.promo.length} /> : undefined}
          sub={cur.promo.length ? `${pesoShort(sum(cur.promo, (o) => o.discount))} discounts · ${Math.round(pct(cur.promo.length, cur.sales.length))}% of orders` : 'no promos ran this period'} />
      </KpiStrip>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <ProductTable title="Best sellers" list={best} action={<Segmented label="Rank best sellers" value={metric} options={options} onChange={setMetric} />} />
        <ProductTable title="Slowest sellers" sub="consider bundling or delisting" list={slowest} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-5 items-start">
        <Card title="Category revenue & margin" sub="dark = margin share of revenue"
          action={<Legend items={[{ label: 'Margin', color: C.green }, { label: 'Cost', color: C.greenLight }]} />}>
          <ul className="divide-y divide-[#f4ede7]">
            {cats.map((c) => (
              <li key={c.name} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                title={`Revenue ${pesoShort(c.revenue)} · margin ${pesoShort(c.margin)} · cost ${pesoShort(c.revenue - c.margin)}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1d1716] truncate">{c.name}</p>
                  <p className="text-xs text-gray-500">{Math.round(pct(c.margin, c.revenue))}% margin</p>
                </div>
                <div className="h-3.5">
                  <div className="flex h-3.5 overflow-hidden rounded-[3px]" style={{ width: `${Math.max(1.5, pct(c.revenue, maxCat))}%`, background: C.greenLight }}>
                    <div className="h-full" style={{ width: `${Math.max(0, pct(c.margin, c.revenue))}%`, background: C.green }} />
                  </div>
                </div>
                <span className="text-right text-sm font-semibold tabular-nums text-[#1d1716] whitespace-nowrap">{pesoShort(c.revenue)}</span>
              </li>
            ))}
            {cats.length === 0 && <li className="py-8 text-center text-sm text-gray-400">No product sales in this period</li>}
          </ul>
        </Card>

        <Card title="Not sold this period" sub={unsold.length ? `${unsold.length} active SKU${unsold.length === 1 ? '' : 's'} · check stock or visibility` : 'every active SKU sold at least once'} bodyClass="pb-1">
          <div className="max-h-80 overflow-y-auto -mx-4 sm:-mx-5">
            <div className="px-4 sm:px-5">
              <TableWrap minWidth={320}>
                <thead><tr><Th>Product</Th><Th>SKU</Th><Th right>On hand</Th></tr></thead>
                <tbody>
                  {unsold.map((p) => {
                    const q = onHand(p.id);
                    return (
                      <tr key={p.id}>
                        <Td className="font-medium text-[#1d1716]">{p.name}</Td>
                        <Td className="text-gray-500 whitespace-nowrap">{p.sku}</Td>
                        <Td right className={cn('whitespace-nowrap', q <= 0 ? 'font-semibold text-[#c8151d]' : 'text-[#1d1716]')}>{fmtNum(q, p.unit === 'kg' && !Number.isInteger(q) ? 1 : 0)} {p.unit}</Td>
                      </tr>
                    );
                  })}
                  {unsold.length === 0 && <EmptyRow cols={3} text="Nothing to check" />}
                </tbody>
              </TableWrap>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProductTable({ title, sub, list, action }: { title: string; sub?: string; list: ProductRow[]; action?: React.ReactNode }) {
  return (
    <Card title={title} sub={sub} action={action} bodyClass="pb-1">
      <TableWrap minWidth={480}>
        <thead><tr><Th className="w-8">#</Th><Th>Product</Th><Th right>Qty</Th><Th right>Revenue</Th><Th right>Margin</Th></tr></thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.id}>
              <Td className="text-gray-400 font-semibold tabular-nums">{i + 1}</Td>
              <Td className="font-semibold text-[#1d1716]">{r.name}</Td>
              <Td right>{r.weighed ? fmtNum(r.qty, 1) : fmtNum(r.qty)}</Td>
              <Td right className="font-semibold text-[#1d1716] whitespace-nowrap">{pesoShort(r.revenue)}</Td>
              <Td right className="whitespace-nowrap">
                <span className={cn('block font-semibold', r.marginPct < 20 ? 'text-[#b5561c]' : 'text-[#1f6b3f]')}>{pesoShort(r.margin)}</span>
                <span className="block text-[11px] text-gray-500">{r.marginPct.toFixed(0)}%</span>
              </Td>
            </tr>
          ))}
          {list.length === 0 && <EmptyRow cols={5} text="No product sales in this period" />}
        </tbody>
      </TableWrap>
    </Card>
  );
}
