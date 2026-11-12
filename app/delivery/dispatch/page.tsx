'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bike, Clock, Navigation, PackageCheck, Repeat, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, StatCard } from '@/src/components/common';
import { MapView, type MapMarker } from '@/src/components/MapView';
import { Button } from '@/src/components/ui/shadcn/button';
import { addAudit, currentUserName, getState, mutate, useStore, useTick } from '@/src/lib/store';
import { assignRider, branchName, can, cityName, getSetting, pesoShort, riderPosition } from '@/src/lib/logic';
import type { Order } from '@/src/lib/types';
import { AssignRiderDialog } from '@/src/components/delivery/AssignRiderDialog';
import { RIDER_TYPE_LABEL, liveRiderPos, minsSince, orderDistance, rankCandidates, workload } from '@/src/components/delivery/helpers';

const LATE_MINS = 40;

function readyAt(o: Order) {
  return [...o.timeline].reverse().find((e) => e.status === 'ready')?.at ?? o.updatedAt;
}

export default function DispatchPage() {
  const s = useStore();
  useTick(1000);
  const [assignFor, setAssignFor] = useState<Order | undefined>();

  if (!can(s, 'riders.view')) {
    return <DashboardLayout title="Dispatch Map" eyebrow="Delivery"><AccessDenied permission="riders.view" /></DashboardLayout>;
  }

  const branch = s.branches.find((b) => b.id === s.session.branchId) ?? s.branches[0];
  const cityBranches = s.branches.filter((b) => b.cityId === branch.cityId);
  const cityBranchIds = cityBranches.map((b) => b.id);
  const rule = String(getSetting(s, 'dispatchRule', branch.id));

  const waiting = s.orders.filter((o) => o.fulfillment === 'delivery' && o.status === 'ready' && !o.riderId && cityBranchIds.includes(o.branchId));
  const assignedNotPicked = s.orders.filter((o) => o.fulfillment === 'delivery' && o.status === 'ready' && o.riderId && cityBranchIds.includes(o.branchId));
  const onRoad = s.orders.filter((o) => o.status === 'out_for_delivery' && cityBranchIds.includes(o.branchId));
  const riders = s.riders.filter((r) => r.type !== 'courier' && r.branchIds.some((id) => cityBranchIds.includes(id)));
  const online = riders.filter((r) => r.status === 'online');
  const late = onRoad.filter((o) => minsSince(o.outForDeliveryAt) > LATE_MINS);

  const markers: MapMarker[] = [
    ...cityBranches.map((b) => ({ id: b.id, lat: b.lat, lng: b.lng, label: '🏪', color: '#dc2626', title: `${b.name} branch` })),
    ...[...waiting, ...assignedNotPicked, ...onRoad].filter((o) => o.address).map((o) => ({
      id: `d-${o.id}`, lat: o.address!.lat, lng: o.address!.lng, label: '📍', color: o.riderId ? '#7c3aed' : '#f59e0b',
      title: `${o.number} · ${o.customerName} · ${o.address!.line}`,
    })),
    ...online.map((r) => {
      const p = liveRiderPos(s, r);
      return { id: r.id, lat: p.lat, lng: p.lng, label: '🛵', color: p.onJob ? '#1e40af' : '#16a34a', pulse: p.onJob, title: `${r.name} · ${p.onJob ? `On job${p.order ? ` ${p.order.number}` : ''}` : 'Available'}` };
    }),
  ];
  const lines = onRoad.filter((o) => o.address).map((o) => {
    const p = riderPosition(s, o);
    return { points: [[p.lat, p.lng], [o.address!.lat, o.address!.lng]] as [number, number][], color: '#1e40af', dashed: true };
  });

  const autoDispatch = () => {
    if (rule === 'Manual only') { toast.error('Auto-dispatch is off', { description: 'The dispatch rule is set to "Manual only" in Settings → Riders.' }); return; }
    let n = 0;
    for (const o of waiting) {
      const st = getState();
      const fresh = st.orders.find((x) => x.id === o.id);
      if (!fresh || fresh.riderId) continue;
      const top = rankCandidates(st, fresh).list[0];
      if (!top) continue;
      assignRider(o.id, top.rider.id, `Auto-dispatch (${rule})`);
      mutate((d) => addAudit(d, { module: 'Riders', action: 'Auto-dispatch', branchId: o.branchId, detail: `${o.number} → ${top.rider.name} by rule "${rule}"` }));
      n++;
    }
    if (n) toast.success(`Auto-dispatched ${n} order${n === 1 ? '' : 's'}`, { description: `Rule: ${rule}` });
    else toast.info('Nothing to dispatch', { description: 'No waiting orders, or no available riders.' });
  };

  const alertLate = (o: Order) => {
    mutate((d) => {
      addAudit(d, { module: 'Riders', action: 'Delay alert sent', branchId: o.branchId, detail: `${o.number} — ${minsSince(o.outForDeliveryAt)} min on the road` });
      d.orders.find((x) => x.id === o.id)?.timeline.push({ status: 'note', at: new Date().toISOString(), by: currentUserName(d), note: 'Dispatcher contacted rider about delay; shopper notified' });
    });
    toast.success(`Delay follow-up logged for ${o.number}`);
  };

  return (
    <DashboardLayout title="Dispatch Map" eyebrow="Delivery">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Riders online" value={online.length} sub={`${riders.length} riders in ${cityName(s, branch.cityId)}`} icon={<Bike className="w-5 h-5" strokeWidth={1.75} />} />
        <StatCard title="On a job" value={online.filter((r) => workload(s, r.id) > 0).length} sub="Pulsing on the map" accent="border-l-indigo-500" icon={<Navigation className="w-5 h-5" strokeWidth={1.75} />} />
        <StatCard title="Waiting for rider" value={waiting.length} sub="Ready, not yet assigned" accent="border-l-amber-500" valueClass={waiting.length ? 'text-amber-600' : undefined} icon={<PackageCheck className="w-5 h-5" strokeWidth={1.75} />} />
        <StatCard title="Delayed" value={late.length} sub={`Out for delivery > ${LATE_MINS} min`} accent="border-l-[#dc2626]" valueClass={late.length ? 'text-[#dc2626]' : undefined} icon={<AlertTriangle className="w-5 h-5" strokeWidth={1.75} />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
        <Panel
          title={<div><h2 className="text-base font-semibold text-gray-900">Live map · {cityName(s, branch.cityId)}</h2><p className="text-xs text-gray-500">Positions refresh every second</p></div>}
          action={
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-600" /> Available</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#1e40af]" /> On job</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Waiting drop-off</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-600" /> Assigned drop-off</span>
            </div>
          }
          bodyClass="p-3"
        >
          <MapView key={branch.cityId} center={[branch.lat, branch.lng]} zoom={13} markers={markers} lines={lines} className="h-[560px]" />
        </Panel>

        <div className="space-y-6">
          <Panel
            title={<div><h2 className="text-base font-semibold text-gray-900">Waiting for rider</h2><p className="text-xs text-gray-500">Rule: {rule}</p></div>}
            action={<Button size="sm" onClick={autoDispatch} disabled={!waiting.length}><Zap className="w-3.5 h-3.5" /> Auto-dispatch</Button>}
            bodyClass="p-0"
          >
            {waiting.length === 0 ? (
              <EmptyState title="No orders waiting" sub="Ready delivery orders appear here" icon={<PackageCheck className="w-8 h-8" />} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {waiting.map((o) => {
                  const wait = minsSince(readyAt(o));
                  return (
                    <li key={o.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          <Link href={`/orders/${o.id}`} className="hover:underline">{o.number}</Link>
                          <span className="font-normal text-gray-500"> · {branchName(s, o.branchId)}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">{o.customerName} · {o.address?.line} · {orderDistance(s, o)} km</p>
                        <p className={`text-xs mt-0.5 ${wait > 10 ? 'text-[#dc2626] font-medium' : 'text-gray-400'}`}>
                          <Clock className="w-3 h-3 inline -mt-0.5" /> Waiting {wait} min · {pesoShort(o.total)}{o.paymentMethod === 'cod' ? ' COD' : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setAssignFor(o)}>Assign</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {assignedNotPicked.length > 0 && (
            <Panel title="Assigned · awaiting pickup" bodyClass="p-0">
              <ul className="divide-y divide-gray-100">
                {assignedNotPicked.map((o) => (
                  <li key={o.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{o.number} <span className="font-normal text-gray-500">· {s.riders.find((r) => r.id === o.riderId)?.name}</span></p>
                      <p className="text-xs text-gray-500 truncate">{branchName(s, o.branchId)} → {o.address?.line}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setAssignFor(o)}><Repeat className="w-3.5 h-3.5" /> Reassign</Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="On the road" bodyClass="p-0">
            {onRoad.length === 0 ? (
              <EmptyState title="No active deliveries" icon={<Navigation className="w-8 h-8" />} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {onRoad.map((o) => {
                  const r = s.riders.find((x) => x.id === o.riderId);
                  const p = riderPosition(s, o);
                  const mins = minsSince(o.outForDeliveryAt);
                  const isLate = mins > LATE_MINS;
                  return (
                    <li key={o.id} className={`px-5 py-3 ${isLate ? 'bg-red-50/60' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {o.number} <span className="font-normal text-gray-500">· {r?.name ?? 'Unassigned'}</span>
                            {r && <Pill className="ml-1.5 bg-gray-100">{RIDER_TYPE_LABEL[r.type]}</Pill>}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{o.customerName} · {o.address?.line}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-[#1e40af]">ETA {p.etaMins} min</p>
                          <p className="text-[11px] text-gray-400">{mins} min out</p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full ${isLate ? 'bg-[#dc2626]' : 'bg-[#1e40af]'} transition-all`} style={{ width: `${Math.round(p.progress * 100)}%` }} />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {isLate && (
                          <span className="text-xs text-[#dc2626] font-medium flex items-center gap-1 mr-auto"><AlertTriangle className="w-3.5 h-3.5" /> Delayed — past {LATE_MINS} min target</span>
                        )}
                        <div className="ml-auto flex gap-1">
                          {isLate && <Button size="sm" variant="outline" onClick={() => alertLate(o)}>Follow up</Button>}
                          <Button size="sm" variant="ghost" onClick={() => setAssignFor(o)}><Repeat className="w-3.5 h-3.5" /> Reassign</Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Riders" bodyClass="p-0">
            <ul className="divide-y divide-gray-100">
              {riders.map((r) => {
                const load = workload(s, r.id);
                return (
                  <li key={r.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${r.status !== 'online' ? 'bg-gray-300' : load ? 'bg-[#1e40af]' : 'bg-green-600'}`} />
                    <span className="flex-1 font-medium text-gray-800 truncate">{r.name}</span>
                    <span className="text-xs text-gray-500">{r.status !== 'online' ? r.status : load ? `${load} job${load > 1 ? 's' : ''}` : 'Available'}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <AssignRiderDialog order={assignFor} open={!!assignFor} onOpenChange={(v) => !v && setAssignFor(undefined)} />
    </DashboardLayout>
  );
}
