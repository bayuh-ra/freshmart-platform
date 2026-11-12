'use client';

// Shared pieces for the Order Desk pages (board, detail, new order).
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { inputClass } from '@/src/components/common';
import { addAudit, currentUserName, mutate } from '@/src/lib/store';
import { peso, rejectOrder } from '@/src/lib/logic';
import type { Order, OrderChannel } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export const CHANNEL_PILL: Record<OrderChannel, string> = {
  app: 'bg-blue-50 text-[#1e40af]',
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject order {order?.number}</DialogTitle>
          <DialogDescription>The shopper is notified with this reason.{order?.paymentStatus === 'paid' ? ` The ${peso(order.total)} payment is refunded automatically.` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {reasons.map((r) => (
            <label key={r} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer', reason === r ? 'border-[#1e40af] bg-blue-50' : 'border-gray-200 hover:bg-gray-50')}>
              <input type="radio" name="reject" checked={reason === r} onChange={() => setReason(r)} className="accent-[#1e40af]" />{r}
            </label>
          ))}
          <label className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer', reason === '__other' ? 'border-[#1e40af] bg-blue-50' : 'border-gray-200 hover:bg-gray-50')}>
            <input type="radio" name="reject" checked={reason === '__other'} onChange={() => setReason('__other')} className="accent-[#1e40af]" />Other
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
