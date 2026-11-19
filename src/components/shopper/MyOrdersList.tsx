'use client';

// Customer "My orders" page: orders in progress as cards, then the order history as a paged table.

import { useState } from 'react';
import Link from 'next/link';
import {
  Bike, ChevronLeft, ChevronRight, CircleCheck, Clock, Package, Phone, ReceiptText, RotateCcw, Scissors, Search, Store, TriangleAlert,
} from 'lucide-react';
import type { Order, OrderItem, OrderStatus } from '@/src/lib/types';
import { fmtTime, isToday, OPEN_STATUSES, PAYMENT_LABEL, peso, riderPosition, setOrderStatus, STATUS_LABEL } from '@/src/lib/logic';
import { useTick } from '@/src/lib/store';
import { cn } from '@/src/lib/utils';
import { ProductImage as PhotoImg } from '@/src/components/ProductImage';
import { Container, PrimaryButton, Sheet, reorderToCart, useMe, useShop } from './shared';
import { CANCEL_REASONS, canCancel, isDone } from './orderRules';

const PAGE_SIZE = 10;
type Tab = 'all' | 'completed' | 'cancelled';

const isEnded = (o: Order) => o.status === 'cancelled' || o.status === 'failed_delivery';

/** "Nov 18, 2026, 4:05 AM" */
const fmtFull = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "NOVEMBER 2026" */
const monthKey = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

/** Neighbourhood of an address line: "Purok 3, Dawis, Digos City" → "Dawis". */
function area(line: string) {
  const parts = line.split(',').map((x) => x.trim()).filter((x) => x && !/digos city|davao/i.test(x));
  return parts[parts.length - 1] ?? line;
}

function matches(o: Order, q: string) {
  if (!q) return true;
  const n = q.toLowerCase();
  return o.number.toLowerCase().includes(n) || o.items.some((i) => i.name.toLowerCase().includes(n) || i.substitute?.name.toLowerCase().includes(n));
}

// ---------- status look ----------
type Tone = 'blue' | 'amber' | 'green' | 'charcoal' | 'grey';
const TONE: Record<Tone, { border: string; pill: string; dot: string }> = {
  blue: { border: 'border-t-[#2c4f9e]', pill: 'bg-[#e6ecf8] text-[#2c4f9e]', dot: 'bg-[#2c4f9e]' },
  amber: { border: 'border-t-[#d4740c]', pill: 'bg-[#fdf0e1] text-[#a85a06]', dot: 'bg-[#d4740c]' },
  green: { border: 'border-t-[#1f6b3f]', pill: 'bg-[#e7f2ec] text-[#1f6b3f]', dot: 'bg-[#1f6b3f]' },
  charcoal: { border: 'border-t-[#2a2322]', pill: 'bg-[#efe9e4] text-[#2a2322]', dot: 'bg-[#2a2322]' },
  grey: { border: 'border-t-gray-300', pill: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
};
const STATUS_TONE: Record<OrderStatus, Tone> = {
  placed: 'amber', awaiting_confirmation: 'amber', awaiting_shopper: 'amber',
  confirmed: 'charcoal', preparing: 'charcoal',
  ready: 'green', out_for_delivery: 'blue',
  delivered: 'green', collected: 'green',
  cancelled: 'grey', failed_delivery: 'grey',
};

function StatusPill({ status, className }: { status: OrderStatus; className?: string }) {
  const t = TONE[STATUS_TONE[status]];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', t.pill, className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', t.dot)} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------- item thumbnails ----------
function Thumbs({ items, size = 'md' }: { items: OrderItem[]; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
  const extra = items.length - 3;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {items.slice(0, 3).map((i, n) => (
        <span key={`${i.productId}-${n}`} className={cn('relative overflow-hidden rounded-md bg-[#f3ebe4] border border-[#eadfd6] shrink-0 flex items-center justify-center text-lg', box)} aria-hidden>
          <PhotoImg image={i.substitute?.status === 'accepted' ? i.substitute.image : i.image} fill />
        </span>
      ))}
      {extra > 0 && <span className={cn('rounded-md bg-[#efe9e4] text-xs font-semibold text-gray-700 shrink-0 flex items-center justify-center', box)}>+{extra}</span>}
      <span className="ml-1 text-sm text-gray-600 whitespace-nowrap">{items.length} item{items.length === 1 ? '' : 's'}</span>
    </div>
  );
}

