'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { exportCsv, peso, pesoShort } from '@/src/lib/logic';
import type { Order, PaymentMethod, Rider } from '@/src/lib/types';
import { dayKey, groupBy, isSale, sum } from '@/src/components/reports/analytics';
import { Delta } from '@/src/components/reports/ui';
import { cn } from '@/src/lib/utils';
import {
  C, Card, type Ctx, EmptyRow, HBar, Kpi, KpiStrip, Legend, ONLINE, OrderLink, PAY_NAME, PayChip, TableWrap, Td, Th, VsPrev, gatewayFee, gatewayPct, pct,
} from './_ui';

const PAY_ORDER: PaymentMethod[] = ['gcash', 'cod', 'card', 'pay_at_pickup', 'maya', 'cash'];

/**
 * Money for a set of orders. `codHeld` is cash riders still hold (current state, so only for the live period).
 * gross = every order that took or owes money (sales + refunded cancellations)
 * collected = gross - not yet collected; net to bank = gross - refunds - gateway fees - delivery subsidy - not collected.
 */
function money(orders: Order[], pctFee: number, codHeld: number) {
  const billed = orders.filter((o) => isSale(o) || (o.refundedAmount ?? 0) > 0);
  const gross = sum(billed, (o) => o.total);
  const refundOrders = orders.filter((o) => (o.refundedAmount ?? 0) > 0);
  const refunds = sum(refundOrders, (o) => o.refundedAmount);
  const fees = sum(billed, (o) => gatewayFee(o, pctFee));
  const pendingOrders = billed.filter((o) => isSale(o) && o.paymentStatus === 'pending');
  const pending = sum(pendingOrders, (o) => o.total);
  const notCollected = pending + codHeld;
  const delivered = orders.filter((o) => o.fulfillment === 'delivery' && o.status === 'delivered');
  const feeIncome = sum(delivered, (o) => o.deliveryFee);
  const riderCost = sum(delivered, (o) => 60 + Math.round(o.deliveryFee * 0.5));
  const subsidy = Math.max(0, riderCost - feeIncome);
  const collected = gross - notCollected;
  const onlineCollected = sum(billed.filter((o) => ONLINE.includes(o.paymentMethod) && o.paymentStatus !== 'pending'), (o) => o.total);
  const discountOrders = orders.filter((o) => isSale(o) && o.discount > 0);
  return {
    billed, gross, refundOrders, refunds, fees, pendingOrders, pending, notCollected, delivered, feeIncome, riderCost, subsidy, collected, onlineCollected,
    transactions: billed.filter((o) => o.paymentStatus !== 'pending').length,
    discountOrders, discounts: sum(discountOrders, (o) => o.discount),
    net: gross - refunds - fees - subsidy - notCollected,
  };
}

function computeFinance(ctx: Ctx) {
  const { s, cur, prev, ids } = ctx;
  const fee = gatewayPct(s, ids[0]);
  const codRiders: Rider[] = s.riders.filter((r) => r.codHeld > 0 && r.branchIds.some((b) => ids.includes(b)));
  const codTotal = sum(codRiders, (r) => r.codHeld);
  const m = money(cur, fee, codTotal);
  const p = money(prev, fee, 0);

  const codOpen = m.pendingOrders.filter((o) => o.paymentMethod === 'cod');
  const pickupOpen = m.pendingOrders.filter((o) => o.paymentMethod === 'pay_at_pickup');
  const otherOpen = m.pendingOrders.filter((o) => o.paymentMethod !== 'cod' && o.paymentMethod !== 'pay_at_pickup');

  const methodRows = (list: Order[], cod: number) => {
    const g = groupBy(list.filter((o) => isSale(o) || (o.refundedAmount ?? 0) > 0), (o) => o.paymentMethod);
    return PAY_ORDER.filter((k) => g.has(k) || (k === 'cod' && cod > 0)).map((k) => {
      const l = g.get(k) ?? [];
      const gross = sum(l, (o) => o.total);
      const held = k === 'cod' ? cod : 0;
      const pending = sum(l.filter((o) => isSale(o) && o.paymentStatus === 'pending'), (o) => o.total) + held;
      const fees = sum(l, (o) => gatewayFee(o, fee));
      const refunds = sum(l, (o) => o.refundedAmount ?? 0);
      const collected = gross - pending;
      return { key: k, name: PAY_NAME[k], orders: l.length, gross, held, pending, fees, refunds, collected, net: collected - fees - refunds };
    });
  };
  const methods = methodRows(cur, codTotal);
  const prevMethods = new Map(methodRows(prev, 0).map((r) => [r.key, r]));
  return { fee, codRiders, codTotal, m, p, codOpen, pickupOpen, otherOpen, methods, prevMethods };
}

