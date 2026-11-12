'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Bike, Check, CheckCircle2, Clock, CreditCard, KeyRound, MapPin, MessageSquare, Minus, PackageCheck,
  Phone, Plus, Printer, QrCode, Receipt, RefreshCcw, Replace, Ruler, Snowflake, Star, StickyNote, Truck, User, X, XCircle, Zap,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, PaymentBadge, Pill, StatusBadge, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';
import { Textarea } from '@/src/components/ui/shadcn/textarea';
import { addAudit, addNotification, currentUserName, mutate, useStore, useTick } from '@/src/lib/store';
import {
  CHANNEL_LABEL, ONLINE_METHODS, PAYMENT_LABEL, STATUS_LABEL, applyStatus, assignRider, available, can, confirmOrder, distanceKm,
  fmtDateTime, fmtTime, getPrice, getSetting, lineTotal, num, peso, recalc, timeAgo,
} from '@/src/lib/logic';
import type { AppState, Order, OrderItem, PaymentMethod, Product } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { CHANNEL_PILL, RejectDialog } from '../_shared';

const ICON = { strokeWidth: 1.75 };
const PICK_LABEL: Record<OrderItem['pickStatus'], { label: string; cls: string }> = {
  pending: { label: 'To pick', cls: 'bg-gray-100 text-gray-600' },
  picked: { label: 'Picked', cls: 'bg-green-100 text-green-800' },
  short: { label: 'Short', cls: 'bg-amber-100 text-amber-800' },
  out_of_stock: { label: 'Out of stock', cls: 'bg-red-100 text-red-700' },
  substituted: { label: 'Substitute', cls: 'bg-blue-100 text-blue-800' },
  removed: { label: 'Removed', cls: 'bg-gray-200 text-gray-500' },
};
const SUB_PREF: Record<OrderItem['subPref'], string> = { similar: 'Replace with similar', ask: 'Ask me first', refund: "Don't replace — refund" };
const EVENT_LABEL: Record<string, string> = { note: 'Internal note', edit: 'Order edited', refund: 'Refund', payment: 'Payment', rider: 'Rider' };
const OPEN = ['placed', 'awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper', 'ready', 'out_for_delivery', 'failed_delivery'];
const FAIL_REASONS = ['Customer not reachable', 'Wrong / incomplete address', 'Customer refused the order', 'Customer not home', 'Unsafe to deliver', 'Vehicle problem'];

type PrintMode = 'pick' | 'pack' | 'receipt' | null;

/** Edit an order inside one mutate: timeline + audit + recalc + payment difference handling. */
function editOrder(orderId: string, action: string, note: string, fn: (o: Order, d: AppState) => void, opts: { recalc?: boolean } = { recalc: true }) {
  mutate((d) => {
    const o = d.orders.find((x) => x.id === orderId);
    if (!o) return;
    const before = o.total;
    const by = currentUserName(d);
    fn(o, d);
    if (opts.recalc !== false) recalc(o);
    o.updatedAt = new Date().toISOString();
    o.timeline.push({ status: 'edit', at: o.updatedAt, by, note });
    const diff = Math.round((o.total - before) * 100) / 100;
    if (diff !== 0 && o.paymentStatus === 'paid' && ONLINE_METHODS.includes(o.paymentMethod)) {
      o.timeline.push({
        status: diff < 0 ? 'refund' : 'payment', at: o.updatedAt, by: 'System',
        note: diff < 0 ? `Price difference ${peso(-diff)} refunded to ${PAYMENT_LABEL[o.paymentMethod]}` : `Additional ${peso(diff)} charged to ${PAYMENT_LABEL[o.paymentMethod]}`,
      });
    }
    addAudit(d, { module: 'Orders', action, detail: `${o.number} — ${note}`, branchId: o.branchId, ...(diff !== 0 ? { oldValue: peso(before), newValue: peso(o.total) } : {}) });
  });
}

