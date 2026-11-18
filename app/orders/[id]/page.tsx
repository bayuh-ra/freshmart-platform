'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Ban, Bike, Check, CheckCircle2, ChevronDown, CircleDashed, Clock, CreditCard, Layers, Lock, Mail, MapPin, MessageSquare,
  Bell, PackageCheck, Phone, PhoneCall, ShoppingBag, Printer, QrCode, Repeat, Replace, RotateCcw, Scale, Scissors, Snowflake, StickyNote, Store,
  Route, Truck, Undo2, Users, Wallet, X, XCircle, Zap,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';
import { Textarea } from '@/src/components/ui/shadcn/textarea';
import { addAudit, addNotification, currentUserName, mutate, useStore } from '@/src/lib/store';
import { liveRiderPos, rankCandidates, useNow, workload } from '@/src/components/delivery/helpers';
import { assignRiderNow, markOrderDelivered, startDelivery } from '@/src/components/delivery/actions';
import {
  CHANNEL_LABEL, ONLINE_METHODS, PAYMENT_LABEL, STATUS_LABEL, applyStatus, can, confirmOrder, distanceKm,
  cutCharge, cutFeeText, fmtDateTime, fmtTime, getSetting, isToday, lineTotal, num, onHand, peso, recalc, riderPosition, timeAgo,
} from '@/src/lib/logic';
import type { AppState, Order, OrderItem, OrderStatus, PaymentMethod } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { RejectDialog, cutLabel } from '../_shared';
import { ProductImage } from '@/src/components/ProductImage';
import {
  Banner, BannerActions, BannerLayout, BannerTitle, Card, CardTitle, DarkButton, DarkChip, ICON, LightButton, OSWALD, PAY_LINE, PAY_SHORT, PAY_STATE, PayRow,
  PrepStepper, RedButton, STATUS_PILL, SegmentedProgress, StepPanel, Tag, closingTime, Timeline, clock, darkInput, initials, type TimelineRow,
} from './_parts';
import { ChooseRiderDrawer, RiderPickCard, rideMins, riderRows, topPicks } from './_rider';

