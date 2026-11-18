'use client';

// Dispatch board: live map of the shop, riders and delivery orders, plus the Orders / Riders panel.
// Times follow the cold-chain rule: the clock starts when the order is packed (marked ready) and the
// limit is the order's maxDeliveryMins (or the "meatMaxDeliveryMins" setting). Ride times use ~25 km/h.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Phone, Route, Search, Snowflake, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { MapView, type MapLine, type MapMarker } from '@/src/components/MapView';
import { BRAND } from '@/src/components/brand/Brand';
import { addAudit, currentUserName, getState, mutate, useStore } from '@/src/lib/store';
import { assignRider, can, distanceKm, fmtTime, getSetting, num, pesoShort } from '@/src/lib/logic';
import type { AppState, Branch, Order, Rider } from '@/src/lib/types';
import { deliverBy, orderDistance, ownRiders, rankCandidates, riderJobs, useNow } from '@/src/components/delivery/helpers';
import { assignRiderNow, markOrderDelivered, startDelivery } from '@/src/components/delivery/actions';
import { ChooseRiderDrawer, rideMins } from '@/app/orders/[id]/_rider';
import { PAY_SHORT } from '@/app/orders/[id]/_parts';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };
const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;
const COLOR = { red: '#c8151d', orange: '#e08a2e', orangeText: '#b8641a', green: '#1f6b3f', blue: '#2c4f9e', grey: '#9a8f8a', charcoal: '#2a2322' };

type Kind = 'waiting' | 'pickup' | 'road';
type OrderFilter = 'waiting' | 'pickup' | 'road' | 'delayed' | 'all';
type RiderFilter = 'can' | 'busy' | 'off';
type LatLng = { lat: number; lng: number };

interface Job {
  o: Order;
  kind: Kind;
  km: number;
  area: string;
  /** Cold-chain limit and minutes since packed. */
  limit: number;
  cold: number;
  /** Minutes past the limit (0 when on time). */
  late: number;
  rider?: Rider;
  /** Waiting: minutes left before it must leave. Pickup: rider minutes to the shop. Road: minutes to the customer. */
  mins: number;
  /** Road: minutes since the rider left. */
  out: number;
  pair?: { o: Order; area: string; dir: string };
}

interface RiderInfo {
  r: Rider;
  online: boolean;
  load: number;
  pos: LatLng;
  km: number;
  mins: number;
  orders: Order[];
  onRoad: boolean;
  backIn: number;
}

// ---------------- Helpers ----------------
const minsFrom = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0);
const packedAt = (o: Order) => [...o.timeline].reverse().find((e) => e.status === 'ready')?.at ?? o.updatedAt;
const shortCode = (number: string) => number.split('-').pop() ?? number;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
/** "Mylene Torres" → "Mylene T." */
const shortName = (name: string) => {
  const p = name.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
};
/** Barangay from "Purok 3, Aplaya, Digos City" → "Aplaya". */
const areaOf = (o: Order) => {
  const parts = (o.address?.line ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? '—';
};
/** Bags packed: the pack-check count, else one bag per five lines. */
const bagsOf = (o: Order) => o.bagCount ?? (Number([...o.timeline].reverse().find((e) => /\d+ bag/.test(e.note ?? ''))?.note?.match(/(\d+) bag/)?.[1] ?? 0) || Math.max(1, Math.ceil(o.items.length / 5)));
const bearing = (a: LatLng, b: LatLng) => {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x = Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) - Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8];
const lerp = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
const payText = (o: Order) =>
  o.paymentStatus === 'paid' ? `Paid · ${PAY_SHORT[o.paymentMethod]}` : o.paymentMethod === 'cod' ? `COD ${pesoShort(o.total)}` : `${PAY_SHORT[o.paymentMethod]} · ${o.paymentStatus}`;

