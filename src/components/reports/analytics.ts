// Shared analytics helpers for Dashboard / Reports / Customers (module-local, not a shared lib file).
import type { AppState, Order } from '@/src/lib/types';
import { getSetting, num, OPEN_STATUSES, lineTotal } from '@/src/lib/logic';

export const BLUE = '#c8151d';
export const CHART_COLORS = ['#c8151d', '#0891b2', '#16a34a', '#f59e0b', '#9333ea', '#dc2626', '#64748b'];

export const DAY = 86_400_000;

export function dayKey(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}
export function dayLabel(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Revenue-bearing order (not cancelled). Net of refunds. */
export const isSale = (o: Order) => o.status !== 'cancelled';
export const netSales = (o: Order) => (isSale(o) ? o.total - (o.refundedAmount ?? 0) : 0);

export function sum<T>(arr: T[], f: (x: T) => number) {
  let t = 0;
  for (const x of arr) t += f(x) || 0;
  return t;
}

export function groupBy<T>(arr: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** On-hand map for every product/branch in one pass over the ledger. */
export function onHandMap(s: AppState) {
  const m = new Map<string, number>();
  for (const mv of s.movements) {
    const k = `${mv.productId}|${mv.branchId}`;
    m.set(k, (m.get(k) ?? 0) + mv.qty);
  }
  return m;
}

export function lowStockList(s: AppState, branchIds: string[]) {
  const oh = onHandMap(s);
  const rows: { productId: string; name: string; image: string; branchId: string; onHand: number; threshold: number }[] = [];
  for (const bid of branchIds) {
    const b = s.branches.find((x) => x.id === bid);
    if (!b || b.status === 'closed') continue;
    const th = num(getSetting(s, 'lowStockThreshold', bid));
    for (const p of s.products) {
      if (p.status !== 'active') continue;
      const q = oh.get(`${p.id}|${bid}`) ?? 0;
      const limit = Math.max(th, p.reorderPoint ?? 0);
      if (q <= limit) rows.push({ productId: p.id, name: p.name, image: p.image, branchId: bid, onHand: q, threshold: limit });
    }
  }
  return rows.sort((a, b) => a.onHand - b.onHand);
}

/** An open order is delayed when it has waited longer than its confirmation / prep / delivery target. */
export function isDelayed(s: AppState, o: Order, now = Date.now()) {
  if (!OPEN_STATUSES.includes(o.status)) return false;
  const mins = (now - new Date(o.placedAt).getTime()) / 60000;
  if (o.status === 'awaiting_confirmation' || o.status === 'placed') return mins > (num(getSetting(s, 'confirmTimeoutMins', o.branchId)) || 10);
  const target = (o.prepMinutes || 20) + (o.fulfillment === 'delivery' ? 45 : 15);
  return mins > target;
}

/** Minutes between the first timeline event of `from` and of `to`. */
export function stepMinutes(o: Order, from: string[], to: string[]) {
  const a = o.timeline.find((e) => from.includes(e.status));
  const b = o.timeline.find((e) => to.includes(e.status));
  if (!a || !b) return undefined;
  const m = (new Date(b.at).getTime() - new Date(a.at).getTime()) / 60000;
  return m >= 0 ? m : undefined;
}

export function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function pctChange(cur: number, prev: number) {
  if (!prev) return cur ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

export function itemQty(i: Order['items'][number]) {
  return i.soldByWeight ? (i.actualWeightKg ?? i.estWeightKg ?? 1) : i.qty;
}
export { lineTotal };
