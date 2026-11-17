// Delivery-module helpers (dispatch ranking, workload, payouts).
// Kept local to the delivery/rider screens; all data comes from the shared store.
// Phase 1 (spec v6): the shop uses its own riders only — no freelance riders, no courier partners.

import { useEffect, useState } from 'react';
import type { AppState, Order, Rider } from '@/src/lib/types';
import { distanceKm, getSetting, riderPosition } from '@/src/lib/logic';

// Only 'own' riders are used in Phase 1; the other keys exist because the data type still allows them.
export const RIDER_TYPE_LABEL: Record<Rider['type'], string> = { own: 'Own rider', freelance: 'Rider', courier: 'Rider' };
export const VEHICLE_LABEL: Record<Rider['vehicle'], string> = { bicycle: 'Bicycle', motorcycle: 'Motorcycle', car: 'Car', van: 'Van' };
export const RIDER_STATUS_CLASS: Record<Rider['status'], string> = {
  online: 'bg-green-100 text-green-800',
  offline: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-800',
};

/** Pay rule for the shop's own riders (base per trip + per km). Editable by admin in production. */
export const PAY_RULES: Record<Rider['type'], { base: number; perKm: number }> = {
  own: { base: 60, perKm: 8 },
  freelance: { base: 60, perKm: 8 },
  courier: { base: 60, perKm: 8 },
};

/** The shop's own riders (optionally only those serving one branch). */
export function ownRiders(s: AppState, branchId?: string) {
  return s.riders.filter((r) => r.type === 'own' && (!branchId || r.branchIds.includes(branchId)));
}

/** Current time, refreshed every `ms`. Keeps render pure: Date.now() is read in the timer, not during render. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Cold-chain deadline: rider pickup time + maximum delivery minutes. */
export function deliverBy(o: Order, now: number) {
  if (!o.outForDeliveryAt || !o.maxDeliveryMins) return undefined;
  const due = new Date(o.outForDeliveryAt).getTime() + o.maxDeliveryMins * 60_000;
  return { due: new Date(due).toISOString(), minsLeft: Math.ceil((due - now) / 60_000), overdue: now > due };
}

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

/** Candidate own riders for an order, sorted by the admin's dispatch rule. */
export function rankCandidates(s: AppState, o: Order, ruleOverride?: string): { list: Candidate[]; rule: string } {
  const rule = ruleOverride ?? String(getSetting(s, 'dispatchRule', o.branchId));
  const b = s.branches.find((x) => x.id === o.branchId);
  const max = Number(getSetting(s, 'maxActiveOrders', o.branchId)) || 2;
  const list = s.riders
    .filter((r) => r.type === 'own' && r.status === 'online' && r.branchIds.includes(o.branchId) && r.id !== o.riderId)
    .map((r) => {
      const pos = liveRiderPos(s, r);
      return { rider: r, km: b ? distanceKm(b, pos) : 0, load: workload(s, r.id) };
    })
    .filter((c) => c.load < max);
  list.sort((a, c) => {
    if (rule.startsWith('Nearest')) return a.km - c.km;
    if (rule.startsWith('Lowest')) return a.load - c.load || a.km - c.km;
    if (rule.startsWith('Highest')) return c.rider.rating - a.rider.rating || a.km - c.km;
    return a.load - c.load || a.km - c.km;
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