/** Planned stops of a rider's deliveries on the road: minutes from leaving the shop to each drop-off (+2 min per extra stop). */
function routePlan(branch: Branch, road: Order[]) {
  const stops = [...road].filter((o) => o.address).sort((a, b) => Date.parse(a.outForDeliveryAt ?? '') - Date.parse(b.outForDeliveryAt ?? '') || distanceKm(branch, a.address!) - distanceKm(branch, b.address!));
  let t = 0;
  let prev: LatLng = branch;
  const plan = stops.map((o, i) => {
    t += rideMins(distanceKm(prev, o.address!)) + (i ? 2 : 0);
    prev = o.address!;
    return { o, at: t };
  });
  return plan;
}

/** Everything the board shows, computed from the store at time `now`. */
function buildBoard(s: AppState, branch: Branch, now: number) {
  const defLimit = num(getSetting(s, 'meatMaxDeliveryMins', branch.id)) || 60;
  const max = num(getSetting(s, 'maxActiveOrders', branch.id)) || 2;
  const dlv = s.orders.filter((o) => o.branchId === branch.id && o.fulfillment === 'delivery');
  const waitingO = dlv.filter((o) => o.status === 'ready' && !o.riderId);
  const pickupO = dlv.filter((o) => o.status === 'ready' && o.riderId);
  const roadO = dlv.filter((o) => o.status === 'out_for_delivery');

  // Riders: live position, load and when they are back at the shop.
  const roster = ownRiders(s, branch.id).filter((r) => r.status === 'online' || r.status === 'offline');
  const etaById = new Map<string, number>();
  const riders: RiderInfo[] = roster.map((r) => {
    const jobs = riderJobs(s, r.id).filter((o) => o.branchId === branch.id);
    const road = jobs.filter((o) => o.status === 'out_for_delivery');
    const plan = routePlan(branch, road);
    let pos: LatLng = { lat: r.lat, lng: r.lng };
    let backIn = 0;
    if (plan.length) {
      const elapsed = Math.max(0, (now - Date.parse(plan[0].o.outForDeliveryAt ?? '')) / 60_000);
      let prev: LatLng = branch;
      let t0 = 0;
      let moving = false;
      pos = plan[plan.length - 1].o.address!; // past the plan: waiting at the last drop-off
      for (const p of plan) {
        etaById.set(p.o.id, Math.max(1, Math.round(p.at - elapsed)));
        if (!moving && elapsed < p.at) {
          pos = lerp(prev, p.o.address!, Math.min(1, Math.max(0, (elapsed - t0) / Math.max(1, p.at - t0))));
          moving = true;
        }
        prev = p.o.address!;
        t0 = p.at;
      }
      const last = plan[plan.length - 1];
      backIn = Math.max(1, Math.round(last.at - elapsed)) + rideMins(distanceKm(last.o.address!, branch));
    }
    for (const o of jobs.filter((j) => j.status === 'ready')) {
      const km = orderDistance(s, o);
      backIn += (backIn ? 0 : rideMins(distanceKm(pos, branch))) + rideMins(km) * 2;
    }
    const km = distanceKm(branch, pos);
    return { r, online: r.status === 'online', load: jobs.length, pos, km, mins: rideMins(km), orders: jobs, onRoad: road.length > 0, backIn };
  });
  const riderById = new Map(riders.map((x) => [x.r.id, x]));

  const base = (o: Order, kind: Kind): Job => {
    const limit = o.maxDeliveryMins ?? defLimit;
    const cold = minsFrom(packedAt(o), now);
    const due = deliverBy(o, now);
    const late = Math.max(0, cold - limit, due?.overdue ? -due.minsLeft : 0);
    return { o, kind, km: orderDistance(s, o), area: areaOf(o), limit, cold, late, rider: o.riderId ? s.riders.find((r) => r.id === o.riderId) : undefined, mins: 0, out: 0 };
  };
  const waiting = waitingO.map((o) => { const j = base(o, 'waiting'); j.mins = j.limit - j.cold - rideMins(j.km); return j; });
  // Pairing hint: another waiting order in about the same direction from the shop and close by.
  for (const j of waiting) {
    if (!j.o.address) continue;
    const dir = bearing(branch, j.o.address);
    const near = waiting
      .filter((x) => x !== j && x.o.address && Math.abs(((bearing(branch, x.o.address) - dir + 540) % 360) - 180) <= 35 && distanceKm(j.o.address!, x.o.address) <= 3)
      .sort((a, b) => distanceKm(j.o.address!, a.o.address!) - distanceKm(j.o.address!, b.o.address!))[0];
    if (near) j.pair = { o: near.o, area: near.area, dir: compass(dir) };
  }
  waiting.sort((a, b) => a.mins - b.mins);
  const pickup = pickupO.map((o) => { const j = base(o, 'pickup'); j.mins = riderById.get(o.riderId!)?.mins ?? 1; return j; }).sort((a, b) => a.mins - b.mins);
  const road = roadO.map((o) => { const j = base(o, 'road'); j.mins = etaById.get(o.id) ?? 1; j.out = minsFrom(o.outForDeliveryAt, now); return j; }).sort((a, b) => a.mins - b.mins);
  const delayed = road.filter((j) => j.late > 0).sort((a, b) => b.late - a.late);
  return { max, defLimit, waiting, pickup, road, delayed, riders };
}

