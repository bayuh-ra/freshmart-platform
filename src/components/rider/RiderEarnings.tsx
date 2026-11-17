'use client';

import { BadgeCheck, Banknote, Package, Star } from 'lucide-react';
import { useStore } from '@/src/lib/store';
import { fmtDate, fmtTime, isToday, peso, pesoShort } from '@/src/lib/logic';
import { orderDistance, tipFor, tripEarnings } from '@/src/components/delivery/helpers';
import { useRider } from './RiderShell';
import { HEADING, SectionTitle, card } from './ui';
import { cn } from '@/src/lib/utils';

export function RiderEarnings() {
  const s = useStore();
  const { rider: r } = useRider();
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
    <div className="space-y-5">
      <h1 className="text-2xl font-bold uppercase tracking-wide text-[#2a2322]" style={HEADING}>Earnings</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#2a2322] p-5 text-white shadow-sm">
            <p className="text-sm text-stone-300">Today’s earnings</p>
            <p className="mt-0.5 text-4xl font-bold" style={HEADING}>{peso(r.earningsToday)}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-200">
              <span>{r.tripsToday} trips</span>
              <span>Tips {pesoShort(tipsToday)}</span>
              <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#ae754d] text-[#ae754d]" /> {r.rating ? r.rating.toFixed(1) : '—'}</span>
            </div>
            <div className="mt-4 h-1 w-16 rounded-full bg-[#ec1b26]" />
          </div>

          <div className={cn(card, 'p-4')}>
            <div className="flex items-baseline justify-between"><p className="text-sm font-semibold text-stone-900">This week</p><p className="text-xl font-bold text-[#c8151d]" style={HEADING}>{pesoShort(week)}</p></div>
            <div className="mt-3 flex h-28 items-end gap-2">
              {days.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className={cn('w-full rounded-t-md', i === 6 ? 'bg-[#c8151d]' : 'bg-[#ae754d]/40')} style={{ height: `${(d.amt / maxAmt) * 84}px` }} title={pesoShort(d.amt)} />
                  <span className="text-xs text-stone-600">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={cn(card, 'p-4')}>
              <p className="flex items-center gap-1 text-xs text-stone-600"><Banknote className="h-4 w-4" /> COD held</p>
              <p className={cn('text-xl font-bold', r.codHeld ? 'text-amber-800' : 'text-stone-900')} style={HEADING}>{peso(r.codHeld)}</p>
              <p className="text-xs text-stone-500">Remit at the branch</p>
            </div>
            <div className={cn(card, 'p-4')}>
              <p className="flex items-center gap-1 text-xs text-stone-600"><BadgeCheck className="h-4 w-4" /> Remitted today</p>
              <p className="text-xl font-bold text-green-700" style={HEADING}>{peso(remittedAmt)}</p>
              <p className="text-xs text-stone-500">{remitted.length ? `Last ${fmtTime(remitted[0].at)}` : 'No remittance yet'}</p>
            </div>
          </div>
        </div>

        <div className={card}>
          <SectionTitle className="px-4 pb-2 pt-4">Trips</SectionTitle>
          {trips.length === 0 && <p className="px-4 pb-4 text-sm text-stone-500">No completed trips yet.</p>}
          <ul className="divide-y divide-stone-100">
            {trips.slice(0, 15).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700"><Package className="h-5 w-5" strokeWidth={1.75} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">{o.number} <span className="text-xs font-normal text-stone-500">· {orderDistance(s, o)} km</span></p>
                  <p className="text-xs text-stone-600">{fmtDate(o.completedAt ?? o.updatedAt)} {fmtTime(o.completedAt ?? o.updatedAt)}{o.paymentMethod === 'cod' ? ' · COD' : ''}{o.rating?.rider ? ` · ★${o.rating.rider}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-stone-900">{pesoShort(tripEarnings(s, o, r))}</p>
                  {tipFor(o) > 0 && <p className="text-xs text-green-700">+{pesoShort(tipFor(o))} tip</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
