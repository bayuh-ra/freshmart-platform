'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, Bike, CheckCircle2, Clock, Columns3, List, PackageCheck, PauseCircle, Plus, Search, ShoppingBag, Store, X, Zap,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { moduleOn } from '@/src/lib/platform';
import { AccessDenied, EmptyState, PaymentBadge, Pill, StatCard, StatusBadge, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { addAudit, currentUserName, mutate, useStore, useTick } from '@/src/lib/store';
import {
  CHANNEL_LABEL, PAYMENT_LABEL, STATUS_LABEL, applyStatus, can, confirmOrder, fmtTime, getSetting, isToday, num, peso, pesoShort, timeAgo,
} from '@/src/lib/logic';
import type { Order, OrderChannel, OrderStatus } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { CHANNEL_PILL, RejectDialog } from './_shared';

const ICON = { strokeWidth: 1.75 };

type ColumnKey = 'awaiting' | 'preparing' | 'ready' | 'out' | 'done';
const COLUMNS: { key: ColumnKey; title: string; statuses: OrderStatus[]; dot: string }[] = [
  { key: 'awaiting', title: 'Awaiting confirmation', statuses: ['placed', 'awaiting_confirmation'], dot: 'bg-red-500' },
  { key: 'preparing', title: 'Confirmed / Preparing', statuses: ['confirmed', 'preparing', 'awaiting_shopper'], dot: 'bg-purple-500' },
  { key: 'ready', title: 'Ready', statuses: ['ready'], dot: 'bg-cyan-500' },
  { key: 'out', title: 'Out for delivery', statuses: ['out_for_delivery', 'failed_delivery'], dot: 'bg-indigo-500' },
  { key: 'done', title: 'Completed today', statuses: ['delivered', 'collected', 'cancelled'], dot: 'bg-green-500' },
];


function itemCount(o: Order) {
  return o.items.filter((i) => i.pickStatus !== 'removed').reduce((n, i) => n + (i.soldByWeight ? 1 : i.qty), 0);
}

export default function OrdersBoardPage() {
  const s = useStore();
  useTick(1000);
  const router = useRouter();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selected, setSelected] = useState<string[]>([]);
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

  const branchOrders = useMemo(() => s.orders.filter((o) => o.branchId === branchId), [s.orders, branchId]);
  const boardOrders = branchOrders.filter((o) => {
    if (['delivered', 'collected', 'cancelled'].includes(o.status)) return isToday(o.completedAt ?? o.updatedAt);
    return true;
  });

  if (!can(s, 'orders.view')) {
    return <DashboardLayout title="Live Orders" eyebrow="Order Desk"><AccessDenied permission="orders.view" /></DashboardLayout>;
  }

  const canEdit = can(s, 'orders.edit');
  const count = (st: OrderStatus[]) => branchOrders.filter((o) => st.includes(o.status)).length;
  const salesToday = branchOrders.filter((o) => isToday(o.placedAt) && o.status !== 'cancelled').reduce((t, o) => t + o.total - o.refundedAmount, 0);
  const ordersToday = branchOrders.filter((o) => isToday(o.placedAt)).length;
  const overdue = branchOrders.filter((o) => isAwaiting(o) && ageMins(o) >= timeoutMins).length;

  const awaitingIds = boardOrders.filter(isAwaiting).map((o) => o.id);
  const selectedValid = selected.filter((id) => awaitingIds.includes(id));

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const doConfirm = (o: Order) => {
    confirmOrder(o.id, currentUserName());
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Order confirmed', detail: `${o.number} confirmed from live board`, branchId: o.branchId }));
    toast.success(`${o.number} confirmed`, { description: `Moved to Preparing · shopper notified` });
  };
  const bulkConfirm = () => {
    const list = boardOrders.filter((o) => selectedValid.includes(o.id));
    mutate((d) => {
      for (const o of list) {
        applyStatus(d, o.id, 'confirmed');
        applyStatus(d, o.id, 'preparing');
      }
      addAudit(d, { module: 'Orders', action: 'Bulk confirm', detail: `${list.length} orders confirmed: ${list.map((o) => o.number).join(', ')}`, branchId });
    });
    setSelected([]);
    toast.success(`${list.length} orders confirmed`, { description: 'All moved to Preparing' });
  };
  const markReady = (o: Order) => {
    mutate((d) => {
      const od = d.orders.find((x) => x.id === o.id);
      if (!od) return;
      od.items.forEach((i) => { if (i.pickStatus === 'pending') i.pickStatus = 'picked'; });
      applyStatus(d, o.id, 'ready', { note: o.fulfillment === 'pickup' ? 'Ready for pickup — shopper notified' : 'Ready — awaiting rider' });
      addAudit(d, { module: 'Orders', action: 'Marked ready', detail: o.number, branchId: o.branchId });
    });
    toast.success(`${o.number} is ready`, { description: o.fulfillment === 'delivery' ? 'Assign a rider from the order page' : 'Shopper notified to pick up' });
  };
  const acknowledgeAll = () => {
    mutate((d) => { d.orders.forEach((o) => { if (o.branchId === branchId) o.acknowledged = true; }); });
    toast.success('New-order alerts acknowledged');
  };
  const unacked = branchOrders.filter((o) => !o.acknowledged).length;

  // ---------- List view filtering ----------
  const listOrders = branchOrders.filter((o) => {
    if (fStatus !== 'all' && o.status !== fStatus) return false;
    if (fChannel !== 'all' && o.channel !== fChannel) return false;
    if (fFul !== 'all' && o.fulfillment !== fFul) return false;
    if (fPay !== 'all' && o.paymentStatus !== fPay) return false;
    if (fRider !== 'all' && (fRider === 'none' ? !!o.riderId : o.riderId !== fRider)) return false;
    if (fDate === 'today' && !isToday(o.placedAt)) return false;
    if (fDate === '7d' && Date.now() - new Date(o.placedAt).getTime() > 7 * 86400000) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      if (!o.number.toLowerCase().includes(t) && !o.customerName.toLowerCase().includes(t) && !o.customerMobile.replace(/\s/g, '').includes(t.replace(/\s/g, ''))) return false;
    }
    return true;
  });
  const branchRiders = s.riders.filter((r) => r.branchIds.includes(branchId));

  return (
    <DashboardLayout title="Live Orders" eyebrow="Order Desk">
      {branch?.status === 'paused' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <PauseCircle className="w-5 h-5 mt-0.5 shrink-0" {...ICON} />
          <div>
            <p className="font-semibold text-sm">{branch.name} is paused — shoppers cannot place new app orders.</p>
            <p className="text-xs mt-0.5">{branch.pausedMessage || 'Existing orders continue through the normal flow. Resume the branch in Cities & Branches.'}</p>
          </div>
        </div>
      )}
      {branch?.status === 'closed' && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700">{branch.name} is closed.</div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Store className="w-6 h-6 text-[#1e40af]" {...ICON} />{branch?.name ?? 'Branch'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {branch?.hours} · Confirmation timeout {timeoutMins} min ({timeoutAction}) · {ordersToday} orders today
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unacked > 0 && (
            <Button variant="outline" onClick={acknowledgeAll} className="border-red-200 text-red-700 hover:bg-red-50">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
              Acknowledge {unacked} new
            </Button>
          )}
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
            <button onClick={() => setView('board')} className={cn('h-8 px-3 rounded-md text-sm font-medium inline-flex items-center gap-1.5', view === 'board' ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}><Columns3 className="w-4 h-4" {...ICON} />Board</button>
            <button onClick={() => setView('list')} className={cn('h-8 px-3 rounded-md text-sm font-medium inline-flex items-center gap-1.5', view === 'list' ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}><List className="w-4 h-4" {...ICON} />List</button>
          </div>
          {can(s, 'orders.create') && moduleOn(s, 'walkin') && (
            <Button onClick={() => router.push('/orders/new')}><Plus className="w-4 h-4" {...ICON} />New walk-in / phone order</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatCard title="Awaiting confirmation" value={count(['placed', 'awaiting_confirmation'])} accent="border-l-[#dc2626]" valueClass={overdue ? 'text-[#dc2626]' : undefined}
          sub={overdue ? `${overdue} past ${timeoutMins}-min timeout` : `Timeout ${timeoutMins} min`} icon={<AlertTriangle className="w-5 h-5" {...ICON} />} />
        <StatCard title="Preparing" value={count(['confirmed', 'preparing', 'awaiting_shopper'])} accent="border-l-purple-500"
          sub={`${count(['awaiting_shopper'])} awaiting shopper reply`} icon={<ShoppingBag className="w-5 h-5" {...ICON} />} />
        <StatCard title="Ready" value={count(['ready'])} accent="border-l-cyan-500"
          sub={`${branchOrders.filter((o) => o.status === 'ready' && o.fulfillment === 'delivery' && !o.riderId).length} need a rider`} icon={<PackageCheck className="w-5 h-5" {...ICON} />} />
        <StatCard title="Out for delivery" value={count(['out_for_delivery'])} accent="border-l-indigo-500"
          sub={`${count(['failed_delivery'])} failed attempts`} icon={<Bike className="w-5 h-5" {...ICON} />} />
        <StatCard title="Sales today" value={pesoShort(salesToday)} accent="border-l-green-500" sub="Net of refunds, excl. cancelled" icon={<CheckCircle2 className="w-5 h-5" {...ICON} />} />
      </div>

      {view === 'board' ? (
        <>
          {selectedValid.length > 0 && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#1e40af]/20 bg-blue-50 px-4 py-2.5">
              <p className="text-sm text-[#1e40af] font-medium">{selectedValid.length} order{selectedValid.length > 1 ? 's' : ''} selected</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
                {canEdit && <Button size="sm" onClick={bulkConfirm}><CheckCircle2 className="w-4 h-4" {...ICON} />Confirm selected</Button>}
              </div>
            </div>
          )}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-5 items-start">
            {COLUMNS.map((col) => {
              const list = boardOrders
                .filter((o) => col.statuses.includes(o.status))
                .sort((a, b) => col.key === 'done'
                  ? new Date(b.completedAt ?? b.updatedAt).getTime() - new Date(a.completedAt ?? a.updatedAt).getTime()
                  : new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());
              const colAwaiting = col.key === 'awaiting' ? list.map((o) => o.id) : [];
              const allSel = colAwaiting.length > 0 && colAwaiting.every((id) => selected.includes(id));
              return (
                <div key={col.key} className="rounded-xl bg-gray-100/70 border border-gray-100 p-2.5 min-h-[200px]">
                  <div className="flex items-center justify-between px-1.5 py-1 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', col.dot)} />
                      <h3 className="text-sm font-semibold text-gray-800">{col.title}</h3>
                      <span className="text-xs font-semibold rounded-full bg-white px-2 py-0.5 text-gray-600 border border-gray-200">{list.length}</span>
                    </div>
                    {col.key === 'awaiting' && canEdit && list.length > 0 && (
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                        <Checkbox checked={allSel} onCheckedChange={(v) => setSelected(v ? Array.from(new Set([...selected, ...colAwaiting])) : selected.filter((id) => !colAwaiting.includes(id)))} />
                        All
                      </label>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {list.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No orders</p>}
                    {list.map((o) => (
                      <OrderCard key={o.id} o={o} timeoutMins={timeoutMins} riderName={s.riders.find((r) => r.id === o.riderId)?.name}
                        selectable={col.key === 'awaiting' && canEdit} selected={selected.includes(o.id)} onToggle={() => toggle(o.id)}
                        canEdit={canEdit} onConfirm={() => doConfirm(o)} onReject={() => setRejecting(o)} onReady={() => markReady(o)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <Toolbar>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" {...ICON} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order no., customer or mobile" className={cn(inputClass, 'pl-8 w-64')} />
            </div>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={selectClass}>
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
            <select value={fChannel} onChange={(e) => setFChannel(e.target.value)} className={selectClass}>
              <option value="all">All channels</option>
              {(Object.keys(CHANNEL_LABEL) as OrderChannel[]).map((k) => <option key={k} value={k}>{CHANNEL_LABEL[k]}</option>)}
            </select>
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
            <span className="ml-auto text-xs text-gray-500">{listOrders.length} orders</span>
          </Toolbar>
          {listOrders.length === 0 ? (
            <EmptyState title="No orders match these filters" sub="Try clearing a filter or widening the date range." icon={<Search className="w-8 h-8" {...ICON} />} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Fulfillment</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rider</TableHead>
                  <TableHead>Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listOrders.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => router.push(`/orders/${o.id}`)}>
                    <TableCell className="font-semibold text-[#1e40af]">{o.number}</TableCell>
                    <TableCell><p className="font-medium text-gray-900">{o.customerName}</p><p className="text-xs text-gray-500">{o.customerMobile}</p></TableCell>
                    <TableCell><Pill className={CHANNEL_PILL[o.channel]}>{CHANNEL_LABEL[o.channel]}</Pill></TableCell>
                    <TableCell className="capitalize">{o.fulfillment}</TableCell>
                    <TableCell className="text-xs">{o.slot}</TableCell>
                    <TableCell className="text-right">{itemCount(o)}</TableCell>
                    <TableCell className="text-right font-semibold">{peso(o.total)}</TableCell>
                    <TableCell><div className="flex flex-col gap-0.5 items-start"><PaymentBadge status={o.paymentStatus} /><span className="text-[11px] text-gray-500">{PAYMENT_LABEL[o.paymentMethod]}</span></div></TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell className="text-xs">{s.riders.find((r) => r.id === o.riderId)?.name ?? '—'}</TableCell>
                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">{isToday(o.placedAt) ? fmtTime(o.placedAt) : new Date(o.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<br />{timeAgo(o.placedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <RejectDialog order={rejecting} reasons={s.rejectReasons} onClose={() => setRejecting(null)} />
    </DashboardLayout>
  );
}

function isAwaiting(o: Order) {
  return o.status === 'awaiting_confirmation' || o.status === 'placed';
}
function ageMins(o: Order) {
  return (Date.now() - new Date(o.placedAt).getTime()) / 60000;
}
function mmss(sec: number) {
  const a = Math.abs(Math.floor(sec));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

function OrderCard({ o, timeoutMins, riderName, selectable, selected, onToggle, canEdit, onConfirm, onReject, onReady }: {
  o: Order; timeoutMins: number; riderName?: string; selectable: boolean; selected: boolean; onToggle: () => void;
  canEdit: boolean; onConfirm: () => void; onReject: () => void; onReady: () => void;
}) {
  const awaiting = isAwaiting(o);
  const remainingSec = timeoutMins * 60 - (Date.now() - new Date(o.placedAt).getTime()) / 1000;
  const overdue = awaiting && remainingSec <= 0;
  const warning = awaiting && !overdue && remainingSec < (timeoutMins * 60) / 2;
  const flash = overdue || (!o.acknowledged && awaiting && warning);
  const done = ['delivered', 'collected', 'cancelled'].includes(o.status);
  const pickedCount = o.items.filter((i) => i.pickStatus !== 'pending').length;
  const proposed = o.items.filter((i) => i.substitute?.status === 'proposed').length;

  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow', flash && 'new-order-flash', warning && !flash && 'border-amber-300', done && 'opacity-80', selected && 'ring-2 ring-[#1e40af]/40')}>
      <div className="flex items-start gap-2">
        {selectable && <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-1" aria-label={`Select ${o.number}`} />}
        <Link href={`/orders/${o.id}`} className="flex-1 min-w-0 group">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#1e40af] group-hover:underline">{o.number}</span>
            <span className="text-[11px] text-gray-500 flex items-center gap-1 whitespace-nowrap"><Clock className="w-3 h-3" {...ICON} />{timeAgo(o.placedAt)}</span>
          </div>
          <p className="text-sm font-medium text-gray-900 truncate mt-0.5">{o.customerName}</p>
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            <Pill className={CHANNEL_PILL[o.channel]}>{CHANNEL_LABEL[o.channel]}</Pill>
            <Pill className={o.fulfillment === 'delivery' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'}>{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</Pill>
            {o.autoConfirmed && <Pill className="bg-green-50 text-green-700"><Zap className="w-3 h-3" {...ICON} />auto-confirmed</Pill>}
            {o.flagged && <Pill className="bg-red-50 text-red-700">flagged</Pill>}
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>{o.slot} · {itemCount(o)} item{itemCount(o) !== 1 ? 's' : ''}</span>
            <span className="text-sm font-bold text-gray-900">{pesoShort(o.total)}</span>
          </div>
          <div className="flex items-center justify-between mt-1.5 gap-1">
            <PaymentBadge status={o.paymentStatus} />
            {!['awaiting_confirmation', 'placed', 'preparing'].includes(o.status) && <StatusBadge status={o.status} className="text-[10px] px-2" />}
            {o.status === 'preparing' && <span className="text-[11px] text-purple-700 font-medium">Picked {pickedCount}/{o.items.length}</span>}
          </div>
          {proposed > 0 && <p className="mt-1.5 text-[11px] font-medium text-amber-700">{proposed} substitute{proposed > 1 ? 's' : ''} awaiting shopper</p>}
          {riderName && !done && <p className="mt-1.5 text-[11px] text-gray-500 flex items-center gap-1"><Bike className="w-3 h-3" {...ICON} />{riderName}</p>}
          {o.status === 'ready' && o.fulfillment === 'delivery' && !o.riderId && <p className="mt-1.5 text-[11px] font-medium text-[#dc2626]">No rider assigned</p>}
          {o.status === 'cancelled' && o.rejectReason && <p className="mt-1.5 text-[11px] text-gray-500 truncate">Reason: {o.rejectReason}</p>}
        </Link>
      </div>

      {awaiting && (
        <div className={cn('mt-2.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold flex items-center gap-1.5', overdue ? 'bg-red-50 text-red-700' : warning ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600')}>
          <Clock className="w-3.5 h-3.5" {...ICON} />
          {overdue ? `Timeout passed ${mmss(remainingSec)} ago — escalated` : `Confirm within ${mmss(remainingSec)}`}
          {!o.acknowledged && <span className="ml-auto rounded bg-red-600 text-white px-1.5 py-px text-[10px]">NEW</span>}
        </div>
      )}

      {canEdit && awaiting && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Button size="sm" onClick={onConfirm}><CheckCircle2 className="w-3.5 h-3.5" {...ICON} />Confirm</Button>
          <Button size="sm" variant="outline" className="text-[#dc2626] border-red-200 hover:bg-red-50" onClick={onReject}><X className="w-3.5 h-3.5" {...ICON} />Reject</Button>
        </div>
      )}
      {canEdit && (o.status === 'preparing' || o.status === 'confirmed') && (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onReady}><PackageCheck className="w-3.5 h-3.5" {...ICON} />Mark ready</Button>
      )}
      {o.status === 'ready' && (
        <Link href={`/orders/${o.id}`} className="mt-2 block">
          <Button size="sm" variant="outline" className="w-full">{o.fulfillment === 'delivery' ? (o.riderId ? 'Dispatch' : 'Assign rider') : 'Pickup handover'}</Button>
        </Link>
      )}
      {o.status === 'failed_delivery' && (
        <Link href={`/orders/${o.id}`} className="mt-2 block"><Button size="sm" variant="destructive" className="w-full">Resolve failed delivery</Button></Link>
      )}
    </div>
  );
}
