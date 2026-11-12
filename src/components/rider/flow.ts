// Rider-app job flow helpers. Progress steps are stored as order timeline notes,
// so the Order Desk, Dispatch Map and Shopper App see every step live.

import type { AppState, Order, Rider } from '@/src/lib/types';
import { addAudit, addNotification, mutate, uid } from '@/src/lib/store';
import { assignRider, getSetting } from '@/src/lib/logic';

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

/** Rider ↔ shopper chat through the masked in-app channel. */
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
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}