export function financeCsv(ctx: Ctx) {
  const { m, methods, codRiders } = computeFinance(ctx);
  exportCsv(`finance-report-${dayKey(new Date())}.csv`, [
    ['Line', 'Orders', 'Amount'],
    ['Gross sales', m.billed.length, m.gross.toFixed(2)], ['Refunds', m.refundOrders.length, (-m.refunds).toFixed(2)], ['Gateway fees', '', (-m.fees).toFixed(2)],
    ['Delivery subsidy', m.delivered.length, (-m.subsidy).toFixed(2)], ['Not yet collected', m.pendingOrders.length, (-m.notCollected).toFixed(2)], ['Net to bank', '', m.net.toFixed(2)],
    [], ['Delivery fee income', m.delivered.length, m.feeIncome.toFixed(2)], ['Rider cost (est.)', m.delivered.length, m.riderCost.toFixed(2)], ['Discounts given', m.discountOrders.length, m.discounts.toFixed(2)],
    [], ['Payment method', 'Orders', 'Collected', 'Pending', 'Gateway fees', 'Refunds', 'Net'],
    ...methods.map((r) => [r.name, r.orders, r.collected.toFixed(2), r.pending.toFixed(2), r.fees.toFixed(2), r.refunds.toFixed(2), r.net.toFixed(2)]),
    [], ['Rider', 'COD held'], ...codRiders.map((r) => [r.name, r.codHeld.toFixed(2)]),
    [], ['Refunded order', 'Reason', 'Method', 'Amount', 'Status'], ...m.refundOrders.map((o) => [o.number, o.rejectReason ?? '', PAY_NAME[o.paymentMethod], o.refundedAmount.toFixed(2), o.paymentStatus]),
  ]);
  toast.success('Finance report exported');
}

/** "4 customer cancellations · 1 out of stock" */
function refundSummary(list: Order[]) {
  const short = (r?: string) => (!r ? 'other' : /customer/i.test(r) ? 'customer cancellation' : /stock/i.test(r) ? 'out of stock' : r.toLowerCase());
  return [...groupBy(list, (o) => short(o.rejectReason))]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, l]) => `${l.length} ${k === 'customer cancellation' && l.length !== 1 ? 'customer cancellations' : k}`).join(' · ');
}

