'use client';

// One-click support actions (refund, voucher, re-deliver, cancel) used by the Support Inbox.

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { mutate, addAudit, addNotification, currentUserName } from '@/src/lib/store';
import { applyStatus, can, getSetting, num, peso, pesoShort, placeOrder, recalc, PAYMENT_LABEL, OPEN_STATUSES } from '@/src/lib/logic';
import type { AppState, Conversation, Order } from '@/src/lib/types';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { inputClass, selectClass } from '@/src/components/common';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';

export type ConversationX = Conversation & { tags?: string[]; csat?: number; escalated?: boolean };

/** Push a message into a conversation inside a mutate() recipe. */
export function pushMessage(d: AppState, convId: string, m: { from: 'system' | 'agent'; text: string; internal?: boolean; name?: string }, notifyShopper = false) {
  const cv = d.conversations.find((c) => c.id === convId);
  if (!cv) return;
  const now = new Date().toISOString();
  cv.messages.push({ from: m.from, name: m.name ?? (m.from === 'system' ? 'System' : currentUserName(d)), text: m.text, at: now, internal: m.internal });
  cv.updatedAt = now;
  if (!m.internal) {
    cv.unreadShopper += 1;
    if (notifyShopper) addNotification(d, { audience: 'shopper', targetId: cv.customerId, title: 'Support replied', body: m.text.slice(0, 120), orderId: cv.orderId });
  }
}

const lbl = 'text-xs font-medium text-gray-600';

