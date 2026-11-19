// Delivery status actions shared by the Order details page, the Dispatch board and the Rider App.
import { toast } from 'sonner';
import { applyStatus, assignRider } from '@/src/lib/logic';
import { addAudit, currentUserName, mutate } from '@/src/lib/store';
import type { AppState, Order } from '@/src/lib/types';

/** Assign one of the shop's own riders (Order details suggestions, Choose a rider drawer, Dispatch board). */
export function assignRiderNow(s: AppState, o: Order, riderId: string, name: string) {
  assignRider(o.id, riderId, currentUserName());
  mutate((d) => addAudit(d, { module: 'Orders', action: 'Rider assigned', detail: `${o.number} → ${name}`, branchId: o.branchId, oldValue: s.riders.find((r) => r.id === o.riderId)?.name, newValue: name }));
  toast.success(`${name} assigned`, { description: 'Job offer sent to the Rider App' });
}

/**
 * Hand the bag to the rider: order goes out for delivery (and the cold-chain clock starts).
 * The Rider App passes `by` (the rider), its own timeline note and `quiet` (it shows its own toast).
 */
export function startDelivery(o: Order, riderName?: string, opts: { bagChecked?: boolean; by?: string; note?: string; quiet?: boolean } = {}) {
  mutate((d) => {
    const x = d.orders.find((y) => y.id === o.id);
    if (x && opts.bagChecked) x.riderBagConfirmed = true;
    applyStatus(d, o.id, 'out_for_delivery', { by: opts.by, note: opts.note ?? `Handed to ${riderName}` });
    addAudit(d, { module: 'Orders', action: 'Out for delivery', detail: `${o.number} · ${riderName}`, branchId: o.branchId, ...(opts.by ? { user: opts.by } : {}) });
  });
  if (!opts.quiet) toast.success('Out for delivery', { description: 'Live tracking active for the shopper' });
}

/** Confirm the delivery (branch, or the rider with proof-of-delivery notes via `by`/`note`/`quiet`). */
export function markOrderDelivered(o: Order, opts: { by?: string; note?: string; quiet?: boolean } = {}) {
  mutate((d) => {
    applyStatus(d, o.id, 'delivered', { by: opts.by, note: opts.note ?? 'Delivery confirmed by branch' });
    addAudit(d, { module: 'Orders', action: 'Marked delivered', detail: o.number, branchId: o.branchId, ...(opts.by ? { user: opts.by } : {}) });
  });
  if (!opts.quiet) toast.success(`${o.number} delivered`);
}
