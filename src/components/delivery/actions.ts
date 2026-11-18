// Delivery status actions shared by the Order details page and the Dispatch board.
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

/** Hand the bag to the rider: order goes out for delivery (and the cold-chain clock starts). */
export function startDelivery(o: Order, riderName?: string, opts: { bagChecked?: boolean } = {}) {
  mutate((d) => {
    const x = d.orders.find((y) => y.id === o.id);
    if (x && opts.bagChecked) x.riderBagConfirmed = true;
    applyStatus(d, o.id, 'out_for_delivery', { note: `Handed to ${riderName}` });
    addAudit(d, { module: 'Orders', action: 'Out for delivery', detail: `${o.number} · ${riderName}`, branchId: o.branchId });
  });
  toast.success('Out for delivery', { description: 'Live tracking active for the shopper' });
}

/** Branch confirms the delivery. */
export function markOrderDelivered(o: Order) {
  mutate((d) => {
    applyStatus(d, o.id, 'delivered', { note: 'Delivery confirmed by branch' });
    addAudit(d, { module: 'Orders', action: 'Marked delivered', detail: o.number, branchId: o.branchId });
  });
  toast.success(`${o.number} delivered`);
}