// ---------------------------------------------------------------- Refund
export function RefundDialog({ s, conv, order, open, onOpenChange }: { s: AppState; conv: Conversation; order?: Order; open: boolean; onOpenChange: (v: boolean) => void }) {
  const refundable = order ? Math.max(0, order.total - (order.refundedAmount ?? 0)) : 2000;
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState<'credit' | 'original'>('credit');
  const [reason, setReason] = useState(conv.category === 'Other' ? 'Goodwill' : conv.category);
  const amt = Number(amount);
  const threshold = num(getSetting(s, 'refundApprovalAbove', order?.branchId ?? conv.branchId));
  const needsApproval = amt > threshold;
  const isApprover = can(s, 'orders.approve');
  const originalAllowed = !!order && order.paymentStatus !== 'pending' && order.paymentMethod !== 'cod' && order.paymentMethod !== 'pay_at_pickup';

  const submit = () => {
    if (!amt || amt <= 0) { toast.error('Enter a refund amount'); return; }
    if (amt > refundable) { toast.error(`Maximum refundable is ${peso(refundable)}`); return; }
    const destLabel = dest === 'credit' ? 'store credit' : order ? PAYMENT_LABEL[order.paymentMethod] : 'original method';
    if (needsApproval && !isApprover) {
      mutate((d) => {
        pushMessage(d, conv.id, { from: 'system', text: `Refund ${peso(amt)} to ${destLabel} requested by ${currentUserName(d)} — awaiting manager approval (above ${pesoShort(threshold)}).`, internal: true });
        addAudit(d, { module: 'Payments', action: 'Refund approval requested', detail: `${order?.number ?? conv.customerName} ${peso(amt)} → ${destLabel} (${reason})`, branchId: order?.branchId ?? conv.branchId });
        addNotification(d, { audience: 'staff', targetId: order?.branchId ?? conv.branchId, title: 'Refund needs approval', body: `${peso(amt)} for ${conv.customerName} (${reason})`, orderId: order?.id });
      });
      toast.warning('Sent for manager approval', { description: `Refunds above ${pesoShort(threshold)} need a manager.` });
      onOpenChange(false);
      setAmount('');
      return;
    }
    mutate((d) => {
      const now = new Date().toISOString();
      const by = currentUserName(d);
      const o = order ? d.orders.find((x) => x.id === order.id) : undefined;
      if (o) {
        const old = o.paymentStatus;
        o.refundedAmount = Math.round(((o.refundedAmount ?? 0) + amt) * 100) / 100;
        o.paymentStatus = o.refundedAmount >= o.total ? 'refunded' : 'partially_refunded';
        o.updatedAt = now;
        o.timeline.push({ status: 'refund', at: now, by, note: `${peso(amt)} to ${destLabel} — ${reason} (support chat)` });
        addAudit(d, { module: 'Payments', action: 'Refund issued', detail: `${o.number} ${peso(amt)} → ${destLabel} (${reason})`, branchId: o.branchId, oldValue: old, newValue: o.paymentStatus });
      }
      if (dest === 'credit') {
        const cu = d.customers.find((x) => x.id === conv.customerId);
        if (cu) {
          const old = cu.storeCredit;
          cu.storeCredit = Math.round((cu.storeCredit + amt) * 100) / 100;
          addAudit(d, { module: 'Payments', action: 'Store credit issued', detail: `${cu.name} ${peso(amt)} (${reason})`, oldValue: peso(old), newValue: peso(cu.storeCredit) });
        }
      }
      pushMessage(d, conv.id, { from: 'system', text: `Refund ${peso(amt)} issued to ${destLabel}${o ? ` for order ${o.number}` : ''}.` });
      addNotification(d, { audience: 'shopper', targetId: conv.customerId, title: 'Refund issued', body: `${peso(amt)} was refunded to your ${destLabel}.`, orderId: o?.id });
    });
    toast.success(`Refund ${peso(amt)} issued`, { description: `To ${destLabel}` });
    onOpenChange(false);
    setAmount('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue refund</DialogTitle>
          <DialogDescription>{order ? `${order.number} · paid ${peso(order.total)} via ${PAYMENT_LABEL[order.paymentMethod]} · refundable ${peso(refundable)}` : 'No order attached — goodwill refund to store credit.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {order && (
            <div className="flex flex-wrap gap-1.5">
              {order.items.slice(0, 6).map((i) => (
                <button key={i.productId} onClick={() => setAmount(String(Math.round(i.unitPrice * (i.soldByWeight ? (i.actualWeightKg ?? i.estWeightKg ?? 1) : i.qty) * 100) / 100))} className="text-xs rounded-full border border-gray-200 px-2.5 py-1 hover:bg-gray-50">
                  <ProductImage image={i.image} /> {i.name}
                </button>
              ))}
              {order.deliveryFee > 0 && <button onClick={() => setAmount(String(order.deliveryFee))} className="text-xs rounded-full border border-gray-200 px-2.5 py-1 hover:bg-gray-50">🚚 Delivery fee</button>}
            </div>
          )}
          <label className="block"><span className={lbl}>Amount (₱)</span>
            <input type="number" min={0} className={cn(inputClass, 'w-full mt-1')} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <div><span className={lbl}>Refund to</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button onClick={() => setDest('credit')} className={cn('rounded-lg border px-3 py-2 text-sm text-left', dest === 'credit' ? 'border-[#c8151d] bg-red-50 text-[#c8151d]' : 'border-gray-200')}>Store credit<span className="block text-xs text-gray-500">instant, usable at checkout</span></button>
              <button disabled={!originalAllowed} onClick={() => setDest('original')} className={cn('rounded-lg border px-3 py-2 text-sm text-left disabled:opacity-40', dest === 'original' ? 'border-[#c8151d] bg-red-50 text-[#c8151d]' : 'border-gray-200')}>Original payment<span className="block text-xs text-gray-500">{order ? PAYMENT_LABEL[order.paymentMethod] : '—'} · 3–7 days</span></button>
            </div>
          </div>
          <label className="block"><span className={lbl}>Reason</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Missing item', 'Damaged item', 'Late delivery', 'Payment issue', 'Rider behavior', 'Wrong item', 'Quality issue', 'Goodwill'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          {needsApproval && (
            <div className={cn('flex gap-2 rounded-lg p-3 text-sm', isApprover ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700')}>
              {isApprover ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{isApprover ? `Above the ${pesoShort(threshold)} approval limit — you are approving this as a manager.` : `Above the ${pesoShort(threshold)} approval limit — this will be sent to a manager for approval.`}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{needsApproval && !isApprover ? 'Request approval' : `Refund ${amt > 0 ? peso(amt) : ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Voucher
export function VoucherSendDialog({ s, conv, open, onOpenChange }: { s: AppState; conv: Conversation; open: boolean; onOpenChange: (v: boolean) => void }) {
  const live = s.vouchers.filter((v) => v.active && new Date(v.end) > new Date() && v.used < v.maxUses);
  const [code, setCode] = useState(live[0]?.code ?? '');
  const v = live.find((x) => x.code === code);
  const submit = () => {
    if (!v) { toast.error('Choose a voucher'); return; }
    mutate((d) => {
      pushMessage(d, conv.id, { from: 'agent', text: `Sorry for the trouble! Here is a voucher for your next order: ${v.code} — ${v.description}. Valid until ${new Date(v.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` }, true);
      addAudit(d, { module: 'Promotions', action: 'Voucher sent from support', detail: `${v.code} → ${conv.customerName}` });
    });
    toast.success(`${v.code} sent to ${conv.customerName}`);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send voucher</DialogTitle><DialogDescription>The code is posted in the chat and pushed to the shopper.</DialogDescription></DialogHeader>
        {live.length === 0 ? <p className="text-sm text-gray-500">No live vouchers. Create one in Promotions.</p> : (
          <div className="space-y-2">
            {live.map((x) => (
              <button key={x.id} onClick={() => setCode(x.code)} className={cn('w-full rounded-lg border px-3 py-2 text-left', code === x.code ? 'border-[#c8151d] bg-red-50' : 'border-gray-200 hover:bg-gray-50')}>
                <span className="font-mono font-semibold text-[#c8151d]">{x.code}</span>
                <span className="block text-xs text-gray-500">{x.description} · min {pesoShort(x.minBasket)}</span>
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!v}>Send voucher</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Re-deliver
export function RedeliverDialog({ conv, order, open, onOpenChange }: { conv: Conversation; order: Order; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>(order.items[0] ? [order.items[0].productId] : []);
  const submit = () => {
    if (!picked.length) { toast.error('Select at least one item'); return; }
    const lines = order.items.filter((i) => picked.includes(i.productId)).map((i) => ({ productId: i.productId, qty: i.qty, subPref: i.subPref, priceOverride: 0, note: `Re-delivery for ${order.number}` }));
    const newId = placeOrder({
      branchId: order.branchId, customerId: order.customerId, channel: 'phone', fulfillment: order.address ? 'delivery' : 'pickup', address: order.address,
      slot: 'ASAP', lines, paymentMethod: 'cash', riderInstructions: `Re-delivery for ${order.number} (support case)`, by: 'Support',
    });
    mutate((d) => {
      const o = d.orders.find((x) => x.id === newId);
      if (o) {
        o.deliveryFee = 0; o.serviceFee = 0; o.discount = 0; o.feeRule = 'Waived — support re-delivery';
        recalc(o);
        o.internalNotes.push({ at: new Date().toISOString(), by: currentUserName(d), text: `Free re-delivery for ${order.number} — support case ${conv.id}` });
      }
      pushMessage(d, conv.id, { from: 'system', text: `Re-delivery order ${o?.number ?? ''} created (${lines.length} item${lines.length > 1 ? 's' : ''}, free of charge).` }, true);
      addAudit(d, { module: 'Support', action: 'Re-delivery created', detail: `${o?.number} for ${order.number} · ${lines.length} items`, branchId: order.branchId });
    });
    toast.success('Re-delivery order created', { description: 'It is now in the branch Live Orders queue.' });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Re-deliver items</DialogTitle><DialogDescription>Creates a free order at the same branch for the selected items of {order.number}.</DialogDescription></DialogHeader>
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {order.items.map((i) => (
            <li key={i.productId}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50 text-sm">
                <input type="checkbox" className="accent-[#c8151d]" checked={picked.includes(i.productId)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.productId] : p.filter((x) => x !== i.productId)))} />
                <span><ProductImage image={i.image} /></span><span className="flex-1">{i.name}</span><span className="text-gray-400">× {i.qty}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Create re-delivery</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Cancel
export function CancelOrderDialog({ conv, order, open, onOpenChange }: { conv: Conversation; order: Order; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reason, setReason] = useState('Customer requested cancellation');
  const isOpen = OPEN_STATUSES.includes(order.status);
  const submit = () => {
    mutate((d) => {
      const o = d.orders.find((x) => x.id === order.id);
      if (o) o.rejectReason = reason;
      applyStatus(d, order.id, 'cancelled', { note: `${reason} (via support)` });
      pushMessage(d, conv.id, { from: 'system', text: `Order ${order.number} was cancelled: ${reason}.${order.paymentStatus === 'paid' ? ` ${peso(order.total)} refunded automatically.` : ''}` });
      addAudit(d, { module: 'Support', action: 'Order cancelled from chat', detail: `${order.number} — ${reason}`, branchId: order.branchId });
    });
    toast.success(`${order.number} cancelled`);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancel order {order.number}</DialogTitle><DialogDescription>{isOpen ? 'Paid online orders are refunded automatically to the original payment method.' : 'This order is already completed or cancelled and cannot be cancelled.'}</DialogDescription></DialogHeader>
        {isOpen && (
          <label className="block"><span className={lbl}>Reason</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Customer requested cancellation', 'Item out of stock', 'Delivery not possible', 'Duplicate order', 'Payment issue'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep order</Button>
          <Button variant="destructive" onClick={submit} disabled={!isOpen}>Cancel order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

