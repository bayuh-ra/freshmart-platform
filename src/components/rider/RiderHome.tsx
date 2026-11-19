'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Banknote, BellRing, Bike, Clock, CloudCheck, Power, Snowflake, Timer } from 'lucide-react';
import { toast } from 'sonner';
import type { AppState, Order, Rider } from '@/src/lib/types';
import { useStore } from '@/src/lib/store';
import { branchName, fmtTime, peso, pesoShort } from '@/src/lib/logic';
import { orderDistance, tripEarnings } from '@/src/components/delivery/helpers';
import {
  acceptOffer, areaOf, availableJobs, claimJob, declineOffer, deliveryWindow, isCodDue, itemName, liveItems, maxMins, payFor, setOnline, stageOf, tripsOn,
} from './flow';
import { useRider } from './RiderShell';
import { Confirm, HEADING, PayPill, Segmented, SectionTitle, btn, card } from './ui';
import { cn } from '@/src/lib/utils';

const itemsLine = (o: Order) => {
  const items = liveItems(o);
  return `${items.length} item${items.length === 1 ? '' : 's'} · ${items.map(itemName).join(', ')}`;
};

/** Dispatch has assigned this job to the rider; it waits for Accept / Decline before the timer runs out. */
function OfferCard({ s, o, r, left, timeout }: { s: AppState; o: Order; r: Rider; left: number; timeout: number }) {
  const router = useRouter();
  const pay = tripEarnings(s, o, r);
  return (
    <section aria-label={`Job offer ${o.number}`} className="overflow-hidden rounded-xl border-2 border-[#2a2322] bg-[#fffdfb]">
      <div className="flex items-center gap-2.5 bg-[#2a2322] px-4 py-3 text-white sm:px-5">
        <BellRing className="h-5 w-5 shrink-0 fill-[#ff5a5f] text-[#ff5a5f]" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-[17px]">New job offer from dispatch</h2>
        <span className={cn('shrink-0 text-base font-bold tabular-nums', left <= 10 && 'text-[#ff5a5f]')} aria-live="polite">{left}s</span>
      </div>
      <div className="h-1 bg-[#eadfd6]" role="progressbar" aria-label="Time left to accept" aria-valuemin={0} aria-valuemax={timeout} aria-valuenow={left}>
        <div className="h-full bg-[#c8151d] transition-[width] duration-1000 ease-linear" style={{ width: `${(left / timeout) * 100}%` }} />
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-semibold text-[#2a2322] sm:text-[22px]">{areaOf(o)}</p>
            <p className="mt-0.5 text-sm text-stone-600 sm:text-[15px]">{o.number} · {orderDistance(s, o)} km from the branch</p>
          </div>
          <p className="shrink-0 text-4xl font-bold leading-none text-[#1f6b3f] sm:text-[44px]" style={HEADING}>+{pesoShort(pay)}</p>
        </div>
        <p className="mt-3 line-clamp-2 text-sm text-[#2a2322] sm:text-[15px]">{itemsLine(o)}</p>
        <div className="mt-3"><PayPill cod={isCodDue(o)} amount={pesoShort(o.total)} /></div>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
          <button type="button" className={btn.secondary} onClick={() => { declineOffer(o, r, 'declined'); toast('Offer declined', { description: 'Sent back to dispatch.' }); }}>Decline</button>
          <button type="button" className={btn.primary} onClick={() => {
            acceptOffer(o, r);
            toast.success(`Accepted ${o.number}`, { description: 'Head to the shop for pickup.' });
            router.push(`/rider/jobs/${o.id}`);
          }}>Accept · {pesoShort(pay)}</button>
        </div>
      </div>
    </section>
  );
}

function CurrentJobCard({ s, o, r, now }: { s: AppState; o: Order; r: Rider; now: number }) {
  const win = o.status === 'out_for_delivery' ? deliveryWindow(s, o, now) : undefined;
  const items = liveItems(o);
  const cod = isCodDue(o);
  const cta = o.status === 'failed_delivery' ? 'Return items' : o.status === 'ready' ? 'Continue to pickup' : 'Continue delivery';
  return (
    <article className={cn(card, 'overflow-hidden')}>
      <div className="flex items-center justify-between gap-2 bg-[#2a2322] px-4 py-3 text-white sm:px-5">
        <span className="text-sm font-bold uppercase tracking-[0.08em]">{stageOf(o)}</span>
        <span className="text-sm font-bold">{o.number}</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-xl font-semibold text-[#2a2322]">{o.customerName}</p>
          <p className="shrink-0 text-base font-bold text-[#1f6b3f]">+{pesoShort(tripEarnings(s, o, r))}</p>
        </div>
        <p className="mt-0.5 text-sm text-stone-600 sm:text-[15px]">To {areaOf(o)} · {orderDistance(s, o)} km · {items.length} item{items.length === 1 ? '' : 's'}</p>

        {win ? (
          <div className="mt-4">
            <div className={cn('flex items-center justify-between gap-2 text-sm font-semibold sm:text-[15px]', win.overdue ? 'text-red-700' : 'text-[#2c4f9e]')}>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Deliver by {fmtTime(win.due)}</span>
              <span>{win.overdue ? `${-win.minsLeft} min late` : `${win.minsLeft} min left`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eadfd6]">
              <div className={cn('h-full rounded-full', win.overdue ? 'bg-red-600' : 'bg-[#2c4f9e]')} style={{ width: `${win.overdue ? 100 : win.left * 100}%` }} />
            </div>
          </div>
        ) : o.status === 'ready' ? (
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-[#2c4f9e]">
            <Snowflake className="h-4 w-4" /> Pick up at Jovanne’s {branchName(s, o.branchId)} · deliver within {maxMins(s, o)} min of pickup
          </p>
        ) : null}

        {cod
          ? <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#fbf0e3] px-3 py-2.5 text-sm font-semibold text-[#8a4b1c] sm:text-[15px]"><Banknote className="h-4 w-4 shrink-0" /> Collect {pesoShort(o.total)} cash</p>
          : <p className="mt-4 flex items-center gap-2 rounded-lg bg-[#e3efe6] px-3 py-2.5 text-sm font-semibold text-[#1f6b3f] sm:text-[15px]"><Banknote className="h-4 w-4 shrink-0" /> Prepaid · no cash to collect</p>}

        <Link href={`/rider/jobs/${o.id}`} className={cn(btn.primary, 'mt-4 w-full text-[17px]')}>
          {cta} <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </article>
  );
}

function AvailableRow({ s, o, r, full, max }: { s: AppState; o: Order; r: Rider; full: boolean; max: number }) {
  const router = useRouter();
  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-[#2a2322]">{areaOf(o)} <span className="ml-1 text-sm font-normal text-stone-600">{orderDistance(s, o)} km</span></p>
        <p className="mt-1 truncate text-sm text-stone-600 sm:text-[15px]">{o.number} · {itemsLine(o)}</p>
        <div className="mt-2"><PayPill cod={isCodDue(o)} amount={pesoShort(o.total)} /></div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <p className="text-3xl font-bold leading-none text-[#1f6b3f]" style={HEADING}>+{pesoShort(tripEarnings(s, o, r))}</p>
        <button type="button" disabled={full} title={full ? `You already have ${max} jobs` : undefined}
          className={cn(btn.secondary, 'min-w-24 px-5 text-[15px]')}
          onClick={() => {
            claimJob(o, r);
            toast.success(`Job ${o.number} is yours`, { description: 'Head to the shop for pickup.' });
            router.push(`/rider/jobs/${o.id}`);
          }}>
          Accept
        </button>
      </div>
    </li>
  );
}

export function RiderHome() {
  const s = useStore();
  const { rider: r, online, active, myOffers, clock, timeout, max, shiftStart, startShift, endShift } = useRider();
  const [sort, setSort] = useState<'near' | 'pay'>('near');
  const [endOpen, setEndOpen] = useState(false);
  const now = clock.now;
  const avail = availableJobs(s, r).sort((a, b) => sort === 'near' ? orderDistance(s, a) - orderDistance(s, b) : tripEarnings(s, b, r) - tripEarnings(s, a, r));
  const shiftMins = shiftStart ? Math.max(0, Math.floor((now - shiftStart) / 60000)) : 0;
  const full = active.length >= max;
  const blocked = r.status === 'pending' || r.status === 'suspended';
  const today = payFor(s, r, tripsOn(s, r, new Date(now)));
  const allCold = avail.length > 0 && avail.every((o) => o.coldChain);
  const coldMins = avail[0] ? maxMins(s, avail[0]) : 60;

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Jobs</h1>

      {/* Shift status */}
      <section aria-label="Shift" className={cn(card, 'overflow-hidden')}>
        <div className="grid grid-cols-3 divide-x divide-[#eadfd6] border-b border-[#eadfd6]">
          <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-xs text-stone-600 sm:text-sm">Shift</p>
            <p className="mt-0.5 truncate text-2xl font-bold text-[#2a2322] sm:text-[32px]" style={HEADING}>{shiftStart ? `${Math.floor(shiftMins / 60)}h ${shiftMins % 60}m` : 'Off'}</p>
          </div>
          <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-xs text-stone-600 sm:text-sm">Jobs</p>
            <p className="mt-0.5 truncate text-2xl font-bold text-[#2a2322] sm:text-[32px]" style={HEADING}>{active.length} of {max}</p>
          </div>
          <div className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <p className="text-xs text-stone-600 sm:text-sm">Today</p>
            <p className="mt-0.5 truncate text-2xl font-bold text-[#2a2322] sm:text-[32px]" style={HEADING}>{pesoShort(today.total)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 sm:px-5">
          <span className="flex items-center gap-1.5 text-sm text-stone-600 sm:text-[15px]">
            <Timer className="h-4 w-4" />{shiftStart ? `Shift started ${fmtTime(new Date(shiftStart).toISOString())}` : 'No active shift'}
          </span>
          <span className="flex items-center gap-1.5 text-sm text-[#1f6b3f] sm:text-[15px]"><CloudCheck className="h-4 w-4" /> All actions synced</span>
          {shiftStart
            ? <button type="button" onClick={() => setEndOpen(true)} className="ml-auto min-h-11 rounded-lg px-1 text-[15px] font-semibold text-[#c8151d] hover:underline">End shift</button>
            : <button type="button" onClick={startShift} disabled={blocked} className="ml-auto min-h-11 rounded-lg px-1 text-[15px] font-semibold text-[#c8151d] hover:underline disabled:opacity-40">Start shift</button>}
        </div>
      </section>

      {r.status === 'pending' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your rider account is not active yet. Please ask the branch manager.</div>}
      {r.status === 'suspended' && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Your account is suspended. Please contact your branch dispatcher.</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {/* Left: offers from dispatch, then current jobs */}
        <div className="space-y-5">
          {online && myOffers.map((o) => {
            const st = clock.seen[o.id];
            const left = st === -1 ? 0 : st ? Math.max(0, timeout - Math.floor((now - st) / 1000)) : timeout;
            return <OfferCard key={o.id} s={s} o={o} r={r} left={left} timeout={timeout} />;
          })}

          {!online && (
            <section className={cn(card, 'px-4 py-8 text-center')}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#efe7df]"><Bike className="h-7 w-7 text-stone-600" strokeWidth={1.5} /></div>
              <p className="mt-3 text-xl font-bold uppercase text-[#2a2322]" style={HEADING}>You’re offline</p>
              <p className="mt-1 text-sm text-stone-600">Go online to get job offers from Jovanne’s {r.branchIds.map((id) => branchName(s, id)).join(' & ')}.</p>
              {!blocked && (
                <button type="button" className={cn(btn.primary, 'mt-4 w-full sm:w-auto sm:px-8')} onClick={() => {
                  if (!shiftStart) { startShift(); return; } // also goes online
                  setOnline(r, true);
                  toast.success('You are online — waiting for jobs');
                }}>
                  <Power className="h-5 w-5" /> Go online
                </button>
              )}
            </section>
          )}

          <section aria-labelledby="current-jobs" className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <SectionTitle><span id="current-jobs">Current jobs</span></SectionTitle>
              <span className="pb-1 text-sm text-stone-600 sm:text-[15px]">{active.length} of {max} jobs</span>
            </div>
            {active.length === 0 ? (
              <p className={cn(card, 'px-4 py-6 text-center text-sm text-stone-600')}>
                No current jobs. {online ? 'Accept an offer or an open job to start.' : 'Go online to start taking jobs.'}
              </p>
            ) : (
              <div className="space-y-4">
                {active.map((o) => <CurrentJobCard key={o.id} s={s} o={o} r={r} now={now} />)}
              </div>
            )}
          </section>
        </div>

        {/* Right: open jobs anyone at the branch can take */}
        <section aria-labelledby="available-jobs" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <SectionTitle><span id="available-jobs">Available jobs</span></SectionTitle>
              <p className="text-sm text-stone-600 sm:text-[15px]">
                {online ? `${avail.length} open${allCold ? ` · all cold chain, deliver within ${coldMins} min of pickup` : avail.length ? ` · deliver within ${coldMins} min of pickup` : ''}` : 'Go online to see open jobs'}
              </p>
            </div>
            {online && avail.length > 1 && (
              <Segmented label="Sort jobs" value={sort} onChange={setSort} options={[{ value: 'near', label: 'Nearest' }, { value: 'pay', label: 'Best pay' }]} />
            )}
          </div>
          {online && full && avail.length > 0 && (
            <p className="rounded-lg bg-[#efe7df] px-3 py-2 text-sm text-stone-700">You have {max} jobs — finish one to accept another.</p>
          )}
          {online && (avail.length === 0
            ? <p className={cn(card, 'px-4 py-6 text-center text-sm text-stone-600')}>No open jobs right now.</p>
            : (
              <ul className={cn(card, 'divide-y divide-[#eadfd6]')}>
                {avail.map((o) => <AvailableRow key={o.id} s={s} o={o} r={r} full={full} max={max} />)}
              </ul>
            ))}
        </section>
      </div>

      <Confirm open={endOpen} onOpenChange={setEndOpen} title="End your shift?"
        body={active.length
          ? <>You still have {active.length} job{active.length > 1 ? 's' : ''} in progress. Finish {active.length > 1 ? 'them' : 'it'} before ending your shift.</>
          : <>You will go offline and stop getting job offers.{r.codHeld > 0 && <> You still hold <b className="text-[#8a4b1c]">{peso(r.codHeld)}</b> COD cash — hand it to the branch cashier before you leave.</>}</>}
        confirm="End shift" onConfirm={endShift} />
    </div>
  );
}
