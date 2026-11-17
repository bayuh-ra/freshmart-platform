'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, Bike, Check, CheckCircle2, Clock, Columns3, HandCoins, Handshake, List, Package, PauseCircle, Phone, Plus, Search,
  Snowflake, Store, Truck, X, Zap, CalendarDays, CircleCheck,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { moduleOn } from '@/src/lib/platform';
import { AccessDenied, EmptyState, inputClass, selectClass } from '@/src/components/common';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { addAudit, currentUserName, mutate, useStore } from '@/src/lib/store';
import { useNow } from '@/src/components/delivery/helpers';
import {
  CHANNEL_LABEL, PAYMENT_LABEL, STATUS_LABEL, applyStatus, can, confirmOrder, fmtTime, getSetting, isToday, num, peso, timeAgo,
} from '@/src/lib/logic';
import type { Order, OrderChannel, OrderStatus, PaymentStatus } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { RejectDialog } from './_shared';

// Jovanne's Meat Shop — Orders (order desk board + list), matching the approved design.
const ICON = { strokeWidth: 1.75 };
const display = { fontFamily: 'var(--font-oswald)' } as const;
const pesoWhole = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

type ColumnKey = 'awaiting' | 'preparing' | 'ready' | 'out' | 'done';
const COLUMNS: { key: ColumnKey; title: string; statuses: OrderStatus[]; dot: string }[] = [
  { key: 'awaiting', title: 'Awaiting confirmation', statuses: ['placed', 'awaiting_confirmation'], dot: '#d6202a' },
  { key: 'preparing', title: 'Preparing', statuses: ['confirmed', 'preparing', 'awaiting_shopper'], dot: '#8b2f6e' },
  { key: 'ready', title: 'Ready', statuses: ['ready'], dot: '#1f6f6a' },
  { key: 'out', title: 'Out for delivery', statuses: ['out_for_delivery', 'failed_delivery'], dot: '#2c4f9e' },
  { key: 'done', title: 'Completed today', statuses: ['delivered', 'collected', 'cancelled'], dot: '#2e6b3a' },
];

const STATUS_PILL: Partial<Record<OrderStatus, string>> = {
  awaiting_confirmation: 'bg-red-50 text-[#c8151d]', placed: 'bg-red-50 text-[#c8151d]', confirmed: 'bg-orange-50 text-[#b4651c]',
  preparing: 'bg-fuchsia-50 text-[#8b2f6e]', awaiting_shopper: 'bg-fuchsia-50 text-[#8b2f6e]', ready: 'bg-teal-50 text-[#1f6f6a]',
  out_for_delivery: 'bg-blue-50 text-[#2c4f9e]', delivered: 'bg-green-50 text-[#2e6b3a]', collected: 'bg-green-50 text-[#2e6b3a]',
  cancelled: 'bg-stone-100 text-stone-600', failed_delivery: 'bg-orange-50 text-orange-700',
};

