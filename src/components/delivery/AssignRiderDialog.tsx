'use client';

import { Bike, Snowflake, Star, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { Order } from '@/src/lib/types';
import { addAudit, currentUserName, mutate, useStore } from '@/src/lib/store';
import { assignRider, branchName, getSetting, num } from '@/src/lib/logic';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Button } from '@/src/components/ui/shadcn/button';
import { Pill } from '@/src/components/common';
import { VEHICLE_LABEL, rankCandidates } from './helpers';

/** Assign or re-assign one of the shop's own riders. Candidates are ranked by the admin's dispatch rule. */
export function AssignRiderDialog({ order, open, onOpenChange }: { order?: Order; open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useStore();
  const live = order ? s.orders.find((o) => o.id === order.id) : undefined;
  if (!live) return null;
  const { list, rule } = rankCandidates(s, live);
  const current = s.riders.find((r) => r.id === live.riderId);
  const maxMins = live.maxDeliveryMins ?? (num(getSetting(s, 'meatMaxDeliveryMins', live.branchId)) || 60);

  const pick = (riderId: string) => {
    const r = s.riders.find((x) => x.id === riderId)!;
    const by = currentUserName();
    assignRider(live.id, riderId, by);
    mutate((d) => {
      addAudit(d, {
        module: 'Riders', action: current ? 'Rider re-assigned' : 'Rider assigned', branchId: live.branchId,
        detail: `${live.number} → ${r.name}`, oldValue: current?.name, newValue: r.name,
      });
      if (current) {
        const o = d.orders.find((x) => x.id === live.id);
        o?.timeline.push({ status: 'note', at: new Date().toISOString(), by, note: `Re-assigned from ${current.name}; shopper notified of new ETA` });
      }
    });
    toast.success(`${live.number} assigned to ${r.name}`, { description: 'Job offer sent to the Rider App' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{current ? 'Re-assign rider' : 'Assign rider'} · {live.number}</DialogTitle>
          <DialogDescription>
            {branchName(s, live.branchId)} → {live.address?.line ?? 'Pickup'} · Own riders, sorted by dispatch rule: <b className="text-gray-700">{rule}</b>
          </DialogDescription>
        </DialogHeader>
        {live.coldChain && (
          <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <Snowflake className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
            <span>❄️ Cold-chain order — deliver within <b>{maxMins} min</b> of pickup. The rider must confirm the insulated bag at pickup.</span>
          </p>
        )}
        {current && <p className="text-xs text-gray-500 -mt-2">Currently assigned: <b>{current.name}</b></p>}
        <div className="space-y-2">
          {list.length === 0 && <p className="text-sm text-gray-500 py-6 text-center">No own rider is available for this branch right now. Wait for a rider to come online or finish a job.</p>}
          {list.map((c, i) => (
            <div key={c.rider.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 rounded-lg border p-3 ${i === 0 ? 'border-[#c8151d]/40 bg-red-50/40' : 'border-gray-100'}`}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[#c8151d]/10 text-[#c8151d]">
                <Bike className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 flex flex-wrap items-center gap-2">
                  {c.rider.name}
                  {i === 0 && <Pill className="bg-[#c8151d] text-white"><Zap className="w-3 h-3" /> Best match</Pill>}
                </p>
                <p className="text-xs text-gray-500">
                  {VEHICLE_LABEL[c.rider.vehicle]} · {c.rider.plate} · {c.km} km from branch · {c.load} active job{c.load === 1 ? '' : 's'} ·{' '}
                  <Star className="w-3 h-3 inline -mt-0.5 text-amber-500 fill-amber-500" /> {c.rider.rating.toFixed(1)}
                </p>
              </div>
              <Button size="sm" variant={i === 0 ? 'default' : 'outline'} className="max-sm:w-full" onClick={() => pick(c.rider.id)}>Assign</Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
