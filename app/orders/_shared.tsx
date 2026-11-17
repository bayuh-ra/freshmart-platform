'use client';

// Shared pieces for the Order Desk pages (board, detail, new order).
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { inputClass } from '@/src/components/common';
import { addAudit, currentUserName, mutate } from '@/src/lib/store';
import { cutFeeText, peso, rejectOrder } from '@/src/lib/logic';
import type { CutFeeType, Order, OrderChannel } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

/** ❄️ badge for orders with fresh or frozen items (insulated bag + maximum delivery time apply). */
export function ColdChainBadge({ order, className }: { order: Pick<Order, 'coldChain' | 'maxDeliveryMins'>; className?: string }) {
  if (!order.coldChain) return null;
  return (
    <span title={order.maxDeliveryMins ? `Insulated bag · deliver within ${order.maxDeliveryMins} min of pickup` : 'Insulated bag required'}
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap bg-sky-50 text-sky-700 border border-sky-200', className)}>
      ❄️ Cold chain
    </span>
  );
}

/** Line description for the butcher: cut / preparation, weights. Used on screen and on printed slips. */
export function cutLabel(cut?: { name: string; fee: number; feeType?: CutFeeType }) {
  if (!cut) return undefined;
  const fee = cutFeeText(cut);
  return `Cut: ${cut.name}${fee ? ` (${fee})` : ''}`;
}

export const CHANNEL_PILL: Record<OrderChannel, string> = {
  app: 'bg-red-50 text-[#c8151d]',
  walk_in: 'bg-emerald-50 text-emerald-700',
  phone: 'bg-amber-50 text-amber-700',
};

export function RejectDialog({ order, reasons, onClose }: { order: Order | null; reasons: string[]; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const final = reason === '__other' ? other.trim() : reason;
  const submit = () => {
    if (!order || !final) return;
    rejectOrder(order.id, final, currentUserName());
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Order rejected', detail: `${order.number} — ${final}`, branchId: order.branchId }));
    toast.success(`${order.number} rejected`, { description: order.paymentStatus === 'paid' ? `Shopper notified · automatic refund ${peso(order.total)}` : 'Shopper notified' });
    setReason('');
    setOther('');
    onClose();
  };
  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Reject order {order?.number}</DialogTitle>
          <DialogDescription>The shopper is notified with this reason.{order?.paymentStatus === 'paid' ? ` The ${peso(order.total)} payment is refunded automatically.` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {reasons.map((r) => (
            <label key={r} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer', reason === r ? 'border-[#c8151d] bg-red-50' : 'border-gray-200 hover:bg-gray-50')}>
              <input type="radio" name="reject" checked={reason === r} onChange={() => setReason(r)} className="accent-[#c8151d]" />{r}
            </label>
          ))}
          <label className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer', reason === '__other' ? 'border-[#c8151d] bg-red-50' : 'border-gray-200 hover:bg-gray-50')}>
            <input type="radio" name="reject" checked={reason === '__other'} onChange={() => setReason('__other')} className="accent-[#c8151d]" />Other
          </label>
          {reason === '__other' && <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Describe the reason" className={cn(inputClass, 'w-full')} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!final} onClick={submit}>Reject order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
