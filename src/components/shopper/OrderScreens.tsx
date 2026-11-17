'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bike, Camera, Check, ChevronRight, CircleX, Download, Flag, MessageCircle, Phone, PhoneOff, RotateCcw, Share2, Star, Store, TriangleAlert } from 'lucide-react';
import type { Conversation, Order, OrderItem } from '@/src/lib/types';
import { mutate, uid } from '@/src/lib/store';
import {
  available, cutFeeText, fmtDateTime, fmtTime, getSetting, lineTotal, num, OPEN_STATUSES, PAYMENT_LABEL, peso, riderPosition, setOrderStatus, STATUS_LABEL,
} from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import { useTick } from '@/src/lib/store';
import { StatusBadge } from '@/src/components/common';
import { MapView } from '@/src/components/MapView';
import { cn } from '@/src/lib/utils';
import {
  CallBranchButton, Card, Container, DEFAULT_SUB_PREF, MobileActionBar, PrimaryButton, ScreenHeader, Sheet, cutsFor, fmtKg, lineKey, ratingsOn as ratingsEnabled, roundKg,
  useDocumentTitle, useMe, useShop,
} from './shared';
import { ProductImage as PhotoImg } from '@/src/components/ProductImage';

/** "1.5 kg est. · Sliced thin (+₱20/kg)" or "× 2 · Sliced". */
function itemDetail(i: OrderItem) {
  const amount = i.soldByWeight ? `${fmtKg(i.actualWeightKg ?? i.estWeightKg ?? 1)}${i.actualWeightKg ? '' : ' est.'}` : `× ${i.qty}`;
  return `${amount}${i.cut ? ` · ${i.cut.name}${cutFeeText(i.cut) ? ` (${cutFeeText(i.cut)})` : ''}` : ''}`;
}

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

/** Order belongs to the signed-in customer? (others' orders are "not found"). */
function useMyOrder(orderId: string) {
  const { s } = useShop();
  const me = useMe();
  return s.orders.find((x) => x.id === orderId && x.customerId === me.id);
}

function NotFound({ title }: { title: string }) {
  return (
    <Container className="pb-6">
      <ScreenHeader title={title} back="/my-orders" />
      <div className="text-center py-14">
        <p className="text-4xl" aria-hidden>🧾</p>
        <p className="text-base font-semibold mt-2">Order not found</p>
        <Link href="/my-orders" className="inline-flex items-center min-h-11 mt-2 text-sm font-semibold text-[#c8151d] hover:underline">See my orders</Link>
      </div>
    </Container>
  );
}

// ====================== ORDERS LIST ======================
type Filter = 'all' | 'active' | 'completed' | 'cancelled';

