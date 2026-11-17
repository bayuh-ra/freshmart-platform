'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bike, Clock, CloudCheck, MapPin, Power, Snowflake, Store, Timer } from 'lucide-react';
import { toast } from 'sonner';
import type { AppState, Order, Rider } from '@/src/lib/types';
import { useStore } from '@/src/lib/store';
import { branchName, fmtTime, pesoShort } from '@/src/lib/logic';
import { deliverBy, orderDistance, tripEarnings } from '@/src/components/delivery/helpers';
import { acceptOffer, availableJobs, claimJob, declineOffer, hasStep, NOTE, setOnline } from './flow';
import { useRider } from './RiderShell';
import { HEADING, SectionTitle, btn, card } from './ui';
import { cn } from '@/src/lib/utils';

function JobCard({ s, o, r, children }: { s: AppState; o: Order; r: Rider; children?: React.ReactNode }) {
  const items = o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock');
  return (
    <div className={cn(card, 'p-4')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-600">{o.number}</p>
        <p className="text-xl font-bold text-green-700" style={HEADING}>+{pesoShort(tripEarnings(s, o, r))}</p>
      </div>
      <div className="mt-1 space-y-1.5">
        <p className="flex items-start gap-2 text-sm"><Store className="mt-0.5 h-4 w-4 shrink-0 text-[#c8151d]" strokeWidth={1.75} /><span><b>Pickup</b> · Jovanne’s {branchName(s, o.branchId)}</span></p>
        <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-700" strokeWidth={1.75} /><span><b>Drop-off</b> · {o.address?.line.split(',').slice(-2).join(',').trim() ?? '—'}</span></p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">{orderDistance(s, o)} km</span>
        <span className="max-w-full truncate rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">{items.length} items · {items.slice(0, 2).map((i) => i.name).join(', ')}{items.length > 2 ? '…' : ''}</span>
        {o.coldChain && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800"><Snowflake className="h-3 w-3" /> Cold chain{o.maxDeliveryMins ? ` · max ${o.maxDeliveryMins} min` : ''}</span>}
        {o.paymentMethod === 'cod' && o.paymentStatus === 'pending'
          ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">COD {pesoShort(o.total)}</span>
          : <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-800">Prepaid</span>}
      </div>
      {children}
    </div>
  );
}

function stageLabel(o: Order) {
  if (o.status === 'failed_delivery') return 'Return items to branch';
  if (o.status === 'ready') return hasStep(o, NOTE.arrivedBranch) ? 'Check items & confirm pickup' : 'Go to the branch for pickup';
  return hasStep(o, NOTE.arrivedDrop) ? 'Hand over & proof of delivery' : 'Delivering to customer';
}

function CurrentJobCard({ s, o, r, now }: { s: AppState; o: Order; r: Rider; now: number }) {
  const due = deliverBy(o, now);
  return (
    <div className={cn(card, 'overflow-hidden border-[#c8151d]/30')}>
      <div className="flex items-center justify-between gap-2 bg-[#2a2322] px-4 py-2 text-white">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-300">{o.status === 'out_for_delivery' ? 'On the way' : 'Pickup at branch'}</span>
        <span className="text-sm font-semibold">{o.number}</span>
      </div>
      <div className="p-4">
        <p className="text-lg font-semibold text-stone-900">{o.customerName}</p>
        <p className="text-sm text-stone-600">{stageLabel(o)} · {o.address?.line.split(',').slice(-2).join(',').trim() ?? branchName(s, o.branchId)}</p>
        {due && (
          <p className={cn('mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold',
            due.overdue ? 'bg-red-50 text-red-700' : due.minsLeft <= 10 ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900')}>
            <Clock className="h-4 w-4" /> Deliver by {fmtTime(due.due)} ({due.overdue ? `${-due.minsLeft} min overdue` : `${due.minsLeft} min left`})
          </p>
        )}
        <Link href={`/rider/jobs/${o.id}`} className={cn(btn.primary, 'mt-3 w-full')}>
          Open job <ArrowRight className="h-5 w-5" />
        </Link>
        <p className="mt-2 text-center text-xs text-stone-500">+{pesoShort(tripEarnings(s, o, r))} for this trip</p>
      </div>
    </div>
  );
}

export function RiderHome() {
  const s = useStore();
  const router = useRouter();
  const { rider: r, online, active, myOffers, clock, timeout, max, shiftStart, startShift, endShift } = useRider();
  const avail = availableJobs(s, r);
  const now = clock.now;
  const shiftMins = shiftStart ? Math.max(0, Math.floor((now - shiftStart) / 60000)) : 0;
  const full = active.length >= max;
  const blocked = r.status === 'pending' || r.status === 'suspended';

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Jobs</h1>

      {/* Shift status */}
      <section className={cn(card, 'p-4')}>
        <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
          <div><p className="text-xs text-stone-500">Shift</p><p className="text-lg font-bold text-stone-900" style={HEADING}>{shiftStart ? `${Math.floor(shiftMins / 60)}h ${shiftMins % 60}m` : 'Off'}</p></div>
          <div><p className="text-xs text-stone-500">Workload</p><p className="text-lg font-bold text-stone-900" style={HEADING}>{active.length}/{max} jobs</p></div>
          <div><p className="text-xs text-stone-500">Today</p><p className="text-lg font-bold text-[#c8151d]" style={HEADING}>{pesoShort(r.earningsToday)}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
          <span className="flex items-center gap-1.5 text-sm text-stone-600">
            <Timer className="h-4 w-4 text-[#ae754d]" />{shiftStart ? `Shift started ${fmtTime(new Date(shiftStart).toISOString())}` : 'No active shift'}
          </span>
          <span className="hidden items-center gap-1 text-xs text-stone-500 sm:flex"><CloudCheck className="h-4 w-4 text-green-600" /> All actions synced</span>
          {shiftStart
            ? <button type="button" onClick={endShift} className="min-h-12 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50">End shift</button>
            : <button type="button" onClick={startShift} disabled={blocked} className="min-h-12 rounded-xl px-3 text-sm font-semibold text-[#c8151d] hover:bg-red-50 disabled:opacity-40">Start shift</button>}
        </div>
      </section>

      {r.status === 'pending' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your rider account is not active yet. Please ask the branch manager.</div>}
      {r.status === 'suspended' && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Your account is suspended. Please contact your branch dispatcher.</div>}

      {active.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>{active.length > 1 ? 'Current jobs' : 'Current job'}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {active.map((o) => <CurrentJobCard key={o.id} s={s} o={o} r={r} now={now} />)}
          </div>
        </section>
      )}

      {!online ? (
        <section className={cn(card, 'px-4 py-10 text-center')}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-100"><Bike className="h-8 w-8 text-stone-500" strokeWidth={1.5} /></div>
          <p className="mt-3 text-lg font-semibold text-stone-800" style={HEADING}>You’re offline</p>
          <p className="mt-1 text-sm text-stone-600">Go online to receive job offers from {r.branchIds.map((id) => `Jovanne’s ${branchName(s, id)}`).join(' & ')}.</p>
          {!blocked && (
            <button type="button" onClick={() => {
                if (!shiftStart) { startShift(); return; } // also goes online
                setOnline(r, true);
                toast.success('You are online — waiting for jobs');
              }}
              className={cn(btn.primary, 'mt-4 w-full sm:w-auto sm:px-8')}>
              <Power className="h-5 w-5" /> Go online
            </button>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start">
          <section className="space-y-3">
            <SectionTitle className="flex items-center gap-2">
              Job offers {myOffers.length > 0 && <span className="rounded-full bg-[#ec1b26] px-2 py-0.5 text-xs text-white" style={{ fontFamily: 'var(--font-inter)' }}>{myOffers.length}</span>}
            </SectionTitle>
            {myOffers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 py-8 text-center">
                <span className="relative inline-flex h-3 w-3"><span className="absolute inset-0 animate-ping rounded-full bg-green-400" /><span className="relative h-3 w-3 rounded-full bg-green-500" /></span>
                <p className="mt-2 text-sm text-stone-600">Waiting for offers from dispatch…</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myOffers.map((o) => {
                  const st = clock.seen[o.id];
                  const left = st === -1 ? 0 : st ? Math.max(0, timeout - Math.floor((now - st) / 1000)) : timeout;
                  return (
                    <JobCard key={o.id} s={s} o={o} r={r}>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Time left to accept" aria-valuemin={0} aria-valuemax={timeout} aria-valuenow={left}>
                        <div className={cn('h-full transition-all', left <= 10 ? 'bg-red-600' : 'bg-amber-500')} style={{ width: `${(left / timeout) * 100}%` }} />
                      </div>
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                        <button type="button" className={btn.secondary} onClick={() => { declineOffer(o, r, 'declined'); toast('Offer declined', { description: 'Sent back to dispatch.' }); }}>Decline</button>
                        <button type="button" className={btn.primary} onClick={() => {
                          acceptOffer(o, r);
                          toast.success(`Accepted ${o.number}`, { description: 'Head to the branch for pickup.' });
                          router.push(`/rider/jobs/${o.id}`);
                        }}>Accept · {left}s</button>
                      </div>
                    </JobCard>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <SectionTitle>Available jobs</SectionTitle>
              <p className="text-sm text-stone-600">Open to riders of your branches</p>
            </div>
            {avail.length === 0 ? <p className={cn(card, 'p-5 text-center text-sm text-stone-500')}>No open jobs right now.</p> : (
              <div className="space-y-3">
                {avail.map((o) => (
                  <JobCard key={o.id} s={s} o={o} r={r}>
                    <button type="button" className={cn(btn.primary, 'mt-3 w-full')} disabled={full} onClick={() => {
                      claimJob(o, r);
                      toast.success(`Job ${o.number} is yours`, { description: 'Head to the branch for pickup.' });
                      router.push(`/rider/jobs/${o.id}`);
                    }}>
                      {full ? `At max workload (${max})` : 'Accept job'}
                    </button>
                  </JobCard>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
