'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { cityName, exportCsv, pesoShort } from '@/src/lib/logic';
import type { Customer, Order } from '@/src/lib/types';
import { DAY, avg, dayKey, groupBy, isSale, netSales, sum } from '@/src/components/reports/analytics';
import { Delta } from '@/src/components/reports/ui';
import { BarRow, C, Card, type Ctx, EmptyRow, Kpi, KpiStrip, TableWrap, Td, Th, pct } from './_ui';

/** Barangay from the first saved address ("Purok 5, San Miguel, Digos City" → "San Miguel"). */
function barangay(c: Customer | undefined) {
  const parts = (c?.addresses[0]?.line ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const rest = parts.filter((p) => !/city$/i.test(p) && !/^purok/i.test(p));
  return rest[rest.length - 1] ?? 'Unknown';
}

/** New vs repeat buyers in a window: a buyer is new when their first ever order is inside the window. */
function buyerSplit(orders: Order[], firstOrder: Map<string, number>, start: number) {
  const buyers = [...groupBy(orders.filter(isSale), (o) => o.customerId)];
  const fresh = buyers.filter(([id]) => (firstOrder.get(id) ?? 0) >= start);
  const repeat = buyers.filter(([id]) => (firstOrder.get(id) ?? 0) < start);
  return { buyers, fresh, repeat };
}

function computeCustomers(ctx: Ctx) {
  const { s, cur, all, prev, start, prevStart, now } = ctx;
  const firstOrder = new Map<string, number>();
  for (const o of all) {
    const t = new Date(o.placedAt).getTime();
    if (!firstOrder.has(o.customerId) || t < firstOrder.get(o.customerId)!) firstOrder.set(o.customerId, t);
  }
  const { buyers, fresh, repeat } = buyerSplit(cur, firstOrder, start);
  const p = buyerSplit(prev, firstOrder, prevStart);

  const lifetimeAt = (until: number) => [...groupBy(all.filter((o) => isSale(o) && new Date(o.placedAt).getTime() < until), (o) => o.customerId)].map(([id, list]) => {
    const c = s.customers.find((x) => x.id === id);
    const last = list.reduce((m, o) => (o.placedAt > m ? o.placedAt : m), '');
    const inRange = list.filter((o) => new Date(o.placedAt).getTime() >= start);
    return { id, name: c?.name ?? list[0].customerName, city: cityName(s, c?.cityId), ltv: sum(list, netSales), orders: list.length, rangeSpend: sum(inRange, netSales), rangeOrders: inRange.length, last };
  });
  const lifetime = lifetimeAt(Infinity);
  const prevLifetime = lifetimeAt(start);
  const top = [...lifetime].filter((x) => x.rangeOrders).sort((a, b) => b.rangeSpend - a.rangeSpend).slice(0, 10);
  const churn = lifetime.filter((x) => now - new Date(x.last).getTime() > 30 * DAY);

  const n = (l: Order[]) => l.length;
  const freq = [
    { bucket: '1 order', count: buyers.filter(([, l]) => n(l) === 1).length },
    { bucket: '2 orders', count: buyers.filter(([, l]) => n(l) === 2).length },
    { bucket: '3–4', count: buyers.filter(([, l]) => n(l) >= 3 && n(l) <= 4).length },
    { bucket: '5–20', count: buyers.filter(([, l]) => n(l) >= 5 && n(l) <= 20).length },
    { bucket: '20+', count: buyers.filter(([, l]) => n(l) > 20).length },
  ];
  const spend = (list: [string, Order[]][]) => sum(list, ([, l]) => sum(l, netSales));
  const repeatSpend = spend(repeat);
  const newSpend = spend(fresh);

  const byBrgyAll = [...groupBy(buyers.map(([id]) => id), (id) => barangay(s.customers.find((c) => c.id === id)))]
    .map(([name, ids]) => ({ name, count: ids.length })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const byBrgy = byBrgyAll.slice(0, 6);
  const others = sum(byBrgyAll.slice(6), (x) => x.count);
  if (others) byBrgy.push({ name: 'Others', count: others });

  return {
    buyers, fresh, repeat, prevBuyers: p.buyers, prevRepeat: p.repeat, lifetime, prevLifetime, top, churn, freq, repeatSpend, newSpend, byBrgy,
    avgLtv: avg(lifetime.map((x) => x.ltv)), prevAvgLtv: avg(prevLifetime.map((x) => x.ltv)),
  };
}

export function customersCsv(ctx: Ctx) {
  const d = computeCustomers(ctx);
  exportCsv(`customer-report-${dayKey(new Date())}.csv`, [
    ['Customer', 'City', 'Orders (period)', 'Spend (period)', 'Lifetime orders', 'Lifetime value', 'Last order'],
    ...[...d.lifetime].sort((a, b) => b.ltv - a.ltv).map((x) => [x.name, x.city, x.rangeOrders, x.rangeSpend.toFixed(2), x.orders, x.ltv.toFixed(2), x.last.slice(0, 10)]),
    [], ['Orders in period', 'Customers'], ...d.freq.map((f) => [f.bucket, f.count]),
    [], ['Barangay', 'Customers'], ...d.byBrgy.map((b) => [b.name, b.count]),
  ]);
  toast.success('Customer report exported');
}

export function CustomersTab({ ctx }: { ctx: Ctx }) {
  const d = computeCustomers(ctx);
  const repeatRate = pct(d.repeat.length, d.buyers.length);
  const prevRepeatRate = d.prevBuyers.length ? pct(d.prevRepeat.length, d.prevBuyers.length) : NaN;
  const maxFreq = Math.max(1, ...d.freq.map((f) => f.count));
  const totalSpend = d.repeatSpend + d.newSpend;
  const maxBrgy = Math.max(1, ...d.byBrgy.map((b) => b.count));
  const repeatShare = Math.round(pct(d.repeatSpend, totalSpend));

  return (
    <div className="space-y-5">
      <KpiStrip cols={4}>
        <Kpi label="Active customers" value={d.buyers.length} delta={<Delta cur={d.buyers.length} prev={d.prevBuyers.length} />} sub="ordered this period" />
        <Kpi label="Repeat rate" value={`${Math.round(repeatRate)}%`} delta={<Delta cur={repeatRate} prev={prevRepeatRate} points />} sub={`${d.repeat.length} repeat · ${d.fresh.length} new`} />
        <Kpi label="Avg lifetime value" value={pesoShort(d.avgLtv)} delta={<Delta cur={d.avgLtv} prev={d.prevAvgLtv} />} sub={`${d.lifetime.length} customers with orders`} />
        <Kpi label="Churn risk" value={d.churn.length} sub="no order in 30+ days" />
      </KpiStrip>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Card title="Order frequency" sub="customers by number of orders">
          <div className="flex h-56 items-end gap-3 sm:gap-6 border-b border-[#eadfd6] pt-6">
            {d.freq.map((f) => (
              <div key={f.bucket} className="flex h-full flex-1 flex-col items-center justify-end" title={`${f.bucket}: ${f.count} customers`}>
                <span className="mb-1 text-sm font-semibold tabular-nums text-[#1d1716]">{f.count}</span>
                <div className="w-full max-w-16 rounded-t-[4px]" style={{ height: `${(f.count / maxFreq) * 100}%`, minHeight: f.count ? 3 : 0, background: C.red }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3 sm:gap-6">
            {d.freq.map((f) => <span key={f.bucket} className="flex-1 text-center text-xs text-gray-500 whitespace-nowrap">{f.bucket}</span>)}
          </div>
        </Card>

        <div className="space-y-5 min-w-0">
          <Card title="New vs repeat" sub={totalSpend ? `repeat customers bring in ${repeatShare}% of revenue` : 'no sales in this period'}>
            <ul className="divide-y divide-[#f4ede7]">
              {[
                { label: 'Repeat customers', n: d.repeat.length, spend: d.repeatSpend },
                { label: 'New customers', n: d.fresh.length, spend: d.newSpend },
              ].map((r) => (
                <BarRow key={r.label} label={r.label} sub={`${r.n} customer${r.n === 1 ? '' : 's'}`} value={r.spend} max={totalSpend} color={C.green}
                  right={<>{pesoShort(r.spend)} <span className="ml-1 text-xs font-normal text-gray-500">{Math.round(pct(r.spend, totalSpend))}%</span></>} />
              ))}
            </ul>
          </Card>
          <Card title="Customers by barangay" sub={cityName(ctx.s, ctx.s.branches.find((b) => b.id === ctx.ids[0])?.cityId)}>
            <ul className="divide-y divide-[#f4ede7]">
              {d.byBrgy.map((b) => <BarRow key={b.name} label={b.name} value={b.count} max={maxBrgy} color={C.blue} right={b.count} />)}
              {d.byBrgy.length === 0 && <li className="py-6 text-center text-sm text-gray-400">No customers in this period</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Card title="Top customers" sub="by spend this period" bodyClass="pb-1">
        <TableWrap minWidth={520}>
          <thead><tr><Th className="w-8">#</Th><Th>Customer</Th><Th right>Orders</Th><Th right>Spend</Th><Th right>Avg</Th></tr></thead>
          <tbody>
            {d.top.map((x, i) => (
              <tr key={x.id}>
                <Td className="text-gray-400 font-semibold tabular-nums">{i + 1}</Td>
                <Td><Link href={`/customers?c=${x.id}`} className="font-semibold text-[#1d1716] hover:text-[#c8151d] hover:underline whitespace-nowrap">{x.name}</Link></Td>
                <Td right>{x.rangeOrders}</Td>
                <Td right className="font-semibold text-[#1d1716]">{pesoShort(x.rangeSpend)}</Td>
                <Td right className="text-gray-600">{pesoShort(x.rangeSpend / x.rangeOrders)}</Td>
              </tr>
            ))}
            {d.top.length === 0 && <EmptyRow cols={5} text="No customers in this period" />}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