export function OrdersScreen() {
  const { s, go, branch, flash } = useShop();
  const shopper = useMe();
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
        const cutId = i.cut && cutsFor(d, p).some((c) => c.id === i.cut!.id) ? i.cut.id : undefined;
        const kg = p.soldByWeight ? i.estWeightKg ?? (p.estWeightKg ?? 1) * i.qty : undefined;
        const l = d.cart.find((c) => lineKey(c) === lineKey({ productId: p.id, cutId }));
        if (l) {
          if (kg !== undefined) l.weightKg = roundKg((l.weightKg ?? 0) + kg);
          else l.qty += i.qty;
        } else d.cart.push({ productId: p.id, qty: p.soldByWeight ? 1 : i.qty, weightKg: kg !== undefined ? roundKg(kg) : undefined, cutId, note: i.note, subPref: DEFAULT_SUB_PREF });
        added.push(i.name);
      }
    });
    if (flagged.length) setReorderResult({ added, flagged });
    else { flash(`${added.length} items added to cart`); go({ name: 'cart' }); }
  };

  return (
    <Container className="pb-6">
      <ScreenHeader title="My orders" sub={`${mine.length} order${mine.length === 1 ? '' : 's'}`} back={false} />
      <div className="flex gap-2 pb-4 overflow-x-auto fm-noscroll -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Filter orders">
        {(['all', 'active', 'completed', 'cancelled'] as Filter[]).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn('shrink-0 h-11 md:h-9 px-4 rounded-full text-sm font-semibold border capitalize', filter === f ? 'bg-[#c8151d] text-white border-[#c8151d]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300')}>{f}</button>
        ))}
      </div>
      {list.length === 0 && (
        <div className="text-center py-16 px-8">
          <p className="text-5xl" aria-hidden>🧾</p>
          <p className="text-base font-semibold mt-3">No orders here yet</p>
          <Link href="/" className="mt-5 h-12 px-8 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm inline-flex items-center">Start shopping</Link>
        </div>
      )}
      {active.length > 0 && <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Active</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">{active.map((o) => <OrderCard key={o.id} o={o} onReorder={reorder} />)}</div>
      {past.length > 0 && <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mt-6 mb-2">Past orders</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">{past.map((o) => <OrderCard key={o.id} o={o} onReorder={reorder} />)}</div>

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

function OrderCard({ o, onReorder }: { o: Order; onReorder: (o: Order) => void }) {
  const { s } = useShop();
  const b = s.branches.find((x) => x.id === o.branchId);
  const open = OPEN_STATUSES.includes(o.status);
  const ratingsOn = ratingsEnabled(s, o.branchId);
  const href = open ? `/my-orders/${o.id}` : `/my-orders/${o.id}/receipt`;
  return (
    <Card className="p-4 flex flex-col">
      <Link href={href} className="block w-full text-left group">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm md:text-base font-semibold group-hover:text-[#c8151d]">{o.number}</p>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-xs text-gray-600 mt-0.5">{b?.name} · {o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {fmtDateTime(o.placedAt)}</p>
        <div className="flex items-center justify-between mt-3">
          <div className="flex -space-x-1.5">
            {o.items.slice(0, 5).map((i, n) => <span key={`${i.productId}-${n}`} className="relative overflow-hidden w-9 h-9 rounded-full bg-[#f8e7da] border-2 border-white flex items-center justify-center text-base" aria-hidden><PhotoImg image={i.image} fill /></span>)}
            {o.items.length > 5 && <span className="w-9 h-9 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[11px] font-semibold text-gray-700">+{o.items.length - 5}</span>}
          </div>
          <p className="text-base font-bold">{peso(o.total)}</p>
        </div>
      </Link>
      <div className="flex gap-2 mt-3">
        {open ? (
          <Link href={`/my-orders/${o.id}`} className="flex-1 h-11 md:h-10 rounded-xl bg-[#c8151d] hover:bg-[#a3111a] text-white text-sm font-semibold flex items-center justify-center">Track order</Link>
        ) : (
          <>
            <button onClick={() => onReorder(o)} className="flex-1 h-11 md:h-10 rounded-xl bg-[#c8151d] hover:bg-[#a3111a] text-white text-sm font-semibold flex items-center justify-center gap-1"><RotateCcw className="w-4 h-4" /> Reorder</button>
            <Link href={`/my-orders/${o.id}/receipt`} className="flex-1 h-11 md:h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300 flex items-center justify-center">Receipt</Link>
            {isDone(o) && ratingsOn && (
              o.rating ? (
                <span className="h-11 md:h-10 px-3 rounded-xl bg-amber-50 text-amber-800 text-sm font-semibold flex items-center gap-1"><Star className="w-4 h-4 fill-amber-400 text-amber-400" />{o.rating.order}</span>
              ) : (
                <Link href={`/my-orders/${o.id}/rate`} className="h-11 md:h-10 px-3 rounded-xl border border-amber-300 text-amber-800 text-sm font-semibold flex items-center">Rate</Link>
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
  const { s, go, flash } = useShop();
  const shopper = useMe();
  const [calling, setCalling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Changed my mind');
  const [report, setReport] = useState<OrderItem | null>(null);
  const o = useMyOrder(orderId);
  useDocumentTitle(o ? `Order ${o.number}` : undefined);
  if (!o) return <NotFound title="Order" />;
  const b = s.branches.find((x) => x.id === o.branchId)!;
  const rider = s.riders.find((r) => r.id === o.riderId);
  const steps = o.fulfillment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const idx = stepIndex(o);
  const ended = o.status === 'cancelled' || o.status === 'failed_delivery';
  const pos = riderPosition(s, o);
  // Phase 2 (Support module): in-app chat with support and with the rider. Phase 1 shows "Call the branch".
  const supportOn = moduleOn(s, 'support');
  const chatOn = supportOn && getSetting(s, 'ff_riderChat', o.branchId) !== false;
  const ratingsOn = ratingsEnabled(s, o.branchId);
  const at = (k: string) => [...o.timeline].reverse().find((e) => e.status === k)?.at;

  const hero: Record<string, { title: string; sub: string; emoji: string }> = {
    placed: { title: 'Order placed', sub: `Sent to ${b.name} branch`, emoji: '📝' },
    awaiting_confirmation: { title: 'Waiting for confirmation', sub: `${b.name} branch will confirm your order shortly`, emoji: '⏳' },
    confirmed: { title: 'Order confirmed', sub: 'Our butchers will start preparing your meat soon', emoji: '✅' },
    preparing: { title: 'Preparing your order', sub: `${o.pickerName ?? 'Our butcher'} is cutting and weighing your meat`, emoji: '🔪' },
    awaiting_shopper: { title: 'The branch will call you', sub: `An item is unavailable — expect a call at ${shopper.mobile || 'your mobile number'}`, emoji: '📞' },
    ready: o.fulfillment === 'pickup' ? { title: 'Ready for pickup!', sub: `Show your QR code at the ${b.pickupInstructions.toLowerCase()}`, emoji: '🛍️' } : { title: 'Packed & ready', sub: rider ? `${rider.name} is heading to the branch` : 'Waiting for a rider', emoji: '📦' },
    out_for_delivery: { title: `Arriving in about ${pos.etaMins} min`, sub: `${rider?.name ?? 'Your rider'} is on the way`, emoji: '🛵' },
    delivered: { title: 'Delivered', sub: `Enjoy your meal, ${shopper.firstName || shopper.name.split(' ')[0]}! Please refrigerate your meat right away.`, emoji: '🎉' },
    collected: { title: 'Collected', sub: 'Thank you for shopping with Jovanne’s Meat Shop', emoji: '🎉' },
    cancelled: { title: 'Order cancelled', sub: o.rejectReason ? `Reason: ${o.rejectReason}` : 'This order was cancelled', emoji: '✖️' },
    failed_delivery: { title: 'Delivery attempt failed', sub: 'We will contact you to reschedule', emoji: '⚠️' },
  };
  const h = hero[o.status];

  const chatRider = () => {
    const id = openConversation('rider', o, shopper.name);
    go({ name: 'chat', convId: id });
  };
  const initials = rider ? rider.name.split(' ').map((x) => x[0]).join('').slice(0, 2) : '';

  return (
    <Container className="pb-6">
      <ScreenHeader title={`Order ${o.number}`} sub={`${b.name} · ${o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · ${o.slot}`} right={<StatusBadge status={o.status} />} back="/my-orders" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_380px] md:gap-6 items-start">
        <div className="space-y-3 min-w-0">
          {/* Hero */}
          <div className={cn('rounded-2xl p-4 md:p-6 text-white shadow-md', ended ? 'bg-gradient-to-br from-gray-500 to-gray-700' : isDone(o) ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-[#2a2322] to-[#4a3d3c]')}>
            <div className="flex items-center gap-3">
              <span className="text-4xl md:text-5xl" aria-hidden>{h.emoji}</span>
              <div className="min-w-0" aria-live="polite">
                <p className="font-display uppercase tracking-wide text-xl md:text-2xl font-semibold leading-tight">{h.title}</p>
                <p className="text-xs md:text-sm text-white/85">{h.sub}</p>
              </div>
            </div>
            {o.status === 'out_for_delivery' && (
              <div className="mt-3 h-1.5 bg-white/25 rounded-full overflow-hidden"><div className="h-full bg-[#ec1b26] rounded-full transition-all duration-1000" style={{ width: `${Math.round(pos.progress * 100)}%` }} /></div>
            )}
            {o.autoConfirmed && !ended && <p className="mt-3 text-xs bg-white/15 rounded-lg px-2.5 py-1.5">⚡ Confirmed automatically — paid online with {PAYMENT_LABEL[o.paymentMethod]}</p>}
          </div>

          {/* Cold chain */}
          {o.coldChain && !ended && !isDone(o) && (
            <div className="rounded-2xl bg-white border border-[#eadfd6] px-3.5 py-2.5 text-xs md:text-sm text-[#2a2322]">
              🧊 Packed in an insulated bag with ice packs{o.fulfillment === 'delivery' ? ` and delivered within ${o.maxDeliveryMins ?? 60} minutes of pickup` : ''}.
            </div>
          )}

          {/* Live map */}
          {o.status === 'out_for_delivery' && o.address && (
            <div>
              <MapView
                key={o.id}
                center={[pos.lat, pos.lng]}
                zoom={14}
                fitToMarkers
                className="h-56 md:h-80"
                markers={[
                  { id: 'b', lat: b.lat, lng: b.lng, label: '🏪', color: '#2a2322', title: `${b.name} branch` },
                  { id: 'h', lat: o.address.lat, lng: o.address.lng, label: '🏠', color: '#059669', title: o.address.line },
                  { id: 'r', lat: pos.lat, lng: pos.lng, label: '🛵', color: '#c8151d', title: rider?.name ?? 'Rider', pulse: true },
                ]}
                lines={[{ points: [[b.lat, b.lng], [pos.lat, pos.lng], [o.address.lat, o.address.lng]], color: '#c8151d', dashed: true }]}
              />
              <p className="text-xs text-gray-600 mt-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live location · ETA {pos.etaMins} min</p>
            </div>
          )}

          {/* Rider card */}
          {rider && o.fulfillment === 'delivery' && !ended && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2a2322] to-[#c8151d] text-white font-bold flex items-center justify-center text-lg shrink-0">{initials}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{rider.name}</p>
                  <p className="text-xs text-gray-600 capitalize">{rider.vehicle} · {rider.plate}</p>
                  <p className="text-xs text-amber-800 font-semibold flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {rider.rating.toFixed(1)}</p>
                </div>
                {!isDone(o) && (
                  <div className="flex gap-2">
                    <button onClick={() => setCalling(true)} className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center" aria-label="Call rider"><Phone className="w-5 h-5" /></button>
                    {chatOn && <button onClick={chatRider} className="w-11 h-11 rounded-full bg-[#fdecec] text-[#c8151d] flex items-center justify-center" aria-label="Chat with rider"><MessageCircle className="w-5 h-5" /></button>}
                  </div>
                )}
              </div>
              {!isDone(o) && <p className="text-[11px] text-gray-500 mt-2">🔒 {chatOn ? 'Calls and chats use' : 'Calls use'} a masked number — your phone number stays private.</p>}
            </Card>
          )}

          {/* Pickup QR */}
          {o.fulfillment === 'pickup' && !ended && o.status !== 'collected' && (
            <Card className="p-5 text-center">
              <p className="text-sm font-semibold">Show this at the pickup counter</p>
              <p className="text-xs text-gray-600">{b.pickupInstructions} · {b.address}</p>
              <div className="flex justify-center mt-3"><PseudoQR seed={o.number + o.pickupPin} /></div>
              <p className="text-xs text-gray-600 mt-3">Pickup PIN</p>
              <p className="text-2xl font-bold tracking-[0.4em] text-[#c8151d] pl-[0.4em]">{o.pickupPin}</p>
              {o.status !== 'ready' && <p className="text-xs text-amber-800 mt-2">We&apos;ll notify you when your order is ready.</p>}
            </Card>
          )}

          {/* Delivery proof */}
          {o.status === 'delivered' && (
            <Card className="p-4">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Camera className="w-4 h-4 text-[#c8151d]" /> Proof of delivery</p>
              <div className="mt-2.5 h-32 md:h-44 rounded-xl bg-gradient-to-br from-amber-100 via-orange-50 to-stone-200 relative overflow-hidden flex items-end justify-center">
                <span className="absolute top-3 left-4 text-4xl" aria-hidden>🚪</span>
                <span className="text-5xl mb-2" aria-hidden>🛍️📦</span>
                <span className="absolute bottom-2 right-2 text-[10px] bg-black/60 text-white rounded px-1.5 py-0.5">{o.completedAt ? fmtDateTime(o.completedAt) : ''} · GPS ✓</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">Delivered by {rider?.name ?? 'rider'} {o.completedAt && `at ${fmtTime(o.completedAt)}`} · {String(getSetting(s, 'podMethod', o.branchId))} confirmed</p>
            </Card>
          )}

          {/* Rate prompt */}
          {isDone(o) && ratingsOn && !o.rating && (
            <Link href={`/my-orders/${o.id}/rate`} className="w-full rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-center gap-3 text-left">
              <span className="text-2xl" aria-hidden>⭐</span>
              <span className="flex-1"><span className="block text-sm font-semibold">How was your order?</span><span className="block text-xs text-gray-700">Rate the order{o.riderId ? ' and your rider' : ''}</span></span>
              <ChevronRight className="w-4 h-4 text-amber-700" />
            </Link>
          )}

          {/* Timeline */}
          <Card className="p-4 md:p-5">
            <p className="text-sm font-semibold mb-3">Order status</p>
            {ended ? (
              <div className="flex items-center gap-2 text-sm text-gray-800"><CircleX className="w-5 h-5 text-[#c8151d]" /> {STATUS_LABEL[o.status]} {o.completedAt && <span className="text-xs text-gray-500">· {fmtTime(o.completedAt)}</span>}</div>
            ) : (
              <ol className="relative">
                {steps.map((st, i) => {
                  const done = i < idx || (i === idx && isDone(o));
                  const current = i === idx && !isDone(o);
                  const t = at(st.key) ?? (i === 0 ? o.placedAt : undefined);
                  return (
                    <li key={st.key} className="flex gap-3 pb-4 last:pb-0 relative">
                      {i < steps.length - 1 && <span className={cn('absolute left-[11px] top-6 bottom-0 w-0.5', i < idx ? 'bg-[#c8151d]' : 'bg-gray-200')} />}
                      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10', done ? 'bg-[#c8151d] text-white' : current ? 'bg-white border-2 border-[#c8151d]' : 'bg-gray-100 border-2 border-gray-200')}>
                        {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : current ? <span className="w-2 h-2 rounded-full bg-[#c8151d] animate-pulse" /> : null}
                      </span>
                      <div className="flex-1 flex justify-between gap-2 -mt-0.5">
                        <div>
                          <p className={cn('text-sm', done || current ? 'font-semibold text-gray-900' : 'text-gray-500')}>{st.label}</p>
                          {current && o.status === 'awaiting_confirmation' && <p className="text-xs text-amber-800">Awaiting branch confirmation</p>}
                          {current && o.status === 'awaiting_shopper' && <p className="text-xs text-amber-800">The branch will call you about an item</p>}
                          {st.key === 'confirmed' && (done || current) && o.autoConfirmed && <p className="text-xs text-emerald-800">Confirmed automatically (paid online)</p>}
                        </div>
                        {t && (done || current) && <span className="text-xs text-gray-500 shrink-0">{fmtTime(t)}</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-3 md:sticky md:top-[140px]">
          {/* Items */}
          <Card className="p-4 md:p-5">
            <p className="text-sm font-semibold mb-2">{o.items.length} item{o.items.length === 1 ? '' : 's'}</p>
            <div className="divide-y divide-[#f1e8e1]">
              {o.items.map((i, n) => (
                <div key={`${i.productId}-${n}`} className="py-2 flex items-center gap-3">
                  <span className="text-2xl w-8 text-center" aria-hidden><PhotoImg image={i.substitute?.status === 'accepted' ? i.substitute.image : i.image} /></span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-medium', (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') && 'line-through text-gray-500')}>
                      {i.substitute?.status === 'accepted' ? `${i.substitute.name} (for ${i.name})` : i.name}
                    </p>
                    <p className="text-[11px] text-gray-600">
                      {itemDetail(i)}
                      {i.pickStatus === 'picked' && ' · ✓ weighed & packed'}{i.pickStatus === 'removed' && ' · refunded'}{i.pickStatus === 'out_of_stock' && ' · out of stock'}
                      {i.note && ` · “${i.note}”`}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums">{peso(lineTotal(i))}</span>
                  {isDone(o) && supportOn && <button onClick={() => setReport(i)} className="min-h-11 text-[11px] text-[#a3111a] font-semibold flex items-center gap-0.5"><Flag className="w-3 h-3" />Report</button>}
                </div>
              ))}
            </div>
            <div className="border-t border-[#f1e8e1] mt-2 pt-2 flex justify-between gap-2 text-sm">
              <span className="text-gray-700">Total · {PAYMENT_LABEL[o.paymentMethod]}</span>
              <span className="font-bold">{peso(o.total)}</span>
            </div>
            {o.refundedAmount > 0 && <p className="text-xs text-emerald-800 mt-1">Refunded {peso(o.refundedAmount)} to {PAYMENT_LABEL[o.paymentMethod]}</p>}
            <Link href={`/my-orders/${o.id}/receipt`} className="mt-3 w-full h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300 flex items-center justify-center">View receipt</Link>
          </Card>

          <div className="flex flex-col gap-2">
            {supportOn ? (
              <button onClick={() => { const id = openConversation('support', o, shopper.name, { category: 'Other', system: `Customer opened a chat about order ${o.number} (${STATUS_LABEL[o.status]}).` }); go({ name: 'chat', convId: id }); }} className="h-11 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300 flex items-center justify-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Help with this order
              </button>
            ) : (
              <CallBranchButton branch={b} />
            )}
            {canCancel(s, o) && (
              <button onClick={() => setCancelOpen(true)} className="h-11 rounded-xl bg-white border border-[#f5c6c8] text-sm font-semibold text-[#a3111a] hover:bg-[#fdf5f5]">Cancel order</button>
            )}
          </div>
        </div>
      </div>

      {/* Masked call overlay */}
      {calling && rider && (
        <div className="fixed inset-0 z-[60] bg-gradient-to-b from-[#1a1514] to-[#2a2322] text-white flex flex-col items-center justify-between py-16 fm-fade" role="dialog" aria-modal="true" aria-label={`Calling ${rider.name}`}>
          <div className="text-center px-6">
            <span className="w-24 h-24 rounded-full bg-gradient-to-br from-[#c8151d] to-[#ae754d] mx-auto flex items-center justify-center text-3xl font-bold">{initials}</span>
            <p className="text-xl font-semibold mt-4">{rider.name}</p>
            <p className="text-sm text-white/70 mt-1 animate-pulse">Calling via Jovanne’s masked line…</p>
            <p className="text-xs text-white/60 mt-4">+63 2 8••• ••42 · Order {o.number}</p>
            <p className="text-[11px] text-white/60 mt-1">🔒 Neither of you sees the other&apos;s real number</p>
          </div>
          <button onClick={() => setCalling(false)} className="w-16 h-16 rounded-full bg-[#c8151d] flex items-center justify-center shadow-lg" aria-label="End call"><PhoneOff className="w-7 h-7" /></button>
        </div>
      )}

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${o.number}?`}>
        <p className="text-sm text-gray-700 mb-3">{o.paymentStatus === 'paid' ? `Your payment of ${peso(o.total)} will be refunded automatically to ${PAYMENT_LABEL[o.paymentMethod]}.` : 'No payment has been collected for this order.'}</p>
        <div className="space-y-2" role="radiogroup" aria-label="Reason">
          {['Changed my mind', 'Ordered by mistake', 'Delivery takes too long', 'Want to change items'].map((r) => (
            <button key={r} role="radio" aria-checked={cancelReason === r} onClick={() => setCancelReason(r)} className={cn('w-full text-left rounded-xl border px-3 min-h-12 text-sm', cancelReason === r ? 'border-[#c8151d] bg-[#fdf5f5]' : 'border-gray-200')}>{r}</button>
          ))}
        </div>
        <button
          onClick={() => {
            if (!canCancel(s, o)) { flash('This order can no longer be cancelled', 'err'); setCancelOpen(false); return; }
            setOrderStatus(o.id, 'cancelled', { by: shopper.name, note: `Cancelled by customer: ${cancelReason}` });
            setCancelOpen(false);
            flash('Order cancelled');
          }}
          className="mt-4 w-full h-12 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm"
        >
          Cancel order
        </button>
      </Sheet>

      <ReportSheet o={o} item={report} onClose={() => setReport(null)} />
    </Container>
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
    <div className="p-2.5 bg-white rounded-xl border border-gray-200" role="img" aria-label="Pickup QR code">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${N}, 7px)` }}>
        {cells.map((v, i) => <span key={i} className={v ? 'bg-gray-900' : 'bg-white'} style={{ width: 7, height: 7 }} />)}
      </div>
    </div>
  );
}

// ---------- Report a problem ----------
function ReportSheet({ o, item, onClose }: { o: Order; item: OrderItem | null; onClose: () => void }) {
  const { go, flash } = useShop();
  const shopper = useMe();
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
    flash('Report sent — support will reply in the chat');
    go({ name: 'chat', convId: id });
  };
  return (
    <Sheet open={!!item} onClose={onClose} title="Report a problem">
      {item && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-[#faf6f2] p-3 mb-3">
            <span className="text-3xl" aria-hidden><PhotoImg image={item.image} /></span>
            <div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-gray-600">Order {o.number} · {peso(lineTotal(item))}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={cn('rounded-xl border px-3 min-h-12 text-sm font-medium', kind === k ? 'border-[#c8151d] bg-[#fdecec] text-[#a3111a]' : 'border-gray-200 text-gray-800')}>{labels[k]}</button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="What happened" placeholder="Tell us what happened (optional)" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-base md:text-sm outline-none focus:border-[#c8151d] resize-none" />
          <button onClick={() => flash('Photo attached (demo)', 'info')} className="mt-2 h-11 px-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-700 flex items-center gap-1.5"><Camera className="w-4 h-4" /> Add photo</button>
          <PrimaryButton onClick={submit} className="mt-4">Send report &amp; open chat</PrimaryButton>
        </>
      )}
    </Sheet>
  );
}

// ====================== RECEIPT ======================
export function ReceiptScreen({ orderId }: { orderId: string }) {
  const { s, flash } = useShop();
  const shopper = useMe();
  const [report, setReport] = useState<OrderItem | null>(null);
  const o = useMyOrder(orderId);
  useDocumentTitle(o ? `Receipt ${o.number}` : undefined);
  if (!o) return <NotFound title="Receipt" />;
  const b = s.branches.find((x) => x.id === o.branchId);
  const supportOn = moduleOn(s, 'support');
  const vatRate = num(getSetting(s, 'vatRate', o.branchId)) || 12;
  const vatable = o.items.reduce((n, i) => n + (s.products.find((p) => p.id === i.productId)?.tax === 'vat' ? lineTotal(i) : 0), 0);
  const vat = Math.round((vatable - vatable / (1 + vatRate / 100)) * 100) / 100;
  return (
    <Container className="pb-6">
      <ScreenHeader title="Receipt" sub={o.number} right={<StatusBadge status={o.status} />} back={`/my-orders/${o.id}`} />
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl border border-[#eadfd6] shadow-sm p-5 md:p-7 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-[26px] md:text-[34px] font-black text-[#c8151d]/10 -rotate-[24deg] whitespace-nowrap">NOT AN OFFICIAL RECEIPT</span>
          </div>
          <div className="text-center">
            <p className="font-display uppercase tracking-wide text-lg font-semibold text-[#c8151d]">Jovanne’s Meat Shop · {b?.name}</p>
            <p className="text-[11px] text-gray-600">{b?.address}</p>
            <p className="text-[11px] text-gray-600">{b?.phone} · VAT Reg. TIN 008-123-456-000</p>
            <p className="mt-2 inline-block text-[10px] font-bold text-[#a3111a] border border-[#a3111a] rounded px-1.5 py-0.5">NOT AN OFFICIAL RECEIPT</p>
          </div>
          <div className="mt-4 text-xs text-gray-700 space-y-0.5">
            <div className="flex justify-between gap-2"><span>Order</span><span className="font-semibold text-gray-900">{o.number}</span></div>
            <div className="flex justify-between gap-2"><span>Date</span><span>{fmtDateTime(o.placedAt)}</span></div>
            <div className="flex justify-between gap-2"><span>Customer</span><span>{o.customerName}</span></div>
            <div className="flex justify-between gap-2"><span>Fulfillment</span><span className="capitalize">{o.fulfillment}{o.address ? ` · ${o.address.label}` : ''}</span></div>
          </div>
          <div className="border-t border-dashed border-gray-300 my-3" />
          <div className="space-y-2">
            {o.items.map((i, n) => (
              <div key={`${i.productId}-${n}`} className="text-xs">
                <div className="flex justify-between gap-2">
                  <span className={cn('flex-1', (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') && 'line-through text-gray-500')}>{i.substitute?.status === 'accepted' ? i.substitute.name : i.name}</span>
                  <span className="tabular-nums font-medium">{peso(lineTotal(i))}</span>
                </div>
                <div className="flex justify-between gap-2 text-[11px] text-gray-600">
                  <span>{i.soldByWeight ? `${fmtKg(i.actualWeightKg ?? i.estWeightKg ?? 1)}${i.actualWeightKg ? '' : ' est.'} × ${peso(i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice)}/kg` : `${i.qty} × ${peso(i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice)}`}</span>
                  {isDone(o) && supportOn && <button onClick={() => setReport(i)} className="text-[#a3111a] font-semibold">Report a problem</button>}
                </div>
                {i.cut && <p className="text-[11px] text-gray-600">{i.cut.name}{cutFeeText(i.cut) ? ` · cut fee ${cutFeeText(i.cut)}` : ''}</p>}
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-gray-300 my-3" />
          <div className="text-xs space-y-1">
            <div className="flex justify-between gap-2"><span className="text-gray-700">Subtotal</span><span>{peso(o.subtotal)}</span></div>
            {o.fulfillment === 'delivery' && <div className="flex justify-between gap-2"><span className="text-gray-700">Delivery fee</span><span>{peso(o.deliveryFee)}</span></div>}
            {o.feeRule && <p className="text-[11px] text-gray-500 -mt-0.5">{o.feeRule}</p>}
            {o.serviceFee > 0 && <div className="flex justify-between gap-2"><span className="text-gray-700">Service fee</span><span>{peso(o.serviceFee)}</span></div>}
            {o.discount > 0 && <div className="flex justify-between gap-2 text-emerald-800"><span>Discount{o.voucherCode ? ` (${o.voucherCode})` : ''}</span><span>−{peso(o.discount)}</span></div>}
            <div className="flex justify-between gap-2 text-sm font-bold pt-1"><span>TOTAL</span><span className="text-[#c8151d]">{peso(o.total)}</span></div>
            <div className="flex justify-between gap-2 text-[11px] text-gray-600"><span>VAT ({vatRate}%) included</span><span>{peso(vat)}</span></div>
            <div className="flex justify-between gap-2 text-xs pt-1"><span className="text-gray-700">Paid via {PAYMENT_LABEL[o.paymentMethod]}</span><span className="capitalize">{o.paymentStatus.replace('_', ' ')}</span></div>
            {o.refundedAmount > 0 && <div className="flex justify-between gap-2 text-xs text-emerald-800"><span>Refunded</span><span>{peso(o.refundedAmount)}</span></div>}
          </div>
          <p className="text-[11px] text-center text-gray-500 mt-4">The BIR official receipt is issued by the branch upon {o.fulfillment === 'delivery' ? 'delivery' : 'pickup'}.</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => { flash('Opening the print dialog — choose “Save as PDF”', 'info'); setTimeout(() => window.print(), 300); }} className="h-11 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300 flex items-center justify-center gap-1.5"><Download className="w-4 h-4" /> Download</button>
          <button onClick={() => flash('Share sheet opened (demo)', 'info')} className="h-11 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300 flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" /> Share</button>
        </div>
        {OPEN_STATUSES.includes(o.status) && <Link href={`/my-orders/${o.id}`} className="mt-3 w-full h-12 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm flex items-center justify-center">Track order</Link>}
        {isDone(o) && !supportOn && <CallBranchButton branch={b ?? s.branches[0]} label="Problem with an item? Call the branch" className="mt-3" />}
        {isDone(o) && !o.rating && ratingsEnabled(s, o.branchId) && (
          <Link href={`/my-orders/${o.id}/rate`} className="mt-3 w-full h-12 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm flex items-center justify-center">Rate this order</Link>
        )}
        {o.rating && ratingsEnabled(s, o.branchId) && (
          <Card className="mt-3 p-4 text-xs text-gray-700">
            <p className="font-semibold text-gray-900 text-sm">Your rating</p>
            <p className="mt-1">Order {'★'.repeat(o.rating.order)}{'☆'.repeat(5 - o.rating.order)}{o.rating.rider ? ` · Rider ${'★'.repeat(o.rating.rider)}` : ''}</p>
            {o.rating.tags.length > 0 && <p className="mt-0.5">{o.rating.tags.join(' · ')}</p>}
            {o.rating.comment && <p className="mt-0.5 italic">“{o.rating.comment}”</p>}
          </Card>
        )}
        <p className="text-center text-[11px] text-gray-500 mt-3">{shopper.email}</p>
      </div>
      <ReportSheet o={o} item={report} onClose={() => setReport(null)} />
    </Container>
  );
}

// ====================== RATE ======================
const TAGS = ['Great service', 'Fresh meat', 'Right cut', 'Still cold', 'Friendly rider', 'On time', 'Late', 'Not cold', 'Wrong item'];

export function RateScreen({ orderId }: { orderId: string }) {
  const { s, replace, flash } = useShop();
  const shopper = useMe();
  const o = useMyOrder(orderId);
  const [orderStars, setOrderStars] = useState(o?.rating?.order ?? 0);
  const [riderStars, setRiderStars] = useState(o?.rating?.rider ?? 0);
  const [tags, setTags] = useState<string[]>(o?.rating?.tags ?? []);
  const [comment, setComment] = useState(o?.rating?.comment ?? '');
  if (!o) return <NotFound title="Rate" />;
  if (!ratingsEnabled(s, o.branchId)) {
    return (
      <Container className="pb-6">
        <ScreenHeader title="Rate your order" back={`/my-orders/${o.id}`} />
        <p className="text-sm text-gray-600 py-10 text-center">Ratings are not available yet.</p>
      </Container>
    );
  }
  const rider = s.riders.find((r) => r.id === o.riderId);
  const save = () => {
    mutate((d) => {
      const od = d.orders.find((x) => x.id === o.id);
      if (!od) return;
      od.rating = { order: orderStars, rider: rider ? riderStars || undefined : undefined, tags, comment: comment.trim() || undefined };
      od.timeline.push({ status: 'note', at: new Date().toISOString(), by: shopper.name, note: `Rated order ${orderStars}★${rider && riderStars ? `, rider ${riderStars}★` : ''}${tags.length ? ` (${tags.join(', ')})` : ''}` });
    });
    flash('Thanks for your feedback!');
    replace(`/my-orders/${o.id}/receipt`);
  };
  const submitBtn = <PrimaryButton onClick={save} disabled={!orderStars}>Submit rating</PrimaryButton>;
  return (
    <Container className="pb-6">
      <ScreenHeader title="Rate your order" sub={o.number} back={`/my-orders/${o.id}`} />
      <div className="max-w-xl mx-auto space-y-3">
        <Card className="p-5 text-center">
          <p className="text-sm font-semibold">How was your order?</p>
          <p className="text-xs text-gray-600">{s.branches.find((b) => b.id === o.branchId)?.name} branch · {o.items.length} items</p>
          <Stars value={orderStars} onChange={setOrderStars} />
        </Card>
        {rider && (
          <Card className="p-5 text-center">
            <span className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-[#2a2322] to-[#c8151d] text-white font-bold flex items-center justify-center"><Bike className="w-5 h-5" /></span>
            <p className="text-sm font-semibold mt-2">Rate {rider.name}</p>
            <Stars value={riderStars} onChange={setRiderStars} />
          </Card>
        )}
        {o.fulfillment === 'pickup' && !rider && <Card className="p-3 text-xs text-gray-600 flex items-center gap-2"><Store className="w-4 h-4" /> Pickup order — no rider to rate.</Card>}
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2">What stood out?</p>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => {
              const on = tags.includes(t);
              return (
                <button key={t} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])} aria-pressed={on}
                  className={cn('h-11 md:h-9 px-3 rounded-full text-xs font-medium border', on ? 'bg-[#fdecec] border-[#c8151d] text-[#a3111a]' : 'border-gray-200 text-gray-700')}>{t}</button>
              );
            })}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} aria-label="Comment" placeholder="Add a comment (optional)" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-base md:text-sm outline-none focus:border-[#c8151d] resize-none" />
        </Card>
        <div className="hidden md:block">{submitBtn}</div>
      </div>
      <MobileActionBar>{submitBtn}</MobileActionBar>
    </Container>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex justify-center gap-1 mt-3">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} className="w-11 h-11 flex items-center justify-center" aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={n <= value}>
          <Star className={cn('w-9 h-9 transition', n <= value ? 'fill-amber-400 text-amber-400 scale-105' : 'text-gray-300')} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
