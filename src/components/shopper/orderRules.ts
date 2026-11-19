// Customer-side order rules shared by the My orders list and the order detail page.

import type { AppState, Order } from '@/src/lib/types';
import { getSetting } from '@/src/lib/logic';

/** Statuses a customer may still cancel from, per the branch's "cancel window" setting. */
const CANCEL_UNTIL: Record<string, string[]> = {
  Placed: ['placed', 'awaiting_confirmation'],
  Confirmed: ['placed', 'awaiting_confirmation', 'confirmed'],
  Preparing: ['placed', 'awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper'],
};

export function canCancel(s: AppState, o: Order) {
  const w = String(getSetting(s, 'cancelWindowStatus', o.branchId) || 'Confirmed');
  return (CANCEL_UNTIL[w] ?? CANCEL_UNTIL.Confirmed).includes(o.status);
}

export const isDone = (o: Order) => o.status === 'delivered' || o.status === 'collected';

export const CANCEL_REASONS = ['Changed my mind', 'Ordered by mistake', 'Delivery takes too long', 'Want to change items'];
