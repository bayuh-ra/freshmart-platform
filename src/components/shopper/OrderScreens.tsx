'use client';

import { useState } from 'react';
import { Bike, Camera, Check, ChevronRight, CircleX, Clock, Download, Flag, MessageCircle, Phone, PhoneOff, RotateCcw, Share2, Star, Store, TriangleAlert } from 'lucide-react';
import type { Conversation, Order, OrderItem } from '@/src/lib/types';
import { mutate, uid } from '@/src/lib/store';
import {
  applyStatus, available, fmtDateTime, fmtTime, getSetting, lineTotal, num, OPEN_STATUSES, PAYMENT_LABEL, peso, recalc, riderPosition, setOrderStatus, STATUS_LABEL,
} from '@/src/lib/logic';
import { useTick } from '@/src/lib/store';
import { StatusBadge } from '@/src/components/common';
import { MapView } from '@/src/components/MapView';
import { cn } from '@/src/lib/utils';
import { Card, PrimaryButton, ScreenHeader, Sheet, SUB_LABEL, useShop } from './shared';

// ---------- helpers ----------
const CANCEL_UNTIL: Record<string, string[]> = {
  Placed: ['placed', 'awaiting_confirmation'],
  Confirmed: ['placed', 'awaiting_confirmation', 'confirmed'],
  Preparing: ['placed', 'awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper'],
};
function canCancel(s: ReturnType<typeof useShop>['s'], o: Order) {
  const w = String(getSetting(s, 'cancelWindowStatus', o.branchId) || 'Confirmed');
  return (CANCEL_UNTIL[w] ?? CANCEL_UNTIL.Confirmed).includes(o.status);
}
function msUntil(t: number) {
  return Math.max(0, t - Date.now());
}
const isDone = (o: Order) => o.status === 'delivered' || o.status === 'collected';

/** Open (or create) a conversation and return its id. */
function openConversation(kind: Conversation['kind'], o: Order, customerName: string, opts: { category?: Conversation['category']; system?: string; firstMessage?: string } = {}) {
  let id = '';
  mutate((d) => {
    let cv = d.conversations.find((c) => c.kind === kind && c.orderId === o.id && c.customerId === o.customerId && (kind === 'rider' || c.status !== 'resolved'));
    const existed = !!cv;
    const now = new Date().toISOString();
    if (!cv) {
      cv = {
        id: uid('cv'), kind, customerId: o.customerId, customerName, orderId: o.id, branchId: o.branchId, category: opts.category ?? 'Other',
        status: 'open', priority: kind === 'support' && opts.category && opts.category !== 'Other' ? 'high' : 'normal', messages: [], unreadStaff: 0, unreadShopper: 0, updatedAt: now,
      };
      if (kind === 'rider') cv.messages.push({ from: 'system', name: 'System', text: `Masked chat for order ${o.number}. Phone numbers stay private.`, at: now });
      d.conversations.unshift(cv);
    }
    if (opts.system && (!existed || opts.firstMessage)) { cv.messages.push({ from: 'system', name: 'System', text: opts.system, at: now }); cv.unreadStaff += 1; }
    if (opts.firstMessage) { cv.messages.push({ from: 'shopper', name: customerName, text: opts.firstMessage, at: now }); }
    if (opts.category && opts.category !== 'Other') cv.category = opts.category;
    cv.status = 'open';
    cv.updatedAt = now;
    id = cv.id;
  });
  return id;
}

// ====================== ORDERS LIST ======================
type Filter = 'all' | 'active' | 'completed' | 'cancelled';