// ---------------- Page ----------------
export default function DispatchPage() {
  const s = useStore();
  const now = useNow(15_000);
  const [tab, setTab] = useState<'orders' | 'riders'>('orders');
  const [filter, setFilter] = useState<OrderFilter | null>(null);
  const [riderFilter, setRiderFilter] = useState<RiderFilter>('can');
  const [query, setQuery] = useState('');
  const [pickFor, setPickFor] = useState<string | null>(null);

  if (!can(s, 'riders.view')) {
    return <DashboardLayout title="Dispatch" eyebrow="Delivery"><AccessDenied permission="riders.view" /></DashboardLayout>;
  }

  const branch = s.branches.find((b) => b.id === s.session.branchId) ?? s.branches[0];
  const rule = String(getSetting(s, 'dispatchRule', branch.id));
  const { max, defLimit, waiting, pickup, road, delayed, riders } = buildBoard(s, branch, now);
  const online = riders.filter((x) => x.online);
  const canTake = online.filter((x) => x.load < max);
  const free = online.filter((x) => x.load === 0);
  const busy = online.filter((x) => x.load > 0);
  const offline = riders.filter((x) => !x.online);
  const urgent = waiting.filter((j) => j.mins <= 5).length;
  const all = [...waiting, ...pickup, ...road];
  const counts: Record<OrderFilter, number> = { waiting: waiting.length, pickup: pickup.length, road: road.length, delayed: delayed.length, all: all.length };
  const firstNonEmpty = (['waiting', 'pickup', 'road', 'delayed'] as OrderFilter[]).find((f) => counts[f] > 0) ?? 'all';
  const active: OrderFilter = filter ?? firstNonEmpty;
  const shown = active === 'waiting' ? waiting : active === 'pickup' ? pickup : active === 'road' ? road : active === 'delayed' ? delayed : all;
  const pickOrder = pickFor ? s.orders.find((o) => o.id === pickFor) : undefined;

  const autoDispatch = () => {
    if (rule === 'Manual only') { toast.error('Auto-assign is off', { description: 'The dispatch rule is set to "Manual only" in Settings → Riders.' }); return; }
    let n = 0;
    for (const j of waiting) {
      const st = getState();
      const fresh = st.orders.find((x) => x.id === j.o.id);
      if (!fresh || fresh.riderId) continue;
      const top = rankCandidates(st, fresh).list[0];
      if (!top) continue;
      assignRider(fresh.id, top.rider.id, `Auto-dispatch (${rule})`);
      mutate((d) => addAudit(d, { module: 'Riders', action: 'Auto-dispatch', branchId: fresh.branchId, detail: `${fresh.number} → ${top.rider.name} by rule "${rule}"` }));
      n++;
    }
    if (n) toast.success(`Auto-assigned ${n} order${n === 1 ? '' : 's'}`, { description: `Rule: ${rule}` });
    else toast.info('Nothing to assign', { description: 'No waiting orders, or no riders with room for another order.' });
  };

  const followUp = (o: Order) => {
    mutate((d) => {
      addAudit(d, { module: 'Riders', action: 'Delay alert sent', branchId: o.branchId, detail: `${o.number} — ${minsFrom(o.outForDeliveryAt, Date.now())} min on the road` });
      d.orders.find((x) => x.id === o.id)?.timeline.push({ status: 'note', at: new Date().toISOString(), by: currentUserName(d), note: 'Dispatcher contacted rider about delay; shopper notified' });
    });
    toast.success(`Delay follow-up logged for ${o.number}`);
  };

  // ---------------- Map ----------------
  const tag = (bg: string, text: string) =>
    `<div style="display:flex;align-items:center;justify-content:center;height:22px;padding:0 6px;border-radius:6px;background:${bg};color:#fff;font:600 11px/1 system-ui,sans-serif;border:1.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);white-space:nowrap">${text}</div>`;
  const markers: MapMarker[] = [
    ...all.filter((j) => j.o.address).map((j): MapMarker => ({
      id: `o-${j.o.id}`, lat: j.o.address!.lat, lng: j.o.address!.lng, label: '', size: [50, 22], z: 100,
      html: tag(j.kind === 'waiting' ? COLOR.orange : j.kind === 'pickup' ? COLOR.blue : j.late ? COLOR.red : COLOR.green, shortCode(j.o.number)),
      title: `${j.o.number} · ${shortName(j.o.customerName)} · ${j.area}`,
    })),
    ...online.map((x): MapMarker => {
      const ring = x.onRoad ? COLOR.orange : x.load ? COLOR.blue : '#2f9e5b';
      return {
        id: `r-${x.r.id}`, lat: x.pos.lat, lng: x.pos.lng, label: '', size: [32, 32], z: 200,
        html: `<div style="width:32px;height:32px;border-radius:999px;background:${COLOR.charcoal};color:#fff;font:600 11px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px ${ring},0 2px 6px rgba(0,0,0,.35)">${initials(x.r.name)}</div>`,
        title: `${x.r.name} · ${x.load ? `${x.load}/${max} orders` : 'free'}`,
      };
    }),
    {
      id: `shop-${branch.id}`, lat: branch.lat, lng: branch.lng, label: '', size: [34, 34], z: 300,
      html: `<div style="width:34px;height:34px;border-radius:9px;background:${COLOR.red};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.4-4.4A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/></svg></div>`,
      popup: `<b>${BRAND.short} · ${branch.name}</b><br/>Pickup point`,
    },
  ];
  const lines: MapLine[] = road.filter((j) => j.o.address).map((j) => ({ points: [[branch.lat, branch.lng], [j.o.address!.lat, j.o.address!.lng]], color: j.late ? COLOR.red : '#2f9e5b', weight: 2.5, opacity: 0.75 }));

  // ---------------- Riders list ----------------
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const riderList = (riderFilter === 'can' ? [...canTake].sort((a, b) => a.load - b.load || a.km - b.km)
    : riderFilter === 'busy' ? [...busy].sort((a, b) => a.load - b.load || a.backIn - b.backIn)
      : [...offline].sort((a, b) => a.r.name.localeCompare(b.r.name)))
    .filter((x) => !q || x.r.name.toLowerCase().replace(/\s+/g, '').includes(q) || x.r.plate.toLowerCase().replace(/\s+/g, '').includes(q));

  const heading: Record<OrderFilter, string> = { waiting: 'Waiting for rider', pickup: 'Awaiting pickup', road: 'On the road', delayed: 'Delayed', all: 'All delivery orders' };
  const pills: { v: OrderFilter; label: string; dot: string }[] = [
    { v: 'waiting', label: 'Waiting', dot: COLOR.orange }, { v: 'pickup', label: 'Pickup', dot: COLOR.blue },
    { v: 'road', label: 'On the road', dot: '#2f9e5b' }, { v: 'delayed', label: 'Delayed', dot: COLOR.red }, { v: 'all', label: 'All', dot: COLOR.grey },
  ];

  return (
    <DashboardLayout title="Dispatch" eyebrow="Delivery">
      {/* Header */}
      <div className="mb-5 md:mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{branch.name} · Live · {fmtTime(new Date(now).toISOString())}</p>
          <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Dispatch</h1>
        </div>
        {waiting.length > 0 && (
          <button type="button" onClick={autoDispatch} title={`Rule: ${rule}`}
            className="self-start sm:self-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#d6202a] text-sm font-semibold text-white hover:bg-[#c8151d] transition-colors">
            <Zap className="w-4 h-4" {...ICON} />Auto-assign {waiting.length}
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 md:mb-6">
        <Stat title="Riders online" value={<>{online.length}<span className="text-[#b3a69f]">/{riders.length}</span></>} sub={`${canTake.length} can take an order · ${free.length} completely free`} />
        <Stat title="On a job" value={busy.length} sub={`${road.length} on the road · ${pickup.length} awaiting pickup`} />
        <Stat title="Waiting for rider" value={waiting.length} color={waiting.length ? COLOR.red : undefined}
          sub={urgent ? `${urgent} must leave in 5 min or less` : waiting.length ? 'All within the cold-chain time' : 'Nothing waiting'} />
        <Stat title="Delayed" value={delayed.length} solid={delayed.length > 0} sub={`Past the ${defLimit}-min cold-chain limit`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 lg:gap-6 items-start">
        {/* Map */}
        <div className="relative rounded-2xl border border-[#eadfd6] bg-[#fffdfb] overflow-hidden lg:sticky lg:top-20">
          <MapView key={branch.id} center={[branch.lat, branch.lng]} zoom={13} fitToMarkers markers={markers} lines={lines} frameClass=""
            className="h-[320px] sm:h-[440px] lg:h-[calc(100vh-7rem)] lg:min-h-[560px] lg:max-h-[760px]" />
          <span className="absolute top-3 right-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-[#2a2322]/90 px-3 py-1.5 text-xs font-semibold text-white shadow">
            <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" /><span className="relative w-2 h-2 rounded-full bg-green-400" /></span>Live
          </span>
          <div className="absolute left-3 bottom-3 right-16 sm:right-auto z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-xl bg-white/95 px-3 py-2 text-[11px] sm:text-xs text-[#3d3230] shadow">
            <LegendItem shape="square" color={COLOR.red}>Shop</LegendItem>
            <LegendItem color={COLOR.orange}>Waiting</LegendItem>
            <LegendItem color={COLOR.blue}>Rider arriving</LegendItem>
            <LegendItem color="#2f9e5b">Out for delivery</LegendItem>
            <LegendItem shape="ring" color="#2f9e5b">Free rider</LegendItem>
          </div>
        </div>

        {/* Orders / Riders panel */}
        <div className="min-w-0 space-y-4">
          <div role="tablist" aria-label="Dispatch panel" className="grid grid-cols-2 gap-1 rounded-xl bg-[#ebe4dd] p-1">
            {([['orders', `Orders · ${all.length}`], ['riders', `Riders · ${free.length} free`]] as const).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                className={cn('h-11 rounded-lg text-sm transition-colors truncate px-2', tab === v ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>{label}</button>
            ))}
          </div>

          {tab === 'orders' ? (
            <>
              <div>
                <h2 className="text-2xl leading-tight uppercase text-[#1d1716]" style={OSWALD}>{heading[active]}</h2>
                <div role="tablist" aria-label="Order status" className="mt-2 flex flex-wrap gap-1">
                  {pills.map((p) => {
                    const on = active === p.v;
                    return (
                      <button key={p.v} type="button" role="tab" aria-selected={on} onClick={() => setFilter(p.v)}
                        className={cn('inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm whitespace-nowrap transition-colors',
                          on ? 'bg-white font-semibold text-[#1d1716] shadow-sm ring-1 ring-[#eadfd6]' : 'text-[#5b4f4b] hover:text-[#1d1716]')}>
                        <span className="w-2 h-2 rounded-full" style={{ background: p.dot }} />{p.label} <span className="tabular-nums">{counts[p.v]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {shown.length === 0 ? (
                <p className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] px-5 py-10 text-center text-sm text-gray-500">No {heading[active].toLowerCase()} right now.</p>
              ) : (
                <ul className="space-y-3">
                  {shown.map((j) => (
                    <li key={j.o.id}>
                      <OrderCard j={j} max={max} riderLoad={j.rider ? riders.find((x) => x.r.id === j.rider!.id)?.load ?? 0 : 0}
                        onAssign={() => setPickFor(j.o.id)} onFollowUp={() => followUp(j.o)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0">
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-2xl leading-tight uppercase text-[#1d1716]" style={OSWALD}>Riders</h2>
                  <span className="text-sm text-gray-500">{online.length} online</span>
                </div>
                <label className="relative block">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" {...ICON} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or plate" aria-label="Search riders by name or plate"
                    className="h-11 w-full rounded-xl border border-[#eadfd6] bg-white pl-10 pr-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-2 focus:ring-[#c8151d]/10" />
                </label>
                <div role="tablist" aria-label="Rider status" className="grid grid-cols-3 gap-1 rounded-xl bg-[#ebe4dd] p-1">
                  {([['can', 'Can take', canTake.length, '#2f9e5b'], ['busy', 'On delivery', busy.length, COLOR.orange], ['off', 'Offline', offline.length, COLOR.grey]] as const).map(([v, label, n, dot]) => (
                    <button key={v} type="button" role="tab" aria-selected={riderFilter === v} onClick={() => setRiderFilter(v)}
                      className={cn('inline-flex items-center justify-center gap-1.5 h-10 rounded-lg px-1.5 text-[13px] sm:text-sm whitespace-nowrap transition-colors',
                        riderFilter === v ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'text-[#5b4f4b] hover:text-[#1d1716]')}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} /><span className="truncate">{label}</span> <span className="tabular-nums">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              {riderList.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-500 border-t border-[#f0e7df]">{q ? 'No riders match your search.' : 'No riders here right now.'}</p>
              ) : (
                <ul className="divide-y divide-[#f0e7df] border-t border-[#f0e7df]">
                  {riderList.map((x) => <RiderRow key={x.r.id} x={x} max={max} />)}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {pickOrder && (
        <ChooseRiderDrawer key={pickOrder.id} open o={pickOrder} s={s} onClose={() => setPickFor(null)}
          onAssign={(riderId, name) => { assignRiderNow(s, pickOrder, riderId, name); setPickFor(null); }} />
      )}
    </DashboardLayout>
  );
}

// ---------------- Pieces ----------------
function Stat({ title, value, sub, color, solid }: { title: string; value: ReactNode; sub: string; color?: string; solid?: boolean }) {
  return (
    <div className={cn('rounded-2xl border px-4 sm:px-5 py-4 min-w-0', solid ? 'border-[#c8151d] bg-[#c8151d] text-white' : 'border-[#eadfd6] bg-[#fffdfb]')}>
      <p className={cn('text-xs sm:text-sm font-semibold', solid ? 'text-white' : 'text-[#1d1716]')}>{title}</p>
      <p className="mt-1.5 text-3xl sm:text-4xl leading-none font-semibold tabular-nums" style={{ ...OSWALD, color: solid ? '#fff' : color ?? '#1d1716' }}>{value}</p>
      <p className={cn('mt-2 text-xs leading-snug', solid ? 'text-white/85' : 'text-gray-500')}>{sub}</p>
    </div>
  );
}

function LegendItem({ children, color, shape = 'dot' }: { children: ReactNode; color: string; shape?: 'dot' | 'square' | 'ring' }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn('w-2.5 h-2.5 shrink-0', shape === 'square' ? 'rounded-[3px]' : 'rounded-full')}
        style={shape === 'ring' ? { border: `2px solid ${color}` } : { background: color }} />
      {children}
    </span>
  );
}

function Avatar({ name, dot, dim }: { name: string; dot?: string; dim?: boolean }) {
  return (
    <span className="relative shrink-0">
      <span className={cn('w-10 h-10 rounded-full flex items-center justify-center text-sm', dim ? 'bg-[#efe8e2] text-gray-400' : 'bg-[#2a2322] text-white')} style={OSWALD}>{initials(name)}</span>
      {dot && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#fffdfb]" style={{ background: dot }} />}
    </span>
  );
}

const loadColor = (load: number, max: number) => (load === 0 ? COLOR.green : load < max ? COLOR.orange : COLOR.red);

function ColdBar({ cold, limit }: { cold: number; limit: number }) {
  const f = cold / limit;
  const color = f >= 0.85 ? COLOR.red : f >= 0.5 ? COLOR.orange : '#2f9e5b';
  return (
    <div className="mt-3 flex items-center gap-2.5" title="Minutes since packed / cold-chain limit">
      <Snowflake className="w-4 h-4 shrink-0" style={{ color }} {...ICON} />
      <div className="flex-1 h-1.5 rounded-full bg-[#efe6de] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(f * 100))}%`, background: color }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-[#5b4f4b] shrink-0">{Math.min(cold, limit)}/{limit} min</span>
    </div>
  );
}

function OrderCard({ j, max, riderLoad, onAssign, onFollowUp }: { j: Job; max: number; riderLoad: number; onAssign: () => void; onFollowUp: () => void }) {
  const { o, kind } = j;
  const isLate = kind === 'road' && j.late > 0;
  const dot = kind === 'waiting' ? COLOR.orange : kind === 'pickup' ? COLOR.blue : isLate ? COLOR.red : '#2f9e5b';
  const n = bagsOf(o);
  const bagText = `${n} ${o.coldChain ? 'insulated ' : ''}bag${n === 1 ? '' : 's'}`;

  let big: string;
  let bigColor: string;
  let sub: string;
  if (kind === 'waiting') {
    big = j.mins <= 0 ? 'Leave now' : `Leave in ${j.mins}m`;
    bigColor = j.mins <= 5 ? COLOR.red : j.mins <= 15 ? COLOR.orangeText : COLOR.green;
    sub = `packed ${j.cold} min ago`;
  } else if (kind === 'pickup') {
    big = `Pickup ~${j.mins}m`;
    bigColor = COLOR.green;
    sub = `packed ${j.cold} min ago`;
  } else {
    big = `ETA ${j.mins}m`;
    bigColor = isLate ? COLOR.red : j.cold + j.mins > j.limit - 5 ? COLOR.orangeText : COLOR.green;
    sub = `out ${j.out} min`;
  }

  const r = j.rider;
  const darkBtn = 'inline-flex items-center justify-center gap-2 min-h-11 py-2 px-4 rounded-xl leading-tight text-center bg-[#2a2322] text-sm font-semibold text-white hover:bg-[#1d1716] transition-colors min-w-0';
  const outlineBtn = 'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-[#eadfd6] bg-white text-sm font-semibold hover:bg-[#faf6f2] transition-colors shrink-0';

  return (
    <article className={cn('rounded-2xl border p-4 sm:p-5 min-w-0', isLate ? 'border-[#f3c9c9] bg-[#fff7f7]' : 'border-[#eadfd6] bg-[#fffdfb]')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-[#1d1716]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dot }} />
            <Link href={`/orders/${o.id}`} className="font-bold hover:underline">{o.number}</Link>
            <span className="text-[#5b4f4b]">{shortName(o.customerName)}</span>
            {isLate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fde3e3] px-2 py-0.5 text-xs font-semibold text-[#c8151d]">
                <AlertTriangle className="w-3 h-3" strokeWidth={2.25} />Delayed {j.late} min
              </span>
            )}
          </p>
          <p className="mt-1 text-[13px] text-gray-500 break-words">
            {[j.area, `${j.km} km`, bagText, payText(o)].join(' · ')}
          </p>
          {o.riderInstructions && <p className="mt-1 text-[13px] italic text-[#5b4f4b] break-words">“{o.riderInstructions}”</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl sm:text-2xl leading-none font-semibold whitespace-nowrap" style={{ ...OSWALD, color: bigColor }}>{big}</p>
          <p className="mt-1 text-xs text-gray-500 whitespace-nowrap">{sub}</p>
        </div>
      </div>

      <ColdBar cold={j.cold} limit={j.limit} />

      {kind === 'waiting' && j.pair && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#e6ecf8] px-3 py-2 text-[13px] font-medium text-[#2c4f9e]">
          <Route className="w-4 h-4 shrink-0 mt-px" {...ICON} />
          <span className="min-w-0">Can pair with {j.pair.o.number} · {j.pair.area}, same {j.pair.dir} route</span>
        </p>
      )}

      {r && kind !== 'waiting' && (
        <div className="mt-3 flex items-center gap-3 border-t border-[#f0e7df] pt-3">
          <Avatar name={r.name} dot={riderLoad >= max ? COLOR.red : COLOR.orange} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1d1716] truncate">{r.name}</p>
            <p className="text-xs text-gray-500 truncate">{r.plate} · ★ {r.rating.toFixed(1)} · {kind === 'pickup' ? 'coming to the shop' : `on the way to ${j.area}`}</p>
          </div>
          <a href={`tel:${r.phone.replace(/\s+/g, '')}`} aria-label={`Call ${r.name}`}
            className="w-11 h-11 rounded-full border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0">
            <Phone className="w-4 h-4" {...ICON} />
          </a>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {kind === 'waiting' && (
          <button type="button" onClick={onAssign} className="w-full h-11 rounded-xl bg-[#d6202a] text-sm font-semibold text-white hover:bg-[#c8151d] transition-colors">Assign rider</button>
        )}
        {kind === 'pickup' && (
          <>
            <button type="button" onClick={onAssign} className={cn(outlineBtn, 'text-[#1d1716]')}>Reassign</button>
            <button type="button" onClick={() => startDelivery(o, r?.name, { bagChecked: true })} className={cn(darkBtn, 'flex-1')}>
              Handed over · out for delivery
            </button>
          </>
        )}
        {kind === 'road' && (
          <>
            {isLate && <button type="button" onClick={onFollowUp} className={cn(outlineBtn, 'text-[#c8151d]')}>Follow up</button>}
            <button type="button" onClick={() => markOrderDelivered(o)} className={cn(darkBtn, 'flex-1')}>Mark delivered</button>
          </>
        )}
      </div>
    </article>
  );
}

function RiderRow({ x, max }: { x: RiderInfo; max: number }) {
  const { r } = x;
  const color = x.online ? loadColor(x.load, max) : COLOR.grey;
  const sub = !x.online
    ? `${r.plate} · ${r.offlineSince ? `offline since ${fmtTime(r.offlineSince)}` : 'off shift'}`
    : x.load === 0
      ? `${r.plate} · ${x.km} km away · at the shop in ~${x.mins} min`
      : `${x.orders.map((o) => o.number).join(', ')} · back in ~${x.backIn} min`;
  return (
    <li className={cn('flex items-center gap-3 px-4 sm:px-5 py-3', !x.online && 'opacity-80')}>
      <Avatar name={r.name} dim={!x.online} dot={x.online ? color : undefined} />
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-2 min-w-0">
          <span className={cn('font-semibold truncate', x.online ? 'text-[#1d1716]' : 'text-gray-500')}>{r.name}</span>
          <span className="text-xs font-semibold text-[#ae754d] shrink-0">★ {r.rating.toFixed(1)}</span>
        </p>
        <p className={cn('text-xs truncate', x.online ? 'text-gray-500' : 'text-gray-400')}>{sub}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>{x.online ? `${x.load}/${max}` : 'Off'}</span>
        <span className="flex gap-0.5" aria-hidden>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className="w-3 h-1.5 rounded-full" style={{ background: x.online && i < x.load ? color : '#e8dfd8' }} />
          ))}
        </span>
      </div>
    </li>
  );
}