export function FinanceTab({ ctx }: { ctx: Ctx }) {
  const { fee, codRiders, codTotal, m, p, codOpen, pickupOpen, otherOpen, methods, prevMethods } = computeFinance(ctx);
  const flow = [
    { label: 'Gross sales', sub: `${m.billed.length} orders`, v: m.gross, color: C.ink, sign: '' },
    { label: 'Refunds', sub: `${m.refundOrders.length} orders`, v: m.refunds, color: C.red, sign: '−' },
    { label: 'Gateway fees', sub: 'GCash, card, Maya', v: m.fees, color: C.red, sign: '−' },
    { label: 'Delivery subsidy', sub: 'rider cost above fees charged', v: m.subsidy, color: C.red, sign: '−' },
    { label: 'Not yet collected', sub: 'COD with riders + pickup unpaid', v: m.notCollected, color: C.brown, sign: '−' },
    { label: 'Net to bank', sub: 'what lands in the bank', v: m.net, color: C.green, sign: '', strong: true },
  ];
  const toCollect = [
    { key: 'riders', label: 'COD cash with riders', sub: <>{codRiders.length} rider{codRiders.length === 1 ? '' : 's'} · collect in <Link href="/delivery/riders?tab=cod" className="text-[#c8151d] hover:underline">Riders → COD</Link></>, v: codTotal },
    { key: 'cod', label: 'COD on orders still out', sub: `${codOpen.length} order${codOpen.length === 1 ? '' : 's'} not yet delivered`, v: sum(codOpen, (o) => o.total) },
    { key: 'pickup', label: 'Pay at pickup, not collected', sub: `${pickupOpen.length} order${pickupOpen.length === 1 ? '' : 's'} awaiting pickup`, v: sum(pickupOpen, (o) => o.total) },
    ...(otherOpen.length ? [{ key: 'other', label: 'Other unpaid orders', sub: `${otherOpen.length} order${otherOpen.length === 1 ? '' : 's'}`, v: sum(otherOpen, (o) => o.total) }] : []),
  ];
  const tot = {
    orders: sum(methods, (r) => r.orders), collected: sum(methods, (r) => r.collected), pending: sum(methods, (r) => r.pending),
    fees: sum(methods, (r) => r.fees), net: sum(methods, (r) => r.net), prev: sum([...prevMethods.values()], (r) => r.collected),
  };
  const maxFee = Math.max(1, m.feeIncome, m.riderCost);
  const pctOf = (v: number, whole: number) => `${pct(v, whole).toFixed(1)}%`;

  return (
    <div className="space-y-5">
      <KpiStrip cols={6}>
        <Kpi label="Payments collected" value={pesoShort(m.collected)} delta={<Delta cur={m.collected} prev={p.collected} />} sub={`${m.transactions} transactions`} />
        <Kpi label="Net to bank" value={pesoShort(m.net)} delta={<Delta cur={m.net} prev={p.net} />} sub="after refunds, fees & rider subsidy" />
        <Kpi label="Still to collect" value={pesoShort(m.notCollected)} delta={<Delta cur={m.notCollected} prev={p.notCollected} invert />} sub="COD + pay-at-pickup not yet in" />
        <Kpi label="Gateway fees" value={pesoShort(m.fees)} delta={<Delta cur={m.fees} prev={p.fees} invert />} sub={`${m.onlineCollected ? pctOf(m.fees, m.onlineCollected) : `${fee}%`} of online payments`} />
        <Kpi label="Refunds" value={pesoShort(m.refunds)} delta={<Delta cur={m.refunds} prev={p.refunds} invert />} sub={`${m.refundOrders.length} orders · ${pctOf(m.refunds, m.gross)} of sales`} />
        <Kpi label="Discounts" value={pesoShort(m.discounts)} delta={m.discounts ? <Delta cur={m.discounts} prev={p.discounts} invert /> : undefined}
          sub={m.discountOrders.length ? `${m.discountOrders.length} orders with vouchers` : 'no vouchers used'} />
      </KpiStrip>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-5 items-start">
        <Card title="Where the money went" sub="from gross sales to what lands in the bank"
          action={<Legend items={[{ label: 'In', color: C.green }, { label: 'Out', color: C.red }, { label: 'Pending', color: C.brown }]} />}>
          <ul className="divide-y divide-[#f4ede7]">
            {flow.map((f) => (
              <li key={f.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                <div className="min-w-0">
                  <p className={cn('text-sm text-[#1d1716] truncate', f.strong ? 'font-semibold' : 'font-medium')}>{f.label}</p>
                  <p className="text-xs text-gray-500 truncate">{f.sub}</p>
                </div>
                <div className="h-3.5">
                  <div className="h-3.5 rounded-[3px]" style={{ width: `${f.v > 0 ? Math.max(0.6, Math.min(100, pct(f.v, m.gross))) : 0}%`, background: f.color }} />
                </div>
                <span className={cn('text-right text-sm tabular-nums whitespace-nowrap', f.strong ? 'font-bold text-[#1f6b3f]' : f.sign ? 'font-semibold text-[#c8151d]' : 'font-semibold text-[#1d1716]',
                  f.color === C.brown && 'text-[#b5561c]')}>
                  {f.sign && f.v ? f.sign : ''}{pesoShort(f.v)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5 min-w-0">
          <Card title="Still to collect" sub="money earned but not yet in your hands" bodyClass="pb-1">
            <TableWrap minWidth={300}>
              <thead><tr><Th>Source</Th><Th right>Amount</Th></tr></thead>
              <tbody>
                {toCollect.map((r) => (
                  <tr key={r.key}>
                    <Td><p className="font-medium text-[#1d1716]">{r.label}</p><p className="text-xs text-gray-500">{r.sub}</p></Td>
                    <Td right className={r.v ? 'font-semibold text-[#ae754d] whitespace-nowrap' : 'text-gray-400'}>{r.v ? pesoShort(r.v) : '–'}</Td>
                  </tr>
                ))}
                <tr><Td className="font-bold text-[#1d1716]">Total</Td><Td right className="font-bold text-[#ae754d]">{pesoShort(m.notCollected)}</Td></tr>
              </tbody>
            </TableWrap>
          </Card>

          <Card title="Delivery fees vs rider cost" sub={`${m.delivered.length} delivered · rider cost = ₱60 base + 50% of fee`}>
            <ul className="space-y-3">
              {[
                { label: 'Fee income', sub: 'charged to customers', v: m.feeIncome, color: C.green },
                { label: 'Rider cost', sub: 'estimated payout', v: m.riderCost, color: C.red },
              ].map((r) => (
                <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0"><p className="text-sm font-medium text-[#1d1716]">{r.label}</p><p className="text-xs text-gray-500">{r.sub}</p></div>
                  <HBar value={r.v} max={maxFee} color={r.color} className="h-3 [&>div]:h-3" />
                  <span className="text-right text-sm font-semibold tabular-nums text-[#1d1716]">{pesoShort(r.v)}</span>
                </li>
              ))}
            </ul>
            <p className={cn('mt-3 text-xs font-medium', m.feeIncome - m.riderCost >= 0 ? 'text-[#1f6b3f]' : 'text-[#c8151d]')}>
              Net delivery {m.feeIncome - m.riderCost >= 0 ? 'margin' : 'subsidy'}: {peso(Math.abs(m.feeIncome - m.riderCost))}
            </p>
          </Card>
        </div>
      </div>

      <Card title="Payments by method" sub="fee rate = gateway fees ÷ collected · net = collected − fees − refunds" bodyClass="pb-1">
        <TableWrap minWidth={860}>
          <thead><tr><Th>Method</Th><Th right>Orders</Th><Th right>Collected</Th><Th right>Pending</Th><Th right>Gateway fees</Th><Th right>Rate</Th><Th right>Net</Th><Th right>vs prev</Th></tr></thead>
          <tbody>
            {methods.map((r) => (
              <tr key={r.key}>
                <Td className="font-medium text-[#1d1716] whitespace-nowrap">{r.name}</Td>
                <Td right>{r.orders}</Td>
                <Td right className="font-semibold text-[#1d1716]">{pesoShort(r.collected)}</Td>
                <Td right className="whitespace-nowrap">
                  {r.pending ? <span className="font-semibold text-[#ae754d]">{pesoShort(r.pending)}</span> : <span className="text-gray-400">–</span>}
                  {r.key === 'cod' && r.held > 0 && <span className="block text-[11px] text-gray-500">{pesoShort(r.held)} with riders</span>}
                  {r.key === 'pay_at_pickup' && r.pending > 0 && <span className="block text-[11px] text-gray-500">awaiting pickup</span>}
                </Td>
                <Td right className={r.fees ? 'text-[#c8151d]' : 'text-gray-400'}>{r.fees ? `−${pesoShort(r.fees)}` : '–'}</Td>
                <Td right className="text-gray-600">{r.fees ? pctOf(r.fees, r.collected) : '–'}</Td>
                <Td right className="font-semibold text-[#1d1716]">{pesoShort(r.net)}</Td>
                <Td right className="text-xs whitespace-nowrap"><VsPrev cur={r.collected} prev={prevMethods.get(r.key)?.collected ?? 0} /></Td>
              </tr>
            ))}
            {methods.length === 0 && <EmptyRow cols={8} text="No payments in this period" />}
            {methods.length > 0 && (
              <tr className="bg-[#faf6f2] font-bold text-[#1d1716]">
                <Td>Total</Td>
                <Td right>{tot.orders}</Td>
                <Td right>{pesoShort(tot.collected)}</Td>
                <Td right className="text-[#ae754d]">{tot.pending ? pesoShort(tot.pending) : '–'}</Td>
                <Td right className="text-[#c8151d]">{tot.fees ? `−${pesoShort(tot.fees)}` : '–'}</Td>
                <Td right>{tot.fees ? pctOf(tot.fees, tot.collected) : '–'}</Td>
                <Td right>{pesoShort(tot.net)}</Td>
                <Td right className="text-xs"><VsPrev cur={tot.collected} prev={tot.prev} /></Td>
              </tr>
            )}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="Refunds" sub={m.refundOrders.length ? refundSummary(m.refundOrders) : 'no refunds in this period'} bodyClass="pb-1">
        <TableWrap minWidth={620}>
          <thead><tr><Th>Order</Th><Th>Reason</Th><Th>Method</Th><Th>Status</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {m.refundOrders.map((o) => (
              <tr key={o.id}>
                <Td><OrderLink o={o} /></Td>
                <Td className="text-gray-600">{o.rejectReason ?? '—'}</Td>
                <Td className="text-gray-600 whitespace-nowrap">{PAY_NAME[o.paymentMethod]}</Td>
                <Td><PayChip status={o.paymentStatus} /></Td>
                <Td right className="font-semibold text-[#c8151d] whitespace-nowrap">−{peso(o.refundedAmount)}</Td>
              </tr>
            ))}
            {m.refundOrders.length === 0 && <EmptyRow cols={5} text="No refunds in this period" />}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