const btnOutline = 'h-11 md:h-10 px-4 rounded-lg border border-[#d9ccc1] bg-white text-sm font-semibold text-[#2a2322] hover:border-[#2a2322] inline-flex items-center justify-center gap-1.5 whitespace-nowrap';
const btnDark = 'h-11 md:h-10 px-4 rounded-lg bg-[#2a2322] hover:bg-black text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap';

// ====================== PAGE ======================
export function OrdersScreen() {
  useTick(15000); // keeps the rider ETA fresh
  const { s, go, branch, flash } = useShop();
  const me = useMe();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(0);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [reorderResult, setReorderResult] = useState<{ added: string[]; flagged: string[] } | null>(null);

  const mine = s.orders.filter((o) => o.customerId === me.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const open = mine.filter((o) => OPEN_STATUSES.includes(o.status));
  const past = mine.filter((o) => !OPEN_STATUSES.includes(o.status));
  const first = mine[mine.length - 1];
  const since = first ? new Date(first.placedAt).toLocaleString('en-US', { month: 'short', year: 'numeric' }) : '';

  const query = q.trim();
  const openShown = open.filter((o) => matches(o, query));
  const pastSearched = past.filter((o) => matches(o, query));
  const counts = { all: pastSearched.length, completed: pastSearched.filter(isDone).length, cancelled: pastSearched.filter(isEnded).length };
  const history = pastSearched.filter((o) => (tab === 'all' ? true : tab === 'completed' ? isDone(o) : isEnded(o)));
  const pages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pg = Math.min(page, pages - 1);
  const rows = history.slice(pg * PAGE_SIZE, pg * PAGE_SIZE + PAGE_SIZE);

  const reorder = (o: Order) => {
    const { added, flagged } = reorderToCart(o, branch.id);
    if (flagged.length) setReorderResult({ added, flagged });
    else { flash(`${added.length} item${added.length === 1 ? '' : 's'} added to cart`); go({ name: 'cart' }); }
  };

  return (
    <Container className="max-w-[1280px] pb-10">
      <nav className="hidden md:flex items-center gap-1.5 text-sm text-gray-500 pt-6" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[#c8151d]">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        <span className="font-semibold text-[#2a2322]">My orders</span>
      </nav>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 pt-4 md:pt-5">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-[32px] font-semibold text-[#2a2322] leading-tight">My orders</h1>
          {mine.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {mine.length} order{mine.length === 1 ? '' : 's'} since {since}{open.length > 0 && ` · ${open.length} in progress`}
            </p>
          )}
        </div>
        {mine.length > 0 && (
          <label className="relative w-full md:w-[400px]">
            <span className="sr-only">Search order number or item</span>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
            <input
              type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search order number or item"
              className="w-full h-12 rounded-lg border border-[#eadfd6] bg-[#fffdfb] pl-10 pr-3 text-base md:text-sm outline-none focus:border-[#2a2322]"
            />
          </label>
        )}
      </div>

      {mine.length === 0 && (
        <div className="mt-8 rounded-xl border border-[#eadfd6] bg-[#fffdfb] text-center py-16 px-8">
          <ReceiptText className="w-10 h-10 mx-auto text-gray-300" aria-hidden />
          <p className="text-base font-semibold mt-3">No orders yet</p>
          <p className="text-sm text-gray-600 mt-1">Your orders will show up here once you check out.</p>
          <Link href="/category" className="mt-5 h-11 px-6 rounded-lg bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm inline-flex items-center">Start shopping</Link>
        </div>
      )}

      {/* In progress */}
      {openShown.length > 0 && (
        <section className="mt-8 md:mt-10" aria-labelledby="in-progress">
          <h2 id="in-progress" className="text-lg md:text-xl font-semibold text-[#2a2322] mb-3">In progress</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {openShown.map((o) => <ProgressCard key={o.id} o={o} onCancel={() => setCancelling(o)} />)}
          </div>
        </section>
      )}

      {/* History */}
      {past.length > 0 && (
        <section className="mt-8 md:mt-12" aria-labelledby="history">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 border-b border-[#eadfd6]">
            <h2 id="history" className="text-lg md:text-xl font-semibold text-[#2a2322] pb-2 sm:pb-3">Order history</h2>
            <div className="flex gap-1 -mb-px overflow-x-auto fm-noscroll" role="tablist" aria-label="Filter order history">
              {(['all', 'completed', 'cancelled'] as Tab[]).map((t) => (
                <button
                  key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setPage(0); }}
                  className={cn('shrink-0 h-11 px-3 text-sm border-b-2 capitalize whitespace-nowrap', tab === t ? 'border-[#c8151d] text-[#2a2322] font-semibold' : 'border-transparent text-gray-600 hover:text-[#2a2322]')}
                >
                  {t} <span className="ml-1 text-gray-400 font-normal">{counts[t]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#eadfd6] bg-[#fffdfb] overflow-hidden">
            <div className={cn(ROW_GRID, 'hidden md:grid px-5 py-3 border-b border-[#eadfd6] text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase')}>
              <span>Order</span><span>Items</span><span>Fulfilment</span><span>Status</span><span className="text-right">Total</span><span aria-hidden />
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-gray-600">{query ? `No orders match “${query}”.` : 'No orders here yet.'}</p>
            ) : (
              rows.map((o, i) => {
                const m = monthKey(o.placedAt);
                const newMonth = i === 0 || monthKey(rows[i - 1].placedAt) !== m;
                return (
                  <div key={o.id}>
                    {newMonth && <p className="px-4 md:px-5 py-2.5 bg-[#f7f2ed] border-b border-[#eadfd6] text-xs font-semibold tracking-[0.08em] text-gray-600">{m}</p>}
                    <HistoryRow o={o} onReorder={reorder} />
                  </div>
                );
              })
            )}
            {history.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 md:px-5 py-3.5 border-t border-[#eadfd6]">
                <p className="text-sm text-gray-600">Showing {pg * PAGE_SIZE + 1}–{pg * PAGE_SIZE + rows.length} of {history.length} order{history.length === 1 ? '' : 's'}</p>
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <button onClick={() => setPage(pg - 1)} disabled={pg === 0} className="w-11 h-11 rounded-lg border border-[#d9ccc1] bg-white flex items-center justify-center disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-sm font-semibold text-[#2a2322] whitespace-nowrap">Page {pg + 1} of {pages}</span>
                  <button onClick={() => setPage(pg + 1)} disabled={pg >= pages - 1} className="w-11 h-11 rounded-lg border border-[#d9ccc1] bg-white flex items-center justify-center disabled:opacity-40" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {mine.length > 0 && query && openShown.length === 0 && past.length === 0 && (
        <p className="mt-10 text-center text-sm text-gray-600">No orders match “{query}”.</p>
      )}

      <CancelOrderSheet o={cancelling} onClose={() => setCancelling(null)} />

      <Sheet open={!!reorderResult} onClose={() => setReorderResult(null)} title="Reorder">
        {reorderResult && (
          <div className="text-sm">
            <p className="text-gray-800"><b>{reorderResult.added.length}</b> item{reorderResult.added.length === 1 ? '' : 's'} added to your cart.</p>
            <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><TriangleAlert className="w-3.5 h-3.5" /> Unavailable at {branch.name} right now</p>
              <ul className="mt-1.5 text-xs text-amber-900 list-disc pl-5">{reorderResult.flagged.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
            <PrimaryButton onClick={() => { setReorderResult(null); go({ name: 'cart' }); }} className="mt-4">View cart</PrimaryButton>
          </div>
        )}
      </Sheet>
    </Container>
  );
}

// ---------- In-progress card ----------
const DELIVERY_STEPS = ['Placed', 'Confirmed', 'Preparing', 'On the way', 'Delivered'];
const PICKUP_STEPS = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Collected'];
function progressIndex(o: Order) {
  const m: Partial<Record<OrderStatus, number>> = {
    placed: 0, awaiting_confirmation: 0, confirmed: 1, preparing: 2, awaiting_shopper: 2,
    ready: o.fulfillment === 'pickup' ? 3 : 2, out_for_delivery: 3, delivered: 4, collected: 4,
  };
  return m[o.status] ?? 0;
}

function ProgressCard({ o, onCancel }: { o: Order; onCancel: () => void }) {
  const { s } = useShop();
  const me = useMe();
  const b = s.branches.find((x) => x.id === o.branchId);
  const rider = s.riders.find((r) => r.id === o.riderId);
  const steps = o.fulfillment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const idx = progressIndex(o);
  const placed = isToday(o.placedAt) ? `${fmtTime(o.placedAt)} today` : fmtFull(o.placedAt);
  const where = o.fulfillment === 'delivery' && o.address ? `Delivery to ${o.address.label}, ${area(o.address.line)}` : `Pickup at ${b?.name ?? 'the shop'}`;
  const cancellable = canCancel(s, o);

  let info: { icon: React.ReactNode; title: string; sub: string; call?: string };
  switch (o.status) {
    case 'out_for_delivery': {
      const eta = riderPosition(s, o).etaMins;
      info = {
        icon: <Bike className="w-5 h-5" />, title: `Arriving in about ${eta} minute${eta === 1 ? '' : 's'}`,
        sub: rider ? `Rider ${rider.name} · ${rider.plate}` : 'Your rider is on the way', call: rider?.phone,
      };
      break;
    }
    case 'placed':
    case 'awaiting_confirmation':
      info = { icon: <Clock className="w-5 h-5" />, title: 'Waiting for the shop to confirm', sub: 'Usually within 5 minutes. We’ll text you once your order is confirmed.' };
      break;
    case 'confirmed':
      info = { icon: <CircleCheck className="w-5 h-5" />, title: 'Order confirmed', sub: o.autoConfirmed ? `Paid with ${PAYMENT_LABEL[o.paymentMethod]}. Our butchers will start on it soon.` : 'Our butchers will start preparing your order soon.' };
      break;
    case 'preparing':
      info = { icon: <Scissors className="w-5 h-5" />, title: 'Preparing your order', sub: `${o.pickerName ?? 'Our butcher'} is cutting and weighing your meat.` };
      break;
    case 'awaiting_shopper':
      info = { icon: <Phone className="w-5 h-5" />, title: 'The shop will call you', sub: `An item is unavailable. Expect a call at ${me.mobile || 'your mobile number'}.` };
      break;
    case 'ready':
      info = o.fulfillment === 'pickup'
        ? { icon: <Store className="w-5 h-5" />, title: 'Ready for pickup', sub: `Show pickup PIN ${o.pickupPin} at the ${b?.pickupInstructions.toLowerCase() ?? 'counter'}.` }
        : { icon: <Package className="w-5 h-5" />, title: 'Packed and ready', sub: rider ? `${rider.name} is heading to the shop to collect it.` : 'Waiting for a rider to collect it.' };
      break;
    default:
      info = { icon: <Clock className="w-5 h-5" />, title: STATUS_LABEL[o.status], sub: '' };
  }

  return (
    <article className={cn('rounded-xl border border-[#eadfd6] border-t-[3px] bg-[#fffdfb] p-4 md:p-5 flex flex-col min-w-0', TONE[STATUS_TONE[o.status]].border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
          <Link href={`/my-orders/${o.id}`} className="text-base md:text-lg font-bold text-[#2a2322] hover:text-[#c8151d]">{o.number}</Link>
          <StatusPill status={o.status} />
        </div>
        <p className="text-base md:text-lg font-bold text-[#2a2322] tabular-nums shrink-0">{peso(o.total)}</p>
      </div>
      <p className="text-sm text-gray-600 mt-1">Placed {placed} · {where}</p>

      {/* 5-step progress */}
      <ol className="grid grid-cols-5 gap-1.5 mt-4" aria-label="Order progress">
        {steps.map((st, i) => (
          <li key={st} className="min-w-0" aria-current={i === idx ? 'step' : undefined}>
            <span className={cn('block h-1 rounded-full', i <= idx ? 'bg-[#c8151d]' : 'bg-[#e9e1d9]')} />
            <span className={cn('block mt-2 text-[11px] sm:text-xs truncate', i === idx ? 'font-semibold text-[#2a2322]' : 'text-gray-500')}>{st}</span>
          </li>
        ))}
      </ol>

      {/* Status info */}
      <div className="mt-3 rounded-lg bg-[#f4efea] px-3.5 py-3 flex items-center gap-3">
        <span className="text-[#2a2322] shrink-0" aria-hidden>{info.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#2a2322]">{info.title}</p>
          {info.sub && <p className="text-xs text-gray-600 mt-0.5">{info.sub}</p>}
        </div>
        {info.call && (
          <a href={`tel:${info.call.replace(/[^\d+]/g, '')}`} className="w-11 h-11 rounded-full border border-[#d9ccc1] bg-white flex items-center justify-center shrink-0 hover:border-[#2a2322]" aria-label={`Call ${rider?.name ?? 'rider'}`}>
            <Phone className="w-4 h-4" />
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Thumbs items={o.items} />
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Link href={`/my-orders/${o.id}`} className={btnOutline}>Order details</Link>
          {o.status === 'out_for_delivery' ? (
            <Link href={`/my-orders/${o.id}`} className={btnDark}>Track on map</Link>
          ) : cancellable ? (
            <button onClick={onCancel} className={btnDark}>Cancel order</button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ---------- History row (table on desktop, stacked card on phones) ----------
const ROW_GRID = 'md:grid-cols-[minmax(150px,1.1fr)_minmax(0,2fr)_100px_130px_110px_168px] md:gap-4 md:items-center';

function HistoryRow({ o, onReorder }: { o: Order; onReorder: (o: Order) => void }) {
  const receipt = (
    <Link href={`/my-orders/${o.id}/receipt`} className="w-11 h-11 md:w-10 md:h-10 rounded-lg border border-[#d9ccc1] bg-white flex items-center justify-center shrink-0 hover:border-[#2a2322]" aria-label={`Receipt for ${o.number}`} title="Receipt">
      <ReceiptText className="w-4 h-4" />
    </Link>
  );
  return (
    <div className={cn(ROW_GRID, 'grid grid-cols-1 gap-3 px-4 md:px-5 py-4 border-b border-[#f0e7df] last:border-b-0')}>
      <div className="flex items-start justify-between gap-3 md:block min-w-0">
        <div className="min-w-0">
          <Link href={`/my-orders/${o.id}`} className="text-sm md:text-[15px] font-bold text-[#2a2322] hover:text-[#c8151d]">{o.number}</Link>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">{fmtFull(o.placedAt)}</p>
        </div>
        <p className="md:hidden text-base font-bold tabular-nums shrink-0">{peso(o.total)}</p>
      </div>
      <Thumbs items={o.items} size="sm" />
      <div className="flex items-center gap-2 md:contents">
        <span className="text-sm text-gray-700">{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
        <span className="md:hidden text-gray-300" aria-hidden>·</span>
        <span><StatusPill status={o.status} /></span>
      </div>
      <p className="hidden md:block text-[15px] font-bold tabular-nums text-right">{peso(o.total)}</p>
      <div className="flex items-center gap-2 md:justify-end">
        {!isEnded(o) && (
          <button onClick={() => onReorder(o)} className={cn(btnOutline, 'flex-1 md:flex-none')}><RotateCcw className="w-4 h-4" /> Reorder</button>
        )}
        {receipt}
      </div>
    </div>
  );
}

// ---------- Cancel ----------
function CancelOrderSheet({ o, onClose }: { o: Order | null; onClose: () => void }) {
  const { s, flash } = useShop();
  const me = useMe();
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  return (
    <Sheet open={!!o} onClose={onClose} title={o ? `Cancel ${o.number}?` : ''}>
      {o && (
        <>
          <p className="text-sm text-gray-700 mb-3">{o.paymentStatus === 'paid' ? `Your payment of ${peso(o.total)} will be refunded automatically to ${PAYMENT_LABEL[o.paymentMethod]}.` : 'No payment has been collected for this order.'}</p>
          <div className="space-y-2" role="radiogroup" aria-label="Reason">
            {CANCEL_REASONS.map((r) => (
              <button key={r} role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className={cn('w-full text-left rounded-lg border px-3 min-h-12 text-sm', reason === r ? 'border-[#c8151d] bg-[#fdf5f5]' : 'border-gray-200')}>{r}</button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={onClose} className="h-12 rounded-lg border border-[#d9ccc1] text-sm font-semibold text-[#2a2322]">Keep order</button>
            <button
              onClick={() => {
                const cur = s.orders.find((x) => x.id === o.id);
                if (!cur || !canCancel(s, cur)) { flash('This order can no longer be cancelled', 'err'); onClose(); return; }
                setOrderStatus(o.id, 'cancelled', { by: me.name, note: `Cancelled by customer: ${reason}` });
                onClose();
                flash('Order cancelled');
              }}
              className="h-12 rounded-lg bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm"
            >
              Cancel order
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
