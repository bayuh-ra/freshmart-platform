// Rider-app job flow helpers. Progress steps are stored as order timeline notes,
// so the Order Desk, Dispatch Map and the customer’s order tracking page see every step live.

import type { AppState, Order, Rider } from '@/src/lib/types';
import { addAudit, addNotification, mutate, uid } from '@/src/lib/store';
import { assignRider, getSetting, num } from '@/src/lib/logic';
import { PAY_RULES, orderDistance, tipFor, tripEarnings } from '@/src/components/delivery/helpers';

export const NOTE = {
  accepted: (r: Rider) => `Accepted by ${r.name}`,
  arrivedBranch: 'Rider arrived at branch',
  arrivedDrop: 'Rider arrived at drop-off',
  returned: 'Returned to branch',
};

function lastAssignIdx(o: Order) {
  let idx = -1;
  o.timeline.forEach((e, i) => { if (e.status === 'rider' && e.note?.startsWith('Rider assigned')) idx = i; });
  return idx;
}
/** True if `note` was recorded after the latest rider assignment. */
export function hasStep(o: Order, note: string) {
  const from = lastAssignIdx(o);
  return o.timeline.some((e, i) => i > from && e.note === note);
}

export function isAccepted(o: Order, r: Rider) {
  return hasStep(o, NOTE.accepted(r));
}

/** Orders that belong on the rider's "current job" screen. */
export function activeJobs(s: AppState, r: Rider) {
  return s.orders.filter((o) => o.riderId === r.id && (
    (o.status === 'ready' && isAccepted(o, r)) ||
    o.status === 'out_for_delivery' ||
    (o.status === 'failed_delivery' && !hasStep(o, NOTE.returned))
  ));
}
export function offers(s: AppState, r: Rider) {
  return s.orders.filter((o) => o.riderId === r.id && o.status === 'ready' && o.fulfillment === 'delivery' && !isAccepted(o, r));
}
export function availableJobs(s: AppState, r: Rider) {
  return s.orders.filter((o) => o.fulfillment === 'delivery' && o.status === 'ready' && !o.riderId && r.branchIds.includes(o.branchId));
}

export function riderNote(orderId: string, by: string, note: string, staffMsg?: { title: string; body: string }, shopperMsg?: string) {
  mutate((d) => {
    const o = d.orders.find((x) => x.id === orderId);
    if (!o) return;
    o.timeline.push({ status: 'rider', at: new Date().toISOString(), by, note });
    o.updatedAt = new Date().toISOString();
    if (staffMsg) addNotification(d, { audience: 'staff', targetId: o.branchId, orderId, ...staffMsg });
    if (shopperMsg) addNotification(d, { audience: 'shopper', targetId: o.customerId, orderId, title: o.number, body: shopperMsg });
  });
}

export function acceptOffer(o: Order, r: Rider) {
  riderNote(o.id, r.name, NOTE.accepted(r), undefined, `${r.name} accepted your delivery and is heading to the branch.`);
}

export function claimJob(o: Order, r: Rider) {
  assignRider(o.id, r.id, r.name);
  acceptOffer(o, r);
}

export function declineOffer(o: Order, r: Rider, reason: string) {
  mutate((d) => {
    const x = d.orders.find((y) => y.id === o.id);
    if (!x) return;
    x.riderId = undefined;
    x.timeline.push({ status: 'rider', at: new Date().toISOString(), by: r.name, note: `Offer declined by ${r.name} (${reason}) — back to dispatch queue` });
    addNotification(d, { audience: 'staff', targetId: x.branchId, orderId: x.id, title: `${x.number}: rider declined`, body: `${r.name} ${reason === 'timed out' ? 'did not respond in time' : 'declined the job'}. Re-assign from the Dispatch Map.` });
    addAudit(d, { module: 'Riders', action: 'Job offer declined', branchId: x.branchId, detail: `${x.number} · ${r.name} · ${reason}`, user: r.name });
  });
}

export function setOnline(r: Rider, online: boolean) {
  mutate((d) => {
    const x = d.riders.find((y) => y.id === r.id);
    if (!x) return;
    x.status = online ? 'online' : 'offline';
    addAudit(d, { module: 'Riders', action: online ? 'Rider went online' : 'Rider went offline', detail: x.name, user: x.name, oldValue: online ? 'offline' : 'online', newValue: x.status });
  });
}