function itemCount(o: Order) {
  return o.items.filter((i) => i.pickStatus !== 'removed').reduce((n, i) => n + (i.soldByWeight ? 1 : i.qty), 0);
}
function isAwaiting(o: Order) {
  return o.status === 'awaiting_confirmation' || o.status === 'placed';
}
function mmss(sec: number) {
  const a = Math.abs(Math.floor(sec));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

export default function OrdersPage() {
  const s = useStore();
  const now = useNow(1000);
  const router = useRouter();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fChannel, setFChannel] = useState('all');
  const [fFul, setFFul] = useState('all');
  const [fPay, setFPay] = useState('all');
  const [fDate, setFDate] = useState('today');
  const [fRider, setFRider] = useState('all');

  const branchId = s.session.branchId;
  const branch = s.branches.find((b) => b.id === branchId);
  const timeoutMins = num(getSetting(s, 'confirmTimeoutMins', branchId)) || 10;
  const timeoutAction = String(getSetting(s, 'timeoutAction', branchId));
  const bagRequired = getSetting(s, 'insulatedBagRequired', branchId) === true;

  const branchOrders = useMemo(() => s.orders.filter((o) => o.branchId === branchId), [s.orders, branchId]);
  const boardOrders = branchOrders.filter((o) => (['delivered', 'collected', 'cancelled'].includes(o.status) ? isToday(o.completedAt ?? o.updatedAt) : true));

  if (!can(s, 'orders.view')) {
    return <DashboardLayout title="Orders" eyebrow="Order desk"><AccessDenied permission="orders.view" /></DashboardLayout>;
  }

  const canEdit = can(s, 'orders.edit');
  const ordersToday = branchOrders.filter((o) => isToday(o.placedAt)).length;
  const salesToday = branchOrders.filter((o) => isToday(o.placedAt) && o.status !== 'cancelled').reduce((t, o) => t + o.total - o.refundedAmount, 0);
  const unacked = branchOrders.filter((o) => !o.acknowledged).length;
  const riderOf = (o: Order) => s.riders.find((r) => r.id === o.riderId);

  const doConfirm = (o: Order) => {
    confirmOrder(o.id, currentUserName());
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Order confirmed', detail: `${o.number} confirmed from the order board`, branchId: o.branchId }));
    toast.success(`${o.number} confirmed`, { description: 'Moved to Preparing · customer notified' });
  };
  const markReady = (o: Order, insulated: boolean) => {
    if (o.coldChain && bagRequired && !insulated) { toast.error('Pack check needed', { description: 'Tick "Packed in insulated bag with ice packs" first.' }); return; }
    mutate((d) => {
      const od = d.orders.find((x) => x.id === o.id);
      if (!od) return;
      od.items.forEach((i) => { if (i.pickStatus === 'pending') i.pickStatus = 'picked'; });
      if (od.coldChain && insulated) {
        od.insulatedPacked = true;
        od.timeline.push({ status: 'edit', at: new Date().toISOString(), by: currentUserName(d), note: 'Pack check: packed in insulated bag with ice packs' });
      }
      applyStatus(d, o.id, 'ready', { note: o.fulfillment === 'pickup' ? 'Ready for pickup — customer notified' : 'Ready — awaiting rider' });
      addAudit(d, { module: 'Orders', action: 'Marked ready', detail: o.number, branchId: o.branchId });
    });
    toast.success(`${o.number} is ready`, { description: o.fulfillment === 'delivery' ? 'Assign a rider next' : 'Customer notified to pick up' });
  };
  const markDelivered = (o: Order) => {
    mutate((d) => {
      applyStatus(d, o.id, 'delivered', { note: 'Marked delivered from the order desk' });
      addAudit(d, { module: 'Orders', action: 'Marked delivered', detail: o.number, branchId: o.branchId });
    });
    toast.success(`${o.number} delivered`, { description: o.paymentMethod === 'cod' ? `Cash ${peso(o.total)} recorded with the rider` : 'Customer notified' });
  };
  const acknowledgeAll = () => {
    mutate((d) => { d.orders.forEach((o) => { if (o.branchId === branchId) o.acknowledged = true; }); });
    toast.success('New-order alerts acknowledged');
  };

  // ---------- List view filtering ----------
  const listOrders = branchOrders.filter((o) => {
    if (fStatus !== 'all' && o.status !== fStatus) return false;
    if (fChannel !== 'all' && o.channel !== fChannel) return false;
    if (fFul !== 'all' && o.fulfillment !== fFul) return false;
    if (fPay !== 'all' && o.paymentStatus !== fPay) return false;
    if (fRider !== 'all' && (fRider === 'none' ? !!o.riderId : o.riderId !== fRider)) return false;
    if (fDate === 'today' && !isToday(o.placedAt)) return false;
    if (fDate === '7d' && now - new Date(o.placedAt).getTime() > 7 * 86400000) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (!o.number.toLowerCase().includes(t) && !o.customerName.toLowerCase().includes(t) && !o.customerMobile.replace(/\s/g, '').includes(t.replace(/\s/g, ''))) return false;
    }
    return true;
  }).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const branchRiders = s.riders.filter((r) => r.branchIds.includes(branchId));
  const showChannel = moduleOn(s, 'walkin');

  // Column sub-lines
  const colSub = (key: ColumnKey, list: Order[]) => {
    if (key === 'awaiting') {
      const late = list.filter((o) => (now - new Date(o.placedAt).getTime()) / 60000 >= timeoutMins).length;
      return late ? { text: `${late} past the ${timeoutMins}-min limit`, warn: true } : { text: `Confirm within ${timeoutMins} min`, warn: false };
    }
    if (key === 'preparing') return { text: `${list.length} still to pack`, warn: false };
    if (key === 'ready') {
      const n = list.filter((o) => o.fulfillment === 'delivery' && !o.riderId).length;
      return n ? { text: `${n} need${n === 1 ? 's' : ''} a rider`, warn: true } : { text: 'All handled', warn: false };
    }
    if (key === 'out') {
      const cod = list.filter((o) => o.paymentStatus === 'pending').length;
      const failed = list.filter((o) => o.status === 'failed_delivery').length;
      return { text: failed ? `${failed} failed attempt${failed === 1 ? '' : 's'}` : `${cod} cash on delivery`, warn: failed > 0 };
    }
    return { text: `${list.filter((o) => o.status === 'cancelled').length} cancelled`, warn: false };
  };

  return (
    <DashboardLayout title="Orders" eyebrow="Order desk">
      {branch?.status === 'paused' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <PauseCircle className="w-5 h-5 mt-0.5 shrink-0" {...ICON} />
          <div>
            <p className="font-semibold text-sm">{branch.name} is paused — customers cannot place new orders.</p>
            <p className="text-xs mt-0.5">{branch.pausedMessage || 'Existing orders continue through the normal flow.'}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-5 md:mb-6">
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{branch?.name ?? 'Branch'} · Open {branch?.hours}</p>
          <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={display}>Orders</h1>
          <p className="mt-2 text-sm text-gray-600">
            Confirm new orders within {timeoutMins} minutes or {/alert manager/i.test(timeoutAction) ? 'the manager is alerted' : `the order is handled by "${timeoutAction}"`} · {ordersToday} orders today
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unacked > 0 && (
            <button onClick={acknowledgeAll} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-red-200 bg-white text-sm font-semibold text-[#c8151d] hover:bg-red-50">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
              Acknowledge {unacked} new
            </button>
          )}
          <div className="inline-flex items-center gap-3 h-11 px-4 rounded-xl bg-[#2a2322] text-white">
            <span className="uppercase tracking-[0.15em] text-xs text-[#e0b38c]" style={display}>Sales today</span>
            <span className="text-2xl font-bold text-[#ec1b26] tabular-nums" style={display}>₱{Math.round(salesToday).toLocaleString('en-PH')}</span>
          </div>
          <div className="inline-flex rounded-xl bg-[#ece4dd] p-1">
            <button onClick={() => setView('board')} className={cn('h-9 px-4 rounded-lg text-sm inline-flex items-center gap-2', view === 'board' ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600')}><Columns3 className="w-4 h-4" {...ICON} />Board</button>
            <button onClick={() => setView('list')} className={cn('h-9 px-4 rounded-lg text-sm inline-flex items-center gap-2', view === 'list' ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600')}><List className="w-4 h-4" {...ICON} />List</button>
          </div>
          {can(s, 'orders.create') && moduleOn(s, 'walkin') && (
            <button onClick={() => router.push('/orders/new')} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#d6202a] hover:bg-[#c8151d] text-white text-sm font-semibold"><Plus className="w-4 h-4" />New order</button>
          )}
        </div>
      </div>

      {view === 'board' ? (
        /* Phones: columns swipe sideways. Tablets: 2 columns. Desktop: all 5. */
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 md:mx-0 md:px-0 md:pb-0 md:grid md:gap-4 md:grid-cols-2 xl:grid-cols-5 md:overflow-visible items-start">
          {COLUMNS.map((col) => {
            const list = boardOrders
              .filter((o) => col.statuses.includes(o.status))
              .sort((a, b) => col.key === 'done'
                ? new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime()
                : new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());
            const sub = colSub(col.key, list);
            return (
              <section key={col.key} className="rounded-2xl bg-[#efe8e2] p-3 min-h-[220px] w-[86%] max-w-[340px] shrink-0 snap-start md:w-auto md:max-w-none md:min-w-0">
                <div className="px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: col.dot }} />
                    <h2 className="text-xl font-medium text-[#1d1716] truncate" style={display}>{col.title}</h2>
                    <span className="min-w-6 h-6 px-1.5 rounded-full bg-white text-xs font-semibold text-gray-700 flex items-center justify-center">{list.length}</span>
                  </div>
                  <p className={cn('mt-0.5 pl-[18px] text-sm', sub.warn ? 'text-[#c8151d]' : 'text-gray-500')}>{sub.text}</p>
                </div>
                <div className="space-y-3">
                  {list.length === 0 && <p className="text-sm text-gray-400 text-center py-10">No orders</p>}
                  {list.map((o) => (
                    <OrderCard key={o.id} o={o} now={now} timeoutMins={timeoutMins} rider={riderOf(o)}
                      bagRequired={bagRequired && !!o.coldChain} canEdit={canEdit} showChannel={showChannel}
                      onConfirm={() => doConfirm(o)} onReject={() => setRejecting(o)} onReady={(ins) => markReady(o, ins)} onDelivered={() => markDelivered(o)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="rounded-2xl bg-[#fffdfb] border border-[#eadfd6] overflow-hidden">
          <div className="p-4 md:p-5 flex flex-wrap items-center gap-2 border-b border-[#f0e8e2]">
            <div className="relative w-full sm:w-auto">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" {...ICON} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no., customer or mobile" className={cn(inputClass, 'pl-8 w-full sm:w-64')} />
            </div>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selectClass}>
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).filter((k) => k !== 'awaiting_shopper').map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
            {showChannel && (
              <select value={fChannel} onChange={(e) => setFChannel(e.target.value)} className={selectClass}>
                <option value="all">All channels</option>
                {(Object.keys(CHANNEL_LABEL) as OrderChannel[]).map((k) => <option key={k} value={k}>{CHANNEL_LABEL[k]}</option>)}
              </select>
            )}
            <select value={fFul} onChange={(e) => setFFul(e.target.value)} className={selectClass}>
              <option value="all">Delivery &amp; pickup</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
            </select>
            <select value={fPay} onChange={(e) => setFPay(e.target.value)} className={selectClass}>
              <option value="all">Any payment status</option>
              {['pending', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded'].map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
            </select>
            <select value={fRider} onChange={(e) => setFRider(e.target.value)} className={selectClass}>
              <option value="all">Any rider</option>
              <option value="none">No rider</option>
              {branchRiders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={fDate} onChange={(e) => setFDate(e.target.value)} className={selectClass}>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="all">All dates</option>
            </select>
            <span className="ml-auto text-sm text-gray-500">{listOrders.length} orders</span>
          </div>
          {listOrders.length === 0 ? (
            <EmptyState title="No orders match these filters" sub="Try clearing a filter or widening the date range." icon={<Search className="w-8 h-8" {...ICON} />} />
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                      <th className="text-left font-semibold py-2.5 pl-5">Order</th>
                      <th className="text-left font-semibold py-2.5">Customer</th>
                      <th className="text-left font-semibold py-2.5">Fulfillment</th>
                      <th className="text-left font-semibold py-2.5">Status</th>
                      <th className="text-left font-semibold py-2.5">Payment</th>
                      <th className="text-left font-semibold py-2.5">Rider</th>
                      <th className="text-right font-semibold py-2.5">Total</th>
                      <th className="text-right font-semibold py-2.5 pr-5">Placed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0e8e2]">
                    {listOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-[#fbf7f3] cursor-pointer" onClick={() => router.push(`/orders/${o.id}`)}>
                        <td className="py-3 pl-5 font-bold text-[#c8151d] whitespace-nowrap">{o.number}</td>
                        <td className="py-3"><p className="font-medium text-[#1d1716]">{o.customerName}</p><p className="text-xs text-gray-500">{o.customerMobile}</p></td>
                        <td className="py-3"><span className="inline-flex flex-wrap items-center gap-1.5"><FulfillPill o={o} />{o.coldChain && <ColdPill />}</span></td>
                        <td className="py-3"><span className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium whitespace-nowrap', STATUS_PILL[o.status])}><span className="w-1.5 h-1.5 rounded-full bg-current" />{STATUS_LABEL[o.status]}</span></td>
                        <td className="py-3"><PayChip status={o.paymentStatus} /><p className="text-[11px] text-gray-500 mt-0.5">{PAYMENT_LABEL[o.paymentMethod]}</p></td>
                        <td className="py-3 text-gray-600">{riderOf(o)?.name ?? '—'}</td>
                        <td className="py-3 text-right font-bold tabular-nums">{peso(o.total)}</td>
                        <td className="py-3 pr-5 text-right text-gray-500 whitespace-nowrap">{isToday(o.placedAt) ? fmtTime(o.placedAt) : new Date(o.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br /><span className="text-xs">{timeAgo(o.placedAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="lg:hidden divide-y divide-[#f0e8e2]">
                {listOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="block px-4 py-3.5 hover:bg-[#fbf7f3]">
                      <div className="flex items-baseline justify-between gap-2">
                        <p><span className="font-bold text-[#c8151d]">{o.number}</span> <span className="text-sm text-gray-500 ml-1">{timeAgo(o.placedAt)}</span></p>
                        <p className="font-bold tabular-nums">{peso(o.total)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="font-medium text-[#1d1716] truncate">{o.customerName}</p>
                        <PayChip status={o.paymentStatus} />
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium', STATUS_PILL[o.status])}><span className="w-1.5 h-1.5 rounded-full bg-current" />{STATUS_LABEL[o.status]}</span>
                        <FulfillPill o={o} />
                        {o.coldChain && <ColdPill />}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <RejectDialog order={rejecting} reasons={s.rejectReasons} onClose={() => setRejecting(null)} />
    </DashboardLayout>
  );
}

// ---------------- pieces ----------------
function FulfillPill({ o }: { o: Order }) {
  const C = o.fulfillment === 'delivery' ? Truck : Store;
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#f3ece6] text-xs font-medium text-gray-700 whitespace-nowrap">
      <C className="w-3.5 h-3.5" {...ICON} />{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
    </span>
  );
}
function ColdPill() {
  return <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-sky-50 text-xs font-medium text-[#1f5f78] whitespace-nowrap"><Snowflake className="w-3.5 h-3.5" {...ICON} />Cold chain</span>;
}
function PayChip({ status }: { status: PaymentStatus }) {
  const map: Partial<Record<PaymentStatus, [string, string]>> = {
    paid: ['Paid', 'bg-green-50 text-[#2e6b3a]'], pending: ['Pending', 'bg-amber-50 text-[#a0620f]'], refunded: ['Refunded', 'bg-stone-100 text-stone-600'],
    partially_refunded: ['Part refunded', 'bg-stone-100 text-stone-600'], failed: ['Failed', 'bg-red-50 text-red-700'], expired: ['Expired', 'bg-stone-100 text-stone-600'],
  };
  const [label, cls] = map[status] ?? [status, 'bg-stone-100 text-stone-600'];
  return <span className={cn('inline-flex items-center h-6 px-2 rounded-md text-xs font-medium whitespace-nowrap', cls)}>{label}</span>;
}

function OrderCard({ o, now, timeoutMins, rider, bagRequired, canEdit, showChannel, onConfirm, onReject, onReady, onDelivered }: {
  o: Order; now: number; timeoutMins: number; rider?: { name: string; phone: string };
  bagRequired: boolean; canEdit: boolean; showChannel: boolean;
  onConfirm: () => void; onReject: () => void; onReady: (insulated: boolean) => void; onDelivered: () => void;
}) {
  const [bagOk, setBagOk] = useState(false);
  const awaiting = isAwaiting(o);
  const remainingSec = timeoutMins * 60 - (now - new Date(o.placedAt).getTime()) / 1000;
  const overdue = awaiting && remainingSec <= 0;
  const warning = awaiting && !overdue && remainingSec < (timeoutMins * 60) / 2;
  const flash = overdue || (!o.acknowledged && awaiting);
  const preparing = ['confirmed', 'preparing', 'awaiting_shopper'].includes(o.status);
  const picked = o.items.filter((i) => i.pickStatus !== 'pending').length;
  const unpaid = o.paymentStatus === 'pending';
  const n = itemCount(o);

  return (
    <article className={cn('bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow', overdue ? 'border-red-200' : 'border-[#eadfd6]', flash && 'new-order-flash')}>
      <Link href={`/orders/${o.id}`} className="block group">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[#c8151d] group-hover:underline">{o.number}</span>
          <span className="text-xs text-gray-500 inline-flex items-center gap-1 whitespace-nowrap"><Clock className="w-3.5 h-3.5" {...ICON} />{timeAgo(o.placedAt)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <p className="text-base font-semibold text-[#1d1716] truncate">{o.customerName}</p>
          <p className="text-base font-bold tabular-nums shrink-0">{pesoWhole(o.total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <FulfillPill o={o} />
          {o.coldChain && <ColdPill />}
          {showChannel && o.channel !== 'app' && <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-violet-50 text-xs font-medium text-violet-700">{CHANNEL_LABEL[o.channel]}</span>}
          {o.autoConfirmed && <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-green-50 text-xs font-medium text-[#2e6b3a]"><Zap className="w-3.5 h-3.5" {...ICON} />Auto-confirmed</span>}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2.5 text-sm text-gray-600">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-gray-400" {...ICON} />{o.slot} · {n} item{n !== 1 ? 's' : ''}</span>
          <PayChip status={o.paymentStatus} />
        </div>
      </Link>

      {/* Awaiting confirmation */}
      {awaiting && (
        <div className={cn('mt-3 rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-2', overdue ? 'bg-red-50 text-[#c8151d]' : warning ? 'bg-amber-50 text-amber-800' : 'bg-[#f6f0eb] text-gray-700')}>
          {overdue ? <AlertTriangle className="w-4 h-4 shrink-0" {...ICON} /> : <Clock className="w-4 h-4 shrink-0" {...ICON} />}
          {overdue ? `Overdue ${mmss(remainingSec)} · manager alerted` : `Confirm within ${mmss(remainingSec)}`}
          {!o.acknowledged && <span className="ml-auto rounded bg-[#d6202a] text-white px-1.5 py-px text-[10px] font-bold">NEW</span>}
        </div>
      )}
      {canEdit && awaiting && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onConfirm} className="h-11 rounded-lg bg-[#d6202a] hover:bg-[#c8151d] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Check className="w-4 h-4" strokeWidth={2.5} />Confirm</button>
          <button onClick={onReject} className="h-11 rounded-lg border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] inline-flex items-center justify-center gap-1.5"><X className="w-4 h-4" {...ICON} />Reject</button>
        </div>
      )}

      {/* Preparing */}
      {preparing && (
        <>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#8b2f6e]">Picked {picked} of {o.items.length}</span>
              <span className="text-gray-400">{picked === o.items.length ? 'packing' : 'picking'}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-[#f0e8e2]"><div className="h-1.5 rounded-full bg-[#8b2f6e]" style={{ width: `${(picked / Math.max(1, o.items.length)) * 100}%` }} /></div>
          </div>
          {canEdit && bagRequired && (
            <label className="mt-3 flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-medium text-[#1f5f78] cursor-pointer">
              <Checkbox checked={bagOk} onCheckedChange={(v) => setBagOk(v === true)} className="bg-white" />
              Packed in insulated bag with ice packs
            </label>
          )}
          {canEdit && (
            <button onClick={() => onReady(bagOk)} disabled={bagRequired && !bagOk}
              className="mt-3 w-full h-11 rounded-lg border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] disabled:text-gray-400 disabled:hover:bg-white inline-flex items-center justify-center gap-2">
              <Package className="w-4 h-4" {...ICON} />{bagRequired && !bagOk ? 'Pack first, then mark ready' : 'Mark ready'}
            </button>
          )}
        </>
      )}

      {/* Ready */}
      {o.status === 'ready' && o.fulfillment === 'pickup' && (
        <>
          {unpaid && <p className="mt-3 text-sm font-medium text-[#a0620f] inline-flex items-center gap-1.5"><HandCoins className="w-4 h-4" {...ICON} />Collect {pesoWhole(o.total)} at the counter</p>}
          <Link href={`/orders/${o.id}`} className="mt-3 w-full h-11 rounded-lg bg-[#2a2322] hover:bg-[#3d3432] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"><Handshake className="w-4 h-4" {...ICON} />Hand over to customer</Link>
        </>
      )}
      {o.status === 'ready' && o.fulfillment === 'delivery' && (
        rider ? (
          <p className="mt-3 text-sm text-gray-600 inline-flex items-center gap-1.5"><Bike className="w-4 h-4" {...ICON} />{rider.name} is on the way to pick up</p>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium text-[#c8151d] inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" {...ICON} />No rider assigned yet</p>
            <Link href={`/orders/${o.id}`} className="mt-3 w-full h-11 rounded-lg bg-[#2a2322] hover:bg-[#3d3432] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"><Bike className="w-4 h-4" {...ICON} />Assign rider</Link>
          </>
        )
      )}

      {/* Out for delivery */}
      {o.status === 'out_for_delivery' && (
        <>
          {rider && (
            <div className="mt-3 rounded-lg bg-[#eef3fb] px-3 py-2.5 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[#2c4f9e] text-white flex items-center justify-center shrink-0"><Bike className="w-4 h-4" {...ICON} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1d2f5e] truncate">{rider.name}</p>
                <p className="text-xs text-[#2c4f9e]">{unpaid ? `Collect ${pesoWhole(o.total)} cash` : 'Prepaid — nothing to collect'}</p>
              </div>
              <a href={`tel:${rider.phone.replace(/\s/g, '')}`} className="w-9 h-9 rounded-full bg-white text-[#2c4f9e] flex items-center justify-center shrink-0 shadow-sm" aria-label={`Call ${rider.name}`}><Phone className="w-4 h-4" {...ICON} /></a>
            </div>
          )}
          {canEdit && (
            <button onClick={onDelivered} className="mt-3 w-full h-11 rounded-lg border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] inline-flex items-center justify-center gap-2"><CircleCheck className="w-4 h-4" {...ICON} />Mark delivered</button>
          )}
        </>
      )}
      {o.status === 'failed_delivery' && (
        <Link href={`/orders/${o.id}`} className="mt-3 w-full h-11 rounded-lg bg-[#c8151d] text-white text-sm font-semibold inline-flex items-center justify-center">Resolve failed delivery</Link>
      )}

      {/* Completed */}
      {['delivered', 'collected', 'cancelled'].includes(o.status) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold', STATUS_PILL[o.status])}>
            {o.status === 'cancelled' ? <X className="w-3.5 h-3.5" {...ICON} /> : <CheckCircle2 className="w-3.5 h-3.5" {...ICON} />}{STATUS_LABEL[o.status]}
          </span>
          {o.status === 'cancelled' && o.rejectReason && <span className="text-sm text-gray-500 truncate">{o.rejectReason}</span>}
        </div>
      )}
    </article>
  );
}
