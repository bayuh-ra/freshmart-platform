'use client';

import { useState } from 'react';
import { useStore } from '@/src/lib/store';
import { fmtTime, isToday, peso, pesoShort } from '@/src/lib/logic';
import { orderDistance, tipFor, tripEarnings } from '@/src/components/delivery/helpers';
import { heldCod } from '@/app/delivery/riders/_own';
import { areaOf, payFor, tripsOn } from './flow';
import { useRider } from './RiderShell';
import { HEADING, PageTitle, card } from './ui';
import { cn } from '@/src/lib/utils';

const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function RiderEarnings() {
  const s = useStore();
  const { rider: r, clock } = useRider();
  const now = clock.now;
  const [pick, setPick] = useState(6); // 0..6 = the last 7 days, 6 = today

  // The last 7 days, all from delivered orders (same pay rule as every trip row).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const trips = tripsOn(s, r, d);
    return { date: d, trips, pay: payFor(s, r, trips) };
  });
  const today = days[6];
  const sel = days[pick];
  const week = days.reduce((t, d) => t + d.pay.total, 0);
  const maxAmt = Math.max(...days.map((d) => d.pay.total), 1);
  const first = days[0].date;
  const sameMonth = first.getMonth() === today.date.getMonth();
  const weekRange = `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${today.date.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;

  // COD: the orders behind the cash held (same rule as the staff Riders page), newest first.
  const held = heldCod(s, r, now).orders.slice().reverse();
  const remittedToday = (s.remittances ?? []).filter((x) => (x.riderId === r.id || x.riderName === r.name) && isToday(x.at)).reduce((t, x) => t + x.amount, 0);

  return (
    <div className="space-y-5">
      <PageTitle>Earnings</PageTitle>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          {/* Today */}
          <section aria-label="Today’s earnings" className="rounded-xl bg-[#2a2322] p-5 text-white sm:p-6">
            <p className="text-sm text-stone-300 sm:text-[15px]">Today · {dayLabel(today.date)}</p>
            <p className="mt-1 text-5xl font-bold leading-none sm:text-6xl" style={HEADING}>{peso(today.pay.total)}</p>
            <p className="mt-2 text-sm text-stone-300 sm:text-[15px]">
              {today.pay.trips} trip{today.pay.trips === 1 ? '' : 's'} · {pesoShort(today.pay.tips)} tips · ★ {r.rating ? r.rating.toFixed(1) : '—'} rating
            </p>
            <dl className="mt-4 divide-y divide-white/10 border-y border-white/10 text-sm sm:text-[15px]">
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-stone-200">Base pay · {today.pay.trips} × {pesoShort(today.pay.baseRate)}</dt><dd className="font-semibold">{pesoShort(today.pay.base)}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-stone-200">Distance · {today.pay.km} km × {pesoShort(today.pay.perKm)}</dt><dd className="font-semibold">{pesoShort(today.pay.distance)}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-stone-200">Tips</dt><dd className="font-semibold">{pesoShort(today.pay.tips)}</dd></div>
            </dl>
          </section>

          {/* This week */}
          <section aria-label="This week" className={cn(card, 'p-4 sm:p-5')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[#2a2322] sm:text-[17px]">This week · {weekRange}</p>
                <p className="text-sm text-stone-600">Tap a day to see its trips</p>
              </div>
              <p className="text-3xl font-bold leading-none text-[#2a2322] sm:text-4xl" style={HEADING}>{pesoShort(week)}</p>
            </div>
            <div className="mt-4 grid h-48 grid-cols-7 items-end gap-1.5 sm:gap-2">
              {days.map((d, i) => {
                const isTodayBar = i === 6;
                const on = i === pick;
                return (
                  <button key={i} type="button" onClick={() => setPick(i)} aria-pressed={on}
                    aria-label={`${d.date.toLocaleDateString('en-US', { weekday: 'long' })}: ${pesoShort(d.pay.total)}, ${d.pay.trips} trips`}
                    className="group flex h-full min-w-0 flex-col items-center justify-end gap-1 rounded-md focus-visible:outline-2 focus-visible:outline-[#c8151d]">
                    <span className={cn('text-[10px] font-semibold sm:text-xs', on ? 'text-[#2a2322]' : 'text-stone-500')}>{pesoShort(d.pay.total)}</span>
                    <span className={cn('w-full rounded-t-md transition-colors',
                      isTodayBar ? 'bg-[#c8151d]' : on ? 'bg-[#c9a98c]' : 'bg-[#e5d6c8] group-hover:bg-[#d8c3b0]')}
                      style={{ height: `${Math.max(4, (d.pay.total / maxAmt) * 128)}px` }} />
                    <span className={cn('text-xs sm:text-sm', on ? 'font-semibold text-[#2a2322]' : 'text-stone-600')}>{d.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* COD cash */}
          <section aria-label="COD cash" className={cn(card, 'overflow-hidden')}>
            <div className="grid grid-cols-2 divide-x divide-[#eadfd6]">
              <div className="p-4 sm:px-5">
                <p className="text-sm text-stone-600">COD cash held</p>
                <p className={cn('mt-0.5 text-3xl font-bold leading-tight sm:text-4xl', r.codHeld > 0 ? 'text-[#ae754d]' : 'text-[#2a2322]')} style={HEADING}>{pesoShort(r.codHeld)}</p>
              </div>
              <div className="p-4 sm:px-5">
                <p className="text-sm text-stone-600">Remitted today</p>
                <p className="mt-0.5 text-3xl font-bold leading-tight text-[#2a2322] sm:text-4xl" style={HEADING}>{pesoShort(remittedToday)}</p>
              </div>
            </div>
            {held.length > 0 && (
              <ul className="divide-y divide-[#eadfd6] border-t border-[#eadfd6]">
                {held.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5 sm:text-[15px]">
                    <span className="min-w-0 truncate"><span className="text-[#2a2322]">{o.number}</span><span className="text-stone-500"> · {fmtTime(o.completedAt ?? o.updatedAt)}</span></span>
                    <span className="shrink-0 font-semibold">{pesoShort(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-[#eadfd6] bg-[#f8f3ee] px-4 py-3 text-sm text-stone-600 sm:px-5">
              {r.codHeld > 0 ? 'Hand this cash to the branch cashier before you end your shift.' : 'No cash on hand — nothing to remit.'}
            </p>
          </section>
        </div>

        {/* Trips of the selected day */}
        <section aria-label="Trips" className={cn(card, 'overflow-hidden')}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[#eadfd6] px-4 py-4 sm:px-5">
            <h2 className="text-lg font-semibold text-[#2a2322] sm:text-xl">{pick === 6 ? `Today · ${dayLabel(sel.date)}` : dayLabel(sel.date)}</h2>
            <p className="text-sm text-stone-600 sm:text-[15px]">{sel.pay.trips} trip{sel.pay.trips === 1 ? '' : 's'} · {pesoShort(sel.pay.total)}</p>
          </div>
          {sel.trips.length === 0 ? <p className="px-4 py-8 text-center text-sm text-stone-500">No trips on this day.</p> : (
            <ul className="divide-y divide-[#eadfd6]">
              {sel.trips.map((o) => {
                const tip = tipFor(o);
                const meta = [o.number, `${orderDistance(s, o)} km`, o.paymentMethod === 'cod' ? `COD ${pesoShort(o.total)}` : '', o.rating?.rider ? `★${o.rating.rider}` : ''].filter(Boolean).join(' · ');
                return (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-3.5 sm:gap-5 sm:px-5">
                    <span className="w-16 shrink-0 text-sm text-stone-600 sm:w-20 sm:text-[15px]">{fmtTime(o.completedAt ?? o.updatedAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#2a2322]">{areaOf(o)}</p>
                      <p className="truncate text-xs text-stone-600 sm:text-sm">{meta}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-[#2a2322]">{pesoShort(tripEarnings(s, o, r) + tip)}</p>
                      {tip > 0 && <p className="text-xs text-[#1f6b3f]">incl. {pesoShort(tip)} tip</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