export function sendSos(r: Rider, o?: Order) {
  mutate((d) => {
    for (const bid of o ? [o.branchId] : r.branchIds) {
      addNotification(d, { audience: 'staff', targetId: bid, orderId: o?.id, title: `🚨 SOS from rider ${r.name}`, body: `${r.phone} · last GPS ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}${o ? ` · on ${o.number}` : ''}` });
    }
    addAudit(d, { module: 'Riders', action: 'SOS alert', detail: `${r.name}${o ? ` during ${o.number}` : ''} — dispatcher alerted`, branchId: o?.branchId, user: r.name });
  });
}

/** Rider ↔ customer chat through the masked chat channel. */
export function sendRiderChat(o: Order, r: Rider, text: string) {
  mutate((d) => {
    let cv = d.conversations.find((c) => c.kind === 'rider' && c.orderId === o.id);
    const now = new Date().toISOString();
    if (!cv) {
      cv = { id: uid('cv'), kind: 'rider', customerId: o.customerId, customerName: o.customerName, orderId: o.id, branchId: o.branchId, category: 'Other', status: 'open', priority: 'normal', messages: [], unreadStaff: 0, unreadShopper: 0, updatedAt: now };
      d.conversations.unshift(cv);
    }
    cv.messages.push({ from: 'rider', name: r.name, text, at: now });
    cv.unreadShopper += 1;
    cv.updatedAt = now;
    addNotification(d, { audience: 'shopper', targetId: o.customerId, orderId: o.id, title: `Message from ${r.name}`, body: text });
  });
}

export function podMethod(s: AppState, branchId: string) {
  return String(getSetting(s, 'podMethod', branchId) || 'Photo');
}

export function mapsLinks(lat: number, lng: number) {
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

/** Items the rider carries (removed / out-of-stock lines are left out). */
export function liveItems(o: Order) {
  return o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock');
}
export function itemName(i: Order['items'][number]) {
  return i.substitute?.status === 'accepted' ? i.substitute.name : i.name;
}

/** Barangay of the drop-off ("Purok 3, Dawis, Digos City" → "Dawis"). */
export function areaOf(o: Order) {
  const parts = (o.address?.line ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? '—';
}

export function isCodDue(o: Order) {
  return o.paymentMethod === 'cod' && o.paymentStatus === 'pending';
}

/** Where the rider is in the job: label for the job header / current-job card. */
export function stageOf(o: Order) {
  if (o.status === 'failed_delivery') return 'Return to shop';
  if (o.status === 'ready') return hasStep(o, NOTE.arrivedBranch) ? 'Pick up' : 'Go to shop';
  return hasStep(o, NOTE.arrivedDrop) ? 'At customer' : 'On the way';
}

/** Cold-chain limit in minutes: the order's own, else the branch's meatMaxDeliveryMins setting. */
export function maxMins(s: AppState, o: Order) {
  return o.maxDeliveryMins || num(getSetting(s, 'meatMaxDeliveryMins', o.branchId)) || 60;
}

/** Delivery window from pickup (outForDeliveryAt) + the cold-chain limit. `left` is 0–1 of the window remaining. */
export function deliveryWindow(s: AppState, o: Order, now: number) {
  if (!o.outForDeliveryAt) return undefined;
  const mins = maxMins(s, o);
  const due = Date.parse(o.outForDeliveryAt) + mins * 60_000;
  return { due: new Date(due).toISOString(), mins, minsLeft: Math.ceil((due - now) / 60_000), overdue: now > due, left: Math.max(0, Math.min(1, (due - now) / (mins * 60_000))) };
}

/** Delivered trips of a rider on one calendar day, newest first. */
export function tripsOn(s: AppState, r: Rider, day: Date) {
  const key = day.toDateString();
  return s.orders
    .filter((o) => o.riderId === r.id && o.status === 'delivered' && o.completedAt && new Date(o.completedAt).toDateString() === key)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
}

/**
 * Pay for a list of trips with the same rule as each trip's payout (PAY_RULES: base + per km, rounded per trip),
 * so base + distance + tips always equals the sum of the trip rows.
 */
export function payFor(s: AppState, r: Rider, trips: Order[]) {
  const rule = PAY_RULES[r.type];
  const trip = trips.reduce((t, o) => t + tripEarnings(s, o, r), 0);
  const base = trips.length * rule.base;
  const km = Math.round(trips.reduce((t, o) => t + orderDistance(s, o), 0) * 10) / 10;
  const tips = trips.reduce((t, o) => t + tipFor(o), 0);
  return { trips: trips.length, base, km, perKm: rule.perKm, baseRate: rule.base, distance: trip - base, tips, total: trip + tips };
}
