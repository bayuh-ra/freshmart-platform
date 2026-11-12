// Delivery-module helpers (dispatch ranking, workload, payouts).
// Kept local to the delivery/rider screens; all data comes from the shared store.

import type { AppState, Order, Rider } from '@/src/lib/types';
import { distanceKm, getSetting, riderPosition } from '@/src/lib/logic';

export const RIDER_TYPE_LABEL: Record<Rider['type'], string> = { own: 'Own rider', freelance: 'Freelance', courier: 'Courier partner' };
export const VEHICLE_LABEL: Record<Rider['vehicle'], string> = { bicycle: 'Bicycle', motorcycle: 'Motorcycle', car: 'Car', van: 'Van' };
export const RIDER_STATUS_CLASS: Record<Rider['status'], string> = {
  online: 'bg-green-100 text-green-800',
  offline: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-800',
};

/** Pay rules per rider type (base per trip + per km). Editable by admin in production. */
export const PAY_RULES: Record<Rider['type'], { base: number; perKm: number }> = {
  own: { base: 60, perKm: 8 },
  freelance: { base: 50, perKm: 10 },
  courier: { base: 0, perKm: 0 },
};

/** Active jobs = orders assigned to this rider that are not yet finished. */
export function riderJobs(s: AppState, riderId: string) {
  return s.orders.filter((o) => o.riderId === riderId && (o.status === 'ready' || o.status === 'out_for_delivery'));
}
export function workload(s: AppState, riderId: string) {
  return riderJobs(s, riderId).length;
}

/** Current rider position: moving along an active delivery, else last known GPS. */
export function liveRiderPos(s: AppState, r: Rider) {
  const ofd = s.orders.find((o) => o.riderId === r.id && o.status === 'out_for_delivery');
  if (ofd) {
    const p = riderPosition(s, ofd);
    return { lat: p.lat, lng: p.lng, onJob: true, order: ofd, etaMins: p.etaMins };
  }
  return { lat: r.lat, lng: r.lng, onJob: workload(s, r.id) > 0, order: undefined as Order | undefined, etaMins: 0 };
}

export function orderDistance(s: AppState, o: Order) {
  const b = s.branches.find((x) => x.id === o.branchId);
  if (!b || !o.address) return 0;
  return distanceKm(b, o.address);
}

/** Estimated rider earnings for one trip (pay rule + tip). */
export function tripEarnings(s: AppState, o: Order, r?: Rider) {
  const rule = PAY_RULES[r?.type ?? 'own'];
  const km = orderDistance(s, o);
  return Math.round(rule.base + rule.perKm * km);
}

/** Deterministic tip from the order (demo: shoppers who rated 5 tip ₱20). */
export function tipFor(o: Order) {
  if (o.rating?.rider === 5) return 20;
  return 0;
}

export interface Candidate { rider: Rider; km: number; load: number }

/** Candidate riders for an order, sorted by the admin's dispatch rule. Courier partners are fallback. */
export function rankCandidates(s: AppState, o: Order, ruleOverride?: string): { list: Candidate[]; rule: string } {
  const rule = ruleOverride ?? String(getSetting(s, 'dispatchRule', o.branchId));
  const b = s.branches.find((x) => x.id === o.branchId);
  const max = Number(getSetting(s, 'maxActiveOrders', o.branchId)) || 2;
  const list = s.riders
    .filter((r) => r.status === 'online' && r.branchIds.includes(o.branchId) && r.id !== o.riderId)
    .map((r) => {
      const pos = liveRiderPos(s, r);
      return { rider: r, km: b ? distanceKm(b, pos) : 0, load: workload(s, r.id) };
    })
    .filter((c) => c.rider.type === 'courier' || c.load < max);
  const typeRank = { own: 0, freelance: 1, courier: 2 } as const;
  list.sort((a, c) => {
    // Courier partners always last except in the type-priority rule (where they're last anyway).
    const courier = (a.rider.type === 'courier' ? 1 : 0) - (c.rider.type === 'courier' ? 1 : 0);
    if (courier) return courier;
    if (rule.startsWith('Nearest')) return a.km - c.km;
    if (rule.startsWith('Lowest')) return a.load - c.load || a.km - c.km;
    if (rule.startsWith('Highest')) return c.rider.rating - a.rider.rating || a.km - c.km;
    return typeRank[a.rider.type] - typeRank[c.rider.type] || a.load - c.load || a.km - c.km;
  });
  return { list, rule };
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
export function docState(d: Rider['documents'][number]): { label: string; cls: string } {
  const days = daysUntil(d.expires);
  if (d.status === 'expired' || days < 0) return { label: 'Expired', cls: 'bg-red-100 text-red-700' };
  if (d.status === 'pending') return { label: 'Pending review', cls: 'bg-amber-100 text-amber-800' };
  if (days <= 30) return { label: `Expires in ${days}d`, cls: 'bg-orange-100 text-orange-800' };
  return { label: 'Valid', cls: 'bg-green-100 text-green-800' };
}

export function minsSince(iso?: string) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export const RIDER_COLOR: Record<Rider['status'], string> = { online: '#16a34a', offline: '#9ca3af', suspended: '#dc2626', pending: '#d97706' };
