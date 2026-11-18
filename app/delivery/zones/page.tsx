'use client';

import { useEffect, useRef, useState } from 'react';
import { Calculator, CirclePause, Clock, Lightbulb, Minus, Pencil, Play, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { MapView, type MapCircle, type MapMarker } from '@/src/components/MapView';
import { useNow } from '@/src/components/delivery/helpers';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/src/components/ui/shadcn/sheet';
import { GreenToggle } from '@/app/catalog/_ui';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import {
  branchOpenHours, calcDeliveryFee, can, distanceKm, getSetting, peso, pesoShort, slotCapacity, slotInfo, slotKey, zoneDistanceFee,
} from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import type { AppState, Branch, DeliveryZone } from '@/src/lib/types';

const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;
const ICON = { strokeWidth: 1.75 };
const cardCls = 'rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0';
const inputCls = 'w-full h-11 rounded-lg border border-[#e3d6cc] bg-white px-3 text-[15px] text-[#1d1716] outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb] disabled:text-gray-500';
const labelCls = 'block text-sm font-medium text-[#3d3432] mb-1.5';
const outlineBtn = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-50 disabled:cursor-not-allowed';
const redBtn = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#d6202a] text-sm font-semibold text-white shadow-sm hover:bg-[#c8151d] disabled:bg-[#efa4a8] disabled:shadow-none disabled:cursor-not-allowed';

const fromOf = (z: DeliveryZone) => z.fromKm ?? 0;
const rangeText = (z: DeliveryZone) => `${fromOf(z)}–${z.radiusKm} km`;
const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? 'AM' : 'PM'}`;
const sameDay = (iso: string, now: number) => new Date(iso).toDateString() === new Date(now).toDateString();

function feeSummary(z: DeliveryZone) {
  if (z.feeModel === 'flat') return `${pesoShort(z.flatFee)} flat`;
  if (z.feeModel === 'distance') return `${pesoShort(z.baseFee)} + ${pesoShort(z.perKm)}/km`;
  return `${pesoShort(z.flatFee)} · ₱39 from ₱1,000 · free from ₱2,000`;
}

/** Point `km` east of the branch, used when the calculator is given a plain distance. */
function pointAt(lat: number, lng: number, km: number) {
  return { lat, lng: lng + km / (111.32 * Math.cos((lat * Math.PI) / 180)) };
}

/** "Rizal Ave, Zone 1, Digos City, Davao del Sur" → "Rizal Ave, Zone 1, Digos City". */
function shortAddress(address: string) {
  const parts = address.split(',').map((x) => x.trim());
  const i = parts.findIndex((p) => /city/i.test(p));
  return (i >= 0 ? parts.slice(0, i + 1) : parts).join(', ');
}

/** Barangay of an address line such as "Purok 5, San Miguel, Digos City" → "San Miguel". */
function barangayOf(line: string) {
  const parts = line.split(',').map((x) => x.trim()).filter(Boolean);
  const i = parts.findIndex((p) => /city/i.test(p));
  const before = i > 0 ? parts.slice(0, i) : parts;
  return before[before.length - 1] ?? line;
}

/** Another active zone whose km range overlaps [from, to] (edges may touch). */
function overlapping(zones: DeliveryZone[], selfId: string, from: number, to: number) {
  return zones.find((o) => o.id !== selfId && o.active && from < o.radiusKm && to > fromOf(o));
}

const PAUSE_REASONS = [
  { label: 'Heavy rain', msg: 'Delivery is paused due to heavy rain. Pickup is available.' },
  { label: 'Rider shortage', msg: 'Delivery is paused because we are short on riders right now. Pickup is available.' },
  { label: 'System issue', msg: 'Delivery is paused while we fix a system issue. Pickup is available.' },
];

export default function ZonesPage() {
  const s = useStore();
  const now = useNow(60_000);
  const [edit, setEdit] = useState<DeliveryZone | undefined>();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [selId, setSelId] = useState<string | undefined>();
  const [calcMode, setCalcMode] = useState<'distance' | 'customer'>('distance');
  const [km, setKm] = useState(2.5);
  const [brgy, setBrgy] = useState('');
  const [subtotal, setSubtotal] = useState('850');

  if (!can(s, 'settings.view')) {
    return <DashboardLayout title="Zones & fees" eyebrow="Delivery"><AccessDenied permission="settings.view" /></DashboardLayout>;
  }
  const canEdit = can(s, 'settings.edit');
  const branch = s.branches.find((b) => b.id === s.session.branchId) ?? s.branches[0];
  const zones = s.zones.filter((z) => z.branchId === branch.id).sort((a, b) => a.radiusKm - b.radiusKm || fromOf(a) - fromOf(b));
  const active = zones.filter((z) => z.active);
  const maxKm = zones.length ? Math.max(...zones.map((z) => z.radiusKm)) : 0;
  const maxActiveKm = active.length ? Math.max(...active.map((z) => z.radiusKm)) : 0;
  const hasOuter = zones.some((z) => fromOf(z) > 0);
  const paused = getSetting(s, 'deliveryPaused', branch.id) === true;
  const selected = zones.find((z) => z.id === selId) ?? active[0] ?? zones[0];

  // Today's delivery orders per zone (by the order's distance from the shop).
  const todays = s.orders.filter((o) => o.branchId === branch.id && o.fulfillment === 'delivery' && o.address && o.status !== 'cancelled' && sameDay(o.placedAt, now));
  const zoneStats = new Map<string, { count: number; fees: number }>();
  for (const o of todays) {
    const d = distanceKm(branch, o.address!);
    const z = zones.find((x) => d >= fromOf(x) && d <= x.radiusKm);
    if (!z) continue;
    const st = zoneStats.get(z.id) ?? { count: 0, fees: 0 };
    st.count += 1;
    st.fees += o.deliveryFee;
    zoneStats.set(z.id, st);
  }

  const setPaused = (v: boolean, msg?: string) => {
    mutate((d) => {
      const st = d.settings.find((x) => x.key === 'deliveryPaused');
      const b = d.branches.find((x) => x.id === branch.id);
      if (!st || !b) return;
      st.branch[branch.id] = v;
      if (v) b.pausedMessage = msg?.trim() || 'Delivery is paused right now. Pickup is still available.';
      addAudit(d, { module: 'Settings', action: v ? 'Delivery paused' : 'Delivery resumed', branchId: branch.id, detail: `${b.name}${v ? ` — “${b.pausedMessage}”` : ''}`, oldValue: String(!v), newValue: String(v) });
    });
    toast.success(v ? `Delivery paused at ${branch.name}` : `Delivery resumed at ${branch.name}`, { description: v ? 'Shoppers see your message at checkout and can still choose pickup.' : undefined });
  };

  const toggleZone = (z: DeliveryZone) => {
    if (!z.active) {
      const clash = overlapping(zones, z.id, fromOf(z), z.radiusKm);
      if (clash) { toast.error(`Overlaps ${clash.name}`, { description: 'Change the km range first, or turn the other zone off.' }); return; }
    }
    mutate((d) => {
      const x = d.zones.find((y) => y.id === z.id);
      if (!x) return;
      x.active = !x.active;
      addAudit(d, { module: 'Settings', action: x.active ? 'Zone activated' : 'Zone deactivated', branchId: z.branchId, detail: z.name, oldValue: String(!x.active), newValue: String(x.active) });
    });
    toast.success(z.active ? `${z.name} turned off` : `${z.name} turned on`);
  };

  const newZone = (): DeliveryZone => {
    if (!zones.length) return { id: '', branchId: branch.id, name: `${branch.name} City 0–6 km`, type: 'radius', fromKm: 0, radiusKm: 6, feeModel: 'distance', flatFee: 0, baseFee: 49, perKm: 10, freeAbove: 2500, minOrder: 500, etaMins: 45, active: true };
    return { id: '', branchId: branch.id, name: `Outer barangays ${maxKm}–${maxKm + 4} km`, type: 'radius', fromKm: maxKm, radiusKm: maxKm + 4, feeModel: 'distance', flatFee: 0, baseFee: 69, perKm: 10, freeAbove: 3000, minOrder: 800, etaMins: 60, active: true };
  };

  // Fee calculator
  const sub = Math.max(0, Number(subtotal) || 0);
  const brgys = [...new Map(s.customers.flatMap((c) => c.addresses).map((a) => [barangayOf(a.line), a] as const)).entries()]
    .map(([name, a]) => ({ name, a, d: distanceKm(branch, a) }))
    .sort((x, y) => x.d - y.d);
  const pick = brgys.find((b) => b.name === brgy) ?? brgys[0];
  const addr = calcMode === 'customer' && pick ? pick.a : pointAt(branch.lat, branch.lng, km);
  const fee = calcDeliveryFee(s, branch.id, sub, addr);
  const sliderMax = Math.max(10, maxKm);

  // Map
  const circles: MapCircle[] = [...active].reverse().map((z) => fromOf(z) > 0
    ? { lat: branch.lat, lng: branch.lng, radiusKm: z.radiusKm, innerKm: fromOf(z), color: '#c8151d', fillOpacity: 0.035, weight: 1.5, dashed: true }
    : { lat: branch.lat, lng: branch.lng, radiusKm: z.radiusKm, color: '#c8151d', fillOpacity: 0.09, weight: 2 });
  const ringLabels: MapMarker[] = [...new Set(active.map((z) => z.radiusKm))].map((r) => {
    const p = pointAt(branch.lat, branch.lng, r);
    return {
      id: `ring-${r}`, lat: p.lat, lng: p.lng, label: '', size: [56, 22],
      html: `<div style="display:flex;justify-content:center"><span style="background:#fff;color:#c8151d;font:600 11px/1 Inter,system-ui,sans-serif;padding:5px 8px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.18);white-space:nowrap">${r} km</span></div>`,
    };
  });
  const markers: MapMarker[] = [
    ...ringLabels,
    {
      id: 'calc', lat: addr.lat, lng: addr.lng, label: '', size: [14, 14], z: 500, title: `Fee calculator point · ${fee.distance} km`,
      html: `<div style="width:14px;height:14px;border-radius:999px;background:#2a2322;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
    },
    {
      id: 'shop-label', lat: branch.lat, lng: branch.lng, label: '', size: [200, 26], z: 900,
      html: `<div style="position:relative;width:200px;height:26px;pointer-events:none"><span style="position:absolute;left:122px;top:2px;background:#2a2322;color:#fff;font:600 12px/1 Inter,system-ui,sans-serif;padding:6px 9px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)">${branch.name} · ${fee.distance} km</span></div>`,
    },
    {
      id: branch.id, lat: branch.lat, lng: branch.lng, label: '', size: [34, 34], z: 1000, title: branch.name,
      html: `<div style="width:34px;height:34px;border-radius:9px;background:#c8151d;color:#fff;display:flex;align-items:center;justify-content:center;font:700 17px/1 var(--font-oswald),sans-serif;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">J</div>`,
    },
  ];

  return (
    <DashboardLayout title="Zones & fees" eyebrow="Delivery">
      <div className="min-w-0">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d] break-words">{branch.name} ({branch.code}) · {shortAddress(branch.address)}</p>
            <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Zones &amp; fees</h1>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {paused ? (
                <button type="button" onClick={() => setPaused(false)} className={cn(outlineBtn, 'h-11 px-4 text-[#1f6b3f]')}>
                  <Play className="w-4 h-4" {...ICON} />Resume delivery
                </button>
              ) : (
                <button type="button" onClick={() => setPauseOpen(true)} className={cn(outlineBtn, 'h-11 px-4')}>
                  <CirclePause className="w-4 h-4" {...ICON} />Pause delivery
                </button>
              )}
              <button type="button" onClick={() => setEdit(newZone())} className={cn(redBtn, 'h-11 px-4')}>
                <Plus className="w-4 h-4" />Add zone
              </button>
            </div>
          )}
        </div>

        {paused && (
          <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-[#f3c9c9] bg-[#fff4f3] px-4 sm:px-5 py-4">
            <span className="w-10 h-10 rounded-xl bg-[#fde3e2] text-[#c8151d] flex items-center justify-center shrink-0"><CirclePause className="w-5 h-5" {...ICON} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#c8151d]">Delivery is paused at {branch.name}</p>
              <p className="text-sm text-[#5b4f4b] break-words">{branch.pausedMessage || 'Shoppers can still choose pickup.'}</p>
            </div>
            {canEdit && (
              <button type="button" onClick={() => setPaused(false)} className={cn(redBtn, 'h-11 px-4 shrink-0')}>
                <Play className="w-4 h-4" {...ICON} />Resume delivery
              </button>
            )}
          </div>
        )}
        {!branch.services.delivery && (
          <p className="mb-5 rounded-xl border border-[#eadfd6] bg-white px-4 py-3 text-sm text-[#5b4f4b]">Delivery service is off for {branch.name} (pickup only). Zones apply once it is turned on in Branches.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)] gap-5 items-start">
          {/* LEFT */}
          <div className="space-y-5 min-w-0">
            <section className={cardCls}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-5 py-4 border-b border-[#f0e8e2]">
                <h2 className="text-base font-semibold text-[#1d1716]">Delivery zones</h2>
                <span className="text-sm text-gray-500">{active.length} active{maxActiveKm ? ` · up to ${maxActiveKm} km` : ''}</span>
              </div>
              {zones.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-500">No delivery zones yet. Shoppers outside every zone are offered pickup.</p>
              ) : (
                <ul className="divide-y divide-[#f0e8e2]">
                  {zones.map((z) => {
                    const on = z.id === selected?.id;
                    const st = zoneStats.get(z.id);
                    return (
                      <li key={z.id} onClick={() => setSelId(z.id)}
                        className={cn('flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5 py-4 border-l-[3px] cursor-pointer transition-colors',
                          on ? 'bg-[#fdf1f0] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#faf6f2]')}>
                        <div className="flex items-start gap-3 flex-1 min-w-[min(100%,16rem)]">
                          <span className={cn('mt-1 w-4 h-4 rounded-full border-[3px] shrink-0', z.active ? 'border-[#c8151d]' : 'border-gray-300')} aria-hidden />
                          <div className="min-w-0">
                            <p className={cn('font-bold break-words', z.active ? 'text-[#1d1716]' : 'text-gray-500')}>
                              {z.name}
                              <span className="ml-2 inline-block align-middle rounded-md bg-[#f1ebe6] px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{rangeText(z)}</span>
                            </p>
                            <p className="mt-0.5 text-[13px] text-gray-500 break-words">
                              {feeSummary(z)} · min {pesoShort(z.minOrder)}{z.freeAbove ? ` · free above ${pesoShort(z.freeAbove)}` : ''} · ETA {z.etaMins} min
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-auto">
                          <div className="text-right">
                            <p className="font-bold text-[#1d1716] tabular-nums whitespace-nowrap">{st?.count ?? 0} {st?.count === 1 ? 'order' : 'orders'}</p>
                            <p className="text-xs text-gray-500 whitespace-nowrap">today{st ? ` · avg fee ${pesoShort(st.fees / st.count)}` : ''}</p>
                          </div>
                          <span onClick={(e) => e.stopPropagation()}>
                            <GreenToggle checked={z.active} disabled={!canEdit} label={`${z.name} active`} onChange={() => toggleZone(z)} />
                          </span>
                          {canEdit && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setSelId(z.id); setEdit({ ...z }); }} className={cn(outlineBtn, 'h-9 px-3')}>
                              <Pencil className="w-3.5 h-3.5" {...ICON} />Edit
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!hasOuter && zones.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3.5 border-t border-[#f0e8e2] bg-[#fbf7f3] rounded-b-2xl">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <Lightbulb className="w-4 h-4 mt-0.5 text-[#ae754d] shrink-0" {...ICON} />
                    <p className="text-[13px] text-[#5b4f4b]">One zone charges the same rule everywhere up to {maxKm} km. Add an outer ring to set a higher minimum or a longer ETA for far barangays.</p>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => setEdit(newZone())} className={cn(outlineBtn, 'h-9 px-3 shrink-0 self-start sm:self-auto')}>Add outer ring</button>
                  )}
                </div>
              )}
            </section>

            <section className={cn(cardCls, 'overflow-hidden')}>
              <MapView key={branch.id} center={[branch.lat, branch.lng]} zoom={12} markers={markers} circles={circles} frameClass="" className="h-[320px] lg:h-[480px]" />
            </section>
          </div>

          {/* RIGHT */}
          <div className="space-y-5 min-w-0">
            <section className={cn(cardCls, 'p-4 sm:p-5')}>
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#1d1716]"><Calculator className="w-4 h-4 text-[#c8151d]" {...ICON} />Fee calculator</h2>
              <div role="group" aria-label="Calculate by" className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-[#ebe4dd] p-1">
                {(['distance', 'customer'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={calcMode === m} onClick={() => setCalcMode(m)}
                    className={cn('h-9 rounded-md text-sm transition-colors', calcMode === m ? 'bg-white font-semibold text-[#c8151d] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
                    {m === 'distance' ? 'By distance' : 'Customer address'}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-4">
                {calcMode === 'distance' ? (
                  <>
                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <label htmlFor="calc-km" className="text-sm font-medium text-[#3d3432]">Distance from {branch.name}</label>
                        <span className="text-sm font-semibold text-[#1d1716] tabular-nums">{km} km</span>
                      </div>
                      <input id="calc-km" type="range" min={0} max={sliderMax} step={0.1} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full accent-[#c8151d] h-6" />
                    </div>
                    <label className="block">
                      <span className={labelCls}>Basket subtotal (₱)</span>
                      <input type="number" inputMode="decimal" min={0} className={inputCls} value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
                    </label>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block min-w-0">
                      <span className={labelCls}>Customer barangay</span>
                      <select className={cn(inputCls, 'pr-8')} value={pick?.name ?? ''} onChange={(e) => setBrgy(e.target.value)}>
                        {brgys.map((b) => <option key={b.name} value={b.name}>{b.name} · {b.d} km</option>)}
                      </select>
                    </label>
                    <label className="block min-w-0">
                      <span className={labelCls}>Basket subtotal (₱)</span>
                      <input type="number" inputMode="decimal" min={0} className={inputCls} value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
                    </label>
                  </div>
                )}

                <div className="rounded-xl border border-[#efe4da] bg-[#f7f1ec] p-4">
                  {fee.outside || !fee.zone ? (
                    <>
                      <p className="font-semibold text-[#c8151d]">Outside delivery zones</p>
                      <p className="mt-0.5 text-[13px] text-gray-500">{fee.distance} km from {branch.name}. Shoppers here are offered pickup instead.</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-[#3d3432]">Delivery fee</span>
                        <span className="text-3xl font-bold text-[#c8151d] tabular-nums leading-none" style={OSWALD}>{peso(fee.fee)}</span>
                      </div>
                      <p className="mt-2 text-[13px] text-gray-500 break-words">{fee.rule} · ETA {fee.zone.etaMins} min</p>
                      {fee.zone.freeAbove ? (
                        <div className="mt-3">
                          <div className="h-2 rounded-full bg-[#e6ddd5] overflow-hidden">
                            <div className="h-full rounded-full bg-[#1f6b3f] transition-[width]" style={{ width: `${Math.min(100, (sub / fee.zone.freeAbove) * 100)}%` }} />
                          </div>
                          <p className="mt-1.5 text-[13px] font-medium text-[#1f6b3f]">
                            {sub >= fee.zone.freeAbove ? 'Free delivery applies' : `${pesoShort(fee.zone.freeAbove - sub)} more for free delivery`}
                          </p>
                        </div>
                      ) : null}
                      {sub < fee.zone.minOrder && <p className="mt-1.5 text-[13px] font-medium text-[#c8151d]">Below the {pesoShort(fee.zone.minOrder)} minimum</p>}
                    </>
                  )}
                </div>
              </div>
            </section>

            <SlotsCard s={s} branch={branch} now={now} canEdit={canEdit} />
          </div>
        </div>
      </div>

      {edit && <ZoneSheet key={edit.id || `new-${fromOf(edit)}`} zone={edit} zones={zones} onClose={() => setEdit(undefined)} />}
      <PauseDialog open={pauseOpen} initial={branch.pausedMessage ?? ''} onClose={() => setPauseOpen(false)} onConfirm={(msg) => { setPaused(true, msg); setPauseOpen(false); }} />
    </DashboardLayout>
  );
}

function SlotsCard({ s, branch, now, canEdit }: { s: AppState; branch: Branch; now: number; canEdit: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const cap = slotCapacity(s, branch.id);
  const date = new Date(now);
  const { open, close } = branchOpenHours(branch);
  const start = Math.max(8, open);
  const end = close > start ? close : 20;
  const slots = Array.from({ length: end - start }, (_, i) => slotInfo(s, branch.id, start + i, date));
  const nowHour = date.getHours();

  // Start the list at the current slot.
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>('[data-now="true"]');
    if (box && row) box.scrollTop = Math.max(0, row.offsetTop - 8);
  }, [nowHour]);

  const setCap = (v: number) => {
    if (v < 1) return;
    mutate((d) => {
      let st = d.settings.find((x) => x.key === 'slotCapacity');
      if (!st) {
        st = { key: 'slotCapacity', label: 'Orders per delivery slot', group: 'Fulfillment', type: 'number', unit: 'orders', global: 8, city: {}, branch: {} };
        d.settings.push(st);
      }
      st.branch[branch.id] = v;
      addAudit(d, { module: 'Settings', action: 'Slot capacity changed', branchId: branch.id, detail: branch.name, oldValue: String(cap), newValue: String(v) });
    });
  };

  const toggleSlot = (hour: number, closed: boolean) => {
    const key = slotKey(branch.id, date, hour);
    const label = `${fmtHour(hour)}–${fmtHour(hour + 1)}`;
    mutate((d) => {
      const cur = d.closedSlots ?? [];
      d.closedSlots = closed ? cur.filter((k) => k !== key) : [...cur, key];
      addAudit(d, { module: 'Settings', action: closed ? 'Delivery slot reopened' : 'Delivery slot closed', branchId: branch.id, detail: `${branch.name} · today ${label}` });
    });
    toast.success(closed ? `${label} reopened` : `${label} closed`, { description: closed ? undefined : 'Shoppers can no longer book this slot today.' });
  };

  const sqBtn = 'w-8 h-8 rounded-lg border border-[#e3d6cc] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#1d1716]"><Clock className="w-4 h-4 text-[#c8151d]" {...ICON} />Today&apos;s slots</h2>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Fewer orders per slot" disabled={!canEdit || cap <= 1} onClick={() => setCap(cap - 1)} className={sqBtn}><Minus className="w-4 h-4" {...ICON} /></button>
          <span className="text-sm font-medium text-[#3d3432] tabular-nums whitespace-nowrap">{cap} per slot</span>
          <button type="button" aria-label="More orders per slot" disabled={!canEdit} onClick={() => setCap(cap + 1)} className={sqBtn}><Plus className="w-4 h-4" {...ICON} /></button>
        </div>
      </div>
      <div ref={list} className="relative max-h-[240px] overflow-y-auto border-y border-[#f0e8e2] divide-y divide-[#f5eee8]">
        {slots.length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No delivery slots in today&apos;s hours.</p>}
        {slots.map((sl) => {
          const label = `${fmtHour(sl.hour)}–${fmtHour(sl.hour + 1)}`;
          const pct = Math.min(100, (sl.booked / Math.max(1, sl.cap)) * 100);
          const tone = sl.closed ? 'closed' : sl.past ? 'past' : sl.full ? 'full' : sl.left <= 1 ? 'low' : 'ok';
          const bar = { closed: '', past: 'bg-[#c9c0b9]', full: 'bg-[#c8151d]', low: 'bg-[#e08a2e]', ok: 'bg-[#1f6b3f]' }[tone];
          const chip = {
            closed: ['Closed', 'bg-[#ece7e3] text-[#5b4f4b]'],
            past: ['Done', 'bg-[#ece7e3] text-[#7a6f6a]'],
            full: ['Full', 'bg-[#fde3e2] text-[#c8151d]'],
            low: [`${sl.left} left`, 'bg-[#fcebd8] text-[#b5651a]'],
            ok: [`${sl.left} left`, 'bg-[#e3f0e7] text-[#1f6b3f]'],
          }[tone];
          return (
            <button key={sl.hour} type="button" data-now={sl.now} disabled={!canEdit || sl.past} onClick={() => toggleSlot(sl.hour, sl.closed)}
              aria-label={`${label}: ${chip[0]}. ${sl.closed ? 'Reopen' : 'Close'} this slot`}
              className={cn('w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors enabled:hover:bg-[#faf6f2] disabled:cursor-default', sl.now && 'bg-[#fdf8f4]')}>
              <span className={cn('w-[8.5rem] shrink-0 text-sm tabular-nums whitespace-nowrap', sl.now ? 'font-bold text-[#1d1716]' : sl.past || sl.closed ? 'text-gray-400' : 'text-[#3d3432]')}>
                {label}{sl.now ? ' · now' : ''}
              </span>
              <span className="flex-1 min-w-0 h-2 rounded-full bg-[#efe8e2] overflow-hidden">
                {sl.closed
                  ? <span className="block h-full w-full" style={{ backgroundImage: 'repeating-linear-gradient(135deg, #cfc6bf 0 4px, transparent 4px 8px)' }} />
                  : <span className={cn('block h-full rounded-full', bar)} style={{ width: `${pct}%` }} />}
              </span>
              <span className={cn('w-14 shrink-0 text-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', chip[1])}>{chip[0]}</span>
            </button>
          );
        })}
      </div>
      <p className="px-4 sm:px-5 py-3 text-xs text-gray-500">Tap a slot to close or reopen it. Applies to all zones.</p>
    </section>
  );
}

function ZoneSheet({ zone, zones, onClose }: { zone: DeliveryZone; zones: DeliveryZone[]; onClose: () => void }) {
  const isNew = !zone.id;
  const [f, setF] = useState({
    name: zone.name,
    from: String(fromOf(zone)),
    to: String(zone.radiusKm),
    base: String(zone.baseFee),
    perKm: String(zone.perKm),
    min: String(zone.minOrder),
    free: String(zone.freeAbove ?? 0),
    eta: String(zone.etaMins),
  });
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const n = { from: Number(f.from), to: Number(f.to), base: Number(f.base), perKm: Number(f.perKm), min: Number(f.min), free: Number(f.free), eta: Number(f.eta) };
  const bad = (Object.keys(n) as (keyof typeof n)[]).filter((k) => f[k] === '' || !Number.isFinite(n[k]) || n[k] < 0);
  const rangeErr = !bad.includes('from') && !bad.includes('to') && n.to <= n.from ? 'To must be more than From.' : '';
  const clash = !rangeErr && !bad.includes('from') && !bad.includes('to') ? overlapping(zones, zone.id, n.from, n.to) : undefined;
  const errors = [
    tried && !f.name.trim() ? 'Enter a zone name.' : '',
    bad.length ? 'Fill in every number (0 or more).' : '',
    rangeErr,
    clash ? `Overlaps ${clash.name} (${rangeText(clash)}). Change the km range or turn that zone off.` : '',
  ].filter(Boolean);
  const ok = f.name.trim() && !bad.length && !rangeErr && !clash;

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const preview = bad.includes('from') || bad.includes('to') || bad.includes('base') || bad.includes('perKm') || rangeErr ? [] : [n.from, r1((n.from + n.to) / 2), n.to];

  const save = () => {
    setTried(true);
    if (!ok) return;
    const next: DeliveryZone = {
      ...zone, name: f.name.trim(), type: zone.type ?? 'radius', feeModel: 'distance', fromKm: n.from, radiusKm: n.to,
      baseFee: n.base, perKm: n.perKm, minOrder: n.min, freeAbove: n.free || undefined, etaMins: n.eta,
    };
    const summary = (z: DeliveryZone) => `${rangeText(z)} · ${feeSummary(z)} · min ${pesoShort(z.minOrder)}${z.freeAbove ? ` · free above ${pesoShort(z.freeAbove)}` : ''} · ETA ${z.etaMins} min`;
    mutate((d) => {
      const b = d.branches.find((x) => x.id === zone.branchId);
      if (isNew) {
        next.id = uid('z');
        d.zones.push(next);
        addAudit(d, { module: 'Settings', action: 'Delivery zone added', branchId: zone.branchId, detail: `${b?.name}: ${next.name}`, newValue: summary(next) });
      } else {
        const i = d.zones.findIndex((x) => x.id === zone.id);
        if (i < 0) return;
        const old = d.zones[i];
        d.zones[i] = next;
        addAudit(d, { module: 'Settings', action: 'Delivery zone updated', branchId: zone.branchId, detail: `${b?.name}: ${next.name}`, oldValue: summary(old), newValue: summary(next) });
      }
    });
    toast.success(isNew ? `${next.name} added` : `${next.name} saved`, { description: 'New fees apply to the next checkout in the Customer App and Order Desk.' });
    onClose();
  };

  const num = (k: keyof typeof f, label: string, step = '1') => (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      <input type="number" inputMode="decimal" min={0} step={step} value={f[k]} onChange={set(k)}
        className={cn(inputCls, (bad.includes(k as keyof typeof n) || ((k === 'from' || k === 'to') && (rangeErr || clash))) && 'border-[#e7b4b6]')} />
    </label>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full max-w-full sm:max-w-[480px] bg-[#fffdfb] border-[#eadfd6] text-[#1d1716]">
        <div className="flex items-start gap-3 px-4 sm:px-5 pt-5 pb-4 border-b border-[#eadfd6] shrink-0">
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-2xl sm:text-3xl leading-none uppercase font-normal text-[#1d1716]" style={OSWALD}>{isNew ? 'New zone' : 'Edit zone'}</SheetTitle>
            <SheetDescription className="mt-1.5 text-[13px] text-[#6b5f5a]">Fee = base + per km × distance. The rule used is saved with each order.</SheetDescription>
          </div>
          <SheetClose className="w-11 h-11 rounded-lg border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
            <X className="w-5 h-5" {...ICON} />
          </SheetClose>
        </div>

        <form id="zone-form" className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="block">
            <span className={labelCls}>Zone name</span>
            <input value={f.name} onChange={set('name')} className={cn(inputCls, tried && !f.name.trim() && 'border-[#e7b4b6]')} />
          </label>
          <div className="grid grid-cols-2 gap-3">{num('from', 'From (km)', '0.1')}{num('to', 'To (km)', '0.1')}</div>
          <div className="grid grid-cols-2 gap-3">{num('base', 'Base fee (₱)')}{num('perKm', 'Per km (₱)')}</div>
          <div className="grid grid-cols-2 gap-3">{num('min', 'Minimum order (₱)')}{num('free', 'Free delivery above (₱)')}</div>
          {num('eta', 'Promised ETA (min)')}

          {errors.length > 0 && (
            <div className="space-y-1">{errors.map((e) => <p key={e} className="text-sm text-[#c8151d]">{e}</p>)}</div>
          )}

          <div className="rounded-xl border border-[#efe4da] bg-[#f7f1ec] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">Preview</p>
            {preview.length ? (
              <ul className="mt-2 space-y-1.5">
                {preview.map((d, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-[#5b4f4b]">At {d} km</span>
                    <span className="font-semibold text-[#1d1716] tabular-nums">{pesoShort(zoneDistanceFee({ baseFee: n.base, perKm: n.perKm }, d))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Enter a valid km range and fees to see example fees.</p>
            )}
          </div>
        </form>

        <div className="flex gap-2 px-4 sm:px-5 py-4 border-t border-[#eadfd6] shrink-0">
          <button type="button" onClick={onClose} className={cn(outlineBtn, 'h-11 px-5')}>Cancel</button>
          <button type="submit" form="zone-form" className={cn(redBtn, 'h-11 flex-1')}>Save zone</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PauseDialog({ open, initial, onClose, onConfirm }: { open: boolean; initial: string; onClose: () => void; onConfirm: (msg: string) => void }) {
  const [msg, setMsg] = useState(initial);
  const [wasOpen, setWasOpen] = useState(open);
  // Start from the saved message each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMsg(initial);
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[560px] w-[calc(100%-1.5rem)] p-0 gap-0 bg-[#fffdfb] border border-[#eadfd6] rounded-2xl">
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="w-10 h-10 rounded-xl bg-[#fde3e2] text-[#c8151d] flex items-center justify-center shrink-0"><CirclePause className="w-5 h-5" {...ICON} /></span>
          <div className="flex-1 min-w-0 pt-0.5">
            <DialogTitle className="text-lg font-bold text-[#1d1716]">Pause delivery</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[#5b4f4b]">For rider shortages, storms or system issues. Pickup stays open, and shoppers see your message at checkout.</DialogDescription>
          </div>
          <DialogClose className="w-11 h-11 rounded-lg border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
            <X className="w-5 h-5" {...ICON} />
          </DialogClose>
        </div>
        <div className="px-5 pt-4 pb-5">
          <div className="flex flex-wrap gap-2">
            {PAUSE_REASONS.map((r) => (
              <button key={r.label} type="button" onClick={() => setMsg(r.msg)}
                className={cn('h-9 px-3 rounded-lg border text-sm font-medium transition-colors',
                  msg === r.msg ? 'border-[#c8151d] bg-[#fdf1f0] text-[#c8151d]' : 'border-[#e3d6cc] bg-white text-[#3d3432] hover:bg-[#faf6f2]')}>
                {r.label}
              </button>
            ))}
          </div>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} aria-label="Message for shoppers"
            placeholder="e.g. Delivery is paused due to heavy rain. Pickup is available."
            className="mt-3 w-full rounded-lg border border-[#e3d6cc] bg-white px-3 py-2.5 text-[15px] text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
          <button type="button" disabled={!msg.trim()} onClick={() => onConfirm(msg.trim())} className={cn(redBtn, 'mt-4 w-full h-11')}>
            <CirclePause className="w-4 h-4" {...ICON} />Pause delivery now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