export default function OrderDetailPage() {
  const s = useStore();
  useTick(5000);
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const o = s.orders.find((x) => x.id === id);

  const [rejecting, setRejecting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [riderOpen, setRiderOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [subFor, setSubFor] = useState<number | null>(null);
  const [shortFor, setShortFor] = useState<number | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  const [note, setNote] = useState('');
  const [bags, setBags] = useState<number | ''>('');
  const [coldOk, setColdOk] = useState(false);
  const [labeled, setLabeled] = useState(false);
  const [pin, setPin] = useState('');
  const [verified, setVerified] = useState(false);
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>('cash');
  const [weights, setWeights] = useState<Record<number, string>>({});

  useEffect(() => {
    if (o && !o.acknowledged) mutate((d) => { const x = d.orders.find((y) => y.id === o.id); if (x) x.acknowledged = true; });
  }, [o]);

  useEffect(() => {
    if (!printMode) return;
    const t = setTimeout(() => { window.print(); setPrintMode(null); }, 150);
    return () => clearTimeout(t);
  }, [printMode]);

  if (!can(s, 'orders.view')) {
    return <DashboardLayout title="Order" eyebrow="Order Desk"><AccessDenied permission="orders.view" /></DashboardLayout>;
  }
  if (!o) {
    return (
      <DashboardLayout title="Order" eyebrow="Order Desk">
        <Panel><EmptyState title="Order not found" sub="It may have been removed when the demo data was reset." /><div className="text-center"><Link href="/orders" className="text-sm text-[#1e40af] hover:underline">Back to live orders</Link></div></Panel>
      </DashboardLayout>
    );
  }

  const branch = s.branches.find((b) => b.id === o.branchId)!;
  const customer = s.customers.find((c) => c.id === o.customerId);
  const rider = s.riders.find((r) => r.id === o.riderId);
  const conversation = s.conversations.find((c) => c.orderId === o.id);
  const canEdit = can(s, 'orders.edit');
  const productOf = (pid: string) => s.products.find((p) => p.id === pid);
  const isOpen = OPEN.includes(o.status);
  const awaiting = o.status === 'awaiting_confirmation' || o.status === 'placed';
  const picking = ['confirmed', 'preparing', 'awaiting_shopper'].includes(o.status);
  const itemsEditable = canEdit && (awaiting || picking);
  const unresolved = o.items.filter((i) => i.pickStatus === 'pending').length;
  const proposed = o.items.filter((i) => i.substitute?.status === 'proposed').length;
  const coldItems = o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock' && productOf(i.substitute?.status === 'accepted' ? i.substitute.productId : i.productId)?.tags.some((t) => t === 'chilled' || t === 'frozen'));
  const refundable = Math.max(0, Math.round((o.total - o.refundedAmount) * 100) / 100);
  const timeoutMins = num(getSetting(s, 'confirmTimeoutMins', o.branchId)) || 10;
  const remainingSec = timeoutMins * 60 - (Date.now() - new Date(o.placedAt).getTime()) / 1000;
  const holdHours = num(getSetting(s, 'pickupHoldHours', o.branchId)) || 4;
  const readyAt = [...o.timeline].reverse().find((e) => e.status === 'ready')?.at;
  const holdUntil = readyAt ? new Date(new Date(readyAt).getTime() + holdHours * 3600000) : undefined;
  const holdExpired = !!holdUntil && holdUntil.getTime() < Date.now();
  const tolerancePct = 10;
  const by = currentUserName(s);

  // ---------- actions ----------
  const confirm = () => {
    confirmOrder(o.id, by);
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Order confirmed', detail: `${o.number} · prep ${o.prepMinutes} min`, branchId: o.branchId }));
    toast.success(`${o.number} confirmed`, { description: 'Moved to Preparing · shopper notified' });
  };
  const startPicking = () => {
    mutate((d) => { applyStatus(d, o.id, 'preparing', { note: 'Picking started' }); addAudit(d, { module: 'Orders', action: 'Picking started', detail: o.number, branchId: o.branchId }); });
    toast.success('Picking started');
  };
  const ensurePreparing = (d: AppState, x: Order) => { if (x.status === 'confirmed') applyStatus(d, x.id, 'preparing', { note: 'Picking started' }); };

  const setPick = (idx: number, st: OrderItem['pickStatus']) => {
    const it = o.items[idx];
    editOrder(o.id, 'Item pick status', `${it.name}: ${PICK_LABEL[st].label.toLowerCase()}`, (x, d) => {
      x.items[idx].pickStatus = st;
      if (st === 'pending') x.items[idx].substitute = undefined;
      ensurePreparing(d, x);
    });
    if (st === 'out_of_stock') {
      const msg = it.subPref === 'refund' ? 'Shopper chose refund — item removed from the total.' : it.subPref === 'similar' ? 'Shopper accepts a similar item — propose a substitute.' : 'Shopper wants to be asked — propose a substitute for approval.';
      toast.warning(`${it.name} marked out of stock`, { description: msg });
    } else toast.success(`${it.name}: ${PICK_LABEL[st].label}`);
  };
  const setWeight = (idx: number) => {
    const it = o.items[idx];
    const kg = Number(weights[idx]);
    if (!kg || kg <= 0) { toast.error('Enter the actual weight in kg'); return; }
    const est = it.estWeightKg ?? 1;
    const dev = Math.abs(kg - est) / est * 100;
    editOrder(o.id, 'Actual weight entered', `${it.name}: ${kg.toFixed(3)} kg (est. ${est.toFixed(2)} kg)`, (x, d) => {
      x.items[idx].actualWeightKg = kg;
      if (x.items[idx].pickStatus === 'pending') x.items[idx].pickStatus = 'picked';
      ensurePreparing(d, x);
    });
    setWeights((w) => ({ ...w, [idx]: '' }));
    if (dev > tolerancePct) toast.warning(`Weight is ${dev.toFixed(0)}% off the estimate`, { description: `Above the ${tolerancePct}% tolerance — shopper sees the updated price.` });
    else toast.success(`${it.name} weighed`, { description: `Line total ${peso(Math.round(it.unitPrice * kg * 100) / 100)}` });
  };
  const shopperReply = (idx: number, accept: boolean, timeout = false) => {
    const it = o.items[idx];
    if (!it.substitute) return;
    const sub = it.substitute;
    editOrder(o.id, timeout ? 'Substitution timeout' : 'Shopper substitution reply',
      timeout ? `No reply for ${it.name} — preset preference "${SUB_PREF[it.subPref]}" applied: ${accept ? `accepted ${sub.name}` : 'item refunded'}`
        : `Shopper ${accept ? 'accepted' : 'rejected'} ${sub.name} for ${it.name}`, (x, d) => {
        const xi = x.items[idx];
        if (!xi.substitute) return;
        xi.substitute.status = accept ? 'accepted' : 'rejected';
        xi.pickStatus = accept ? 'substituted' : 'removed';
        if (!x.items.some((i) => i.substitute?.status === 'proposed') && x.status === 'awaiting_shopper') {
          applyStatus(d, x.id, 'preparing', { by: timeout ? 'System' : x.customerName, note: 'Substitution resolved' });
        }
      });
    toast.success(accept ? `Substitute accepted: ${sub.name}` : `${it.name} refunded`, { description: 'Order total recalculated' });
  };
  const assignPicker = (name: string) => {
    editOrder(o.id, 'Picker assigned', name ? `Picker: ${name}` : 'Picker unassigned (cashier picks)', (x) => { x.pickerName = name || undefined; }, { recalc: false });
    toast.success(name ? `${name} assigned as picker` : 'Picker cleared');
  };
  const changePrep = (delta: number) => {
    const next = Math.max(5, o.prepMinutes + delta);
    editOrder(o.id, 'Prep time adjusted', `Preparation time ${o.prepMinutes} → ${next} min`, (x, d) => {
      x.prepMinutes = next;
      addNotification(d, { audience: 'shopper', targetId: x.customerId, title: `${x.number}: updated estimate`, body: `Your order will be ready in about ${next} minutes.`, orderId: x.id });
    }, { recalc: false });
    toast.success(`Prep time set to ${next} min`, { description: 'Shopper sees the updated estimate' });
  };
  const markReady = () => {
    if (unresolved || proposed) { toast.error('Finish picking first', { description: `${unresolved} item(s) to pick, ${proposed} substitute(s) awaiting reply` }); return; }
    const bagCount = Number(bags) || Math.max(1, Math.ceil(o.items.length / 5));
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (!x) return;
      x.bagCount = bagCount;
      x.timeline.push({ status: 'edit', at: new Date().toISOString(), by, note: `Pack check: ${bagCount} bag(s)${coldItems.length ? `, ${coldItems.length} cold item(s) in insulated bag` : ''}, labeled` });
      applyStatus(d, o.id, 'ready', { note: o.fulfillment === 'pickup' ? `Ready for pickup — hold ${holdHours}h` : 'Ready — rider assignment' });
      addAudit(d, { module: 'Orders', action: 'Marked ready', detail: `${o.number} · ${bagCount} bag(s)`, branchId: o.branchId });
    });
    toast.success(`${o.number} is ready`, { description: o.fulfillment === 'pickup' ? 'Shopper notified to pick up' : 'Choose a rider' });
    if (o.fulfillment === 'delivery' && !o.riderId) setRiderOpen(true);
  };
  const outForDelivery = () => {
    mutate((d) => { applyStatus(d, o.id, 'out_for_delivery', { note: `Handed to ${rider?.name}` }); addAudit(d, { module: 'Orders', action: 'Out for delivery', detail: `${o.number} · ${rider?.name}`, branchId: o.branchId }); });
    toast.success('Out for delivery', { description: 'Live tracking active for the shopper' });
  };
  const markDelivered = () => {
    mutate((d) => { applyStatus(d, o.id, 'delivered', { note: 'Delivery confirmed by branch' }); addAudit(d, { module: 'Orders', action: 'Marked delivered', detail: o.number, branchId: o.branchId }); });
    toast.success(`${o.number} delivered`);
  };
  const verifyPin = () => {
    if (pin.trim() === o.pickupPin) {
      setVerified(true);
      editOrder(o.id, 'Pickup verified', 'Shopper verified with PIN', () => {}, { recalc: false });
      toast.success('PIN verified', { description: 'Check items with the shopper' });
    } else toast.error('PIN does not match', { description: 'Ask the shopper to show the QR code in the app' });
  };
  const scanQr = () => {
    setVerified(true);
    setPin(o.pickupPin);
    editOrder(o.id, 'Pickup verified', 'Shopper verified by QR scan', () => {}, { recalc: false });
    toast.success('QR code verified');
  };
  const collectPayment = (method: PaymentMethod) => {
    editOrder(o.id, 'Payment collected', `${PAYMENT_LABEL[method]} ${peso(o.total)} collected at counter`, (x) => {
      x.paymentStatus = 'paid';
      if (method !== x.paymentMethod && x.paymentMethod !== 'pay_at_pickup') x.paymentMethod = method;
      x.timeline.push({ status: 'payment', at: new Date().toISOString(), by, note: `${PAYMENT_LABEL[method]} ${peso(x.total)} received` });
    }, { recalc: false });
    toast.success('Payment recorded', { description: `${peso(o.total)} · ${PAYMENT_LABEL[method]}` });
  };
  const markCollected = () => {
    mutate((d) => { applyStatus(d, o.id, 'collected', { note: 'Handed over at counter' }); addAudit(d, { module: 'Orders', action: 'Marked collected', detail: o.number, branchId: o.branchId }); });
    toast.success(`${o.number} collected`, { description: 'Stock deducted · order complete' });
  };
  const failedAction = (kind: 'reattempt' | 'return') => {
    mutate((d) => {
      if (kind === 'reattempt') applyStatus(d, o.id, 'out_for_delivery', { note: 'Re-attempt delivery' });
      else applyStatus(d, o.id, 'ready', { note: 'Returned to branch — held for re-dispatch or pickup' });
      addAudit(d, { module: 'Orders', action: kind === 'reattempt' ? 'Delivery re-attempt' : 'Returned to branch', detail: o.number, branchId: o.branchId });
    });
    toast.success(kind === 'reattempt' ? 'Re-attempt dispatched' : 'Order returned to branch');
  };
  const addNote = () => {
    if (!note.trim()) return;
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (!x) return;
      const now = new Date().toISOString();
      x.internalNotes.push({ at: now, by, text: note.trim() });
      x.timeline.push({ status: 'note', at: now, by, note: 'Internal note added (staff only)' });
      addAudit(d, { module: 'Orders', action: 'Internal note', detail: `${x.number} — ${note.trim()}`, branchId: x.branchId });
    });
    setNote('');
    toast.success('Note added');
  };
  const print = (m: PrintMode) => setPrintMode(m);

  // ---------- render ----------
  const pickers = s.staff.filter((u) => u.status === 'active' && ['role-picker', 'role-cashier', 'role-branch'].includes(u.roleId) && (u.scope.type === 'all' || u.scope.ids.includes(o.branchId) || u.scope.ids.includes(branch.cityId)));

  return (
    <DashboardLayout title={`Order ${o.number}`} eyebrow="Order Desk">
      <div className="print:hidden">
        <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1e40af] mb-3"><ArrowLeft className="w-4 h-4" {...ICON} />Live orders</Link>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">{o.number}</h1>
                <StatusBadge status={o.status} />
                <PaymentBadge status={o.paymentStatus} />
                <Pill className={CHANNEL_PILL[o.channel]}>{CHANNEL_LABEL[o.channel]}</Pill>
                <Pill className={o.fulfillment === 'delivery' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'}>{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</Pill>
                {o.autoConfirmed && <Pill className="bg-green-50 text-green-700"><Zap className="w-3 h-3" {...ICON} />auto-confirmed</Pill>}
              </div>
              <p className="text-sm text-gray-500 mt-1.5">
                Placed {fmtDateTime(o.placedAt)} ({timeAgo(o.placedAt)}) · {branch.name} · Slot <span className="font-medium text-gray-700">{o.slot}</span>
                {o.pickerName && <> · Picker <span className="font-medium text-gray-700">{o.pickerName}</span></>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isOpen && !['ready', 'out_for_delivery', 'failed_delivery'].includes(o.status) && (
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 h-9 text-sm">
                  <Clock className="w-4 h-4 text-gray-400" {...ICON} />
                  <span className="text-gray-500">Prep</span>
                  {canEdit && <button className="p-1 rounded hover:bg-gray-100" onClick={() => changePrep(-5)} aria-label="Decrease prep time"><Minus className="w-3.5 h-3.5" {...ICON} /></button>}
                  <span className="font-semibold text-[#1e40af] w-12 text-center">{o.prepMinutes} min</span>
                  {canEdit && <button className="p-1 rounded hover:bg-gray-100" onClick={() => changePrep(5)} aria-label="Increase prep time"><Plus className="w-3.5 h-3.5" {...ICON} /></button>}
                </div>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline"><Printer className="w-4 h-4" {...ICON} />Print</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => print('pick')}>Pick list (by aisle)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => print('pack')}>Packing slip</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => print('receipt')}>Receipt</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canEdit && ['paid', 'partially_refunded'].includes(o.paymentStatus) && refundable > 0 && (
                <Button variant="outline" onClick={() => setRefundOpen(true)}><RefreshCcw className="w-4 h-4" {...ICON} />Refund</Button>
              )}
              {canEdit && isOpen && !awaiting && (
                <Button variant="outline" className="text-[#dc2626] border-red-200 hover:bg-red-50" onClick={() => setCancelOpen(true)}><XCircle className="w-4 h-4" {...ICON} />Cancel order</Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
          <div className="space-y-5 min-w-0">
            {/* Next step panel */}
            {canEdit && <NextStep>
              {awaiting && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">Accept this order?</p>
                    <p className={cn('text-sm mt-0.5', remainingSec <= 0 ? 'text-[#dc2626] font-medium' : 'text-gray-500')}>
                      {remainingSec > 0 ? `Confirm within ${Math.floor(remainingSec / 60)}:${String(Math.floor(remainingSec % 60)).padStart(2, '0')} (timeout ${timeoutMins} min)` : `Confirmation timeout passed — ${String(getSetting(s, 'timeoutAction', o.branchId))}`}
                      {o.paymentStatus === 'pending' && ` · ${PAYMENT_LABEL[o.paymentMethod]} — unpaid`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="text-[#dc2626] border-red-200 hover:bg-red-50" onClick={() => setRejecting(true)}><X className="w-4 h-4" {...ICON} />Reject</Button>
                    <Button onClick={confirm}><CheckCircle2 className="w-4 h-4" {...ICON} />Confirm · prep {o.prepMinutes} min</Button>
                  </div>
                </div>
              )}
              {o.status === 'confirmed' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold text-gray-900">Confirmed — stock reserved</p><p className="text-sm text-gray-500">Start picking, or mark items picked below.</p></div>
                  <Button onClick={startPicking}><PackageCheck className="w-4 h-4" {...ICON} />Start picking</Button>
                </div>
              )}
              {o.status === 'awaiting_shopper' && (
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-amber-600 mt-0.5" {...ICON} />
                  <div><p className="font-semibold text-gray-900">Waiting for the shopper to approve {proposed} substitute{proposed !== 1 ? 's' : ''}</p>
                    <p className="text-sm text-gray-500">Push notification sent. If there is no reply within {String(getSetting(s, 'subResponseMins', o.branchId))} min, the item&apos;s preset preference applies. Use the simulate buttons on the item to demo the reply.</p></div>
                </div>
              )}
              {o.status === 'preparing' && (
                unresolved || proposed ? (
                  <div className="flex items-start gap-3">
                    <PackageCheck className="w-5 h-5 text-purple-600 mt-0.5" {...ICON} />
                    <div><p className="font-semibold text-gray-900">Picking in progress — {o.items.length - unresolved}/{o.items.length} items done</p>
                      <p className="text-sm text-gray-500">Mark each item picked, short or out of stock. Enter the actual weight for weighed items.</p></div>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><PackageCheck className="w-5 h-5 text-[#1e40af]" {...ICON} />Pack check</p>
                    <div className="grid sm:grid-cols-3 gap-3 mb-3">
                      <label className="text-sm"><span className="block text-xs text-gray-500 mb-1">Bag count</span>
                        <input type="number" min={1} value={bags} placeholder={String(Math.max(1, Math.ceil(o.items.length / 5)))} onChange={(e) => setBags(e.target.value === '' ? '' : Number(e.target.value))} className={cn(inputClass, 'w-full')} /></label>
                      <label className="flex items-center gap-2 text-sm rounded-lg border border-gray-200 px-3 mt-5 h-9">
                        <Checkbox checked={coldOk || coldItems.length === 0} disabled={coldItems.length === 0} onCheckedChange={(v) => setColdOk(!!v)} />
                        <Snowflake className="w-4 h-4 text-sky-500" {...ICON} />{coldItems.length ? `${coldItems.length} cold item(s) in insulated bag` : 'No cold items'}
                      </label>
                      <label className="flex items-center gap-2 text-sm rounded-lg border border-gray-200 px-3 mt-5 h-9">
                        <Checkbox checked={labeled} onCheckedChange={(v) => setLabeled(!!v)} />Order labeled &amp; in ready area
                      </label>
                    </div>
                    {coldItems.length > 0 && <p className="text-xs text-sky-700 mb-3">Cold items: {coldItems.map((i) => i.substitute?.status === 'accepted' ? i.substitute.name : i.name).join(', ')}</p>}
                    <Button onClick={markReady} disabled={!labeled || (coldItems.length > 0 && !coldOk)}><CheckCircle2 className="w-4 h-4" {...ICON} />Mark Ready</Button>
                  </div>
                )
              )}
              {o.status === 'ready' && o.fulfillment === 'delivery' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{rider ? `Rider: ${rider.name}` : 'Ready — assign a rider'}</p>
                    <p className="text-sm text-gray-500">{rider ? `${rider.vehicle} · ${rider.plate} · ${rider.phone}` : `Dispatch rule: ${String(getSetting(s, 'dispatchRule', o.branchId))}`}{o.bagCount ? ` · ${o.bagCount} bag(s)` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setRiderOpen(true)}><Bike className="w-4 h-4" {...ICON} />{rider ? 'Change rider' : 'Assign rider'}</Button>
                    {rider && <Button onClick={outForDelivery}><Truck className="w-4 h-4" {...ICON} />Mark out for delivery</Button>}
                  </div>
                </div>
              )}
              {o.status === 'ready' && o.fulfillment === 'pickup' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900">Pickup handover</p>
                    {holdUntil && <p className={cn('text-xs', holdExpired ? 'text-[#dc2626] font-medium' : 'text-gray-500')}>{holdExpired ? `Hold time expired — policy: ${String(getSetting(s, 'noShowPolicy', o.branchId))}` : `Held until ${fmtTime(holdUntil.toISOString())} (${holdHours}h)`}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold', verified ? 'bg-green-600 text-white' : 'bg-[#1e40af] text-white')}>{verified ? <Check className="w-4 h-4" /> : 1}</span>
                    <KeyRound className="w-4 h-4 text-gray-400" {...ICON} />
                    <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => e.key === 'Enter' && verifyPin()} placeholder="4-digit PIN" disabled={verified} className={cn(inputClass, 'w-32 tracking-widest font-mono')} />
                    <Button variant="outline" onClick={verifyPin} disabled={verified || pin.length !== 4}>Verify PIN</Button>
                    <Button variant="outline" onClick={scanQr} disabled={verified}><QrCode className="w-4 h-4" {...ICON} />Scan QR</Button>
                    {verified && <span className="text-sm text-green-700 font-medium">Shopper verified</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold', o.paymentStatus !== 'pending' ? 'bg-green-600 text-white' : 'bg-[#1e40af] text-white')}>{o.paymentStatus !== 'pending' ? <Check className="w-4 h-4" /> : 2}</span>
                    {o.paymentStatus === 'pending' ? (
                      <>
                        <span className="text-sm text-gray-700">Collect <b>{peso(o.total)}</b></span>
                        <select value={collectMethod} onChange={(e) => setCollectMethod(e.target.value as PaymentMethod)} className={selectClass}>
                          <option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="card">Card at counter</option>
                        </select>
                        <Button variant="outline" disabled={!verified} onClick={() => collectPayment(collectMethod)}><CreditCard className="w-4 h-4" {...ICON} />Payment received</Button>
                      </>
                    ) : <span className="text-sm text-gray-700">Paid — {PAYMENT_LABEL[o.paymentMethod]}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold bg-[#1e40af] text-white">3</span>
                    <Button onClick={markCollected} disabled={!verified || o.paymentStatus === 'pending'}><CheckCircle2 className="w-4 h-4" {...ICON} />Mark collected</Button>
                    {holdExpired && <Button variant="destructive" onClick={() => setCancelOpen(true)}>Apply no-show policy</Button>}
                  </div>
                </div>
              )}
              {o.status === 'out_for_delivery' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold text-gray-900">On the way with {rider?.name ?? 'rider'}</p>
                    <p className="text-sm text-gray-500">Left {o.outForDeliveryAt ? timeAgo(o.outForDeliveryAt) : ''} · the Rider App confirms delivery with proof ({String(getSetting(s, 'podMethod', o.branchId))}).</p></div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="text-[#dc2626] border-red-200 hover:bg-red-50" onClick={() => setFailOpen(true)}><AlertTriangle className="w-4 h-4" {...ICON} />Failed delivery</Button>
                    <Button onClick={markDelivered}><CheckCircle2 className="w-4 h-4" {...ICON} />Mark delivered</Button>
                  </div>
                </div>
              )}
              {o.status === 'failed_delivery' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="font-semibold text-[#dc2626]">Delivery attempt failed</p>
                    <p className="text-sm text-gray-500">{[...o.timeline].reverse().find((e) => e.status === 'failed_delivery')?.note ?? 'Record what happened, then choose the next step.'}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => failedAction('reattempt')}><Truck className="w-4 h-4" {...ICON} />Re-attempt</Button>
                    <Button variant="outline" onClick={() => failedAction('return')}><ArrowLeft className="w-4 h-4" {...ICON} />Return to branch</Button>
                    <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel order</Button>
                  </div>
                </div>
              )}
              {['delivered', 'collected'].includes(o.status) && (
                <div className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6 text-green-600" {...ICON} /><div><p className="font-semibold text-gray-900">{STATUS_LABEL[o.status]} {o.completedAt ? fmtDateTime(o.completedAt) : ''}</p><p className="text-sm text-gray-500">Payment settled · stock deducted{o.rating ? ` · rated ${o.rating.order}★` : ''}</p></div></div>
              )}
              {o.status === 'cancelled' && (
                <div className="flex items-center gap-3"><XCircle className="w-6 h-6 text-gray-500" {...ICON} /><div><p className="font-semibold text-gray-900">Cancelled{o.rejectReason ? ` — ${o.rejectReason}` : ''}</p><p className="text-sm text-gray-500">Stock released{o.refundedAmount ? ` · ${peso(o.refundedAmount)} refunded` : ''}</p></div></div>
              )}
            </NextStep>}

            {/* Items */}
            <Panel title={`Items (${o.items.length})`} bodyClass="p-0"
              action={branch.services.picker && canEdit && (awaiting || picking) ? (
                <label className="flex items-center gap-2 text-xs text-gray-500">Picker
                  <select value={o.pickerName ?? ''} onChange={(e) => assignPicker(e.target.value)} className={cn(selectClass, 'h-8 text-xs')}>
                    <option value="">Cashier picks</option>
                    {pickers.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                </label>
              ) : undefined}>
              <div className="divide-y divide-gray-100">
                {o.items.map((it, idx) => {
                  const p = productOf(it.productId);
                  const total = lineTotal(it);
                  const dim = it.pickStatus === 'removed' || it.pickStatus === 'out_of_stock';
                  return (
                    <div key={idx} className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-2xl shrink-0', dim && 'opacity-40')}>{it.image}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cn('font-medium text-gray-900', dim && 'line-through text-gray-400')}>{it.name}</p>
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', PICK_LABEL[it.pickStatus].cls)}>{PICK_LABEL[it.pickStatus].label}</span>
                            {p?.tags.filter((t) => t === 'chilled' || t === 'frozen').map((t) => <Pill key={t} className="bg-sky-50 text-sky-700 text-[11px]"><Snowflake className="w-3 h-3" {...ICON} />{t}</Pill>)}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {p ? `${p.size} · SKU ${p.sku} · Aisle ${p.aisle}` : ''}
                            {it.soldByWeight ? ` · ${peso(it.unitPrice)}/kg · est. ${(it.estWeightKg ?? 1).toFixed(2)} kg${it.actualWeightKg ? ` · actual ${it.actualWeightKg.toFixed(3)} kg` : ''}` : ` · ${it.qty} × ${peso(it.unitPrice)}`}
                          </p>
                          <p className="text-xs mt-0.5"><span className="text-gray-400">Substitution:</span> <span className="text-gray-600">{SUB_PREF[it.subPref]}</span></p>
                          {it.note && <p className="text-xs mt-1 inline-flex items-center gap-1 rounded bg-amber-50 text-amber-800 px-2 py-0.5"><StickyNote className="w-3 h-3" {...ICON} />{it.note}</p>}
                          {it.substitute && (
                            <div className={cn('mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm', it.substitute.status === 'proposed' ? 'border-amber-200 bg-amber-50' : it.substitute.status === 'accepted' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50')}>
                              <Replace className="w-4 h-4 text-gray-500" {...ICON} />
                              <span className="text-lg">{it.substitute.image}</span>
                              <span className="font-medium">{it.substitute.name}</span>
                              <span className="text-gray-500">{peso(it.substitute.unitPrice)}</span>
                              <span className="text-xs font-medium capitalize text-gray-600">· {it.substitute.status}</span>
                              {it.substitute.status === 'proposed' && canEdit && (
                                <span className="ml-auto flex flex-wrap gap-1.5">
                                  <Button size="sm" variant="outline" className="h-7" onClick={() => shopperReply(idx, true)}>Simulate: accept</Button>
                                  <Button size="sm" variant="outline" className="h-7" onClick={() => shopperReply(idx, false)}>Simulate: reject</Button>
                                  <Button size="sm" variant="ghost" className="h-7" onClick={() => shopperReply(idx, it.subPref === 'similar', true)}>No reply (timeout)</Button>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn('font-semibold', dim ? 'text-gray-400' : 'text-gray-900')}>{peso(total)}</p>
                          {!it.soldByWeight && <p className="text-xs text-gray-500">qty {it.qty}</p>}
                        </div>
                      </div>
                      {itemsEditable && it.pickStatus !== 'removed' && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[60px]">
                          {picking && it.pickStatus !== 'picked' && it.pickStatus !== 'substituted' && (
                            <Button size="sm" variant="outline" className="h-7 text-green-700 border-green-200 hover:bg-green-50" onClick={() => setPick(idx, 'picked')}><Check className="w-3.5 h-3.5" {...ICON} />Picked</Button>
                          )}
                          {!it.soldByWeight && it.qty > 1 && it.pickStatus !== 'out_of_stock' && !it.substitute && (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => setShortFor(idx)}>Short</Button>
                          )}
                          {it.pickStatus !== 'out_of_stock' && !it.substitute && (
                            <Button size="sm" variant="outline" className="h-7 text-[#dc2626] border-red-200 hover:bg-red-50" onClick={() => setPick(idx, 'out_of_stock')}>Out of stock</Button>
                          )}
                          {(!it.substitute || it.substitute.status === 'rejected') && it.subPref !== 'refund' && (
                            <Button size="sm" variant="outline" className="h-7" onClick={() => setSubFor(idx)}><Replace className="w-3.5 h-3.5" {...ICON} />Propose substitute</Button>
                          )}
                          {it.pickStatus !== 'pending' && !it.substitute && (
                            <Button size="sm" variant="ghost" className="h-7 text-gray-500" onClick={() => setPick(idx, 'pending')}>Undo</Button>
                          )}
                          {it.soldByWeight && picking && (
                            <span className="flex items-center gap-1 ml-auto">
                              <Ruler className="w-4 h-4 text-gray-400" {...ICON} />
                              <input type="number" step="0.001" min={0} value={weights[idx] ?? ''} onChange={(e) => setWeights((w) => ({ ...w, [idx]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && setWeight(idx)} placeholder="Actual kg" className={cn(inputClass, 'h-7 w-24 text-xs')} />
                              <Button size="sm" className="h-7" onClick={() => setWeight(idx)}>Set weight</Button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between text-sm bg-gray-50/60 rounded-b-xl">
                <span className="text-gray-500">{o.items.filter((i) => i.pickStatus === 'picked' || i.pickStatus === 'substituted').length} picked · {o.items.filter((i) => i.pickStatus === 'out_of_stock' || i.pickStatus === 'removed').length} refunded / removed{o.bagCount ? ` · ${o.bagCount} bag(s)` : ''}</span>
                <span className="font-semibold">Subtotal {peso(o.subtotal)}</span>
              </div>
            </Panel>

            {/* Timeline */}
            <Panel title="Timeline">
              <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                {[...o.timeline].reverse().map((e, i) => (
                  <li key={i} className="ml-4">
                    <span className={cn('absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-white', i === 0 ? 'bg-[#1e40af]' : e.status === 'refund' ? 'bg-orange-400' : e.status === 'cancelled' || e.status === 'failed_delivery' ? 'bg-red-500' : 'bg-gray-300')} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium text-gray-900">{(STATUS_LABEL as Record<string, string>)[e.status] ?? EVENT_LABEL[e.status] ?? e.status}</p>
                      <p className="text-xs text-gray-400">{fmtDateTime(e.at)}</p>
                    </div>
                    <p className="text-xs text-gray-500">{e.by}{e.note ? ` — ${e.note}` : ''}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            <Panel title="Customer">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1e40af]/10 text-[#1e40af] flex items-center justify-center shrink-0"><User className="w-5 h-5" {...ICON} /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{o.customerName}</p>
                  <p className="text-sm text-gray-500 flex items-center gap-1"><Phone className="w-3.5 h-3.5" {...ICON} />{o.customerMobile}</p>
                  {customer && <p className="text-xs text-gray-400 mt-0.5">{customer.email || 'No email'} · {customer.source.replace('_', '-')} customer · {s.orders.filter((x) => x.customerId === customer.id).length} orders</p>}
                  {customer?.blocked && <Pill className="bg-red-50 text-red-700 mt-1">Blocked: {customer.blockReason}</Pill>}
                </div>
              </div>
              {o.fulfillment === 'delivery' && o.address ? (
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="flex items-start gap-1.5 text-gray-800"><MapPin className="w-4 h-4 mt-0.5 text-[#dc2626] shrink-0" {...ICON} /><span><b className="font-medium">{o.address.label}:</b> {o.address.line}</span></p>
                  {o.address.landmark && <p className="text-xs text-gray-500 mt-1 ml-5">Landmark: {o.address.landmark}</p>}
                  <p className="text-xs text-gray-500 mt-1 ml-5">{distanceKm(branch, o.address)} km from {branch.name}</p>
                  {o.riderInstructions && <p className="text-xs text-gray-600 mt-1 ml-5 italic">&ldquo;{o.riderInstructions}&rdquo;</p>}
                </div>
              ) : (
                <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  <p className="font-medium">Pickup at {branch.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{branch.pickupInstructions}</p>
                  <p className="text-xs text-gray-500 mt-1">Pickup PIN is shown in the shopper&apos;s app</p>
                </div>
              )}
              {conversation ? (
                <Link href={`/support?c=${conversation.id}`} className="mt-3 flex items-center justify-between rounded-lg border border-[#1e40af]/20 bg-blue-50 px-3 py-2 text-sm text-[#1e40af] hover:bg-blue-100">
                  <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4" {...ICON} />Support chat · {conversation.category}</span>
                  {conversation.unreadStaff > 0 && <span className="rounded-full bg-[#dc2626] text-white text-[10px] font-bold px-1.5">{conversation.unreadStaff}</span>}
                </Link>
              ) : <p className="mt-3 text-xs text-gray-400">No support conversation for this order.</p>}
            </Panel>

            <Panel title="Payment" action={<PaymentBadge status={o.paymentStatus} />}>
              <p className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3"><CreditCard className="w-4 h-4 text-gray-400" {...ICON} />{PAYMENT_LABEL[o.paymentMethod]}</p>
              <dl className="space-y-1.5 text-sm">
                <Row k="Subtotal" v={peso(o.subtotal)} />
                {o.fulfillment === 'delivery' && <Row k="Delivery fee" v={peso(o.deliveryFee)} sub={o.feeRule} />}
                {o.serviceFee > 0 && <Row k="Service fee (gateway)" v={peso(o.serviceFee)} />}
                {o.discount > 0 && <Row k={`Discount${o.voucherCode ? ` (${o.voucherCode})` : ''}`} v={`−${peso(o.discount)}`} cls="text-green-700" />}
                <div className="border-t border-gray-100 pt-2 mt-2"><Row k="Total" v={peso(o.total)} cls="text-[#1e40af] font-bold text-base" /></div>
                {o.refundedAmount > 0 && <Row k="Refunded" v={`−${peso(o.refundedAmount)}`} cls="text-orange-700" />}
              </dl>
              {canEdit && o.paymentStatus === 'pending' && ONLINE_METHODS.includes(o.paymentMethod) && (
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => collectPayment(o.paymentMethod)}>Mark payment link as paid</Button>
              )}
              {o.paymentStatus === 'pending' && ['cod', 'pay_at_pickup'].includes(o.paymentMethod) && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Collect {peso(o.total)} {o.paymentMethod === 'cod' ? 'on delivery (rider)' : 'at the counter'}.</p>
              )}
            </Panel>

            {o.fulfillment === 'delivery' && (
              <Panel title="Rider" action={canEdit && ['ready', 'preparing', 'confirmed', 'failed_delivery'].includes(o.status) ? <Button size="sm" variant="outline" onClick={() => setRiderOpen(true)}>{rider ? 'Change' : 'Assign'}</Button> : undefined}>
                {rider ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center"><Bike className="w-5 h-5" {...ICON} /></div>
                    <div className="text-sm">
                      <p className="font-semibold text-gray-900">{rider.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{rider.type} · {rider.vehicle} · {rider.plate} · <Star className="w-3 h-3 inline -mt-0.5 text-amber-500" {...ICON} />{rider.rating}</p>
                      <p className="text-xs text-gray-500">{rider.phone}</p>
                    </div>
                  </div>
                ) : <p className="text-sm text-gray-400">No rider assigned yet.</p>}
              </Panel>
            )}

            <Panel title="Internal notes" action={<span className="text-[11px] text-gray-400">Staff only</span>}>
              <div className="space-y-2.5 mb-3">
                {o.internalNotes.length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
                {o.internalNotes.map((n, i) => (
                  <div key={i} className="rounded-lg bg-amber-50/70 border border-amber-100 px-3 py-2">
                    <p className="text-sm text-gray-800">{n.text}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{n.by} · {fmtDateTime(n.at)}</p>
                  </div>
                ))}
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" rows={2} />
              <Button size="sm" className="mt-2" onClick={addNote} disabled={!note.trim()}>Add note</Button>
            </Panel>
          </div>
        </div>
      </div>

      {/* Print-only section */}
      {printMode && <PrintView o={o} mode={printMode} s={s} />}

      <RejectDialog order={rejecting ? o : null} reasons={s.rejectReasons} onClose={() => setRejecting(false)} />
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} o={o} reasons={s.rejectReasons} noShow={o.status === 'ready' && o.fulfillment === 'pickup' && holdExpired ? String(getSetting(s, 'noShowPolicy', o.branchId)) : undefined} />
      <RefundDialog open={refundOpen} onClose={() => setRefundOpen(false)} o={o} refundable={refundable} threshold={num(getSetting(s, 'refundApprovalAbove', o.branchId))} canApprove={can(s, 'orders.approve')} />
      <RiderDialog open={riderOpen} onClose={() => setRiderOpen(false)} o={o} s={s} />
      <FailDialog open={failOpen} onClose={() => setFailOpen(false)} o={o} />
      <ShortDialog idx={shortFor} o={o} onClose={() => setShortFor(null)} />
      <SubstituteDialog idx={subFor} o={o} s={s} onClose={() => setSubFor(null)} />
    </DashboardLayout>
  );
}

function NextStep({ children }: { children: React.ReactNode }) {
  return <section className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-[#1e40af] p-5">{children}</section>;
}

function Row({ k, v, sub, cls }: { k: string; v: string; sub?: string; cls?: string }) {
  return (
    <div>
      <div className={cn('flex justify-between gap-3', cls)}><dt className="text-gray-500">{k}</dt><dd className="font-medium">{v}</dd></div>
      {sub && <p className="text-[11px] text-gray-400 text-right">{sub}</p>}
    </div>
  );
}

// ---------------- Dialogs ----------------
function CancelDialog({ open, onClose, o, reasons, noShow }: { open: boolean; onClose: () => void; o: Order; reasons: string[]; noShow?: string }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const final = noShow ? `Pickup no-show — ${noShow}` : reason;
  const submit = () => {
    if (!final) return;
    const text = `${final}${detail.trim() ? ` (${detail.trim()})` : ''}`;
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (x) x.rejectReason = final;
      applyStatus(d, o.id, 'cancelled', { note: text });
    });
    toast.success(`${o.number} cancelled`, { description: o.paymentStatus === 'paid' ? `Stock released · ${peso(o.total - o.refundedAmount)} refunded automatically` : 'Stock released · shopper notified' });
    setReason(''); setDetail('');
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order {o.number}</DialogTitle>
          <DialogDescription>The shopper is notified and reserved stock is released.{o.paymentStatus === 'paid' ? ' Paid orders are refunded to the original payment method.' : ''}</DialogDescription>
        </DialogHeader>
        {noShow ? <p className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">No-show policy: <b>{noShow}</b></p> : (
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(selectClass, 'w-full')}>
            <option value="">Choose a reason…</option>
            {[...reasons, 'Failed delivery — customer unreachable', 'Duplicate order'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Details (optional)" rows={2} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep order</Button>
          <Button variant="destructive" disabled={!final} onClick={submit}>Cancel order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ open, onClose, o, refundable, threshold, canApprove }: { open: boolean; onClose: () => void; o: Order; refundable: number; threshold: number; canApprove: boolean }) {
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState<'original' | 'store_credit' | 'cash'>('original');
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState('');
  const amt = mode === 'full' ? refundable : Math.min(refundable, Math.max(0, Number(amount) || 0));
  const needsApproval = amt > threshold;
  const approvalOk = !needsApproval || canApprove || approver.trim().length > 2;
  const destLabel = dest === 'original' ? PAYMENT_LABEL[o.paymentMethod] : dest === 'store_credit' ? 'store credit' : 'cash';
  const submit = () => {
    if (!amt || !reason.trim() || !approvalOk) return;
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (!x) return;
      const by = currentUserName(d);
      const now = new Date().toISOString();
      const oldStatus = x.paymentStatus;
      x.refundedAmount = Math.round((x.refundedAmount + amt) * 100) / 100;
      x.paymentStatus = x.refundedAmount >= x.total - 0.001 ? 'refunded' : 'partially_refunded';
      x.updatedAt = now;
      const approval = needsApproval ? (canApprove ? ` · approved by ${by}` : ` · manager approval: ${approver.trim()}`) : '';
      x.timeline.push({ status: 'refund', at: now, by, note: `${mode === 'full' ? 'Full' : 'Partial'} refund ${peso(amt)} to ${destLabel} — ${reason.trim()}${approval}` });
      if (dest === 'store_credit') {
        const cu = d.customers.find((c) => c.id === x.customerId);
        if (cu) cu.storeCredit += amt;
      }
      addNotification(d, { audience: 'shopper', targetId: x.customerId, title: `Refund for ${x.number}`, body: `${peso(amt)} refunded to your ${destLabel}.`, orderId: x.id });
      addAudit(d, { module: 'Payments', action: 'Refund issued', detail: `${x.number} — ${peso(amt)} to ${destLabel}: ${reason.trim()}${approval}`, branchId: x.branchId, oldValue: oldStatus, newValue: x.paymentStatus });
    });
    toast.success(`Refunded ${peso(amt)}`, { description: `To ${destLabel}` });
    setAmount(''); setReason(''); setApprover(''); setMode('full');
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {o.number}</DialogTitle>
          <DialogDescription>Refundable balance {peso(refundable)} · paid by {PAYMENT_LABEL[o.paymentMethod]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['full', 'partial'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn('rounded-lg border px-3 py-2 text-sm font-medium', mode === m ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]' : 'border-gray-200 text-gray-600')}>{m === 'full' ? `Full (${peso(refundable)})` : 'Partial'}</button>
            ))}
          </div>
          {mode === 'partial' && <input type="number" min={0} max={refundable} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₱)" className={cn(inputClass, 'w-full')} />}
          <label className="block text-sm"><span className="block text-xs text-gray-500 mb-1">Refund to</span>
            <select value={dest} onChange={(e) => setDest(e.target.value as typeof dest)} className={cn(selectClass, 'w-full')}>
              <option value="original">Original payment method ({PAYMENT_LABEL[o.paymentMethod]})</option>
              <option value="store_credit">Store credit</option>
              {['cash', 'cod', 'pay_at_pickup'].includes(o.paymentMethod) && <option value="cash">Cash at counter</option>}
            </select>
          </label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. damaged item, missing item)" rows={2} />
          {needsApproval && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Refunds above {peso(threshold)} need manager approval.</p>
              {canApprove ? <p className="text-xs mt-0.5">You have approval rights — this refund is approved by you.</p> : (
                <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Approving manager & approval note" className={cn(inputClass, 'w-full mt-2')} />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!amt || !reason.trim() || !approvalOk} onClick={submit}>Refund {peso(amt)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RiderDialog({ open, onClose, o, s }: { open: boolean; onClose: () => void; o: Order; s: AppState }) {
  const branch = s.branches.find((b) => b.id === o.branchId)!;
  const maxActive = num(getSetting(s, 'maxActiveOrders', o.branchId)) || 2;
  const rule = String(getSetting(s, 'dispatchRule', o.branchId));
  const typeRank = { own: 0, freelance: 1, courier: 2 } as const;
  const rows = s.riders.filter((r) => r.branchIds.includes(o.branchId)).map((r) => ({
    r,
    dist: distanceKm(r, branch),
    load: s.orders.filter((x) => x.riderId === r.id && ['ready', 'out_for_delivery'].includes(x.status) && x.id !== o.id).length,
  })).sort((a, b) => {
    const av = a.r.status === 'online' ? 0 : 1;
    const bv = b.r.status === 'online' ? 0 : 1;
    if (av !== bv) return av - bv;
    if (rule.startsWith('Lowest')) return a.load - b.load || a.dist - b.dist;
    if (rule.startsWith('Highest')) return b.r.rating - a.r.rating;
    if (rule.startsWith('Own')) return typeRank[a.r.type] - typeRank[b.r.type] || a.dist - b.dist;
    return a.dist - b.dist;
  });
  const assign = (riderId: string, name: string) => {
    assignRider(o.id, riderId, currentUserName());
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Rider assigned', detail: `${o.number} → ${name}`, branchId: o.branchId, oldValue: s.riders.find((r) => r.id === o.riderId)?.name, newValue: name }));
    toast.success(`${name} assigned`, { description: 'Job offer sent to the Rider App' });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign rider · {o.number}</DialogTitle>
          <DialogDescription>Riders serving {branch.name}. Sorted by dispatch rule: {rule}. Max {maxActive} active orders per rider.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
          {rows.length === 0 && <EmptyState title="No riders serve this branch" />}
          {rows.map(({ r, dist, load }, i) => {
            const usable = r.status === 'online' && load < maxActive;
            return (
              <div key={r.id} className={cn('flex items-center gap-3 px-3 py-2.5', !usable && 'opacity-60')}>
                <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0"><Bike className="w-4 h-4" {...ICON} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">{r.name}{i === 0 && usable && <Pill className="bg-green-50 text-green-700 text-[10px]">Recommended</Pill>}{o.riderId === r.id && <Pill className="bg-blue-50 text-[#1e40af] text-[10px]">Current</Pill>}</p>
                  <p className="text-xs text-gray-500 capitalize">{r.type} · {r.vehicle} · {r.plate}</p>
                </div>
                <div className="hidden sm:grid grid-cols-4 gap-3 text-xs text-center">
                  <div><p className={cn('font-semibold capitalize', r.status === 'online' ? 'text-green-700' : 'text-gray-500')}>{r.status}</p><p className="text-gray-400">status</p></div>
                  <div><p className="font-semibold text-gray-800">{dist} km</p><p className="text-gray-400">away</p></div>
                  <div><p className={cn('font-semibold', load >= maxActive ? 'text-[#dc2626]' : 'text-gray-800')}>{load}/{maxActive}</p><p className="text-gray-400">active</p></div>
                  <div><p className="font-semibold text-gray-800">★ {r.rating}</p><p className="text-gray-400">rating</p></div>
                </div>
                <Button size="sm" disabled={!usable || o.riderId === r.id} onClick={() => assign(r.id, r.name)}>Assign</Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FailDialog({ open, onClose, o }: { open: boolean; onClose: () => void; o: Order }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const submit = () => {
    if (!reason) return;
    mutate((d) => {
      applyStatus(d, o.id, 'failed_delivery', { note: `${reason}${detail.trim() ? ` — ${detail.trim()}` : ''}` });
      addAudit(d, { module: 'Orders', action: 'Failed delivery', detail: `${o.number} — ${reason}`, branchId: o.branchId });
    });
    toast.warning(`${o.number}: failed delivery recorded`);
    setReason(''); setDetail('');
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record failed delivery</DialogTitle><DialogDescription>What happened? Next you can re-attempt, return to branch or cancel.</DialogDescription></DialogHeader>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(selectClass, 'w-full')}>
          <option value="">Choose what happened…</option>
          {FAIL_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Details (calls attempted, time at location…)" rows={2} />
        <DialogFooter><Button variant="outline" onClick={onClose}>Back</Button><Button variant="destructive" disabled={!reason} onClick={submit}>Record</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortDialog({ idx, o, onClose }: { idx: number | null; o: Order; onClose: () => void }) {
  const it = idx !== null ? o.items[idx] : undefined;
  const [qty, setQty] = useState('');
  const submit = () => {
    if (idx === null || !it) return;
    const n = Math.floor(Number(qty));
    if (!(n >= 1 && n < it.qty)) { toast.error(`Enter a quantity between 1 and ${it.qty - 1}`); return; }
    editOrder(o.id, 'Short pick', `${it.name}: quantity ${it.qty} → ${n} (short ${it.qty - n})`, (x, d) => {
      x.items[idx].qty = n;
      x.items[idx].pickStatus = 'short';
      if (x.status === 'confirmed') applyStatus(d, x.id, 'preparing', { note: 'Picking started' });
    });
    toast.success(`${it.name} short-picked`, { description: `${it.qty - n} unit(s) removed from the total` });
    setQty('');
    onClose();
  };
  return (
    <Dialog open={idx !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Short pick · {it?.name}</DialogTitle><DialogDescription>Ordered {it?.qty}. How many are available?</DialogDescription></DialogHeader>
        <input type="number" min={1} max={(it?.qty ?? 2) - 1} value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className={cn(inputClass, 'w-full')} autoFocus />
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit}>Update quantity</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubstituteDialog({ idx, o, s, onClose }: { idx: number | null; o: Order; s: AppState; onClose: () => void }) {
  const it = idx !== null ? o.items[idx] : undefined;
  const orig = it ? s.products.find((p) => p.id === it.productId) : undefined;
  const candidates: Product[] = orig ? s.products.filter((p) => p.categoryId === orig.categoryId && p.id !== orig.id && p.status === 'active') : [];
  const propose = (p: Product) => {
    if (idx === null || !it) return;
    const price = getPrice(s, p.id, o.branchId, o.channel);
    editOrder(o.id, 'Substitute proposed', `${it.name} → ${p.name} (${peso(price)})`, (x, d) => {
      x.items[idx].substitute = { productId: p.id, name: p.name, image: p.image, unitPrice: price, status: 'proposed' };
      x.items[idx].pickStatus = 'substituted';
      if (x.status !== 'awaiting_shopper' && ['confirmed', 'preparing'].includes(x.status)) applyStatus(d, x.id, 'awaiting_shopper', { note: `Substitute proposed for ${it.name}` });
      addNotification(d, { audience: 'shopper', targetId: x.customerId, title: `${x.number}: substitute suggested`, body: `${it.name} is unavailable. Accept ${p.name} for ${peso(price)}?`, orderId: x.id });
    }, { recalc: false });
    toast.success('Substitute proposed', { description: 'Shopper notified — awaiting reply' });
    onClose();
  };
  return (
    <Dialog open={idx !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Propose a substitute</DialogTitle><DialogDescription>For {it?.name} · same category · shopper preference: {it ? SUB_PREF[it.subPref] : ''}</DialogDescription></DialogHeader>
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 max-h-80 overflow-y-auto">
          {candidates.length === 0 && <EmptyState title="No similar products in this category" />}
          {candidates.map((p) => {
            const price = getPrice(s, p.id, o.branchId, o.channel);
            const avail = available(s, p.id, o.branchId);
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-2xl">{p.image}</span>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 truncate">{p.name}</p><p className="text-xs text-gray-500">{p.brand} · {p.size} · {avail} available</p></div>
                <div className="text-right text-sm"><p className="font-semibold">{peso(price)}{p.soldByWeight ? '/kg' : ''}</p>{it && <p className={cn('text-[11px]', price > it.unitPrice ? 'text-amber-700' : 'text-green-700')}>{price > it.unitPrice ? '+' : ''}{peso(price - it.unitPrice)}</p>}</div>
                <Button size="sm" disabled={avail <= 0} onClick={() => propose(p)}>Propose</Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Print views ----------------
function PrintView({ o, mode, s }: { o: Order; mode: Exclude<PrintMode, null>; s: AppState }) {
  const branch = s.branches.find((b) => b.id === o.branchId)!;
  const aisle = (i: OrderItem) => s.products.find((p) => p.id === (i.substitute?.status === 'accepted' ? i.substitute.productId : i.productId))?.aisle ?? 99;
  const items = mode === 'pick' ? [...o.items].sort((a, b) => aisle(a) - aisle(b)) : o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock');
  const title = mode === 'pick' ? 'PICK LIST' : mode === 'pack' ? 'PACKING SLIP' : 'ORDER RECEIPT';
  const cold = (i: OrderItem) => s.products.find((p) => p.id === i.productId)?.tags.some((t) => t === 'chilled' || t === 'frozen');
  return (
    <div className="hidden print:block text-black text-[12px] font-sans">
      <div className="flex justify-between border-b-2 border-black pb-2 mb-3">
        <div><p className="text-lg font-bold">FreshMart · {branch.name}</p><p>{branch.address} · {branch.phone}</p></div>
        <div className="text-right"><p className="text-lg font-bold">{title}</p><p>{o.number}</p><p>{new Date().toLocaleString('en-PH')}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div><p><b>Customer:</b> {o.customerName}</p><p><b>Mobile:</b> {o.customerMobile}</p>{o.fulfillment === 'delivery' && o.address && <p><b>Deliver to:</b> {o.address.line}{o.address.landmark ? ` (${o.address.landmark})` : ''}</p>}</div>
        <div className="text-right"><p><b>{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</b> · {o.slot}</p><p><b>Channel:</b> {CHANNEL_LABEL[o.channel]}</p><p><b>Payment:</b> {PAYMENT_LABEL[o.paymentMethod]} ({o.paymentStatus.replace('_', ' ')})</p>{mode !== 'receipt' && o.bagCount ? <p><b>Bags:</b> {o.bagCount}</p> : null}</div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-black text-left">
          {mode === 'pick' && <th className="py-1 w-8">✓</th>}
          {mode === 'pick' && <th className="py-1">Aisle</th>}
          <th className="py-1">Item</th><th className="py-1 text-right">Qty / Wt</th>
          {mode === 'pick' && <th className="py-1">Note / Sub. pref</th>}
          {mode === 'pack' && <th className="py-1">Cold</th>}
          {mode === 'receipt' && <th className="py-1 text-right">Price</th>}
          {mode === 'receipt' && <th className="py-1 text-right">Amount</th>}
        </tr></thead>
        <tbody>
          {items.map((i, k) => {
            const name = i.substitute?.status === 'accepted' ? `${i.substitute.name} (sub. for ${i.name})` : i.name;
            const qty = i.soldByWeight ? `${(i.actualWeightKg ?? i.estWeightKg ?? 1).toFixed(3)} kg` : String(i.qty);
            return (
              <tr key={k} className="border-b border-gray-300 align-top">
                {mode === 'pick' && <td className="py-1">☐</td>}
                {mode === 'pick' && <td className="py-1">{aisle(i)}</td>}
                <td className="py-1">{name}</td><td className="py-1 text-right">{qty}</td>
                {mode === 'pick' && <td className="py-1">{[i.note, SUB_PREF[i.subPref]].filter(Boolean).join(' · ')}</td>}
                {mode === 'pack' && <td className="py-1">{cold(i) ? '❄ COLD' : ''}</td>}
                {mode === 'receipt' && <td className="py-1 text-right">{peso(i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice)}</td>}
                {mode === 'receipt' && <td className="py-1 text-right">{peso(lineTotal(i))}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {mode === 'receipt' && (
        <div className="mt-3 ml-auto w-64 space-y-0.5">
          <div className="flex justify-between"><span>Subtotal</span><span>{peso(o.subtotal)}</span></div>
          {o.deliveryFee > 0 && <div className="flex justify-between"><span>Delivery fee</span><span>{peso(o.deliveryFee)}</span></div>}
          {o.serviceFee > 0 && <div className="flex justify-between"><span>Service fee</span><span>{peso(o.serviceFee)}</span></div>}
          {o.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{peso(o.discount)}</span></div>}
          <div className="flex justify-between font-bold border-t border-black pt-1"><span>TOTAL</span><span>{peso(o.total)}</span></div>
          {o.refundedAmount > 0 && <div className="flex justify-between"><span>Refunded</span><span>−{peso(o.refundedAmount)}</span></div>}
        </div>
      )}
      {mode === 'pack' && o.riderInstructions && <p className="mt-3"><b>Rider instructions:</b> {o.riderInstructions}</p>}
      {mode === 'pick' && <p className="mt-3">Picker: {o.pickerName ?? '________________'} · Checked by: ________________</p>}
      {mode === 'receipt' && <p className="mt-6 text-center font-bold">This is not an official receipt.</p>}
      <p className="mt-2 text-center text-[10px]">Printed {fmtDateTime(new Date().toISOString())}</p>
    </div>
  );
}