const PICK_LABEL: Record<OrderItem['pickStatus'], { label: string; cls: string }> = {
  pending: { label: 'To pick', cls: 'bg-[#f3ece6] text-[#3d3230]' },
  picked: { label: 'Picked', cls: 'bg-green-50 text-green-800' },
  short: { label: 'Short', cls: 'bg-amber-50 text-amber-800' },
  out_of_stock: { label: 'Out of stock', cls: 'bg-red-50 text-red-700' },
  substituted: { label: 'Substitute', cls: 'bg-red-50 text-red-800' },
  removed: { label: 'Removed', cls: 'bg-gray-100 text-gray-500' },
};
const SUB_PREF: Record<OrderItem['subPref'], string> = { similar: 'Replace with similar', ask: 'Ask me first', refund: 'Don’t replace — refund' };
const SUB_ICON: Record<OrderItem['subPref'], typeof Repeat> = { similar: Repeat, ask: Phone, refund: RotateCcw };
const EVENT_LABEL: Record<string, string> = { note: 'Internal note', edit: 'Order edited', refund: 'Refund', payment: 'Payment', rider: 'Rider' };
const CHANNEL_TEXT: Record<Order['channel'], string> = { app: 'Ordered in the app', walk_in: 'Walk-in order', phone: 'Phone order' };
const CHANNEL_PLACED: Record<Order['channel'], string> = { app: 'Placed in the app', walk_in: 'Placed at the counter', phone: 'Placed by phone' };
const OPEN = ['placed', 'awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper', 'ready', 'out_for_delivery', 'failed_delivery'];
const FAIL_REASONS = ['Customer not reachable', 'Wrong / incomplete address', 'Customer refused the order', 'Customer not home', 'Unsafe to deliver', 'Vehicle problem'];
/** Where each status sits in the fulfillment flow (index into the flow built in the page). */
const STAGE_IDX: Partial<Record<OrderStatus, number>> = {
  placed: 0, awaiting_confirmation: 0, confirmed: 0, preparing: 1, awaiting_shopper: 1, ready: 2, out_for_delivery: 3, failed_delivery: 3,
};

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
  const now = useNow(1000);
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? '');
  const o = s.orders.find((x) => x.id === id);

  const [rejecting, setRejecting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [riderOpen, setRiderOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  /** Ready-delivery with a rider: "Rider checked the insulated bag" tick before hand-over. */
  const [riderBagOk, setRiderBagOk] = useState(false);
  const [shortFor, setShortFor] = useState<number | null>(null);
  /** Actual weight outside tolerance: waiting for "Shopper approved by phone". */
  const [pendingWeight, setPendingWeight] = useState<{ idx: number; kg: number } | null>(null);
  const [printMode, setPrintMode] = useState<PrintMode>(null);
  const [note, setNote] = useState('');
  const [bags, setBags] = useState<number | ''>('');
  const [coldOk, setColdOk] = useState(false);
  const [labeled, setLabeled] = useState(false);
  const [pin, setPin] = useState('');
  const [verified, setVerified] = useState(false);
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>('cash');
  const [weights, setWeights] = useState<Record<number, string>>({});
  const [showWeighs, setShowWeighs] = useState(false);

  useEffect(() => {
    if (o && !o.acknowledged) mutate((d) => { const x = d.orders.find((y) => y.id === o.id); if (x) x.acknowledged = true; });
  }, [o]);

  useEffect(() => {
    if (!printMode) return;
    const t = setTimeout(() => { window.print(); setPrintMode(null); }, 150);
    return () => clearTimeout(t);
  }, [printMode]);

  if (!can(s, 'orders.view')) {
    return <DashboardLayout title="Order" crumbs={[{ label: 'Order desk' }, { label: 'Orders', href: '/orders' }, { label: 'Order' }]}><AccessDenied permission="orders.view" /></DashboardLayout>;
  }
  if (!o) {
    return (
      <DashboardLayout title="Order" crumbs={[{ label: 'Order desk' }, { label: 'Orders', href: '/orders' }, { label: 'Order' }]}>
        <Panel><EmptyState title="Order not found" sub="It may have been removed when the demo data was reset." /><div className="text-center"><Link href="/orders" className="text-sm text-[#c8151d] hover:underline">Back to orders</Link></div></Panel>
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
  const coldItems = o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock' && (i.storage === 'fresh' || i.storage === 'frozen'));
  const refundable = Math.max(0, Math.round((o.total - o.refundedAmount) * 100) / 100);
  const timeoutMins = num(getSetting(s, 'confirmTimeoutMins', o.branchId)) || 10;
  const remainingSec = timeoutMins * 60 - (now - new Date(o.placedAt).getTime()) / 1000;
  const holdHours = num(getSetting(s, 'pickupHoldHours', o.branchId)) || 4;
  const readyAt = [...o.timeline].reverse().find((e) => e.status === 'ready')?.at;
  const riderAssignedAt = [...o.timeline].reverse().find((e) => e.status === 'rider')?.at;
  /** Pickup hold: ready time + hold hours, capped at the branch closing time (when the order was ready before closing). */
  const holdRaw = readyAt ? new Date(new Date(readyAt).getTime() + holdHours * 3600000) : undefined;
  const closeAt = readyAt ? closingTime(branch.hours, new Date(readyAt)) : undefined;
  const holdCapped = !!holdRaw && !!closeAt && closeAt.getTime() > new Date(readyAt!).getTime() && closeAt < holdRaw;
  const holdUntil = holdCapped ? closeAt : holdRaw;
  const holdExpired = !!holdUntil && holdUntil.getTime() < now;
  const tolerancePct = num(getSetting(s, 'weightTolerancePct', o.branchId)) || 10;
  const bagRequired = !!o.coldChain && getSetting(s, 'insulatedBagRequired', o.branchId) === true;
  const by = currentUserName(s);

  // ---------- display helpers ----------
  const terminal = ['delivered', 'collected', 'cancelled'].includes(o.status);
  const activeItems = o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock');
  const pickedCount = o.items.filter((i) => i.pickStatus === 'picked' || i.pickStatus === 'substituted').length;
  const droppedCount = o.items.length - activeItems.length;
  const weighedLines = o.items.filter((i) => i.soldByWeight).length;
  const notWeighed = activeItems.filter((i) => i.soldByWeight && !i.actualWeightKg).length;
  const estimated = !terminal && notWeighed > 0;
  const timeoutAction = String(getSetting(s, 'timeoutAction', o.branchId));
  const alertPhrase = timeoutAction === 'Alert manager' ? 'manager alerted' : timeoutAction === 'Remind' ? 'reminder sent' : timeoutAction.toLowerCase();
  const overdue = awaiting && remainingSec <= 0;
  const confirmedAt = [...o.timeline].reverse().find((e) => e.status === 'confirmed')?.at;
  const prepBase = awaiting ? now : new Date(confirmedAt ?? o.placedAt).getTime();
  const readyBy = fmtTime(new Date(prepBase + o.prepMinutes * 60000).toISOString());
  const prepShown = isOpen && !['ready', 'out_for_delivery', 'failed_delivery'].includes(o.status);
  const when = (iso: string) => (isToday(iso) ? fmtTime(iso) : fmtDateTime(iso));
  const placedText = isToday(o.placedAt) ? `today, ${fmtTime(o.placedAt)}` : fmtDateTime(o.placedAt);
  const payWord = { pending: 'unpaid', paid: 'paid', failed: 'payment failed', expired: 'link expired', refunded: 'refunded', partially_refunded: 'partly refunded' }[o.paymentStatus];
  const payTagCls = o.paymentStatus === 'pending' ? 'bg-amber-50 text-amber-800' : o.paymentStatus === 'paid' ? 'bg-green-50 text-green-800' : o.paymentStatus === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600';
  const firstName = customer?.firstName || o.customerName.split(' ')[0];
  const orderCount = customer ? s.orders.filter((x) => x.customerId === customer.id).length : 0;
  const roleOf = (name?: string) => {
    const u = s.staff.find((x) => x.name === name);
    return u ? s.roles.find((r) => r.id === u.roleId)?.name.toLowerCase() : undefined;
  };
  const pickupInstr = branch.pickupInstructions?.trim().replace(/[.\s]+$/, '');
  const doneCount = o.items.length - unresolved;
  /** Prep target: confirmation time (or placement) + prep minutes. */
  const targetAt = new Date(confirmedAt ?? o.placedAt).getTime() + o.prepMinutes * 60000;
  const targetText = fmtTime(new Date(targetAt).toISOString());
  const minsOver = Math.floor((now - targetAt) / 60000);
  const canAssignRider = canEdit && ['ready', 'preparing', 'confirmed', 'failed_delivery'].includes(o.status);
  const pickupReady = o.status === 'ready' && o.fulfillment === 'pickup';
  const readyDelivery = o.status === 'ready' && o.fulfillment === 'delivery';
  const outDelivery = o.status === 'out_for_delivery';
  const blueStage = (readyDelivery && !!rider) || outDelivery;
  const deliveredView = o.status === 'delivered' && o.fulfillment === 'delivery';
  /** Packed delivery orders (ready, out for delivery, delivered) share the "In the bag" / "Deliver to" layout. */
  const dlv = readyDelivery || outDelivery || deliveredView;
  /** Packed orders (ready for pickup or for a rider) show the "In the bag" summary. */
  const bagView = pickupReady || dlv;
  const deliveryKm = o.fulfillment === 'delivery' && o.address ? distanceKm(branch, o.address) : undefined;
  const minsText = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`);
  const waitMins = readyAt ? Math.max(0, Math.floor((now - new Date(readyAt).getTime()) / 60000)) : 0;
  const holdText = holdUntil ? fmtTime(holdUntil.toISOString()) : '';
  const packEvent = [...o.timeline].reverse().find((e) => e.status === 'edit' && e.note?.startsWith('Pack check:'));
  const bagN = o.bagCount ?? Number(packEvent?.note?.match(/(\d+) bag/)?.[1] ?? 0);
  const bagText = bagN ? `${bagN} ${o.coldChain ? 'insulated ' : ''}bag${bagN > 1 ? 's' : ''}` : o.coldChain ? 'Insulated bag' : '';
  const statusText = o.status === 'ready' ? (o.fulfillment === 'pickup' ? 'Ready for pickup' : rider ? 'Rider assigned' : 'Ready · no rider') : STATUS_LABEL[o.status];
  const lateConfirm = awaiting ? remainingSec <= 0
    : !o.autoConfirmed && !!confirmedAt && new Date(confirmedAt).getTime() - new Date(o.placedAt).getTime() > timeoutMins * 60000;

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
    if (st === 'out_of_stock' || st === 'removed') {
      // Phase 1: staff phone the shopper; no in-app substitution request.
      const msg = it.subPref === 'refund' ? 'Shopper chose refund — item removed from the total.' : `Shopper preference: "${SUB_PREF[it.subPref]}". Call the shopper, then log it with "Called shopper".`;
      toast.warning(`${it.name} ${st === 'removed' ? 'removed' : 'marked out of stock'}`, { description: msg });
    } else toast.success(`${it.name}: ${PICK_LABEL[st].label}`);
  };

  /** Effective price per kg / unit (accepted substitute price wins). */
  const priceOf = (it: OrderItem) => (it.substitute?.status === 'accepted' ? it.substitute.unitPrice : it.unitPrice);
  /** Price difference of a weighed line vs its estimate (null when not weighed). */
  /** Line total of a weighed line at a given weight (price/kg × kg + cut charge, which may itself be per kg). */
  const weighedLine = (it: OrderItem, kg: number) => Math.round((priceOf(it) * kg + cutCharge(it.cut, true, 1, kg)) * 100) / 100;
  const weighDiffOf = (it: OrderItem) => (it.soldByWeight && it.actualWeightKg ? Math.round((weighedLine(it, it.actualWeightKg) - weighedLine(it, it.estWeightKg ?? 1)) * 100) / 100 : null);
  const weighDiff = Math.round(activeItems.reduce((t, it) => t + (weighDiffOf(it) ?? 0), 0) * 100) / 100;
  /** What the shopper saw at checkout: every line at its estimated weight + fees. */
  const estAtCheckout = Math.round((o.items.reduce((t, it) => t + (it.soldByWeight ? it.unitPrice * (it.estWeightKg ?? 1) + cutCharge(it.cut, true, 1, it.estWeightKg ?? 1) : lineTotal(it)), 0)
    + o.deliveryFee + o.serviceFee - o.discount) * 100) / 100;
  const otherAdjust = Math.round((o.total - estAtCheckout - weighDiff) * 100) / 100;
  const remindPickup = () => {
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (!x) return;
      const at = new Date().toISOString();
      addNotification(d, { audience: 'shopper', targetId: x.customerId, title: 'Your order is ready for pickup', body: `${x.number} is ready at ${branch.name}${holdText ? ` — we’ll hold it until ${holdText}` : ''}. Show your pickup PIN at the counter.`, orderId: x.id });
      x.timeline.push({ status: 'note', at, by, note: `Pickup reminder sent to ${firstName}` });
      addAudit(d, { module: 'Orders', action: 'Pickup reminder', detail: `${x.number} — reminder sent to ${x.customerName}`, branchId: x.branchId });
    });
    toast.success(`Reminder sent to ${firstName}`);
  };
  const weightCheck = (it: OrderItem, kg: number) => {
    const est = it.estWeightKg ?? 1;
    const devPct = ((kg - est) / est) * 100;
    const diff = Math.round((weighedLine(it, kg) - weighedLine(it, est)) * 100) / 100;
    return { est, devPct, diff, within: Math.abs(devPct) <= tolerancePct + 1e-9 };
  };
  const applyWeight = (idx: number, kg: number, phoneApproved: boolean) => {
    const it = o.items[idx];
    const { est, devPct, diff } = weightCheck(it, kg);
    const sign = devPct >= 0 ? '+' : '−';
    const note = `${it.name}: actual ${kg.toFixed(3)} kg (est. ${est.toFixed(2)} kg, ${sign}${Math.abs(devPct).toFixed(1)}%) · price ${diff >= 0 ? '+' : '−'}${peso(Math.abs(diff))}`
      + (phoneApproved ? ` · outside ${tolerancePct}% tolerance — shopper approved by phone` : ` · within ${tolerancePct}% tolerance, applied automatically`);
    editOrder(o.id, phoneApproved ? 'Actual weight approved by phone' : 'Actual weight entered', note, (x, d) => {
      x.items[idx].actualWeightKg = kg;
      if (x.items[idx].pickStatus === 'pending') x.items[idx].pickStatus = 'picked';
      ensurePreparing(d, x);
    });
    setWeights((w) => ({ ...w, [idx]: '' }));
    setPendingWeight(null);
    toast.success(`${it.name} weighed`, { description: `Line total ${peso(weighedLine(it, kg))}${phoneApproved ? ' · shopper approved by phone' : ''}` });
  };
  const setWeight = (idx: number) => {
    const it = o.items[idx];
    const kg = Math.round(Number(weights[idx]) * 1000) / 1000;
    if (!kg || kg <= 0) { toast.error('Enter the actual weight in kg'); return; }
    if (weightCheck(it, kg).within) applyWeight(idx, kg, false);
    else {
      setPendingWeight({ idx, kg });
      toast.warning('Outside weight tolerance', { description: 'Call the shopper to approve the new price before applying.' });
    }
  };
  /** Logs a phone call as an internal note + timeline entry ("Called shopper" per item, "Called customer" from the notes card). */
  const calledShopper = (detail?: string, who: 'shopper' | 'customer' = 'shopper') => {
    const text = `Called ${who}${detail ? ` about ${detail}` : ''} (${o.customerMobile})`;
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (!x) return;
      const at = new Date().toISOString();
      x.internalNotes.push({ at, by, text });
      x.timeline.push({ status: 'note', at, by, note: text });
      addAudit(d, { module: 'Orders', action: `Called ${who}`, detail: `${x.number} — ${text}`, branchId: x.branchId });
    });
    toast.success('Call logged', { description: text });
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
    if (unresolved || proposed) { toast.error('Finish picking first', { description: `${unresolved} item(s) to pick, ${proposed} substitute(s) still open` }); return; }
    if (bagRequired && !coldOk) { toast.error('Pack check needed', { description: 'Tick "Packed in insulated bag with ice packs".' }); return; }
    const bagCount = Number(bags) || Math.max(1, Math.ceil(o.items.length / 5));
    mutate((d) => {
      const x = d.orders.find((y) => y.id === o.id);
      if (!x) return;
      x.bagCount = bagCount;
      if (x.coldChain && coldOk) x.insulatedPacked = true;
      x.timeline.push({ status: 'edit', at: new Date().toISOString(), by, note: `Pack check: ${bagCount} bag(s)${x.coldChain && coldOk ? ', packed in insulated bag with ice packs' : ''}, labeled` });
      applyStatus(d, o.id, 'ready', { note: o.fulfillment === 'pickup' ? `Ready for pickup — hold ${holdHours}h` : 'Ready — rider assignment' });
      addAudit(d, { module: 'Orders', action: 'Marked ready', detail: `${o.number} · ${bagCount} bag(s)`, branchId: o.branchId });
    });
    toast.success(`${o.number} is ready`, { description: o.fulfillment === 'pickup' ? 'Shopper notified to pick up' : 'Choose a rider' });
    if (o.fulfillment === 'delivery' && !o.riderId) setRiderOpen(true);
  };
  const outForDelivery = () => startDelivery(o, rider?.name);
  const markDelivered = () => markOrderDelivered(o);
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
  const pickerEditable = branch.services.picker && canEdit && (awaiting || picking);
  const pickerRole = roleOf(o.pickerName);

  const payChip = <DarkChip tone={o.paymentStatus === 'paid' ? 'green' : 'default'}><Wallet className="w-3.5 h-3.5" {...ICON} />{PAY_SHORT[o.paymentMethod]} · {payWord}</DarkChip>;
  const stepper = prepShown ? <PrepStepper minutes={o.prepMinutes} readyBy={readyBy} onChange={changePrep} editable={canEdit} /> : null;

  // ---------- rider card (delivery only; shown first while the order is being picked) ----------
  const candidates = o.fulfillment === 'delivery' && canAssignRider && !rider && !readyDelivery ? rankCandidates(s, o).list.slice(0, 4) : [];
  const riderFirst = o.fulfillment === 'delivery' && picking;
  const riderCard = o.fulfillment === 'delivery' && !(readyDelivery && !rider) && !deliveredView ? (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Rider</CardTitle>
        {canAssignRider && rider && <LightButton onClick={() => setRiderOpen(true)}>Change</LightButton>}
      </div>
      {rider ? (() => {
        // Assigned rider: blue card with shift status, distance from the shop, workload and a call button.
        const km = distanceKm(liveRiderPos(s, rider), branch);
        const load = workload(s, rider.id);
        const shift = rider.status === 'online' ? 'On shift' : rider.status === 'offline' ? 'Off shift' : rider.status === 'suspended' ? 'Suspended' : 'Pending';
        return (
          <div className="mt-4 flex items-center gap-3 sm:gap-4 rounded-xl bg-[#e6ecf8] px-3.5 sm:px-4 py-3.5">
            <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#2c4f9e] text-white flex items-center justify-center shrink-0"><Bike className="w-5 h-5" {...ICON} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-base sm:text-lg font-semibold text-[#1d2f5e] truncate">{rider.name}</p>
              <p className="text-sm text-[#3b5aa0] leading-snug">
                {shift} · {km < 0.15 ? 'at the shop' : `${km.toFixed(1)} km away`} · {load ? `${load} active ${load === 1 ? 'delivery' : 'deliveries'}` : 'free'}
              </p>
            </div>
            <a href={`tel:${rider.phone.replace(/\s+/g, '')}`} aria-label={`Call ${rider.name}`}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white text-[#2c4f9e] flex items-center justify-center shrink-0 shadow-sm hover:bg-[#f5f8fd]">
              <Phone className="w-5 h-5" {...ICON} />
            </a>
          </div>
        );
      })() : (
        <>
          <p className="mt-2 text-sm text-[#5b4f4b]">No rider yet.{canAssignRider ? ' Assign one now so they arrive as packing finishes.' : ''}</p>
          {canAssignRider && (candidates.length ? (
            <ul className="mt-3 space-y-2">
              {candidates.map((c) => (
                <li key={c.rider.id} className="flex items-center gap-3 rounded-xl border border-[#eadfd6] bg-white pl-3 pr-1.5 py-2">
                  <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0"><Bike className="w-4 h-4" {...ICON} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1d1716] truncate">{c.rider.name}</p>
                    <p className="text-xs text-gray-500">On shift · {c.km < 0.15 ? 'at the shop' : `${c.km.toFixed(1)} km away`} · {c.load ? `${c.load} active ${c.load === 1 ? 'delivery' : 'deliveries'}` : 'free'}</p>
                  </div>
                  <button type="button" onClick={() => assignRiderNow(s, o, c.rider.id, c.rider.name)}
                    className="shrink-0 min-h-11 px-2.5 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Assign</button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-gray-400">No riders on shift are free right now.</p>)}
          {canAssignRider && (
            <button type="button" onClick={() => setRiderOpen(true)} className="mt-2 min-h-11 text-sm font-medium text-[#5b4f4b] hover:text-[#c8151d]">All riders…</button>
          )}
        </>
      )}
    </Card>
  ) : null;

  // ---------- stage banner ----------
  let banner: React.ReactNode = null;
  if (awaiting) {
    banner = (
      <BannerLayout title="Accept this order?"
        chips={<>
          {overdue
            ? <DarkChip tone="red"><AlertTriangle className="w-3.5 h-3.5" {...ICON} />Overdue {clock(-remainingSec)} · {alertPhrase}</DarkChip>
            : <span title={`Confirmation timeout ${timeoutMins} min`}><DarkChip><Clock className="w-3.5 h-3.5" {...ICON} />Confirm within {clock(remainingSec)}</DarkChip></span>}
          {payChip}
        </>}
        aside={<>
          {stepper}
          <BannerActions alignWithStepper={!!stepper}>
            <DarkButton onClick={() => setRejecting(true)}><X className="w-4 h-4" {...ICON} />Reject</DarkButton>
            <RedButton onClick={confirm}><Check className="w-4 h-4" strokeWidth={2.25} />Confirm order</RedButton>
          </BannerActions>
        </>} />
    );
  } else if (picking) {
    const allDone = !unresolved && !proposed;
    const subline = o.status === 'confirmed'
      ? 'Confirmed — stock reserved. Start picking, or weigh and mark items below.'
      : o.status === 'awaiting_shopper'
        ? 'Waiting on the shopper: call about the unavailable item(s), log the call with “Called shopper”, then mark each item.'
        : allDone ? 'Everything is picked. Do the pack check, then mark the order ready.'
          : 'Weigh each item and enter the actual kg, or mark it out of stock. Totals update as you go.';
    banner = (
      <>
        <BannerLayout title={`Picking · ${doneCount} of ${o.items.length} done`}
          aside={prepShown ? (
            <PrepStepper label="PREP TARGET" minutes={o.prepMinutes} onChange={changePrep} editable={canEdit}
              footer={minsOver > 0
                ? <p className="text-xs font-semibold text-red-300 mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" {...ICON} />{minsOver} min over · target was {targetText}</p>
                : <p className="text-xs text-white/60 mt-1.5">Ready by {targetText}</p>} />
          ) : undefined}>
          <p className="mt-2.5 text-sm text-white/75 max-w-3xl">{subline}</p>
          {proposed > 0 && <div className="mt-3"><DarkChip tone="amber"><Replace className="w-3.5 h-3.5" {...ICON} />{proposed} substitute(s) still open</DarkChip></div>}
        </BannerLayout>
        <div className="mt-5">
          <SegmentedProgress items={o.items.map((i) => ({ name: i.name, done: i.pickStatus !== 'pending', dropped: i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock' }))} />
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-stretch gap-3">
          {(o.coldChain || allDone) && (
            <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/20 px-4 py-1.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-6">
              {o.coldChain && (
                <label className="flex items-center gap-3 min-h-11 py-1 cursor-pointer">
                  <input type="checkbox" checked={coldOk} onChange={(e) => setColdOk(e.target.checked)} className="w-5 h-5 accent-[#d6202a] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Packed in insulated bag with ice packs</span>
                    {bagRequired && <span className="block text-xs text-white/55">Required for cold-chain orders</span>}
                  </span>
                </label>
              )}
              {allDone && (
                <label className="flex items-center gap-3 min-h-11 py-1 cursor-pointer text-sm font-semibold">
                  <input type="checkbox" checked={labeled} onChange={(e) => setLabeled(e.target.checked)} className="w-5 h-5 accent-[#d6202a] shrink-0" />Labeled &amp; in ready area
                </label>
              )}
              {allDone && (
                <label className="flex items-center gap-2 min-h-11 py-1 text-sm text-white/70">Bags
                  <input type="number" min={1} value={bags} placeholder={String(Math.max(1, Math.ceil(o.items.length / 5)))} onChange={(e) => setBags(e.target.value === '' ? '' : Number(e.target.value))} className={cn(darkInput, 'w-20 h-10')} />
                </label>
              )}
            </div>
          )}
          <div className="flex flex-col min-[400px]:flex-row gap-2 sm:ml-auto sm:shrink-0 [&>*]:w-full sm:[&>*]:w-auto">
            {o.status === 'confirmed' && <DarkButton className="sm:h-auto min-h-11" onClick={startPicking}><PackageCheck className="w-4 h-4" {...ICON} />Start picking</DarkButton>}
            {o.status === 'awaiting_shopper' && <DarkButton className="sm:h-auto min-h-11" onClick={() => calledShopper()}><PhoneCall className="w-4 h-4" {...ICON} />Called shopper</DarkButton>}
            {allDone ? (
              <RedButton className="sm:h-auto min-h-11" onClick={markReady} disabled={!labeled || (bagRequired && !coldOk)}><CheckCircle2 className="w-4 h-4" {...ICON} />Mark ready</RedButton>
            ) : (
              <button type="button" disabled className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 min-h-11 text-sm font-semibold text-white/50 cursor-not-allowed">
                <PackageCheck className="w-4 h-4" {...ICON} />Finish picking ({unresolved ? `${unresolved} left` : `${proposed} substitute(s) open`})
              </button>
            )}
          </div>
        </div>
        {allDone && coldItems.length > 0 && <p className="text-xs text-sky-200 mt-3">❄️ Cold items: {coldItems.map((i) => i.substitute?.status === 'accepted' ? i.substitute.name : i.name).join(', ')}{bagRequired ? ' · insulated bag required by branch setting' : ''}</p>}
        {allDone && notWeighed > 0 && <p className="text-xs text-amber-200 mt-2">Some weighed items have no actual weight yet — the estimated weight will be charged.</p>}
      </>
    );
  } else if (readyDelivery && !rider) {
    // No rider yet: three suggestions (best match / free now / top rated) + "Browse all riders" drawer.
    const rr = riderRows(s, o);
    const picks = topPicks(rr.available);
    const maxMins = o.maxDeliveryMins ?? (num(getSetting(s, 'meatMaxDeliveryMins', o.branchId)) || 60);
    banner = (
      <BannerLayout title="Assign a rider"
        chips={<>
          <DarkChip tone="red"><AlertTriangle className="w-3.5 h-3.5" {...ICON} />Packed and waiting {minsText(waitMins)}</DarkChip>
          <DarkChip><Route className="w-3.5 h-3.5" {...ICON} />{rr.rule} · max {rr.max} orders each</DarkChip>
          {o.coldChain && <DarkChip tone="sky"><Snowflake className="w-3.5 h-3.5" {...ICON} />Deliver within {maxMins} min of pickup</DarkChip>}
        </>}>
        {picks.length ? (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
            {picks.map((p) => <RiderPickCard key={p.row.rider.id} row={p.row} badge={p.badge} max={rr.max} onAssign={() => assignRiderNow(s, o, p.row.rider.id, p.row.rider.name)} />)}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">No rider is free right now. Browse all riders to see who frees up first.</p>
        )}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <DarkButton onClick={() => setRiderOpen(true)}><Users className="w-4 h-4" {...ICON} />Browse all {rr.rows.length} riders</DarkButton>
          <p className="text-xs text-white/60">{rr.counts.available} available · {rr.counts.capacity} at capacity · {rr.counts.offline} offline</p>
        </div>
      </BannerLayout>
    );
  } else if (readyDelivery && rider) {
    // Rider assigned: countdown until the rider reaches the shop, bag check, then hand over.
    const riderFirst = rider.name.split(/\s+/)[0];
    const rideSec = Math.max(60, Math.round((distanceKm(liveRiderPos(s, rider), branch) / 25) * 3600));
    const arriveMs = (riderAssignedAt ? new Date(riderAssignedAt).getTime() : now) + rideSec * 1000;
    const leftSec = Math.max(0, Math.round((arriveMs - now) / 1000));
    const bagOk = riderBagOk || !!o.riderBagConfirmed;
    const handOver = () => {
      if (!bagOk) return;
      startDelivery(o, rider.name, { bagChecked: true });
    };
    banner = (
      <>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <BannerTitle>{leftSec > 0 ? `${riderFirst} is on the way` : `${riderFirst} is at the counter`}</BannerTitle>
            <p className="mt-2 text-sm sm:text-base text-white/75">
              {leftSec > 0
                ? `Get the ${bagN > 1 ? `${bagN} bags` : 'bag'} ready so it’s waiting when the rider walks in.`
                : `Hand over the bag once the rider has checked it.${o.coldChain ? ` The ${o.maxDeliveryMins ?? 60}-min cold-chain clock starts when you do.` : ''}`}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">{leftSec > 0 ? 'Arrives in' : 'Arrived'}</p>
            <p className={cn('text-4xl sm:text-5xl leading-none tabular-nums', leftSec > 0 ? 'text-white' : 'text-[#7fd6a0]')} style={OSWALD}>{leftSec > 0 ? clock(leftSec) : 'Here'}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-11 h-11 rounded-full bg-[#e6ecf8] text-[#2c4f9e] flex items-center justify-center text-base shrink-0" style={OSWALD}>{initials(rider.name)}</span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{rider.name}</p>
              <p className="text-sm text-white/60 truncate"><span className="capitalize">{rider.vehicle}</span> · {rider.plate} · ★ {rider.rating}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
            <a href={`tel:${rider.phone.replace(/\s/g, '')}`} className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white text-[#1d1716] text-sm font-semibold hover:bg-white/90">
              <Phone className="w-4 h-4" {...ICON} />Call
            </a>
            <DarkButton onClick={() => setRiderOpen(true)}>Change rider</DarkButton>
          </div>
        </div>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-stretch gap-3">
          <label className="flex-1 min-w-0 flex items-center gap-3 min-h-11 rounded-xl border border-white/10 bg-black/20 px-4 py-3 cursor-pointer">
            <input type="checkbox" checked={bagOk} disabled={!!o.riderBagConfirmed} onChange={(e) => setRiderBagOk(e.target.checked)} className="w-5 h-5 accent-[#d6202a] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{o.coldChain ? 'Rider checked the insulated bag' : 'Rider checked the bag'}</span>
              <span className="block text-xs text-white/55">Sealed, labeled {o.number}{o.coldChain ? ', ice packs inside' : ''}</span>
            </span>
          </label>
          <RedButton className="sm:w-auto sm:min-w-[260px] min-h-11 disabled:bg-white/10 disabled:text-white/45 disabled:opacity-100" disabled={!bagOk} onClick={handOver}>
            <Bike className="w-4 h-4" {...ICON} />Hand over · start delivery
          </RedButton>
        </div>
      </>
    );
  } else if (readyDelivery) {
    banner = (
      <BannerLayout title={rider ? 'Hand to rider' : 'Assign a rider'}
        chips={<>
          {rider
            ? <DarkChip><Bike className="w-3.5 h-3.5" {...ICON} />{rider.name} · <span className="capitalize">{rider.vehicle}</span> · {rider.plate} · {rider.phone}</DarkChip>
            : <DarkChip>Dispatch rule: {String(getSetting(s, 'dispatchRule', o.branchId))}</DarkChip>}
          {o.bagCount ? <DarkChip>{o.bagCount} bag(s)</DarkChip> : null}
          {o.coldChain && <DarkChip><Snowflake className="w-3.5 h-3.5" {...ICON} />Cold chain{o.maxDeliveryMins ? ` · deliver within ${o.maxDeliveryMins} min` : ''}</DarkChip>}
          {payChip}
        </>}
        aside={<BannerActions>
          <DarkButton onClick={() => setRiderOpen(true)}><Bike className="w-4 h-4" {...ICON} />{rider ? 'Change rider' : 'Assign rider'}</DarkButton>
          {rider && <RedButton onClick={outForDelivery}><Truck className="w-4 h-4" {...ICON} />Out for delivery</RedButton>}
        </BannerActions>} />
    );
  } else if (o.status === 'ready' && o.fulfillment === 'pickup') {
    const paid = o.paymentStatus !== 'pending';
    const methods: { v: PaymentMethod; label: string }[] = [
      { v: 'cash', label: 'Cash' }, { v: 'gcash', label: 'GCash' }, { v: 'maya', label: 'Maya' }, { v: 'card', label: 'Card at counter' },
    ];
    banner = (
      <BannerLayout title={`Hand over to ${firstName}`}
        chips={<>
          {holdUntil && (holdExpired
            ? <DarkChip tone="red"><AlertTriangle className="w-3.5 h-3.5" {...ICON} />Hold time expired — policy: {String(getSetting(s, 'noShowPolicy', o.branchId))}</DarkChip>
            : <DarkChip><Clock className="w-3.5 h-3.5" {...ICON} />Held until {holdText}{holdCapped ? ' · closing' : ''}</DarkChip>)}
          {bagText && <DarkChip><ShoppingBag className="w-3.5 h-3.5" {...ICON} />{bagText}</DarkChip>}
          {o.paymentStatus === 'pending'
            ? <DarkChip tone="copper"><Wallet className="w-3.5 h-3.5" {...ICON} />Collect {peso(o.total)}</DarkChip>
            : o.paymentStatus === 'paid' ? <DarkChip tone="green"><CheckCircle2 className="w-3.5 h-3.5" {...ICON} />Paid · nothing to collect</DarkChip> : payChip}
        </>}>
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <StepPanel n={1} title={verified ? 'PIN verified' : 'Verify pickup PIN'} state={verified ? 'done' : 'active'}>
            {verified ? (
              <p className="text-sm text-green-300">{firstName} is verified — check the items together.</p>
            ) : (
              <>
                <p className="text-sm text-white/65">Ask {firstName} for the 4-digit PIN or QR shown in the app.</p>
                <div className="mt-3 flex flex-col min-[400px]:flex-row gap-2">
                  <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 4) verifyPin(); }}
                    placeholder="• • • •" inputMode="numeric" autoComplete="off" aria-label="Pickup PIN"
                    className="h-12 w-full min-[400px]:flex-1 min-w-0 rounded-xl bg-white px-4 text-lg font-semibold tracking-[0.5em] text-[#1d1716] placeholder:text-gray-400 placeholder:tracking-[0.3em] outline-none focus:ring-2 focus:ring-[#d6202a]/60" />
                  <DarkButton className="h-12" onClick={verifyPin} disabled={pin.length !== 4}>Verify</DarkButton>
                </div>
                <DarkButton className="mt-2 w-full" onClick={scanQr}><QrCode className="w-4 h-4" {...ICON} />Scan QR instead</DarkButton>
              </>
            )}
          </StepPanel>
          <StepPanel n={2} state={paid ? 'done' : verified ? 'active' : 'locked'} lockedText="Unlocks after the PIN is verified"
            title={o.paymentStatus === 'pending' ? `Collect ${peso(o.total)}`
              : o.paymentStatus === 'paid' ? (ONLINE_METHODS.includes(o.paymentMethod) ? 'Paid online · nothing to collect' : `Paid · ${peso(o.total)}`)
                : `Payment · ${PAY_STATE[o.paymentStatus].label.toLowerCase()}`}>
            {o.paymentStatus === 'pending' ? (
              <>
                <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
                  {methods.map((m) => (
                    <button key={m.v} type="button" role="radio" aria-checked={collectMethod === m.v} onClick={() => setCollectMethod(m.v)}
                      className={cn('h-11 rounded-xl border px-2 text-sm font-semibold transition-colors',
                        collectMethod === m.v ? 'border-white bg-white text-[#1d1716]' : 'border-white/15 bg-white/5 text-white hover:bg-white/10')}>{m.label}</button>
                  ))}
                </div>
                <RedButton className="mt-3 w-full" onClick={() => collectPayment(collectMethod)}><CreditCard className="w-4 h-4" {...ICON} />Payment received</RedButton>
              </>
            ) : <p className="text-sm text-white/65">{PAYMENT_LABEL[o.paymentMethod]}</p>}
          </StepPanel>
          <StepPanel n={3} title="Hand over the bag" state={verified && paid ? 'active' : 'locked'} lockedText={verified ? 'Unlocks after payment' : 'Unlocks after the PIN is verified'}>
            <p className="text-sm text-white/65">Give {firstName} the {bagText ? bagText.toLowerCase() : 'order'} and check the items together.</p>
            <RedButton className="mt-3 w-full" onClick={markCollected}><CheckCircle2 className="w-4 h-4" {...ICON} />Mark collected</RedButton>
          </StepPanel>
        </div>
        {holdExpired && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-100 flex-1">Hold time passed — no-show policy: {String(getSetting(s, 'noShowPolicy', o.branchId))}</p>
            <DarkButton className="border-red-400/40 text-red-100 hover:bg-red-500/15" onClick={() => setCancelOpen(true)}>Apply no-show policy</DarkButton>
          </div>
        )}
      </BannerLayout>
    );
  } else if (o.status === 'out_for_delivery') {
    // Out for delivery: blue banner with the cold-chain countdown (or rider ETA), call / undo / delivered.
    const riderFirst = rider?.name.split(/\s+/)[0] ?? 'rider';
    const leftAt = o.outForDeliveryAt ? new Date(o.outForDeliveryAt).getTime() : now;
    const chainMins = o.coldChain ? (o.maxDeliveryMins ?? (num(getSetting(s, 'meatMaxDeliveryMins', o.branchId)) || 60)) : 0;
    const dueMs = leftAt + chainMins * 60000;
    const leftSec = Math.round((dueMs - now) / 1000);
    const pos = riderPosition(s, o);
    const frac = chainMins ? Math.max(0, Math.min(1, leftSec / (chainMins * 60))) : Math.max(0, Math.min(1, 1 - pos.progress));
    const undoDispatch = () => {
      mutate((d) => {
        const x = d.orders.find((y) => y.id === o.id);
        if (!x) return;
        x.status = 'ready';
        x.outForDeliveryAt = undefined;
        x.timeline.push({ status: 'edit', at: new Date().toISOString(), by: currentUserName(), note: `Dispatch undone, back to ready (${rider?.name ?? 'rider'})` });
        addAudit(d, { module: 'Orders', action: 'Dispatch undone', detail: o.number, branchId: o.branchId });
      });
      toast.success('Dispatch undone', { description: 'Order is back to ready for hand-over' });
    };
    banner = (
      <>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <BannerTitle>Out for delivery</BannerTitle>
            <p className="mt-2 text-sm sm:text-base text-white/80">
              {rider?.name ?? 'The rider'} left at {fmtTime(new Date(leftAt).toISOString())}
              {o.address ? ` for ${o.address.line}${deliveryKm !== undefined ? ` · ${deliveryKm} km` : ''}` : ''}.
              {o.riderInstructions ? ` ${firstName}’s note: “${o.riderInstructions}”` : ''}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            {chainMins ? (
              <>
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75"><Snowflake className="w-3.5 h-3.5" {...ICON} />{leftSec >= 0 ? 'Cold chain left' : 'Cold chain over by'}</p>
                <p className={cn('text-5xl leading-none tabular-nums', leftSec < 0 && 'text-red-300')} style={OSWALD}>{clock(Math.abs(leftSec))}</p>
                <p className="mt-1.5 text-xs sm:text-sm text-white/80">Deliver by {fmtTime(new Date(dueMs).toISOString())}</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">Arrives in</p>
                <p className="text-5xl leading-none tabular-nums" style={OSWALD}>~{pos.etaMins} min</p>
              </>
            )}
          </div>
        </div>
        <div className="mt-5 h-2 rounded-full bg-white/15 overflow-hidden" aria-hidden>
          <div className={cn('h-full rounded-full transition-[width] duration-1000', leftSec < 0 && chainMins ? 'bg-red-300' : 'bg-[#a9d4f5]')} style={{ width: `${Math.round(frac * 1000) / 10}%` }} />
        </div>
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
            {rider && (
              <a href={`tel:${rider.phone.replace(/\s/g, '')}`} className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white text-[#1d2f5e] text-sm font-semibold hover:bg-white/90">
                <Phone className="w-4 h-4" {...ICON} />Call {riderFirst}
              </a>
            )}
            <DarkButton className="border-white/25 bg-transparent hover:bg-white/10" onClick={undoDispatch}>Undo dispatch</DarkButton>
            <DarkButton className="border-white/25 bg-transparent hover:bg-white/10 col-span-2 sm:col-span-1" onClick={() => setFailOpen(true)}><AlertTriangle className="w-4 h-4" {...ICON} />Delivery failed</DarkButton>
          </div>
          <button type="button" onClick={markDelivered} className="sm:ml-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-white text-[#1d2f5e] text-sm font-semibold hover:bg-white/90">
            <CheckCircle2 className="w-4 h-4" {...ICON} />Mark delivered
          </button>
        </div>
      </>
    );
  } else if (o.status === 'failed_delivery') {
    banner = (
      <BannerLayout title="Delivery failed"
        chips={<><DarkChip tone="red"><AlertTriangle className="w-3.5 h-3.5" {...ICON} />Attempt failed</DarkChip>{payChip}</>}
        aside={<BannerActions>
          <DarkButton onClick={() => failedAction('reattempt')}><Truck className="w-4 h-4" {...ICON} />Re-attempt</DarkButton>
          <DarkButton onClick={() => failedAction('return')}><ArrowLeft className="w-4 h-4" {...ICON} />Return to branch</DarkButton>
          <RedButton onClick={() => setCancelOpen(true)}>Cancel order</RedButton>
        </BannerActions>}>
        <p className="mt-3 text-sm text-white/70">{[...o.timeline].reverse().find((e) => e.status === 'failed_delivery')?.note ?? 'Record what happened, then choose the next step.'}</p>
      </BannerLayout>
    );
  } else if (o.status === 'delivered' || o.status === 'collected') {
    // Done: light green banner. Undo is offered for 15 minutes after completion.
    const doneAt = o.completedAt ? new Date(o.completedAt).getTime() : now;
    const canUndo = now - doneAt < 15 * 60000;
    let sentence = `${firstName} collected it at the counter. Order closed.`;
    if (o.status === 'delivered') {
      const chain = o.coldChain && o.outForDeliveryAt ? (o.maxDeliveryMins ?? (num(getSetting(s, 'meatMaxDeliveryMins', o.branchId)) || 60)) : 0;
      const overMins = chain ? Math.ceil((doneAt - new Date(o.outForDeliveryAt!).getTime()) / 60000) - chain : 0;
      sentence = `${rider?.name ?? 'The rider'} handed it to ${firstName}${chain ? (overMins <= 0 ? ' within the cold-chain window' : ` ${overMins} min after the cold-chain window`) : ''}. Order closed.`;
    }
    const undoComplete = () => {
      mutate((d) => {
        const x = d.orders.find((y) => y.id === o.id);
        if (!x || !x.completedAt) return;
        const at = x.completedAt;
        const back: OrderStatus = x.status === 'delivered' ? 'out_for_delivery' : 'ready';
        // Reverse what completion did: stock movements, cash collected at the door, rider trip.
        d.movements = d.movements.filter((m) => !(m.ref === x.number && m.reason === 'Order completed' && m.at === at));
        const payEv = x.timeline.find((e) => e.status === 'payment' && e.at === at);
        if (payEv) {
          x.paymentStatus = 'pending';
          if (x.paymentMethod === 'cod' && x.riderId) { const r = d.riders.find((y) => y.id === x.riderId); if (r) r.codHeld = Math.max(0, r.codHeld - x.total); }
        }
        if (x.status === 'delivered' && x.riderId) {
          const r = d.riders.find((y) => y.id === x.riderId);
          if (r) { r.tripsToday = Math.max(0, r.tripsToday - 1); r.earningsToday = Math.max(0, r.earningsToday - (60 + Math.round(x.deliveryFee * 0.5))); }
        }
        x.timeline = x.timeline.filter((e) => !(e.at === at && (e.status === x.status || e.status === 'payment')));
        x.status = back;
        x.completedAt = undefined;
        x.timeline.push({ status: 'edit', at: new Date().toISOString(), by: currentUserName(), note: `${STATUS_LABEL[o.status]} undone` });
        addAudit(d, { module: 'Orders', action: `${STATUS_LABEL[o.status]} undone`, detail: o.number, branchId: o.branchId });
      });
      toast.success(`${STATUS_LABEL[o.status]} undone`, { description: o.status === 'delivered' ? 'Order is back to out for delivery' : 'Order is back to ready for pickup' });
    };
    banner = (
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <span className="w-12 h-12 rounded-full bg-[#1f6b3f] text-white flex items-center justify-center shrink-0"><Check className="w-6 h-6" strokeWidth={2.5} /></span>
          <div className="min-w-0">
            <h2 className="text-[26px] sm:text-[32px] leading-none uppercase text-[#1d4d33] break-words" style={OSWALD}>{STATUS_LABEL[o.status]} · {fmtTime(new Date(doneAt).toISOString())}</h2>
            <p className="mt-1.5 text-sm text-[#2f6b47]">{sentence}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
          {canUndo && (
            <button type="button" onClick={undoComplete} className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-[#bfe0cb] bg-white text-sm font-semibold text-[#1d4d33] hover:bg-[#f3faf5]">Undo</button>
          )}
          <Link href="/orders" className={cn('inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#1f6b3f] text-sm font-semibold text-white hover:bg-[#195a35]', !canUndo && 'col-span-2')}>
            Orders <ArrowRight className="w-4 h-4" {...ICON} />
          </Link>
        </div>
      </div>
    );
  } else if (o.status === 'cancelled') {
    banner = (
      <BannerLayout title="Cancelled"
        chips={<>
          {o.rejectReason && <DarkChip tone="red"><XCircle className="w-3.5 h-3.5" {...ICON} />{o.rejectReason}</DarkChip>}
          <DarkChip>Stock released</DarkChip>
          {o.refundedAmount ? <DarkChip>{peso(o.refundedAmount)} refunded</DarkChip> : null}
        </>} />
    );
  }

  // ---------- timeline rows ----------
  type Ev = Order['timeline'][number];
  let currentIdx = -1;
  for (let i = o.timeline.length - 1; i >= 0; i--) if (o.timeline[i].status === o.status) { currentIdx = i; break; }
  const pickerAssignedBy = [...o.timeline].reverse().find((e) => e.status === 'edit' && e.note?.startsWith('Picker: '))?.by;
  /** Per-item weigh / pick-status edits are collapsed into one expandable row. */
  const WEIGH_RE = /: actual [\d.]+ kg/;
  const PICK_RE = /: (to pick|picked|short|out of stock|substitute|removed)$/;
  const isItemEvent = (e: Ev) => e.status === 'edit' && !!e.note && (WEIGH_RE.test(e.note) || PICK_RE.test(e.note));
  const itemEvents = o.timeline.filter(isItemEvent);
  const weighEvents = itemEvents.filter((e) => WEIGH_RE.test(e.note ?? ''));
  const keepCurrent = o.status === 'preparing' || pickupReady || readyDelivery;
  const titleOf = (e: Ev) => {
    const st = e.status;
    if (st === 'placed') return CHANNEL_PLACED[o.channel];
    if (st === 'confirmed') return o.autoConfirmed ? 'Auto-confirmed' : `Confirmed · prep ${o.prepMinutes} min`;
    if (st === 'preparing') return 'Picking started';
    if (dlv && st === 'rider') return 'Rider assigned';
    if (dlv && st === 'out_for_delivery') return `Out for delivery${o.riderBagConfirmed ? ' · bag checked' : ''}`;
    if (st === 'ready') return o.fulfillment === 'pickup' ? `Ready for pickup · ${firstName} notified` : 'Ready for dispatch';
    if (st === 'edit' && e.note?.startsWith('Pack check:')) {
      const n = Number(e.note.match(/(\d+) bag/)?.[1] ?? 0);
      const cold = e.note.includes('insulated');
      if (dlv) return `Packed · ${n} ${cold ? 'insulated ' : ''}bag${n === 1 ? '' : 's'}`;
      return `Packed · ${n} ${cold ? 'insulated ' : ''}bag${n === 1 ? '' : 's'}${cold ? ' with ice packs' : ''}${e.note.includes('labeled') ? ', labeled' : ''}`;
    }
    if (st === 'edit') return e.note ?? 'Order edited';
    return (STATUS_LABEL as Record<string, string>)[st] ?? EVENT_LABEL[st] ?? st;
  };
  const subOf = (e: Ev, i: number) => {
    if (e.status === 'preparing' && o.pickerName) return `${pickerAssignedBy ?? e.by} assigned ${o.pickerName}`;
    if (e.status === 'ready' && o.fulfillment === 'pickup' && i === currentIdx && holdUntil) return `Held until ${holdCapped ? 'closing, ' : ''}${holdText}`;
    if (dlv && e.status === 'edit' && e.note?.startsWith('Pack check:') && weighDiff !== 0) {
      const paidOnline = o.paymentStatus === 'paid' && ONLINE_METHODS.includes(o.paymentMethod);
      return `${e.by} · weights ${weighDiff > 0 ? '+' : '−'}${peso(Math.abs(weighDiff))}${paidOnline ? `, ${weighDiff > 0 ? 'charged to' : 'refunded to'} ${PAY_SHORT[o.paymentMethod]}` : ' vs estimate'}`;
    }
    if (dlv && e.status === 'rider') return e.note?.match(/Rider assigned: (.+?) \(/)?.[1] ?? e.by;
    if (dlv && e.status === 'out_for_delivery') return e.note?.replace(/^Handed to /, '') ?? e.by;
    if (dlv && e.status === 'delivered') return o.customerName;
    if (e.status === 'ready' && dlv) return e.note && !e.note.startsWith('Ready — rider') ? e.note : '';
    if (e.status === 'edit' || e.status === 'confirmed' || e.status === 'preparing') return e.by;
    return [e.by, e.note].filter(Boolean).join(' · ');
  };
  const past: (TimelineRow & { t: number })[] = [];
  let itemRowAdded = false;
  o.timeline.forEach((e, i) => {
    if (i === currentIdx && !terminal && !keepCurrent) return;
    if (isItemEvent(e)) {
      if (itemRowAdded) return;
      itemRowAdded = true;
      const last = itemEvents[itemEvents.length - 1];
      const weighedItems = new Set(weighEvents.map((x) => (x.note ?? '').split(': actual')[0])).size;
      const byPhone = weighEvents.filter((x) => x.note?.includes('approved by phone')).length;
      const who = [...new Set(itemEvents.map((x) => x.by))].join(', ');
      const onlyWeighs = weighEvents.length === itemEvents.length;
      past.push({
        key: 'items', t: new Date(last.at).getTime(), time: when(last.at), kind: 'done',
        title: weighedItems
          ? `Weighed ${weighedItems} item${weighedItems === 1 ? '' : 's'} · ${weighDiff === 0 ? 'as estimated' : `${weighDiff > 0 ? '+' : '−'}${peso(Math.abs(weighDiff))} vs estimate`}`
          : `${itemEvents.length} item update${itemEvents.length === 1 ? '' : 's'}`,
        sub: weighedItems ? `${who} · ${byPhone ? `${byPhone} approved by phone` : `all within ${tolerancePct}% tolerance`}` : who,
        extra: (
          <div className="mt-2">
            <button type="button" onClick={() => setShowWeighs((v) => !v)} aria-expanded={showWeighs}
              className="inline-flex items-center gap-1 h-11 sm:h-8 px-2.5 rounded-lg border border-[#eadfd6] bg-white text-xs font-medium text-[#3d3230] hover:bg-[#faf6f2]">
              {showWeighs ? 'Hide' : `Show ${itemEvents.length} ${onlyWeighs ? (itemEvents.length === 1 ? 'weight' : 'weights') : (itemEvents.length === 1 ? 'update' : 'updates')}`}
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showWeighs && 'rotate-180')} {...ICON} />
            </button>
            {showWeighs && (
              <ul className="mt-2 space-y-1.5 border-l-2 border-[#eadfd6] pl-3">
                {itemEvents.map((x, j) => (
                  <li key={j} className="text-xs text-[#5b4f4b] break-words">
                    <span className="text-gray-400">{when(x.at)} · {x.by}</span><br />{x.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      });
      return;
    }
    past.push({
      key: `e${i}`, t: new Date(e.at).getTime(), title: titleOf(e), sub: subOf(e, i), time: when(e.at),
      kind: e.status === 'cancelled' || e.status === 'failed_delivery' ? 'alert' : e.status === 'refund' ? 'warn' : i === currentIdx && terminal && o.status !== 'cancelled' ? 'end' : 'done',
    });
  });
  if (lateConfirm) {
    const at = new Date(o.placedAt).getTime() + timeoutMins * 60000;
    past.push({ key: 'overdue', t: at, title: `Not confirmed in ${timeoutMins} min — ${alertPhrase}`, sub: 'Automatic', time: when(new Date(at).toISOString()), kind: 'alert' });
  }
  past.sort((a, b) => a.t - b.t);
  const nowSub: Partial<Record<OrderStatus, string>> = {
    placed: 'Waiting on staff', awaiting_confirmation: 'Waiting on staff', confirmed: 'Stock reserved — waiting to start picking',
    preparing: `Picking · ${o.items.length - unresolved} of ${o.items.length} items done`, awaiting_shopper: 'Waiting on the shopper’s reply',
    ready: o.fulfillment === 'pickup' ? 'Waiting for the customer' : rider ? `Waiting for ${rider.name}` : 'Waiting for a rider',
    out_for_delivery: `With ${rider?.name ?? 'the rider'}`, failed_delivery: 'Choose the next step',
  };
  const flow: { st: OrderStatus; title: string }[] = o.fulfillment === 'pickup'
    ? [{ st: 'awaiting_confirmation', title: 'Awaiting confirmation' }, { st: 'preparing', title: 'Preparing' }, { st: 'ready', title: 'Ready for pickup' }, { st: 'collected', title: 'Collected' }]
    : [{ st: 'awaiting_confirmation', title: 'Awaiting confirmation' }, { st: 'preparing', title: 'Preparing' }, { st: 'ready', title: 'Packed & ready' }, { st: 'out_for_delivery', title: 'Out for delivery' }, { st: 'delivered', title: 'Delivered' }];
  const timelineRows: TimelineRow[] = [...past];
  if (!terminal) {
    const cur = currentIdx >= 0 ? o.timeline[currentIdx] : undefined;
    if (o.status === 'preparing') {
      timelineRows.push({ key: 'now', kind: 'now', tone: 'purple', title: `Picking · ${doneCount} of ${o.items.length} done`, sub: o.pickerName ?? 'Cashier picks', time: 'Now' });
    } else if (pickupReady) {
      timelineRows.push({ key: 'now', kind: 'now', tone: 'teal', title: `Waiting for ${firstName}`, sub: `${minsText(waitMins)} since ready`, time: 'Now' });
    } else if (readyDelivery) {
      timelineRows.push(rider
        ? { key: 'now', kind: 'now', title: `Waiting for ${rider.name}`, sub: `Rider assigned · ${minsText(waitMins)} since ready`, time: 'Now' }
        : { key: 'now', kind: 'now', title: 'Waiting for a rider', sub: `${minsText(waitMins)} so far`, time: 'Now' });
    } else {
      timelineRows.push({ key: 'now', kind: 'now', tone: picking ? 'purple' : 'red', title: statusText, sub: [nowSub[o.status], cur?.note].filter(Boolean).join(' · '), time: 'Now' });
    }
    flow.slice((STAGE_IDX[o.status] ?? 0) + 1).forEach((f) => timelineRows.push({
      key: `next-${f.st}`, kind: 'next', title: f.title, time: f.st === 'ready' && picking ? `target ${targetText}` : undefined,
    }));
  }

  return (
    <DashboardLayout title={o.number} crumbs={[{ label: 'Order desk' }, { label: 'Orders', href: '/orders' }, { label: o.number }]}>
      <div className="print:hidden space-y-5 sm:space-y-6 text-[#1d1716]">
        {/* Header */}
        <div>
          <Link href="/orders" className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 text-sm font-medium text-[#5b4f4b] hover:text-[#c8151d]"><ArrowLeft className="w-4 h-4" {...ICON} />Orders</Link>
          <div className="mt-1 sm:mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-5xl sm:text-6xl leading-none uppercase text-[#1d1716] break-words" style={OSWALD}>{o.number}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Tag className={blueStage ? 'bg-[#e6ecf8] text-[#2c4f9e]' : STATUS_PILL[o.status].cls}><span className={cn('w-1.5 h-1.5 rounded-full', blueStage ? 'bg-[#2c4f9e]' : STATUS_PILL[o.status].dot)} />{statusText}</Tag>
                <Tag className="bg-[#f3ece6] text-[#3d3230]">
                  {o.fulfillment === 'delivery' ? <Truck className="w-3.5 h-3.5" {...ICON} /> : <Store className="w-3.5 h-3.5" {...ICON} />}
                  {o.fulfillment === 'delivery' ? `Delivery${dlv && deliveryKm !== undefined ? ` · ${deliveryKm} km` : ''}` : 'Pickup'}
                </Tag>
                {o.coldChain && (
                  <Tag className="bg-sky-50 text-sky-800" title={o.maxDeliveryMins ? `Insulated bag · deliver within ${o.maxDeliveryMins} min of rider pickup` : 'Insulated bag required'}>
                    <Snowflake className="w-3.5 h-3.5" {...ICON} />Cold chain · {o.fulfillment === 'delivery' && o.maxDeliveryMins && !dlv ? `deliver within ${o.maxDeliveryMins} min of pickup${o.insulatedPacked ? ' · packed ✓' : ''}` : o.insulatedPacked ? 'packed' : 'insulated bag'}{o.riderBagConfirmed && !dlv ? ' · rider bag ✓' : ''}
                  </Tag>
                )}
                <Tag className={payTagCls}>
                  {o.paymentStatus === 'paid'
                    ? <><CheckCircle2 className="w-3.5 h-3.5" {...ICON} />Paid · {PAY_SHORT[o.paymentMethod]}</>
                    : <><Wallet className="w-3.5 h-3.5" {...ICON} />{PAY_SHORT[o.paymentMethod]} · {payWord}</>}
                </Tag>
                {o.autoConfirmed && <Tag className="bg-green-50 text-green-700"><Zap className="w-3.5 h-3.5" {...ICON} />Auto-confirmed</Tag>}
              </div>
              <p className="mt-3 text-sm text-[#6b5f5a]">
                {(o.status === 'delivered' || o.status === 'collected') && o.completedAt ? (
                  <>Placed {placedText} · {STATUS_LABEL[o.status]} {fmtTime(o.completedAt)} · {CHANNEL_TEXT[o.channel]}</>
                ) : outDelivery && o.outForDeliveryAt ? (
                  <>Placed {placedText} · Left the shop {fmtTime(o.outForDeliveryAt)} · {CHANNEL_TEXT[o.channel]}</>
                ) : readyDelivery && rider && riderAssignedAt ? (
                  <>Placed {placedText} · Rider assigned {fmtTime(riderAssignedAt)} · {CHANNEL_TEXT[o.channel]}</>
                ) : o.status === 'ready' && readyAt ? (
                  <>Placed {placedText} · Ready since {fmtTime(readyAt)} ({minsText(waitMins)} waiting) · {CHANNEL_TEXT[o.channel]}</>
                ) : (
                  <>
                    Placed {placedText} ({timeAgo(o.placedAt)}) · Slot <b className="font-semibold text-[#1d1716]">{o.slot}</b> ·{' '}
                    {o.pickerName ? <>Picker <b className="font-semibold text-[#1d1716]">{o.pickerName}</b></> : CHANNEL_TEXT[o.channel]}
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#eadfd6] bg-white shadow-sm">
                <button type="button" onClick={() => print(pickupReady ? 'receipt' : dlv ? 'pack' : 'pick')} className="inline-flex items-center gap-2 h-11 pl-4 pr-3 rounded-l-xl text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]">
                  <Printer className="w-4 h-4" {...ICON} />{pickupReady ? 'Print receipt' : dlv ? 'Print label' : 'Print pick list'}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="More print options" className="h-11 w-10 flex items-center justify-center rounded-r-xl border-l border-[#eadfd6] text-[#5b4f4b] hover:bg-[#faf6f2]">
                      <ChevronDown className="w-4 h-4" {...ICON} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => print('pick')}>Pick list (by aisle)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => print('pack')}>Packing slip</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => print('receipt')}>Receipt</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {canEdit && ['paid', 'partially_refunded'].includes(o.paymentStatus) && refundable > 0 && (
                <LightButton className="sm:h-11 rounded-xl" onClick={() => setRefundOpen(true)}><Undo2 className="w-4 h-4" {...ICON} />Refund</LightButton>
              )}
              {canEdit && isOpen && !awaiting && !outDelivery && (
                <LightButton tone="danger" className="sm:h-11 rounded-xl" onClick={() => setCancelOpen(true)}><XCircle className="w-4 h-4" {...ICON} />Cancel order</LightButton>
              )}
            </div>
          </div>
        </div>

        {/* Stage action banner */}
        {canEdit && banner && <Banner tone={o.status === 'out_for_delivery' ? 'blue' : o.status === 'delivered' || o.status === 'collected' ? 'green' : 'dark'}>{banner}</Banner>}

        <div className="grid grid-cols-1 gap-5 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] items-start">
          {/* Items */}
          <Card className="lg:col-start-1 lg:row-start-1 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#eadfd6]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
                <CardTitle>{picking ? 'Pick list' : bagView ? 'In the bag' : 'Items'}</CardTitle>
                <span className="text-sm text-gray-500">
                  {bagView
                    ? (droppedCount
                      ? `${activeItems.length} of ${o.items.length} items · ${[o.items.filter((i) => i.pickStatus === 'out_of_stock').length && `${o.items.filter((i) => i.pickStatus === 'out_of_stock').length} out of stock`, o.items.filter((i) => i.pickStatus === 'removed').length && `${o.items.filter((i) => i.pickStatus === 'removed').length} removed`].filter(Boolean).join(' · ')}`
                      : `${o.items.length} items · ${notWeighed ? 'all picked' : 'all picked and weighed'}`)
                    : picking
                    ? `${o.items.length} items${weighedLines ? (weighedLines === o.items.length ? ' · weigh each one' : ` · weigh ${weighedLines}`) : ''}`
                    : `${activeItems.length} of ${o.items.length} items${weighedLines ? (weighedLines === o.items.length ? ' · sold by weight' : ` · ${weighedLines} sold by weight`) : ''}`}
                </span>
              </div>
              {(pickerEditable || o.pickerName) && (
                <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0 max-w-full">
                  <span className="shrink-0">Picker</span>
                  <div className={cn('relative inline-flex items-center gap-2 h-11 sm:h-10 pl-1.5 pr-3 rounded-full border border-[#eadfd6] bg-white text-sm font-medium text-[#1d1716] min-w-0',
                    pickerEditable && 'hover:bg-[#faf6f2] has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-[#c8151d]/30')}>
                    <span className="w-7 h-7 rounded-full bg-[#ae754d] text-white text-[11px] font-bold flex items-center justify-center shrink-0">{o.pickerName ? initials(o.pickerName) : '—'}</span>
                    <span className="truncate">{o.pickerName ? `${o.pickerName}${pickerRole ? ` · ${pickerRole}` : ''}` : 'Cashier picks'}</span>
                    {pickerEditable && <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" {...ICON} />}
                    {pickerEditable && (
                      <select aria-label="Picker" value={o.pickerName ?? ''} onChange={(e) => assignPicker(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                        <option value="">Cashier picks</option>
                        {pickers.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </div>

            <ul className="divide-y divide-[#f0e7df]">
              {o.items.map((it, idx) => {
                const p = productOf(it.productId);
                const total = lineTotal(it);
                const dim = it.pickStatus === 'removed' || it.pickStatus === 'out_of_stock';
                const pw = pendingWeight?.idx === idx ? pendingWeight : null;
                const pwCheck = pw ? weightCheck(it, pw.kg) : null;
                const stockLeft = p && !dim && (awaiting || picking) ? onHand(s, p.id, o.branchId) : undefined;
                const lowStock = p && stockLeft !== undefined && stockLeft <= p.reorderPoint;
                const stockUnit = p?.soldByWeight || p?.unit === 'kg' ? 'kg' : p?.unit === 'pc' ? 'pcs' : p?.unit;
                const SubIcon = SUB_ICON[it.subPref];
                if (bagView) {
                  const d = dim ? null : weighDiffOf(it);
                  const sub = it.substitute?.status === 'accepted' ? it.substitute : undefined;
                  return (
                    <li key={idx} className="px-4 sm:px-6 py-3.5 flex items-center gap-3 sm:gap-4">
                      <div className="relative shrink-0">
                        <div className={cn('relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-[#f3ece6] border border-[#eadfd6] text-2xl', dim && 'opacity-40 grayscale')}>
                          <ProductImage image={sub?.image ?? it.image} alt={sub?.name ?? it.name} fill />
                        </div>
                        {!dim && (
                          <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-green-600 text-white ring-2 ring-[#fffdfb] flex items-center justify-center" aria-label="Picked">
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className={cn('font-semibold text-[15px] leading-snug text-[#1d1716] break-words', dim && 'line-through text-gray-400')}>{sub?.name ?? it.name}</p>
                          {it.cut && <Tag className="px-2 py-0.5 bg-red-50 text-[#c8151d] font-semibold whitespace-normal"><Scissors className="w-3.5 h-3.5" {...ICON} />{it.cut.name}</Tag>}
                          {dim && <Tag className={cn('px-2 py-0.5', PICK_LABEL[it.pickStatus].cls)}>{PICK_LABEL[it.pickStatus].label}</Tag>}
                        </div>
                        {sub && <p className="text-xs text-gray-500">Substitute for {it.name}</p>}
                        <p className="mt-0.5 text-[13px] text-[#5b4f4b] flex flex-wrap gap-x-2.5 gap-y-0.5">
                          {it.soldByWeight ? (
                            <>
                              <span>{peso(priceOf(it))}/kg</span>
                              {it.actualWeightKg
                                ? <span className="text-green-700">Weighed <b className="font-semibold">{it.actualWeightKg.toFixed(3).replace(/0$/, '')} kg</b></span>
                                : <span className="text-amber-700">Not weighed — estimate charged</span>}
                              <span className="text-gray-400">est. {(it.estWeightKg ?? 1).toFixed(2)} kg</span>
                            </>
                          ) : (
                            <span>{peso(priceOf(it))} × <b className="font-semibold text-[#1d1716]">{it.qty}</b>{it.pickStatus === 'short' ? ' · short-picked' : ''}</span>
                          )}
                        </p>
                        {it.note && <p className="mt-1 text-xs text-amber-800 flex items-center gap-1"><StickyNote className="w-3.5 h-3.5 shrink-0" {...ICON} />{it.note}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('font-bold text-[15px] leading-snug', dim ? 'text-gray-400' : 'text-[#1d1716]')}>{peso(total)}</p>
                        {dim ? null
                          : !it.soldByWeight ? <p className="text-[11px] text-gray-400">qty {it.qty}</p>
                            : d === null ? <p className="text-[11px] text-gray-400">est.</p>
                              : d === 0 ? <p className="text-[11px] text-gray-400">as estimated</p>
                                : <p className={cn('text-[11px] font-medium', d > 0 ? 'text-orange-600' : 'text-green-700')}>{d > 0 ? '+' : '−'}{peso(Math.abs(d))}{dlv ? ' vs est.' : ''}</p>}
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={idx} className="px-4 sm:px-6 py-5">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="relative shrink-0">
                        <div className={cn('relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-[#f3ece6] border border-[#eadfd6] text-3xl', dim && 'opacity-40 grayscale')}>
                          <ProductImage image={it.image} alt={it.name} fill />
                        </div>
                        {(it.pickStatus === 'picked' || it.pickStatus === 'substituted') && (
                          <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-green-600 text-white ring-2 ring-[#fffdfb] flex items-center justify-center" aria-label="Picked">
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className={cn('font-semibold text-[15px] leading-snug text-[#1d1716] break-words min-w-0', dim && 'line-through text-gray-400')}>{it.name}</p>
                          <div className="text-right shrink-0">
                            <p className={cn('font-bold text-[15px] leading-snug', dim ? 'text-gray-400' : 'text-[#1d1716]')}>{peso(total)}</p>
                            {(() => {
                              const d = dim ? null : weighDiffOf(it);
                              if (!it.soldByWeight) return <p className="text-[11px] text-gray-400">qty {it.qty}</p>;
                              if (d === null) return <p className="text-[11px] text-gray-400">est.</p>;
                              if (d === 0) return <p className="text-[11px] text-gray-400">as estimated</p>;
                              return <p className={cn('text-[11px] font-medium', d > 0 ? 'text-orange-600' : 'text-green-700')}>{d > 0 ? '+' : '−'}{peso(Math.abs(d))} vs est.</p>;
                            })()}
                          </div>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Tag className={cn('px-2 py-0.5', PICK_LABEL[it.pickStatus].cls)}>
                            {it.pickStatus === 'pending' && <CircleDashed className="w-3.5 h-3.5" {...ICON} />}
                            {it.pickStatus === 'picked' && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
                            {PICK_LABEL[it.pickStatus].label}
                          </Tag>
                          {it.cut && (
                            <Tag className="px-2 py-0.5 bg-red-50 text-[#c8151d] font-semibold whitespace-normal">
                              <Scissors className="w-3.5 h-3.5" {...ICON} />Cut: {it.cut.name}{cutFeeText(it.cut) ? ` (${cutFeeText(it.cut)})` : ''}
                            </Tag>
                          )}
                          {it.cut && s.cutOptions.find((c) => c.id === it.cut!.id)?.instructions && (
                            <span className="basis-full text-[13px] text-[#5b4f4b]">
                              <span className="font-semibold text-[#1d1716]">Picker note:</span> {s.cutOptions.find((c) => c.id === it.cut!.id)!.instructions}
                            </span>
                          )}
                          {it.storage === 'frozen' && <Tag className="px-2 py-0.5 bg-sky-50 text-sky-700"><Snowflake className="w-3.5 h-3.5" {...ICON} />Frozen</Tag>}
                          {lowStock && (
                            <Tag className="px-2 py-0.5 bg-amber-50 text-amber-800" title={`Reorder point ${p.reorderPoint} ${stockUnit}`}>
                              <Layers className="w-3.5 h-3.5" {...ICON} />{stockLeft > 0 ? `Low stock · ${Number.isInteger(stockLeft) ? stockLeft : stockLeft.toFixed(1)} ${stockUnit} left` : 'No stock on hand'}
                            </Tag>
                          )}
                        </div>

                        <p className="mt-2 text-[13px] text-[#5b4f4b] flex flex-wrap gap-x-2.5 gap-y-0.5">
                          {it.soldByWeight ? (
                            <>
                              <span>{peso(priceOf(it))}/kg · est. <b className="font-semibold text-[#1d1716]">{(it.estWeightKg ?? 1).toFixed(2)} kg</b></span>
                              {it.actualWeightKg
                                ? <span className="text-green-700 font-medium">Weighed {it.actualWeightKg.toFixed(3).replace(/0$/, '')} kg</span>
                                : <span className="text-amber-700">Not weighed yet</span>}
                            </>
                          ) : (
                            <span>{peso(priceOf(it))} × <b className="font-semibold text-[#1d1716]">{it.qty}</b>{p?.size ? ` · ${p.size}` : ''}</span>
                          )}
                          {p && <span className="text-gray-400">{p.sku} · Aisle {p.aisle}</span>}
                        </p>
                        <p className="mt-1 text-[13px] text-[#5b4f4b] flex items-start gap-1.5">
                          <SubIcon className="w-3.5 h-3.5 mt-[3px] shrink-0 text-gray-400" {...ICON} />
                          <span>If unavailable: {SUB_PREF[it.subPref]}</span>
                        </p>
                        {it.note && <p className="text-xs mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 text-amber-800 px-2.5 py-1"><StickyNote className="w-3.5 h-3.5" {...ICON} />{it.note}</p>}
                        {it.substitute && (
                          <div className={cn('mt-2 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm', it.substitute.status === 'accepted' ? 'border-green-200 bg-green-50' : 'border-[#eadfd6] bg-[#faf6f2]')}>
                            <Replace className="w-4 h-4 text-gray-500" {...ICON} />
                            <span className="text-lg"><ProductImage image={it.substitute.image} /></span>
                            <span className="font-medium">{it.substitute.name}</span>
                            <span className="text-gray-500">{peso(it.substitute.unitPrice)}</span>
                            <span className="text-xs font-medium capitalize text-gray-600">· {it.substitute.status}</span>
                          </div>
                        )}

                        {pw && pwCheck && (
                          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-4 text-sm text-amber-900">
                            <p className="font-semibold flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" {...ICON} />Weight is {Math.abs(pwCheck.devPct).toFixed(1)}% {pwCheck.devPct > 0 ? 'over' : 'under'} the estimate (tolerance {tolerancePct}%)</p>
                            <p className="mt-1">
                              Est. {pwCheck.est.toFixed(2)} kg → actual <b>{pw.kg.toFixed(3)} kg</b> · price difference{' '}
                              <b className={pwCheck.diff > 0 ? 'text-[#dc2626]' : 'text-green-700'}>{pwCheck.diff > 0 ? '+' : '−'}{peso(Math.abs(pwCheck.diff))}</b>
                              {' '}(line {peso(lineTotal(it))} → {peso(weighedLine(it, pw.kg))})
                            </p>
                            <p className="text-xs mt-1">Call {o.customerName} at {o.customerMobile} and ask if the new price is OK before applying.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <RedButton className="rounded-lg h-11 sm:h-9 px-3" onClick={() => applyWeight(idx, pw.kg, true)}><PhoneCall className="w-4 h-4" {...ICON} />Shopper approved by phone</RedButton>
                              <LightButton onClick={() => setPendingWeight(null)}>Cancel — re-weigh</LightButton>
                            </div>
                          </div>
                        )}

                        {itemsEditable && picking && it.pickStatus === 'pending' && !it.substitute ? (
                          <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                            {!pw && (
                              <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1 sm:min-w-[260px]">
                                {it.soldByWeight && (
                                  <label className="relative flex-1 min-w-0">
                                    <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" {...ICON} />
                                    <input type="number" step="0.001" min={0} inputMode="decimal" aria-label={`Actual weight of ${it.name} in kg`} value={weights[idx] ?? ''}
                                      onChange={(e) => setWeights((w) => ({ ...w, [idx]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter' && Number(weights[idx]) > 0) setWeight(idx); }} placeholder="0.00"
                                      className="h-11 w-full rounded-xl border border-[#eadfd6] bg-white pl-10 pr-10 text-base font-semibold text-[#1d1716] placeholder:font-normal placeholder:text-gray-400 outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/15" />
                                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">kg</span>
                                  </label>
                                )}
                                <button type="button" onClick={() => (it.soldByWeight ? setWeight(idx) : setPick(idx, 'picked'))} disabled={it.soldByWeight && !(Number(weights[idx]) > 0)}
                                  className={cn('inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:bg-green-700/40 disabled:cursor-not-allowed shrink-0', !it.soldByWeight && 'flex-1 sm:flex-none')}>
                                  <Check className="w-4 h-4" strokeWidth={2.25} />Picked
                                </button>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {!it.soldByWeight && it.qty > 1 && (
                                <LightButton className="sm:h-11 rounded-xl" onClick={() => setShortFor(idx)}>Short</LightButton>
                              )}
                              <LightButton tone="danger" className="sm:h-11 rounded-xl" onClick={() => setPick(idx, 'out_of_stock')}><Ban className="w-4 h-4" {...ICON} />Out of stock</LightButton>
                              <LightButton className="sm:h-11 rounded-xl" onClick={() => setPick(idx, 'removed')}><X className="w-4 h-4" {...ICON} />Remove</LightButton>
                            </div>
                          </div>
                        ) : itemsEditable && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {it.pickStatus !== 'removed' && picking && it.pickStatus !== 'picked' && it.pickStatus !== 'substituted' && it.pickStatus !== 'short' && (
                              <LightButton tone="success" onClick={() => setPick(idx, 'picked')}><Check className="w-4 h-4" {...ICON} />Picked</LightButton>
                            )}
                            {!it.soldByWeight && it.qty > 1 && !dim && !it.substitute && it.pickStatus === 'pending' && (
                              <LightButton onClick={() => setShortFor(idx)}>Short</LightButton>
                            )}
                            {!dim && !it.substitute && it.pickStatus === 'pending' && (
                              <LightButton tone="danger" onClick={() => setPick(idx, 'out_of_stock')}><Ban className="w-4 h-4" {...ICON} />Out of stock</LightButton>
                            )}
                            {!dim && !it.substitute && it.pickStatus === 'pending' && (
                              <LightButton onClick={() => setPick(idx, 'removed')}><X className="w-4 h-4" {...ICON} />Remove</LightButton>
                            )}
                            {(dim || it.pickStatus === 'short') && (
                              <LightButton onClick={() => calledShopper(it.name)}><PhoneCall className="w-4 h-4" {...ICON} />Called shopper</LightButton>
                            )}
                            {it.pickStatus !== 'pending' && it.substitute?.status !== 'accepted' && (
                              <LightButton onClick={() => setPick(idx, 'pending')}><RotateCcw className="w-4 h-4" {...ICON} />Undo</LightButton>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-[#eadfd6] bg-[#faf6f2] px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              {bagView ? (
                <span className="text-[#5b4f4b]">{packEvent ? `Packed by ${packEvent.by} · ${when(packEvent.at)}` : o.pickerName ? `Picked by ${o.pickerName}` : 'Packed'}{dlv && bagText ? ` · ${bagText.charAt(0).toLowerCase()}${bagText.slice(1)}` : ''}</span>
              ) : <span className="text-[#5b4f4b]">{pickedCount} picked · {droppedCount} out of stock / removed{picking ? ` · ${unresolved} to go` : ''}{o.bagCount ? ` · ${o.bagCount} bag(s)` : ''}</span>}
              <span className="font-semibold">{picking || bagView ? 'Items' : 'Subtotal'} {peso(o.subtotal)}</span>
            </div>
          </Card>

          {/* Side cards */}
          <div className="space-y-5 lg:space-y-6 min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
            {riderFirst && riderCard}

            {/* Customer */}
            <Card className="p-5 sm:p-6">
              <CardTitle>{dlv ? 'Deliver to' : 'Customer'}</CardTitle>
              <div className="mt-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-50 border border-red-100 text-[#c8151d] flex items-center justify-center text-lg shrink-0" style={OSWALD}>{initials(o.customerName)}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-[17px] text-[#1d1716] truncate">{o.customerName}</p>
                  <p className="text-[13px] text-gray-500">{orderCount > 1 ? `Returning customer · ${orderCount} orders` : 'New customer · first order'}</p>
                </div>
              </div>
              {customer?.blocked && <Tag className="mt-3 bg-red-50 text-red-700 whitespace-normal">Blocked: {customer.blockReason}</Tag>}
              <div className="mt-4 grid grid-cols-1 min-[400px]:grid-cols-[1.35fr_1fr] gap-2">
                <a href={`tel:${o.customerMobile.replace(/\s+/g, '')}`} className="inline-flex items-center justify-center gap-2 h-12 px-3 rounded-xl bg-[#2a2322] text-white text-sm font-semibold hover:bg-[#1d1716] min-w-0">
                  <Phone className="w-4 h-4 shrink-0" {...ICON} /><span className="truncate">{o.customerMobile}</span>
                </a>
                {pickupReady && canEdit ? (
                  <button type="button" onClick={remindPickup} className="inline-flex items-center justify-center gap-2 h-12 px-3 rounded-xl border border-[#eadfd6] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]">
                    <Bell className="w-4 h-4" {...ICON} />Remind
                  </button>
                ) : customer?.email ? (
                  <a href={`mailto:${customer.email}`} title={customer.email} className="inline-flex items-center justify-center gap-2 h-12 px-3 rounded-xl border border-[#eadfd6] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]">
                    <Mail className="w-4 h-4" {...ICON} />Email
                  </a>
                ) : (
                  <span className="inline-flex items-center justify-center gap-2 h-12 px-3 rounded-xl border border-[#eadfd6] text-sm text-gray-400" aria-disabled="true"><Mail className="w-4 h-4" {...ICON} />No email</span>
                )}
              </div>
              {o.fulfillment === 'delivery' ? (
                <div className="mt-4 rounded-xl bg-[#f3ece6] p-4 text-sm flex gap-3">
                  <MapPin className="w-5 h-5 text-[#d6202a] shrink-0" {...ICON} />
                  {o.address ? (
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1d1716] break-words">{o.address.label} · {o.address.line}</p>
                      {o.address.landmark && <p className="text-[13px] text-[#5b4f4b] mt-1">Landmark: {o.address.landmark}</p>}
                      <p className="text-[13px] text-[#5b4f4b] mt-1">{distanceKm(branch, o.address)} km from the shop{dlv ? ` · about ${rideMins(distanceKm(branch, o.address))} min by motorcycle` : ''}</p>
                      {o.riderInstructions && <p className="text-[13px] text-[#5b4f4b] mt-1.5 italic">“{o.riderInstructions}”</p>}
                    </div>
                  ) : <p className="text-[13px] text-[#5b4f4b]">No delivery address on file.</p>}
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-[#f3ece6] p-4 text-sm flex gap-3">
                  <Store className="w-5 h-5 text-[#ae754d] shrink-0" {...ICON} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1d1716]">Pickup at {branch.name}</p>
                    <p className="text-[13px] text-[#5b4f4b] mt-0.5">{pickupInstr ? `${pickupInstr}. ` : ''}{pickupReady && readyAt ? `${firstName} was notified at ${fmtTime(readyAt)}.` : `Ask for the pickup PIN shown in ${firstName}’s app.`}</p>
                  </div>
                </div>
              )}
              {conversation ? (
                <Link href={`/support?c=${conversation.id}`} className="mt-3 flex items-center justify-between gap-2 min-h-11 rounded-xl border border-[#c8151d]/20 bg-red-50 px-3 py-2 text-sm text-[#c8151d] hover:bg-red-100">
                  <span className="flex items-center gap-2 min-w-0"><MessageSquare className="w-4 h-4 shrink-0" {...ICON} /><span className="truncate">Support chat · {conversation.category}</span></span>
                  {conversation.unreadStaff > 0 && <span className="rounded-full bg-[#dc2626] text-white text-[10px] font-bold px-1.5">{conversation.unreadStaff}</span>}
                </Link>
              ) : !dlv && <p className="mt-3 text-xs text-gray-400">No support conversation for this order.</p>}
            </Card>

            {!riderFirst && riderCard}

            {/* Payment */}
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Payment</CardTitle>
                <span className={cn('rounded-lg border px-2.5 py-1 text-xs font-semibold whitespace-nowrap', PAY_STATE[o.paymentStatus].cls)}>{PAY_STATE[o.paymentStatus].label}</span>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#1d1716]"><Wallet className="w-4 h-4 text-[#5b4f4b] shrink-0" {...ICON} />{dlv && o.paymentStatus === 'paid' ? `${PAY_SHORT[o.paymentMethod]} · nothing to collect at the door`
                : dlv && o.paymentMethod === 'cod' && o.paymentStatus === 'pending' ? `Cash on delivery · rider collects ${peso(o.total)}`
                  : ONLINE_METHODS.includes(o.paymentMethod) ? `${PAY_SHORT[o.paymentMethod]} · ${o.paymentStatus === 'pending' ? 'awaiting payment' : 'paid at checkout'}` : PAY_LINE[o.paymentMethod]}</p>
              {pickupReady ? (
                <dl className="mt-4 pt-4 border-t border-[#eadfd6] space-y-2 text-sm">
                  <PayRow k="Estimated at checkout" v={peso(estAtCheckout)} />
                  {weighDiff !== 0 && <PayRow k="Weight adjustment" v={`${weighDiff > 0 ? '+' : '−'}${peso(Math.abs(weighDiff))}`} cls={weighDiff > 0 ? 'text-orange-700 [&_dt]:text-orange-700' : 'text-green-700 [&_dt]:text-green-700'} />}
                  {otherAdjust !== 0 && <PayRow k={droppedCount ? 'Out of stock / removed' : 'Other adjustments'} v={`${otherAdjust > 0 ? '+' : '−'}${peso(Math.abs(otherAdjust))}`} cls={otherAdjust > 0 ? 'text-orange-700' : 'text-green-700'} />}
                </dl>
              ) : (
              <dl className="mt-4 pt-4 border-t border-[#eadfd6] space-y-2 text-sm">
                <PayRow k={picking && estimated ? 'Items (estimated)' : dlv && weighedLines && !notWeighed ? 'Items (weighed)' : `Items (${activeItems.length} of ${o.items.length} items)`} v={peso(o.subtotal)} />
                {o.fulfillment === 'delivery' && (o.deliveryFee > 0 || o.feeRule) && <PayRow k="Delivery fee" v={o.deliveryFee > 0 ? peso(o.deliveryFee) : 'Free'} sub={o.feeRule} />}
                {o.serviceFee > 0 && <PayRow k="Service fee (gateway)" v={peso(o.serviceFee)} />}
                {o.discount > 0 && <PayRow k={`Discount${o.voucherCode ? ` (${o.voucherCode})` : ''}`} v={`−${peso(o.discount)}`} cls="text-green-700" />}
              </dl>
              )}
              <div className={cn('mt-4 flex items-end justify-between gap-3', pickupReady && 'pt-4 border-t border-[#eadfd6]')}>
                <span className="font-semibold text-[#1d1716] pb-0.5">{o.paymentStatus === 'paid' ? 'Paid' : (pickupReady || (dlv && o.paymentMethod === 'cod')) && o.paymentStatus === 'pending' ? 'To collect' : estimated ? 'Estimated total' : 'Total'}</span>
                <span className="text-3xl sm:text-[34px] leading-none text-[#c8151d] whitespace-nowrap" style={OSWALD}>{peso(o.total)}</span>
              </div>
              {o.refundedAmount > 0 && <dl className="mt-2 text-sm"><PayRow k="Refunded" v={`−${peso(o.refundedAmount)}`} cls="text-orange-700" /></dl>}
              {canEdit && o.paymentStatus === 'pending' && ONLINE_METHODS.includes(o.paymentMethod) && (
                <LightButton className="mt-4 w-full rounded-xl sm:h-10" onClick={() => collectPayment(o.paymentMethod)}>Mark payment link as paid</LightButton>
              )}
              {weighDiff !== 0 && (!terminal || deliveredView) && !pickupReady && (
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-3 text-[13px] text-amber-900">
                  <p className="flex justify-between gap-3 font-semibold"><span>{dlv ? (weighDiff > 0 ? 'Weight top-up' : 'Weight refund') : weighDiff > 0 ? 'Over estimate' : 'Under estimate'}</span><span>{weighDiff > 0 ? '+' : '−'}{peso(Math.abs(weighDiff))}</span></p>
                  <p className="mt-1">
                    {dlv && weighDiff > 0 && o.paymentStatus === 'paid' && ONLINE_METHODS.includes(o.paymentMethod)
                      ? `${peso(estAtCheckout)} at checkout. The heavier weight was charged to ${PAYMENT_LABEL[o.paymentMethod]} when the order was marked ready.`
                      : weighDiff > 0 ? 'Heavier than estimated. ' : 'Lighter than estimated. '}
                    {dlv && weighDiff > 0 && o.paymentStatus === 'paid' && ONLINE_METHODS.includes(o.paymentMethod) ? null : o.paymentStatus === 'paid'
                      ? (ONLINE_METHODS.includes(o.paymentMethod)
                        ? `The difference was ${weighDiff > 0 ? 'charged to' : 'refunded to'} ${PAYMENT_LABEL[o.paymentMethod]} automatically.`
                        : `Settle the difference with ${firstName} at handover.`)
                      : o.paymentMethod === 'cod' ? `The rider collects the final amount (${peso(o.total)}).`
                        : o.paymentMethod === 'pay_at_pickup' ? `Collect the final amount (${peso(o.total)}) at the counter.`
                          : `The final amount is ${peso(o.total)}.`}
                  </p>
                </div>
              )}
              {weighDiff === 0 && !pickupReady && o.paymentStatus === 'pending' && (o.paymentMethod === 'pay_at_pickup' || o.paymentMethod === 'cod') && (
                <p className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-3 text-[13px] text-amber-900">
                  {o.paymentMethod === 'cod' ? 'The rider collects' : 'Collect'} {estimated ? 'about ' : ''}<b>{peso(o.total)}</b> {o.paymentMethod === 'cod' ? 'on delivery' : 'at the counter'}.
                  {estimated ? ' The final amount is set after weighing.' : ''}
                </p>
              )}
              {weighDiff === 0 && o.paymentStatus === 'paid' && ONLINE_METHODS.includes(o.paymentMethod) && estimated && (
                <p className="mt-4 rounded-xl bg-[#faf6f2] border border-[#eadfd6] px-3.5 py-3 text-[13px] text-[#5b4f4b]">
                  Paid online. Weight differences are refunded or charged to {PAYMENT_LABEL[o.paymentMethod]} automatically.
                </p>
              )}
            </Card>

            {/* Internal notes */}
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Internal notes</CardTitle>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Lock className="w-3.5 h-3.5" {...ICON} />Staff only</span>
              </div>
              <div className="mt-3 space-y-2">
                {o.internalNotes.length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
                {o.internalNotes.map((n, i) => (
                  <div key={i} className="rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5">
                    <p className="text-sm text-amber-950 break-words">{n.text}</p>
                    <p className="text-[11px] text-amber-800/70 mt-0.5">{n.by} · {when(n.at)}</p>
                  </div>
                ))}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" rows={3} aria-label="Internal note"
                className="mt-3 w-full rounded-xl border border-[#eadfd6] bg-white px-3.5 py-3 text-sm placeholder:text-gray-400 outline-none resize-y focus:border-[#c8151d]/50 focus:ring-2 focus:ring-[#c8151d]/10" />
              <div className="mt-3 flex flex-wrap gap-2">
                <RedButton className="rounded-lg h-11 sm:h-10 px-4" onClick={addNote} disabled={!note.trim()}>Add note</RedButton>
                {canEdit && <LightButton className="sm:h-10" onClick={() => calledShopper(undefined, 'customer')}><PhoneCall className="w-4 h-4" {...ICON} />Log a call</LightButton>}
              </div>
            </Card>
          </div>

          {/* Timeline */}
          <Card className="p-5 sm:p-6 lg:col-start-1 lg:row-start-2">
            <CardTitle className="mb-4">Timeline</CardTitle>
            <Timeline rows={timelineRows} />
          </Card>
        </div>
      </div>

      {/* Print-only section */}
      {printMode && <PrintView o={o} mode={printMode} s={s} />}

      <RejectDialog order={rejecting ? o : null} reasons={s.rejectReasons} onClose={() => setRejecting(false)} />
      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} o={o} reasons={s.rejectReasons} noShow={o.status === 'ready' && o.fulfillment === 'pickup' && holdExpired ? String(getSetting(s, 'noShowPolicy', o.branchId)) : undefined} />
      <RefundDialog open={refundOpen} onClose={() => setRefundOpen(false)} o={o} refundable={refundable} threshold={num(getSetting(s, 'refundApprovalAbove', o.branchId))} canApprove={can(s, 'orders.approve')} />
      <ChooseRiderDrawer open={riderOpen} onClose={() => setRiderOpen(false)} o={o} s={s}
        onAssign={(riderId, name) => { assignRiderNow(s, o, riderId, name); setRiderOpen(false); }} />
      <FailDialog open={failOpen} onClose={() => setFailOpen(false)} o={o} />
      <ShortDialog idx={shortFor} o={o} onClose={() => setShortFor(null)} />
    </DashboardLayout>
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
      <DialogContent className="w-[calc(100%-1.5rem)] p-4 sm:p-6">
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
      <DialogContent className="w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Refund {o.number}</DialogTitle>
          <DialogDescription>Refundable balance {peso(refundable)} · paid by {PAYMENT_LABEL[o.paymentMethod]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['full', 'partial'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn('rounded-lg border px-3 py-2 text-sm font-medium', mode === m ? 'border-[#c8151d] bg-red-50 text-[#c8151d]' : 'border-gray-200 text-gray-600')}>{m === 'full' ? `Full (${peso(refundable)})` : 'Partial'}</button>
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
      <DialogContent className="w-[calc(100%-1.5rem)] p-4 sm:p-6">
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
      <DialogContent className="w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader><DialogTitle>Short pick · {it?.name}</DialogTitle><DialogDescription>Ordered {it?.qty}. How many are available?</DialogDescription></DialogHeader>
        <input type="number" min={1} max={(it?.qty ?? 2) - 1} value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className={cn(inputClass, 'w-full')} autoFocus />
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit}>Update quantity</Button></DialogFooter>
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
  const cold = (i: OrderItem) => i.storage === 'fresh' || i.storage === 'frozen';
  const weightText = (i: OrderItem) => {
    if (!i.soldByWeight) return String(i.qty);
    const est = `Est. ${(i.estWeightKg ?? 1).toFixed(2)} kg`;
    if (i.actualWeightKg) return `${est} · Actual ${i.actualWeightKg.toFixed(3)} kg`;
    return mode === 'receipt' ? `${(i.estWeightKg ?? 1).toFixed(3)} kg` : `${est} · Actual ______ kg`;
  };
  return (
    <div className="hidden print:block text-black text-[12px] font-sans">
      <div className="flex justify-between border-b-2 border-black pb-2 mb-3">
        <div><p className="text-lg font-bold">Jovanne’s Meat Shop · {branch.name}</p><p>{branch.address} · {branch.phone}</p></div>
        <div className="text-right"><p className="text-lg font-bold">{title}</p><p>{o.number}</p><p>{new Date().toLocaleString('en-PH')}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div><p><b>Customer:</b> {o.customerName}</p><p><b>Mobile:</b> {o.customerMobile}</p>{o.fulfillment === 'delivery' && o.address && <p><b>Deliver to:</b> {o.address.line}{o.address.landmark ? ` (${o.address.landmark})` : ''}</p>}</div>
        <div className="text-right"><p><b>{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</b> · {o.slot}</p><p><b>Channel:</b> {CHANNEL_LABEL[o.channel]}</p><p><b>Payment:</b> {PAYMENT_LABEL[o.paymentMethod]} ({o.paymentStatus.replace('_', ' ')})</p>{mode !== 'receipt' && o.bagCount ? <p><b>Bags:</b> {o.bagCount}</p> : null}</div>
      </div>
      {mode !== 'receipt' && o.coldChain && (
        <p className="mb-2 border-2 border-black px-2 py-1 font-bold">❄ COLD CHAIN — pack in insulated bag with ice packs{o.maxDeliveryMins ? ` · deliver within ${o.maxDeliveryMins} min of rider pickup` : ''}</p>
      )}
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-black text-left">
          {mode === 'pick' && <th className="py-1 w-8">✓</th>}
          {mode === 'pick' && <th className="py-1">Aisle</th>}
          <th className="py-1">Item</th><th className="py-1 text-right">Qty / Wt</th>
          {mode === 'pick' && <th className="py-1">Note / If unavailable</th>}
          {mode === 'pack' && <th className="py-1">Cold</th>}
          {mode === 'receipt' && <th className="py-1 text-right">Price</th>}
          {mode === 'receipt' && <th className="py-1 text-right">Amount</th>}
        </tr></thead>
        <tbody>
          {items.map((i, k) => {
            const name = i.substitute?.status === 'accepted' ? `${i.substitute.name} (sub. for ${i.name})` : i.name;
            const qty = mode === 'receipt' && i.soldByWeight ? `${(i.actualWeightKg ?? i.estWeightKg ?? 1).toFixed(3)} kg` : weightText(i);
            const cut = cutLabel(i.cut);
            const howTo = i.cut ? s.cutOptions.find((c) => c.id === i.cut!.id)?.instructions : undefined;
            return (
              <tr key={k} className="border-b border-gray-300 align-top">
                {mode === 'pick' && <td className="py-1">☐</td>}
                {mode === 'pick' && <td className="py-1">{aisle(i)}</td>}
                <td className="py-1">
                  {name}
                  {cut && mode !== 'receipt' && <p className="text-[14px] font-bold uppercase">✂ {cut}</p>}
                  {howTo && mode === 'pick' && <p className="text-[12px]">{howTo}</p>}
                  {cut && mode === 'receipt' && <p className="text-[11px]">{cut}</p>}
                </td>
                <td className="py-1 text-right whitespace-nowrap">{qty}</td>
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
