'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck, Banknote, Bike, Briefcase, CloudCheck, FileText, LogOut, MapPin, Package, Power, Siren, Star, Store, Timer, User, Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { AppState, Order, Rider } from '@/src/lib/types';
import { useStore, useTick } from '@/src/lib/store';
import { branchName, fmtDate, fmtTime, getSetting, isToday, num, peso, pesoShort, playAlert } from '@/src/lib/logic';
import { Button } from '@/src/components/ui/shadcn/button';
import { RIDER_TYPE_LABEL, VEHICLE_LABEL, docState, orderDistance, tipFor, tripEarnings } from '@/src/components/delivery/helpers';
import { acceptOffer, activeJobs, availableJobs, claimJob, declineOffer, offers, sendSos, setOnline } from './flow';
import { ActiveJob } from './ActiveJob';

type Tab = 'jobs' | 'earnings' | 'profile';

export function RiderApp({ riderId }: { riderId: string }) {
  const s = useStore();
  useTick(1000);
  const [tab, setTab] = useState<Tab>('jobs');
  const [shiftStart, setShiftStart] = useState<number | null>(() => {
    const d = new Date(); d.setHours(7, 0, 0, 0); return d.getTime();
  });
  const seen = useRef<Record<string, number>>({});
  const r = s.riders.find((x) => x.id === riderId);

  const myOffers = r ? offers(s, r) : [];
  const offerKey = myOffers.map((o) => o.id).join(',');
  // New-offer alert + start the countdown when the rider first sees the offer.
  useEffect(() => {
    if (!r) return;
    let fresh = false;
    for (const o of myOffers) if (!seen.current[o.id]) { seen.current[o.id] = Date.now(); fresh = true; }
    if (fresh && r.status === 'online') { playAlert(); toast.info('New job offer', { description: 'Accept before the timer runs out.' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerKey, riderId]);

  if (!r) return <div className="p-6 text-sm text-gray-500">Rider not found.</div>;

  const online = r.status === 'online';
  const active = activeJobs(s, r);
  const max = num(getSetting(s, 'maxActiveOrders', r.branchIds[0])) || 2;
  const timeout = num(getSetting(s, 'offerTimeoutSecs', r.branchIds[0])) || 45;
  const [focusId, current] = [active[0]?.id, active[0]];

  // Auto-decline expired offers (cascade to the next rider via the dispatch queue).
  for (const o of myOffers) {
    const left = timeout - Math.floor((Date.now() - (seen.current[o.id] ?? Date.now())) / 1000);
    if (online && left <= 0 && seen.current[o.id] !== -1) {
      seen.current[o.id] = -1;
      setTimeout(() => { declineOffer(o, r, 'timed out'); toast.warning(`Offer ${o.number} expired`, { description: 'Sent back to dispatch for the next rider.' }); }, 0);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#f6f7fb]">
      {/* Status bar + header */}
      <div className="bg-[#1e40af] text-white pt-8 pb-3 px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center font-bold">{r.name.split(' ').map((p) => p[0]).join('')}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight truncate">{r.name}</p>
            <p className="text-[11px] text-blue-200 flex items-center gap-1"><Star className="w-3 h-3 fill-amber-300 text-amber-300" /> {r.rating ? r.rating.toFixed(1) : 'New'} · {RIDER_TYPE_LABEL[r.type]}</p>
          </div>
          <button title="SOS" onClick={() => { sendSos(r, current); toast.error('SOS sent to dispatcher', { description: 'Your location was shared. Stay safe — the branch will call you now.' }); }}
            className="h-9 px-3 rounded-full bg-[#dc2626] text-white text-xs font-bold flex items-center gap-1 shadow"><Siren className="w-4 h-4" /> SOS</button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button disabled={r.status === 'pending' || r.status === 'suspended'}
            onClick={() => {
              if (online && active.length) { toast.error('Finish your current job before going offline'); return; }
              setOnline(r, !online);
              if (!online && !shiftStart) setShiftStart(Date.now());
              toast.success(online ? 'You are offline' : 'You are online — waiting for jobs');
            }}
            className={`flex-1 h-10 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${online ? 'bg-green-500 text-white' : 'bg-white/15 text-white'}`}>
            <Power className="w-4 h-4" /> {online ? 'Online' : r.status === 'pending' ? 'Pending approval' : r.status === 'suspended' ? 'Suspended' : 'Go online'}
          </button>
          <span className="h-10 px-3 rounded-xl bg-white/10 text-[11px] flex items-center gap-1 whitespace-nowrap"><CloudCheck className="w-4 h-4 text-green-300" /> All actions synced</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'jobs' && (current
          ? <ActiveJob key={focusId} order={current} rider={r} />
          : <JobsScreen s={s} r={r} online={online} myOffers={myOffers} timeout={timeout} seen={seen.current} max={max} activeCount={active.length}
              shiftStart={shiftStart} onEndShift={() => { setShiftStart(null); setOnline(r, false); toast.success('Shift ended', { description: 'Remember to remit your COD cash at the branch.' }); }}
              onStartShift={() => { setShiftStart(Date.now()); if (!online) setOnline(r, true); toast.success('Shift started'); }} />)}
        {tab === 'earnings' && <EarningsScreen s={s} r={r} />}
        {tab === 'profile' && <ProfileScreen s={s} r={r} />}
      </div>

      {/* Bottom tabs */}
      <nav className="shrink-0 bg-white border-t border-gray-100 grid grid-cols-3 pb-3 pt-1.5">
        {([['jobs', 'Jobs', Briefcase], ['earnings', 'Earnings', Wallet], ['profile', 'Profile', User]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`relative flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${tab === k ? 'text-[#1e40af]' : 'text-gray-400'}`}>
            <Icon className="w-5 h-5" strokeWidth={1.75} />{l}
            {k === 'jobs' && (myOffers.length > 0 || active.length > 0) && <span className="absolute top-0 right-[34%] w-2 h-2 rounded-full bg-[#dc2626]" />}
          </button>
        ))}
      </nav>
    </div>
  );
}

function JobCard({ s, o, r, children }: { s: AppState; o: Order; r: Rider; children?: React.ReactNode }) {
  const items = o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock');
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">{o.number}</p>
        <p className="text-lg font-bold text-green-700">+{pesoShort(tripEarnings(s, o, r))}</p>
      </div>
      <div className="mt-1 space-y-1.5">
        <p className="text-sm flex items-start gap-2"><Store className="w-4 h-4 mt-0.5 text-[#dc2626] shrink-0" strokeWidth={1.75} /><span><b>Pickup</b> · FreshMart {branchName(s, o.branchId)}</span></p>
        <p className="text-sm flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 text-green-600 shrink-0" strokeWidth={1.75} /><span><b>Drop-off</b> · {o.address?.line.split(',').slice(-2).join(',').trim() ?? '—'}</span></p>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
        <span className="rounded-full bg-gray-100 px-2 py-0.5">{orderDistance(s, o)} km</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5">{items.length} items · {items.slice(0, 2).map((i) => i.name).join(', ')}{items.length > 2 ? '…' : ''}</span>
        {o.paymentMethod === 'cod' && o.paymentStatus === 'pending' ? <span className="rounded-full bg-red-50 text-[#dc2626] px-2 py-0.5 font-semibold">COD {pesoShort(o.total)}</span> : <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5">Prepaid</span>}
      </div>
      {children}
    </div>
  );
}

function JobsScreen({ s, r, online, myOffers, timeout, seen, max, activeCount, shiftStart, onStartShift, onEndShift }: {
  s: AppState; r: Rider; online: boolean; myOffers: Order[]; timeout: number; seen: Record<string, number>; max: number; activeCount: number;
  shiftStart: number | null; onStartShift: () => void; onEndShift: () => void;
}) {
  const avail = availableJobs(s, r);
  const shiftMins = shiftStart ? Math.floor((Date.now() - shiftStart) / 60000) : 0;
  const full = activeCount >= max;
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white border border-gray-100 p-2.5"><p className="text-[10px] text-gray-500">Shift</p><p className="text-sm font-bold text-gray-900">{shiftStart ? `${Math.floor(shiftMins / 60)}h ${shiftMins % 60}m` : 'Off'}</p></div>
        <div className="rounded-xl bg-white border border-gray-100 p-2.5"><p className="text-[10px] text-gray-500">Workload</p><p className="text-sm font-bold text-gray-900">{activeCount}/{max} jobs</p></div>
        <div className="rounded-xl bg-white border border-gray-100 p-2.5"><p className="text-[10px] text-gray-500">Today</p><p className="text-sm font-bold text-[#1e40af]">{pesoShort(r.earningsToday)}</p></div>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-3 py-2">
        <span className="text-xs text-gray-600 flex items-center gap-1.5"><Timer className="w-4 h-4 text-gray-400" />{shiftStart ? `Shift started ${fmtTime(new Date(shiftStart).toISOString())}` : 'No active shift'}</span>
        {shiftStart ? <button onClick={onEndShift} className="text-xs font-semibold text-[#dc2626]">End shift</button> : <button onClick={onStartShift} disabled={r.status === 'pending' || r.status === 'suspended'} className="text-xs font-semibold text-[#1e40af] disabled:opacity-40">Start shift</button>}
      </div>

      {r.status === 'pending' && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Your documents are under review. You can accept jobs once the branch approves your account.</div>}
      {r.status === 'suspended' && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-900">Your account is suspended. Please contact your branch dispatcher.</div>}

      {!online ? (
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-full bg-gray-100 mx-auto flex items-center justify-center"><Bike className="w-8 h-8 text-gray-400" strokeWidth={1.5} /></div>
          <p className="font-semibold text-gray-700 mt-3">You&apos;re offline</p>
          <p className="text-xs text-gray-500 mt-1">Go online to receive job offers from {r.branchIds.map((id) => branchName(s, id)).join(' & ')}.</p>
        </div>
      ) : (
        <>
          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Job offers {myOffers.length > 0 && <span className="ml-1 rounded-full bg-[#dc2626] text-white text-[10px] px-1.5 py-0.5">{myOffers.length}</span>}</h3>
            {myOffers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 py-6 text-center">
                <span className="relative inline-flex w-3 h-3"><span className="absolute inset-0 rounded-full bg-green-400 animate-ping" /><span className="relative w-3 h-3 rounded-full bg-green-500" /></span>
                <p className="text-xs text-gray-500 mt-2">Waiting for offers from dispatch…</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myOffers.map((o) => {
                  const st = seen[o.id];
                  const left = st === -1 ? 0 : Math.max(0, timeout - Math.floor((Date.now() - (st ?? Date.now())) / 1000));
                  return (
                    <JobCard key={o.id} s={s} o={o} r={r}>
                      <div className="mt-3 h-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-amber-500 transition-all" style={{ width: `${(left / timeout) * 100}%` }} /></div>
                      <div className="grid grid-cols-[1fr_2fr] gap-2 mt-2">
                        <Button variant="outline" className="h-10 rounded-xl" onClick={() => { declineOffer(o, r, 'declined'); toast('Offer declined', { description: 'Sent back to dispatch.' }); }}>Decline</Button>
                        <Button className="h-10 rounded-xl" onClick={() => { acceptOffer(o, r); toast.success(`Accepted ${o.number}`, { description: 'Head to the branch for pickup.' }); }}>Accept · {left}s</Button>
                      </div>
                    </JobCard>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Available jobs <span className="text-xs font-normal text-gray-500">· open to riders of your branches</span></h3>
            {avail.length === 0 ? <p className="text-xs text-gray-400 rounded-2xl bg-white border border-gray-100 p-4 text-center">No open jobs right now.</p> : (
              <div className="space-y-3">
                {avail.map((o) => (
                  <JobCard key={o.id} s={s} o={o} r={r}>
                    <Button className="w-full h-10 rounded-xl mt-3" disabled={full} onClick={() => { claimJob(o, r); toast.success(`Job ${o.number} is yours`, { description: 'Head to the branch for pickup.' }); }}>
                      {full ? `At max workload (${max})` : 'Accept job'}
                    </Button>
                  </JobCard>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function EarningsScreen({ s, r }: { s: AppState; r: Rider }) {
  const trips = s.orders.filter((o) => o.riderId === r.id && o.status === 'delivered').sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const todayTrips = trips.filter((o) => isToday(o.completedAt ?? o.updatedAt));
  const tipsToday = todayTrips.reduce((t, o) => t + tipFor(o), 0);
  // Last 7 days: real delivered orders, topped up to the rider's typical day for older days (demo history).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toDateString();
    const list = trips.filter((o) => new Date(o.completedAt ?? o.updatedAt).toDateString() === key);
    const real = list.reduce((t, o) => t + tripEarnings(s, o, r) + tipFor(o), 0);
    const isTodayDay = i === 6;
    const synth = ((r.id.charCodeAt(2) * 13 + i * 37) % 5 + 3) * 85;
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), amt: isTodayDay ? Math.max(r.earningsToday, real) : Math.max(real, r.status === 'pending' ? 0 : synth) };
  });
  const week = days.reduce((t, d) => t + d.amt, 0);
  const maxAmt = Math.max(...days.map((d) => d.amt), 1);
  const remitted = s.audit.filter((a) => a.action === 'COD remitted' && a.detail.startsWith(r.name) && isToday(a.at));
  const remittedAmt = remitted.reduce((t, a) => t + (Number((a.oldValue ?? '').replace(/[^\d.]/g, '')) || 0), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#1e40af] to-[#2563eb] text-white p-4">
        <p className="text-xs text-blue-200">Today&apos;s earnings</p>
        <p className="text-3xl font-bold mt-0.5">{peso(r.earningsToday)}</p>
        <div className="flex gap-4 mt-2 text-xs text-blue-100">
          <span>{r.tripsToday} trips</span><span>Tips {pesoShort(tipsToday)}</span><span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-300 text-amber-300" /> {r.rating ? r.rating.toFixed(1) : '—'}</span>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 p-4">
        <div className="flex justify-between items-baseline"><p className="text-sm font-semibold text-gray-900">This week</p><p className="text-lg font-bold text-[#1e40af]">{pesoShort(week)}</p></div>
        <div className="flex items-end gap-2 h-24 mt-3">
          {days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full rounded-t-md ${i === 6 ? 'bg-[#1e40af]' : 'bg-blue-200'}`} style={{ height: `${(d.amt / maxAmt) * 72}px` }} title={pesoShort(d.amt)} />
              <span className="text-[10px] text-gray-500">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white border border-gray-100 p-3">
          <p className="text-[11px] text-gray-500 flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> COD held</p>
          <p className={`text-lg font-bold ${r.codHeld ? 'text-[#dc2626]' : 'text-gray-900'}`}>{peso(r.codHeld)}</p>
          <p className="text-[10px] text-gray-400">Remit at the branch</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-100 p-3">
          <p className="text-[11px] text-gray-500 flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" /> Remitted today</p>
          <p className="text-lg font-bold text-green-700">{peso(remittedAmt)}</p>
          <p className="text-[10px] text-gray-400">{remitted.length ? `Last ${fmtTime(remitted[0].at)}` : 'No remittance yet'}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100">
        <p className="text-sm font-semibold text-gray-900 px-4 pt-3 pb-2">Trips</p>
        {trips.length === 0 && <p className="text-xs text-gray-400 px-4 pb-4">No completed trips yet.</p>}
        <ul className="divide-y divide-gray-50">
          {trips.slice(0, 15).map((o) => (
            <li key={o.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-green-700 flex items-center justify-center"><Package className="w-4 h-4" strokeWidth={1.75} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{o.number} <span className="text-xs text-gray-400 font-normal">· {orderDistance(s, o)} km</span></p>
                <p className="text-[11px] text-gray-500">{fmtDate(o.completedAt ?? o.updatedAt)} {fmtTime(o.completedAt ?? o.updatedAt)}{o.paymentMethod === 'cod' ? ' · COD' : ''}{o.rating?.rider ? ` · ★${o.rating.rider}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{pesoShort(tripEarnings(s, o, r))}</p>
                {tipFor(o) > 0 && <p className="text-[10px] text-green-700">+{pesoShort(tipFor(o))} tip</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ProfileScreen({ s, r }: { s: AppState; r: Rider }) {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-[#1e40af]/10 text-[#1e40af] flex items-center justify-center text-lg font-bold">{r.name.split(' ').map((p) => p[0]).join('')}</div>
        <div>
          <p className="font-semibold text-gray-900">{r.name}</p>
          <p className="text-xs text-gray-500">{r.phone} · {RIDER_TYPE_LABEL[r.type]}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {r.rating ? r.rating.toFixed(1) : 'New rider'}</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2 text-sm">
        <p className="font-semibold text-gray-900 flex items-center gap-2"><Bike className="w-4 h-4 text-gray-400" /> Vehicle</p>
        <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{VEHICLE_LABEL[r.vehicle]}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Plate</span><span className="font-mono">{r.plate}</span></div>
      </div>
      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2">
        <p className="font-semibold text-gray-900 text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Documents</p>
        {r.documents.length === 0 && <p className="text-xs text-gray-400">No documents on file.</p>}
        {r.documents.map((d) => {
          const st = docState(d);
          return (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <div><p>{d.name}</p><p className="text-[11px] text-gray-400">Expires {fmtDate(d.expires)}</p></div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
            </div>
          );
        })}
      </div>
      <div className="rounded-2xl bg-white border border-gray-100 p-4">
        <p className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-2"><Store className="w-4 h-4 text-gray-400" /> Branches</p>
        <div className="flex flex-wrap gap-1.5">
          {r.branchIds.map((id) => <span key={id} className="rounded-full bg-blue-50 text-[#1e40af] text-xs px-2.5 py-1">FreshMart {branchName(s, id)}</span>)}
        </div>
      </div>
      <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-[#dc2626] font-medium py-2"><LogOut className="w-4 h-4" /> Sign out</Link>
    </div>
  );
}