export function OrdersScreen() {
  const { s, shopper, go, branch, flash } = useShop();
  const [filter, setFilter] = useState<Filter>('all');
  const [reorderResult, setReorderResult] = useState<{ added: string[]; flagged: string[] } | null>(null);
  const mine = s.orders.filter((o) => o.customerId === shopper.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const list = mine.filter((o) =>
    filter === 'all' ? true : filter === 'active' ? OPEN_STATUSES.includes(o.status) : filter === 'completed' ? isDone(o) : o.status === 'cancelled' || o.status === 'failed_delivery');
  const active = list.filter((o) => OPEN_STATUSES.includes(o.status));
  const past = list.filter((o) => !OPEN_STATUSES.includes(o.status));

  const reorder = (o: Order) => {
    const added: string[] = [];
    const flagged: string[] = [];
    mutate((d) => {
      for (const i of o.items) {
        const p = d.products.find((x) => x.id === i.productId);
        if (!p || p.status !== 'active' || available(d, p.id, branch.id) <= 0) { flagged.push(i.name); continue; }
        const l = d.cart.find((c) => c.productId === p.id);
        if (l) l.qty += i.qty; else d.cart.push({ productId: p.id, qty: i.qty, note: i.note, subPref: i.subPref });
        added.push(i.name);
      }
    });
    if (flagged.length) setReorderResult({ added, flagged });
    else { flash(`${added.length} items added to cart`); go({ name: 'cart' }); }
  };

  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title="My orders" sub={`${mine.length} orders`} />
      <div className="flex gap-2 px-4 py-3 overflow-x-auto fm-noscroll">
        {(['all', 'active', 'completed', 'cancelled'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('shrink-0 h-8 px-3.5 rounded-full text-xs font-medium border capitalize', filter === f ? 'bg-[#1e40af] text-white border-[#1e40af]' : 'bg-white text-gray-700 border-gray-200')}>{f}</button>
        ))}
      </div>
      {list.length === 0 && (
        <div className="text-center py-16 px-8">
          <p className="text-5xl">🧾</p>
          <p className="text-sm font-semibold mt-3">No orders here yet</p>
          <PrimaryButton onClick={() => go({ name: 'home' })} className="mt-5 w-44 mx-auto">Start shopping</PrimaryButton>
        </div>
      )}
      {active.length > 0 && <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active</p>}
      <div className="px-4 space-y-3">{active.map((o) => <OrderCard key={o.id} o={o} onReorder={reorder} />)}</div>
      {past.length > 0 && <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5 mb-2">Past orders</p>}
      <div className="px-4 space-y-3">{past.map((o) => <OrderCard key={o.id} o={o} onReorder={reorder} />)}</div>

      <Sheet open={!!reorderResult} onClose={() => setReorderResult(null)} title="Reorder">
        {reorderResult && (
          <div className="text-sm">
            <p className="text-gray-700"><b>{reorderResult.added.length}</b> item{reorderResult.added.length === 1 ? '' : 's'} added to your cart.</p>
            <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><TriangleAlert className="w-3.5 h-3.5" /> Unavailable at {branch.name} right now</p>
              <ul className="mt-1.5 text-xs text-amber-900 list-disc pl-5">{reorderResult.flagged.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
            <PrimaryButton onClick={() => { setReorderResult(null); go({ name: 'cart' }); }} className="mt-4">View cart</PrimaryButton>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function OrderCard({ o, onReorder }: { o: Order; onReorder: (o: Order) => void }) {
  const { s, go } = useShop();
  const b = s.branches.find((x) => x.id === o.branchId);
  const open = OPEN_STATUSES.includes(o.status);
  const ratingsOn = getSetting(s, 'ff_ratings', o.branchId) !== false;
  return (
    <Card className="p-3.5">
      <button onClick={() => go({ name: open ? 'track' : 'receipt', orderId: o.id })} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{o.number}</p>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">{b?.name} · {o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {fmtDateTime(o.placedAt)}</p>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex -space-x-1.5">
            {o.items.slice(0, 5).map((i) => <span key={i.productId} className="w-8 h-8 rounded-full bg-gray-50 border-2 border-white flex items-center justify-center text-base">{i.image}</span>)}
            {o.items.length > 5 && <span className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-gray-600">+{o.items.length - 5}</span>}
          </div>
          <p className="text-sm font-bold">{peso(o.total)}</p>
        </div>
      </button>
      <div className="flex gap-2 mt-3">
        {open ? (
          <button onClick={() => go({ name: 'track', orderId: o.id })} className="flex-1 h-9 rounded-xl bg-[#1e40af] text-white text-xs font-semibold">Track order</button>
        ) : (
          <>
            <button onClick={() => onReorder(o)} className="flex-1 h-9 rounded-xl bg-[#1e40af] text-white text-xs font-semibold flex items-center justify-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Reorder</button>
            <button onClick={() => go({ name: 'receipt', orderId: o.id })} className="flex-1 h-9 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">Receipt</button>
            {isDone(o) && ratingsOn && (
              o.rating ? (
                <span className="h-9 px-2.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-semibold flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{o.rating.order}</span>
              ) : (
                <button onClick={() => go({ name: 'rate', orderId: o.id })} className="h-9 px-3 rounded-xl border border-amber-300 text-amber-700 text-xs font-semibold">Rate</button>
              )
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ====================== TRACKING ======================
const DELIVERY_STEPS = [
  { key: 'placed', label: 'Placed' }, { key: 'confirmed', label: 'Confirmed' }, { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' }, { key: 'out_for_delivery', label: 'Out for delivery' }, { key: 'delivered', label: 'Delivered' },
];
const PICKUP_STEPS = [
  { key: 'placed', label: 'Placed' }, { key: 'confirmed', label: 'Confirmed' }, { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready for pickup' }, { key: 'collected', label: 'Collected' },
];
function stepIndex(o: Order) {
  const m: Record<string, number> = { placed: 0, awaiting_confirmation: 0, confirmed: 1, preparing: 2, awaiting_shopper: 2, ready: 3, out_for_delivery: 4, delivered: 5, collected: 4 };
  return m[o.status] ?? 0;
}

export function TrackScreen({ orderId }: { orderId: string }) {
  useTick(1000);
  const { s, shopper, go, flash } = useShop();
  const [calling, setCalling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Changed my mind');
  const [report, setReport] = useState<OrderItem | null>(null);
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return <><ScreenHeader title="Order" /><p className="p-8 text-center text-sm text-gray-500">Order not found.</p></>;
  const b = s.branches.find((x) => x.id === o.branchId)!;
  const rider = s.riders.find((r) => r.id === o.riderId);
  const steps = o.fulfillment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const idx = stepIndex(o);
  const ended = o.status === 'cancelled' || o.status === 'failed_delivery';
  const proposed = o.items.filter((i) => i.substitute?.status === 'proposed');
  const subMins = num(getSetting(s, 'subResponseMins', o.branchId)) || 5;
  const askedAt = [...o.timeline].reverse().find((e) => e.status === 'awaiting_shopper')?.at ?? o.updatedAt;
  const remaining = msUntil(new Date(askedAt).getTime() + subMins * 60_000);
  const pos = riderPosition(s, o);
  const chatOn = getSetting(s, 'ff_riderChat', o.branchId) !== false;
  const ratingsOn = getSetting(s, 'ff_ratings', o.branchId) !== false;
  const at = (k: string) => [...o.timeline].reverse().find((e) => e.status === k)?.at;

  const hero: Record<string, { title: string; sub: string; emoji: string }> = {
    placed: { title: 'Order placed', sub: `Sent to ${b.name} branch`, emoji: '📝' },
    awaiting_confirmation: { title: 'Waiting for confirmation', sub: `${b.name} branch will confirm your order shortly`, emoji: '⏳' },
    confirmed: { title: 'Order confirmed', sub: 'A picker will start shopping your items soon', emoji: '✅' },
    preparing: { title: 'Preparing your order', sub: `${o.pickerName ?? 'Our picker'} is picking fresh items for you`, emoji: '🧺' },
    awaiting_shopper: { title: 'We need your reply', sub: 'An item is out of stock — please choose below', emoji: '🙋' },
    ready: o.fulfillment === 'pickup' ? { title: 'Ready for pickup!', sub: `Show your QR code at ${b.pickupInstructions.toLowerCase()}`, emoji: '🛍️' } : { title: 'Packed & ready', sub: rider ? `${rider.name} is heading to the branch` : 'Waiting for a rider', emoji: '📦' },
    out_for_delivery: { title: `Arriving in ~${pos.etaMins} min`, sub: `${rider?.name ?? 'Your rider'} is on the way`, emoji: '🛵' },
    delivered: { title: 'Delivered', sub: `Enjoy your groceries, ${shopper.name.split(' ')[0]}!`, emoji: '🎉' },
    collected: { title: 'Collected', sub: 'Thank you for shopping with FreshMart', emoji: '🎉' },
    cancelled: { title: 'Order cancelled', sub: o.rejectReason ? `Reason: ${o.rejectReason}` : 'This order was cancelled', emoji: '✖️' },
    failed_delivery: { title: 'Delivery attempt failed', sub: 'We will contact you to reschedule', emoji: '⚠️' },
  };
  const h = hero[o.status];

  const respond = (item: OrderItem, action: 'accept' | 'reject' | 'refund') => {
    mutate((d) => {
      const od = d.orders.find((x) => x.id === o.id);
      if (!od) return;
      const it = od.items.find((x) => x.productId === item.productId);
      if (!it?.substitute) return;
      const before = od.total;
      const now = new Date().toISOString();
      if (action === 'accept') { it.substitute.status = 'accepted'; it.pickStatus = 'substituted'; }
      else if (action === 'reject') { it.substitute.status = 'rejected'; it.pickStatus = 'pending'; }
      else { it.substitute.status = 'rejected'; it.pickStatus = 'removed'; }
      recalc(od);
      const note = action === 'accept' ? `Shopper accepted ${it.substitute.name} for ${it.name}` : action === 'reject' ? `Shopper rejected ${it.substitute.name}; asked to pick another item for ${it.name}` : `Shopper chose refund for ${it.name}`;
      od.timeline.push({ status: 'note', at: now, by: shopper.name, note });
      const diff = Math.round((before - od.total) * 100) / 100;
      if (diff > 0 && od.paymentStatus === 'paid') {
        od.refundedAmount += diff;
        od.paymentStatus = 'partially_refunded';
        od.timeline.push({ status: 'refund', at: now, by: 'System', note: `Refund ${peso(diff)} to ${PAYMENT_LABEL[od.paymentMethod]}` });
      }
      if (!od.items.some((x) => x.substitute?.status === 'proposed') && od.status === 'awaiting_shopper') applyStatus(d, od.id, 'preparing', { by: shopper.name, note: 'Shopper replied to substitution' });
    });
    flash(action === 'accept' ? 'Substitute accepted' : action === 'reject' ? 'Store will find another option' : 'Item will be refunded');
  };

  const chatRider = () => {
    const id = openConversation('rider', o, shopper.name);
    go({ name: 'chat', convId: id });
  };

  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title={`Order ${o.number}`} sub={`${b.name} · ${o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · ${o.slot}`} right={<StatusBadge status={o.status} />} />

      {/* Hero */}
      <div className={cn('mx-4 mt-3 rounded-2xl p-4 text-white shadow-md', ended ? 'bg-gradient-to-br from-gray-500 to-gray-700' : isDone(o) ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-[#1e40af] to-[#2563eb]')}>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{h.emoji}</span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{h.title}</p>
            <p className="text-xs text-white/85">{h.sub}</p>
          </div>
        </div>
        {o.status === 'out_for_delivery' && (
          <div className="mt-3 h-1.5 bg-white/25 rounded-full overflow-hidden"><div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${Math.round(pos.progress * 100)}%` }} /></div>
        )}
        {o.autoConfirmed && !ended && <p className="mt-3 text-[11px] bg-white/15 rounded-lg px-2.5 py-1.5">⚡ Auto-confirmed — paid online with {PAYMENT_LABEL[o.paymentMethod]}</p>}
      </div>

      {/* Substitution requests */}
      {proposed.map((i) => (
        <Card key={i.productId} className="mx-4 mt-3 p-4 border-amber-300 bg-amber-50/40">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Substitution request</p>
            <span className={cn('text-xs font-bold tabular-nums px-2 py-0.5 rounded-full', remaining > 60_000 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-[#dc2626]')}>
              <Clock className="w-3 h-3 inline -mt-0.5 mr-1" />{Math.floor(remaining / 60000)}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1 rounded-xl bg-white border border-gray-200 p-2 text-center opacity-70">
              <p className="text-2xl">{i.image}</p>
              <p className="text-[11px] line-through text-gray-500 truncate">{i.name}</p>
              <p className="text-[10px] text-[#dc2626] font-semibold">Out of stock</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="flex-1 rounded-xl bg-white border-2 border-[#1e40af] p-2 text-center">
              <p className="text-2xl">{i.substitute!.image}</p>
              <p className="text-[11px] font-medium truncate">{i.substitute!.name}</p>
              <p className="text-[10px] text-[#1e40af] font-semibold">{peso(i.substitute!.unitPrice)}{i.soldByWeight ? '/kg' : ''}</p>
            </div>
          </div>
          {remaining === 0 && <p className="text-[11px] text-[#dc2626] mt-2">Time&apos;s up — the store will follow your preference ({SUB_LABEL[i.subPref]}).</p>}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button onClick={() => respond(i, 'accept')} className="h-9 rounded-xl bg-[#1e40af] text-white text-xs font-semibold">Accept</button>
            <button onClick={() => respond(i, 'reject')} className="h-9 rounded-xl border border-gray-300 bg-white text-xs font-semibold text-gray-700">Reject</button>
            <button onClick={() => respond(i, 'refund')} className="h-9 rounded-xl border border-red-200 bg-white text-xs font-semibold text-[#dc2626]">Refund</button>
          </div>
        </Card>
      ))}

      {/* Live map */}
      {o.status === 'out_for_delivery' && o.address && (
        <div className="mx-4 mt-3">
          <MapView
            key={o.id}
            center={[pos.lat, pos.lng]}
            zoom={14}
            fitToMarkers
            className="h-48"
            markers={[
              { id: 'b', lat: b.lat, lng: b.lng, label: '🏪', color: '#1e40af', title: `${b.name} branch` },
              { id: 'h', lat: o.address.lat, lng: o.address.lng, label: '🏠', color: '#059669', title: o.address.line },
              { id: 'r', lat: pos.lat, lng: pos.lng, label: '🛵', color: '#dc2626', title: rider?.name ?? 'Rider', pulse: true },
            ]}
            lines={[{ points: [[b.lat, b.lng], [pos.lat, pos.lng], [o.address.lat, o.address.lng]], color: '#1e40af', dashed: true }]}
          />
          <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live location · ETA {pos.etaMins} min</p>
        </div>
      )}

      {/* Rider card */}
      {rider && o.fulfillment === 'delivery' && !ended && (
        <Card className="mx-4 mt-3 p-3.5">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1e40af] to-indigo-400 text-white font-bold flex items-center justify-center text-lg">{rider.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{rider.name}</p>
              <p className="text-[11px] text-gray-500 capitalize">{rider.vehicle} · {rider.plate}</p>
              <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {rider.rating.toFixed(1)}</p>
            </div>
            {!isDone(o) && (
              <div className="flex gap-2">
                <button onClick={() => setCalling(true)} className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center" aria-label="Call rider"><Phone className="w-4 h-4" /></button>
                {chatOn && <button onClick={chatRider} className="w-10 h-10 rounded-full bg-blue-50 text-[#1e40af] flex items-center justify-center" aria-label="Chat with rider"><MessageCircle className="w-4 h-4" /></button>}
              </div>
            )}
          </div>
          {!isDone(o) && <p className="text-[10px] text-gray-400 mt-2">🔒 Calls and chats use a masked number — your phone number stays private.</p>}
        </Card>
      )}

      {/* Pickup QR */}
      {o.fulfillment === 'pickup' && !ended && o.status !== 'collected' && (
        <Card className="mx-4 mt-3 p-4 text-center">
          <p className="text-sm font-semibold">Show this at the pickup counter</p>
          <p className="text-[11px] text-gray-500">{b.pickupInstructions} · {b.address}</p>
          <div className="flex justify-center mt-3"><PseudoQR seed={o.number + o.pickupPin} /></div>
          <p className="text-xs text-gray-500 mt-3">Pickup PIN</p>
          <p className="text-2xl font-bold tracking-[0.4em] text-[#1e40af] pl-[0.4em]">{o.pickupPin}</p>
          {o.status !== 'ready' && <p className="text-[11px] text-amber-700 mt-2">We&apos;ll notify you when your order is ready.</p>}
        </Card>
      )}

      {/* Delivery proof */}
      {o.status === 'delivered' && (
        <Card className="mx-4 mt-3 p-3.5">
          <p className="text-sm font-semibold flex items-center gap-1.5"><Camera className="w-4 h-4 text-[#1e40af]" /> Proof of delivery</p>
          <div className="mt-2.5 h-32 rounded-xl bg-gradient-to-br from-amber-100 via-orange-50 to-stone-200 relative overflow-hidden flex items-end justify-center">
            <span className="absolute top-3 left-4 text-4xl">🚪</span>
            <span className="text-5xl mb-2">🛍️📦</span>
            <span className="absolute bottom-2 right-2 text-[9px] bg-black/50 text-white rounded px-1.5 py-0.5">{o.completedAt ? fmtDateTime(o.completedAt) : ''} · GPS ✓</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Delivered by {rider?.name ?? 'rider'} {o.completedAt && `at ${fmtTime(o.completedAt)}`} · {String(getSetting(s, 'podMethod', o.branchId))} confirmed</p>
        </Card>
      )}

      {/* Rate prompt */}
      {isDone(o) && ratingsOn && !o.rating && (
        <button onClick={() => go({ name: 'rate', orderId: o.id })} className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex items-center gap-3 text-left">
          <span className="text-2xl">⭐</span>
          <span className="flex-1"><span className="block text-sm font-semibold">How was your order?</span><span className="block text-xs text-gray-600">Rate the order{o.riderId ? ' and your rider' : ''}</span></span>
          <ChevronRight className="w-4 h-4 text-amber-600" />
        </button>
      )}

      {/* Timeline */}
      <Card className="mx-4 mt-3 p-4">
        <p className="text-sm font-semibold mb-3">Order status</p>
        {ended ? (
          <div className="flex items-center gap-2 text-sm text-gray-700"><CircleX className="w-5 h-5 text-[#dc2626]" /> {STATUS_LABEL[o.status]} {o.completedAt && <span className="text-xs text-gray-400">· {fmtTime(o.completedAt)}</span>}</div>
        ) : (
          <ol className="relative">
            {steps.map((st, i) => {
              const done = i < idx || (i === idx && isDone(o));
              const current = i === idx && !isDone(o);
              const t = at(st.key) ?? (i === 0 ? o.placedAt : undefined);
              return (
                <li key={st.key} className="flex gap-3 pb-4 last:pb-0 relative">
                  {i < steps.length - 1 && <span className={cn('absolute left-[11px] top-6 bottom-0 w-0.5', i < idx ? 'bg-[#1e40af]' : 'bg-gray-200')} />}
                  <span className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10', done ? 'bg-[#1e40af] text-white' : current ? 'bg-white border-2 border-[#1e40af]' : 'bg-gray-100 border-2 border-gray-200')}>
                    {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : current ? <span className="w-2 h-2 rounded-full bg-[#1e40af] animate-pulse" /> : null}
                  </span>
                  <div className="flex-1 flex justify-between gap-2 -mt-0.5">
                    <div>
                      <p className={cn('text-sm', done || current ? 'font-semibold text-gray-900' : 'text-gray-400')}>{st.label}</p>
                      {current && o.status === 'awaiting_confirmation' && <p className="text-[11px] text-amber-700">Awaiting branch confirmation</p>}
                      {current && o.status === 'awaiting_shopper' && <p className="text-[11px] text-amber-700">Waiting for your reply on a substitute</p>}
                      {st.key === 'confirmed' && (done || current) && o.autoConfirmed && <p className="text-[11px] text-emerald-700">Auto-confirmed (paid online)</p>}
                    </div>
                    {t && (done || current) && <span className="text-[11px] text-gray-400 shrink-0">{fmtTime(t)}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Items */}
      <Card className="mx-4 mt-3 p-4">
        <p className="text-sm font-semibold mb-2">{o.items.length} items</p>
        <div className="divide-y divide-gray-50">
          {o.items.map((i) => (
            <div key={i.productId} className="py-2 flex items-center gap-3">
              <span className="text-2xl w-8 text-center">{i.substitute?.status === 'accepted' ? i.substitute.image : i.image}</span>
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium truncate', (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') && 'line-through text-gray-400')}>
                  {i.substitute?.status === 'accepted' ? `${i.substitute.name} (for ${i.name})` : i.name}
                </p>
                <p className="text-[10px] text-gray-500">
                  {i.soldByWeight ? `${i.actualWeightKg ?? i.estWeightKg ?? 1} kg${i.actualWeightKg ? '' : ' est.'}` : `× ${i.qty}`}
                  {i.pickStatus === 'picked' && ' · ✓ picked'}{i.pickStatus === 'removed' && ' · refunded'}{i.pickStatus === 'out_of_stock' && ' · out of stock'}
                  {i.note && ` · “${i.note}”`}
                </p>
              </div>
              <span className="text-xs font-semibold tabular-nums">{peso(lineTotal(i))}</span>
              {isDone(o) && <button onClick={() => setReport(i)} className="text-[10px] text-[#dc2626] font-semibold flex items-center gap-0.5"><Flag className="w-3 h-3" />Report</button>}
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between text-sm">
          <span className="text-gray-600">Total · {PAYMENT_LABEL[o.paymentMethod]}</span>
          <span className="font-bold">{peso(o.total)}</span>
        </div>
        {o.refundedAmount > 0 && <p className="text-[11px] text-emerald-700 mt-1">Refunded {peso(o.refundedAmount)} to {PAYMENT_LABEL[o.paymentMethod]}</p>}
        <button onClick={() => go({ name: 'receipt', orderId: o.id })} className="mt-3 w-full h-9 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">View receipt</button>
      </Card>

      <div className="mx-4 mt-3 flex gap-2">
        <button onClick={() => { const id = openConversation('support', o, shopper.name, { category: 'Other', system: `Shopper opened a chat about order ${o.number} (${STATUS_LABEL[o.status]}).` }); go({ name: 'chat', convId: id }); }} className="flex-1 h-10 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5" /> Help with this order
        </button>
        {canCancel(s, o) && (
          <button onClick={() => setCancelOpen(true)} className="flex-1 h-10 rounded-xl bg-white border border-red-200 text-xs font-semibold text-[#dc2626]">Cancel order</button>
        )}
      </div>

      {/* Masked call overlay */}
      {calling && rider && (
        <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 to-[#0f172a] text-white flex flex-col items-center justify-between py-16 fm-fade">
          <div className="text-center">
            <span className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1e40af] to-indigo-400 mx-auto flex items-center justify-center text-3xl font-bold">{rider.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
            <p className="text-xl font-semibold mt-4">{rider.name}</p>
            <p className="text-sm text-gray-400 mt-1 animate-pulse">Calling via FreshMart masked line…</p>
            <p className="text-xs text-gray-500 mt-4">+63 2 8••• ••42 · Order {o.number}</p>
            <p className="text-[11px] text-gray-500 mt-1">🔒 Neither of you sees the other&apos;s real number</p>
          </div>
          <button onClick={() => setCalling(false)} className="w-16 h-16 rounded-full bg-[#dc2626] flex items-center justify-center shadow-lg" aria-label="End call"><PhoneOff className="w-7 h-7" /></button>
        </div>
      )}

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${o.number}?`}>
        <p className="text-xs text-gray-600 mb-3">{o.paymentStatus === 'paid' ? `Your payment of ${peso(o.total)} will be refunded automatically to ${PAYMENT_LABEL[o.paymentMethod]}.` : 'No payment has been collected for this order.'}</p>
        <div className="space-y-2">
          {['Changed my mind', 'Ordered by mistake', 'Delivery takes too long', 'Want to change items'].map((r) => (
            <button key={r} onClick={() => setCancelReason(r)} className={cn('w-full text-left rounded-xl border px-3 py-2.5 text-sm', cancelReason === r ? 'border-[#1e40af] bg-blue-50/50' : 'border-gray-200')}>{r}</button>
          ))}
        </div>
        <button
          onClick={() => {
            if (!canCancel(s, o)) { flash('This order can no longer be cancelled', 'err'); setCancelOpen(false); return; }
            setOrderStatus(o.id, 'cancelled', { by: shopper.name, note: `Cancelled by shopper: ${cancelReason}` });
            setCancelOpen(false);
            flash('Order cancelled');
          }}
          className="mt-4 w-full h-12 rounded-2xl bg-[#dc2626] text-white font-semibold text-sm"
        >
          Cancel order
        </button>
      </Sheet>

      <ReportSheet o={o} item={report} onClose={() => setReport(null)} />
    </div>
  );
}

/** Deterministic pseudo-QR made of divs. */
function PseudoQR({ seed }: { seed: string }) {
  const N = 21;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 16) & 1; };
  const finder = (r: number, c: number) => {
    for (const [fr, fc] of [[0, 0], [0, N - 7], [N - 7, 0]]) {
      const y = r - fr, x = c - fc;
      if (y >= 0 && y < 7 && x >= 0 && x < 7) return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4) ? 1 : 0;
      if (y >= -1 && y <= 7 && x >= -1 && x <= 7) return 0;
    }
    return -1;
  };
  const cells: number[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const f = finder(r, c); cells.push(f === -1 ? rnd() : f); }
  return (
    <div className="p-2.5 bg-white rounded-xl border border-gray-200">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${N}, 7px)` }}>
        {cells.map((v, i) => <span key={i} className={v ? 'bg-gray-900' : 'bg-white'} style={{ width: 7, height: 7 }} />)}
      </div>
    </div>
  );
}

// ---------- Report a problem ----------
function ReportSheet({ o, item, onClose }: { o: Order; item: OrderItem | null; onClose: () => void }) {
  const { shopper, go, flash } = useShop();
  const [kind, setKind] = useState<'missing' | 'damaged' | 'wrong' | 'quality'>('missing');
  const [text, setText] = useState('');
  const labels = { missing: 'Missing item', damaged: 'Damaged item', wrong: 'Wrong item', quality: 'Poor quality' } as const;
  const submit = () => {
    if (!item) return;
    const category: Conversation['category'] = kind === 'missing' ? 'Missing item' : kind === 'damaged' ? 'Damaged item' : 'Other';
    const id = openConversation('support', o, shopper.name, {
      category,
      system: `Problem reported on order ${o.number}: ${item.name} — ${labels[kind].toLowerCase()}. Order attached.`,
      firstMessage: text.trim() || `Hi, I have a problem with ${item.name} from order ${o.number}: ${labels[kind].toLowerCase()}.`,
    });
    onClose();
    setText('');
    flash('Report sent — support will reply here');
    go({ name: 'chat', convId: id });
  };
  return (
    <Sheet open={!!item} onClose={onClose} title="Report a problem">
      {item && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3 mb-3">
            <span className="text-3xl">{item.image}</span>
            <div><p className="text-sm font-semibold">{item.name}</p><p className="text-[11px] text-gray-500">Order {o.number} · {peso(lineTotal(item))}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn('rounded-xl border px-3 py-2.5 text-sm font-medium', kind === k ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]' : 'border-gray-200 text-gray-700')}>{labels[k]}</button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Tell us what happened (optional)" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1e40af] resize-none" />
          <button onClick={() => flash('Photo attached (demo)', 'info')} className="mt-2 h-9 px-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-600 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Add photo</button>
          <PrimaryButton onClick={submit} className="mt-4">Send report & open chat</PrimaryButton>
        </>
      )}
    </Sheet>
  );
}

// ====================== RECEIPT ======================
export function ReceiptScreen({ orderId }: { orderId: string }) {
  const { s, shopper, go, flash } = useShop();
  const [report, setReport] = useState<OrderItem | null>(null);
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return <><ScreenHeader title="Receipt" /><p className="p-8 text-center text-sm text-gray-500">Order not found.</p></>;
  const b = s.branches.find((x) => x.id === o.branchId);
  const vatRate = num(getSetting(s, 'vatRate', o.branchId)) || 12;
  const vatable = o.items.reduce((n, i) => n + (s.products.find((p) => p.id === i.productId)?.tax === 'vat' ? lineTotal(i) : 0), 0);
  const vat = Math.round((vatable - vatable / (1 + vatRate / 100)) * 100) / 100;
  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title="Receipt" sub={o.number} right={<StatusBadge status={o.status} />} />
      <div className="mx-4 mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[26px] font-black text-red-500/10 -rotate-[24deg] whitespace-nowrap">NOT AN OFFICIAL RECEIPT</span>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-[#1e40af]">FreshMart {b?.name}</p>
          <p className="text-[10px] text-gray-500">{b?.address}</p>
          <p className="text-[10px] text-gray-500">{b?.phone} · VAT Reg. TIN 008-123-456-000</p>
          <p className="mt-2 inline-block text-[10px] font-bold text-[#dc2626] border border-[#dc2626] rounded px-1.5 py-0.5">NOT AN OFFICIAL RECEIPT</p>
        </div>
        <div className="mt-4 text-[11px] text-gray-600 space-y-0.5">
          <div className="flex justify-between"><span>Order</span><span className="font-semibold text-gray-900">{o.number}</span></div>
          <div className="flex justify-between"><span>Date</span><span>{fmtDateTime(o.placedAt)}</span></div>
          <div className="flex justify-between"><span>Customer</span><span>{o.customerName}</span></div>
          <div className="flex justify-between"><span>Fulfillment</span><span className="capitalize">{o.fulfillment}{o.address ? ` · ${o.address.label}` : ''}</span></div>
        </div>
        <div className="border-t border-dashed border-gray-300 my-3" />
        <div className="space-y-2">
          {o.items.map((i) => (
            <div key={i.productId} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className={cn('flex-1', (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') && 'line-through text-gray-400')}>{i.substitute?.status === 'accepted' ? i.substitute.name : i.name}</span>
                <span className="tabular-nums font-medium">{peso(lineTotal(i))}</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>{i.soldByWeight ? `${i.actualWeightKg ?? i.estWeightKg ?? 1} kg × ${peso(i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice)}/kg` : `${i.qty} × ${peso(i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice)}`}</span>
                {isDone(o) && <button onClick={() => setReport(i)} className="text-[#dc2626] font-semibold">Report a problem</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-gray-300 my-3" />
        <div className="text-xs space-y-1">
          <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span>{peso(o.subtotal)}</span></div>
          {o.fulfillment === 'delivery' && <div className="flex justify-between"><span className="text-gray-600">Delivery fee</span><span>{peso(o.deliveryFee)}</span></div>}
          {o.feeRule && <p className="text-[10px] text-gray-400 -mt-0.5">{o.feeRule}</p>}
          {o.serviceFee > 0 && <div className="flex justify-between"><span className="text-gray-600">Service fee</span><span>{peso(o.serviceFee)}</span></div>}
          {o.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount{o.voucherCode ? ` (${o.voucherCode})` : ''}</span><span>−{peso(o.discount)}</span></div>}
          <div className="flex justify-between text-sm font-bold pt-1"><span>TOTAL</span><span className="text-[#1e40af]">{peso(o.total)}</span></div>
          <div className="flex justify-between text-[10px] text-gray-500"><span>VAT ({vatRate}%) included</span><span>{peso(vat)}</span></div>
          <div className="flex justify-between text-[11px] pt-1"><span className="text-gray-600">Paid via {PAYMENT_LABEL[o.paymentMethod]}</span><span className="capitalize">{o.paymentStatus.replace('_', ' ')}</span></div>
          {o.refundedAmount > 0 && <div className="flex justify-between text-[11px] text-emerald-700"><span>Refunded</span><span>{peso(o.refundedAmount)}</span></div>}
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-4">The BIR official receipt is issued by the branch upon {o.fulfillment === 'delivery' ? 'delivery' : 'pickup'}.</p>
      </div>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => flash('Receipt saved to Files (PDF)')} className="h-10 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" /> Download</button>
        <button onClick={() => flash('Share sheet opened (demo)', 'info')} className="h-10 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5"><Share2 className="w-3.5 h-3.5" /> Share</button>
      </div>
      {OPEN_STATUSES.includes(o.status) && <PrimaryButton onClick={() => go({ name: 'track', orderId: o.id })} className="mx-4 mt-3 w-[calc(100%-2rem)]">Track order</PrimaryButton>}
      {isDone(o) && !o.rating && getSetting(s, 'ff_ratings', o.branchId) !== false && (
        <PrimaryButton onClick={() => go({ name: 'rate', orderId: o.id })} className="mx-4 mt-3 w-[calc(100%-2rem)]">Rate this order</PrimaryButton>
      )}
      {o.rating && (
        <Card className="mx-4 mt-3 p-3.5 text-xs text-gray-600">
          <p className="font-semibold text-gray-900 text-sm">Your rating</p>
          <p className="mt-1">Order {'★'.repeat(o.rating.order)}{'☆'.repeat(5 - o.rating.order)}{o.rating.rider ? ` · Rider ${'★'.repeat(o.rating.rider)}` : ''}</p>
          {o.rating.tags.length > 0 && <p className="mt-0.5">{o.rating.tags.join(' · ')}</p>}
          {o.rating.comment && <p className="mt-0.5 italic">“{o.rating.comment}”</p>}
        </Card>
      )}
      <p className="text-center text-[10px] text-gray-400 mt-3">{shopper.email}</p>
      <ReportSheet o={o} item={report} onClose={() => setReport(null)} />
    </div>
  );
}

// ====================== RATE ======================
const TAGS = ['Great service', 'Fresh items', 'Friendly rider', 'On time', 'Late', 'Damaged', 'Wrong item'];

export function RateScreen({ orderId }: { orderId: string }) {
  const { s, shopper, back, flash } = useShop();
  const o = s.orders.find((x) => x.id === orderId);
  const [orderStars, setOrderStars] = useState(o?.rating?.order ?? 0);
  const [riderStars, setRiderStars] = useState(o?.rating?.rider ?? 0);
  const [tags, setTags] = useState<string[]>(o?.rating?.tags ?? []);
  const [comment, setComment] = useState(o?.rating?.comment ?? '');
  if (!o) return <><ScreenHeader title="Rate" /><p className="p-8 text-center text-sm text-gray-500">Order not found.</p></>;
  const rider = s.riders.find((r) => r.id === o.riderId);
  const save = () => {
    mutate((d) => {
      const od = d.orders.find((x) => x.id === o.id);
      if (!od) return;
      od.rating = { order: orderStars, rider: rider ? riderStars || undefined : undefined, tags, comment: comment.trim() || undefined };
      od.timeline.push({ status: 'note', at: new Date().toISOString(), by: shopper.name, note: `Rated order ${orderStars}★${rider && riderStars ? `, rider ${riderStars}★` : ''}${tags.length ? ` (${tags.join(', ')})` : ''}` });
    });
    flash('Thanks for your feedback!');
    back();
  };
  return (
    <div className="min-h-full flex flex-col">
      <ScreenHeader title="Rate your order" sub={o.number} />
      <div className="flex-1 px-4 py-4 space-y-3">
        <Card className="p-5 text-center">
          <p className="text-sm font-semibold">How was your order?</p>
          <p className="text-[11px] text-gray-500">{s.branches.find((b) => b.id === o.branchId)?.name} branch · {o.items.length} items</p>
          <Stars value={orderStars} onChange={setOrderStars} />
        </Card>
        {rider && (
          <Card className="p-5 text-center">
            <span className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-[#1e40af] to-indigo-400 text-white font-bold flex items-center justify-center"><Bike className="w-5 h-5" /></span>
            <p className="text-sm font-semibold mt-2">Rate {rider.name}</p>
            <Stars value={riderStars} onChange={setRiderStars} />
          </Card>
        )}
        {o.fulfillment === 'pickup' && !rider && <Card className="p-3 text-xs text-gray-500 flex items-center gap-2"><Store className="w-4 h-4" /> Pickup order — no rider to rate.</Card>}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2">What stood out?</p>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => {
              const on = tags.includes(t);
              const bad = ['Late', 'Damaged', 'Wrong item'].includes(t);
              return (
                <button key={t} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={cn('h-8 px-3 rounded-full text-xs font-medium border', on ? (bad ? 'bg-red-50 border-red-300 text-[#dc2626]' : 'bg-blue-50 border-[#1e40af] text-[#1e40af]') : 'border-gray-200 text-gray-600')}>{t}</button>
              );
            })}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Add a comment (optional)" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1e40af] resize-none" />
        </Card>
      </div>
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 pt-3 pb-4">
        <PrimaryButton onClick={save} disabled={!orderStars}>Submit rating</PrimaryButton>
      </div>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex justify-center gap-2 mt-3">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-label={`${n} stars`}>
          <Star className={cn('w-9 h-9 transition', n <= value ? 'fill-amber-400 text-amber-400 scale-105' : 'text-gray-300')} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
