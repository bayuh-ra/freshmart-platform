'use client';

import { Bike, Star, Truck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { Order } from '@/src/lib/types';
import { addAudit, currentUserName, mutate, useStore } from '@/src/lib/store';
import { assignRider, branchName } from '@/src/lib/logic';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Button } from '@/src/components/ui/shadcn/button';
import { Pill } from '@/src/components/common';
import { RIDER_TYPE_LABEL, VEHICLE_LABEL, rankCandidates } from './helpers';

/** Assign or re-assign a rider to an order. Candidates are ranked by the admin's dispatch rule. */
export function AssignRiderDialog({ order, open, onOpenChange }: { order?: Order; open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useStore();
  const live = order ? s.orders.find((o) => o.id === order.id) : undefined;
  if (!live) return null;
  const { list, rule } = rankCandidates(s, live);
  const current = s.riders.find((r) => r.id === live.riderId);

  const pick = (riderId: string) => {
    const r = s.riders.find((x) => x.id === riderId)!;
    const by = currentUserName();
    assignRider(live.id, riderId, by);
    mutate((d) => {
      addAudit(d, {
        module: 'Riders', action: current ? 'Rider re-assigned' : 'Rider assigned', branchId: live.branchId,
        detail: `${live.number} → ${r.name} (${RIDER_TYPE_LABEL[r.type]})`, oldValue: current?.name, newValue: r.name,
      });
      if (current) {
        const o = d.orders.find((x) => x.id === live.id);
        o?.timeline.push({ status: 'note', at: new Date().toISOString(), by, note: `Re-assigned from ${current.name}; shopper notified of new ETA` });
      }
    });
    toast.success(`${live.number} assigned to ${r.name}`, { description: r.type === 'courier' ? 'Job sent to courier partner via API' : 'Job offer sent to the rider app' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{current ? 'Re-assign rider' : 'Assign rider'} · {live.number}</DialogTitle>
          <DialogDescription>
            {branchName(s, live.branchId)} → {live.address?.line ?? 'Pickup'} · Sorted by dispatch rule: <b className="text-gray-700">{rule}</b>
          </DialogDescription>
        </DialogHeader>
        {current && <p className="text-xs text-gray-500 -mt-2">Currently assigned: <b>{current.name}</b></p>}
        <div className="space-y-2">
          {list.length === 0 && <p className="text-sm text-gray-500 py-6 text-center">No available riders for this branch. Escalate to a courier partner or wait for a rider to come online.</p>}
          {list.map((c, i) => (
            <div key={c.rider.id} className={`flex items-center gap-3 rounded-lg border p-3 ${i === 0 ? 'border-[#1e40af]/40 bg-blue-50/40' : 'border-gray-100'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${c.rider.type === 'courier' ? 'bg-amber-100 text-amber-700' : 'bg-[#1e40af]/10 text-[#1e40af]'}`}>
                {c.rider.type === 'courier' ? <Truck className="w-4 h-4" strokeWidth={1.75} /> : <Bike className="w-4 h-4" strokeWidth={1.75} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  {c.rider.name}
                  {i === 0 && <Pill className="bg-[#1e40af] text-white"><Zap className="w-3 h-3" /> Best match</Pill>}
                  {c.rider.type === 'courier' && <Pill className="bg-amber-100 text-amber-800">Fallback</Pill>}
                </p>
                <p className="text-xs text-gray-500">
                  {RIDER_TYPE_LABEL[c.rider.type]} · {VEHICLE_LABEL[c.rider.vehicle]} · {c.rider.type === 'courier' ? 'ETA from partner API' : `${c.km} km from branch`} · {c.load} active job{c.load === 1 ? '' : 's'} ·{' '}
                  <Star className="w-3 h-3 inline -mt-0.5 text-amber-500 fill-amber-500" /> {c.rider.rating.toFixed(1)}
                </p>
              </div>
              <Button size="sm" variant={i === 0 ? 'default' : 'outline'} onClick={() => pick(c.rider.id)}>Assign</Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
