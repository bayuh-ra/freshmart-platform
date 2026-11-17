'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon, ArrowLeft, Banknote, Check, CheckCircle2, Clock, MapPin, MessageCircle, Navigation, Package, Phone, Snowflake, Store, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Order, Rider } from '@/src/lib/types';
import { mutate, useStore } from '@/src/lib/store';
import { applyStatus, distanceKm, fmtTime, peso, pesoShort, riderPosition, setOrderStatus } from '@/src/lib/logic';
import { MapView } from '@/src/components/MapView';
import { NOTE, hasStep, mapsLinks, podMethod, riderNote, sendRiderChat } from './flow';
import { PhotoCapture, PinEntry, SignaturePad } from './ProofOfDelivery';
import { deliverBy, tripEarnings, useNow } from '@/src/components/delivery/helpers';
import { ActionBar, HEADING, btn, card } from './ui';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';

const FAIL_REASONS = ['Customer unreachable', 'Wrong address', 'Refused by customer', 'Unsafe location'];
const QUICK_CHAT = ["I'm on my way 🛵", "I've arrived at your gate", "I can't find the address — can you share a landmark?", 'Running ~5 min late, sorry!'];

function NavButtons({ lat, lng, to }: { lat: number; lng: number; to: string }) {
  const l = mapsLinks(lat, lng);
  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={l.google} target="_blank" rel="noreferrer" aria-label={`Navigate to ${to} with Google Maps`} className={cn(btn.secondary, 'text-sm')}><Navigation className="h-4 w-4 text-[#c8151d]" /> Google Maps</a>
      <a href={l.waze} target="_blank" rel="noreferrer" aria-label={`Navigate to ${to} with Waze`} className={cn(btn.secondary, 'text-sm')}><Navigation className="h-4 w-4 text-sky-600" /> Waze</a>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Pickup', 'Deliver', 'Proof'];
  return (
    <ol className="flex items-center gap-1.5" aria-label="Job progress">
      {labels.map((l, i) => (
        <li key={l} className="flex-1" aria-current={i === step ? 'step' : undefined}>
          <div className={cn('h-2 rounded-full', i < step ? 'bg-green-600' : i === step ? 'bg-[#c8151d]' : 'bg-stone-200')} />
          <p className={cn('mt-1 text-xs', i === step ? 'font-semibold text-[#c8151d]' : i < step ? 'text-green-700' : 'text-stone-500')}>{i < step ? '✓ ' : ''}{l}</p>
        </li>
      ))}
    </ol>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-green-600 bg-green-600 text-white' : 'border-stone-400 bg-white')}>
      {on && <Check className="h-4 w-4" />}
    </span>
  );
}

/** The active job flow: pickup → navigate → deliver → proof of delivery (and failed delivery / return). */
export function ActiveJob({ order, rider }: { order: Order; rider: Rider }) {
  const s = useStore();
  const o = s.orders.find((x) => x.id === order.id) ?? order;
  const b = s.branches.find((x) => x.id === o.branchId)!;
  const dest = o.address ?? b;
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [signed, setSigned] = useState(false);
  const [cash, setCash] = useState('');
  const [failing, setFailing] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [failPhoto, setFailPhoto] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [bagOk, setBagOk] = useState(false);
  const now = useNow(1000);

  const items = o.items.filter((i) => i.pickStatus !== 'removed' && i.pickStatus !== 'out_of_stock');
  const arrivedBranch = hasStep(o, NOTE.arrivedBranch);
  const arrivedDrop = hasStep(o, NOTE.arrivedDrop);
  const pos = riderPosition(s, o);
  const method = podMethod(s, o.branchId);
  const isCod = o.paymentMethod === 'cod' && o.paymentStatus === 'pending';
  const cashNum = Number(cash) || 0;
  const podOk =
    (method.includes('Photo') ? !!photo : true) &&
    (method.includes('PIN') ? pin === o.pickupPin : true) &&
    (method === 'Signature' ? signed : true);
  const codOk = !isCod || cashNum >= o.total;
  const delivering = o.status === 'out_for_delivery';
  const failed = o.status === 'failed_delivery';
  const step = o.status === 'ready' ? 0 : delivering && !arrivedDrop ? 1 : 2;
  const due = delivering ? deliverBy(o, now) : undefined;
  const headingToBranch = !delivering;
  const target = headingToBranch ? b : dest;

  // ---------- Left column: countdown, map, ETA and contact ----------
  const mapColumn = (
    <div className="space-y-3 md:sticky md:top-24">
      {due && (
        <div role="status" className={cn('flex items-center gap-2 rounded-xl border px-3 py-3 text-base font-semibold',
          due.overdue ? 'border-red-300 bg-red-50 text-red-800' : due.minsLeft <= 10 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>
          <Clock className="h-5 w-5 shrink-0" />
          <span>Deliver by {fmtTime(due.due)} ({due.overdue ? `${-due.minsLeft} min overdue` : `${due.minsLeft} min left`})</span>
          <Snowflake className="ml-auto h-4 w-4 shrink-0 opacity-70" aria-label="Cold chain" />
        </div>
      )}
      <div className="relative isolate">
        <MapView center={[pos.lat, pos.lng]} zoom={14} fitToMarkers className="h-56 sm:h-72 md:h-[420px]"
          markers={[
            { id: 'b', lat: b.lat, lng: b.lng, label: '🏪', color: '#2a2322', title: `Jovanne’s ${b.name}` },
            { id: 'd', lat: dest.lat, lng: dest.lng, label: '🏠', color: '#15803d', title: o.address?.line },
            { id: 'r', lat: pos.lat, lng: pos.lng, label: '🛵', color: '#c8151d', pulse: true, title: 'You' },
          ]}
          lines={[{ points: [[pos.lat, pos.lng], [target.lat, target.lng]], color: '#c8151d', dashed: true }]} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {delivering ? (
            <>
              <p className="text-2xl font-bold text-[#c8151d]" style={HEADING}>{arrivedDrop ? 'Arrived' : `${pos.etaMins} min`}</p>
              <p className="text-sm text-stone-600">{arrivedDrop ? 'Complete the handover' : `ETA · ${distanceKm(pos, dest)} km to go`}</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-[#2a2322]" style={HEADING}>{distanceKm(pos, b)} km</p>
              <p className="text-sm text-stone-600">to Jovanne’s {b.name}</p>
            </>
          )}
        </div>
        {delivering && (
          <div className="flex shrink-0 gap-2">
            <button type="button" aria-label={`Call ${o.customerName}`} onClick={() => toast.info('Calling via masked number', { description: `0917-***-${o.id.length * 731 % 9000 + 1000} · your number stays hidden` })}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700 hover:bg-green-100"><Phone className="h-5 w-5" /></button>
            <button type="button" aria-label={`Message ${o.customerName}`} aria-expanded={chatOpen} onClick={() => setChatOpen((v) => !v)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[#c8151d] hover:bg-red-100"><MessageCircle className="h-5 w-5" /></button>
          </div>
        )}
      </div>
      {delivering && chatOpen && (
        <div className={cn(card, 'space-y-1.5 p-2')}>
          <p className="px-1 text-xs text-stone-600">Quick message to {o.customerName.split(' ')[0]} (masked chat)</p>
          {QUICK_CHAT.map((m) => (
            <button type="button" key={m} onClick={() => { sendRiderChat(o, rider, m); toast.success('Message sent'); setChatOpen(false); }}
              className="min-h-12 w-full rounded-lg bg-stone-50 px-3 py-2 text-left text-sm hover:bg-red-50">{m}</button>
          ))}
        </div>
      )}
    </div>
  );

  // ---------- Right column: steps, details and the main action ----------
  let detail: React.ReactNode;
  let action: React.ReactNode;
  let hint: string | undefined;

  if (failed) {
    detail = (
      <div className="space-y-3">
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-orange-900"><AlertOctagon className="h-5 w-5" /> Delivery failed</p>
          <p className="mt-1 text-sm text-orange-900">{[...o.timeline].reverse().find((e) => e.status === 'failed_delivery')?.note}</p>
          <p className="mt-2 text-sm text-orange-800">Bring the items back to Jovanne’s {b.name}. The branch will re-attempt, restock or cancel per policy.</p>
        </div>
        <NavButtons lat={b.lat} lng={b.lng} to={b.name} />
      </div>
    );
    action = (
      <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => {
        riderNote(o.id, rider.name, NOTE.returned, { title: `${o.number}: returned to branch`, body: `${rider.name} returned ${items.length} items to ${b.name}.` });
        toast.success('Return recorded', { description: 'Branch notified to check the items back in.' });
      }}><Undo2 className="h-5 w-5" /> Items returned to branch</button>
    );
  } else if (failing) {
    detail = (
      <div className="space-y-3">
        <p className="font-semibold text-stone-900">Report failed delivery</p>
        <div className="space-y-2" role="radiogroup" aria-label="Reason">
          {FAIL_REASONS.map((r) => (
            <button type="button" role="radio" aria-checked={failReason === r} key={r} onClick={() => setFailReason(r)}
              className={cn('min-h-12 w-full rounded-xl border px-3 py-2.5 text-left text-sm', failReason === r ? 'border-red-600 bg-red-50 font-semibold text-red-800' : 'border-stone-300 bg-white')}>{r}</button>
          ))}
        </div>
        <PhotoCapture value={failPhoto} onChange={setFailPhoto} label="Photo evidence (gate / location)" />
      </div>
    );
    action = (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
        <button type="button" className={btn.secondary} onClick={() => setFailing(false)}>Back</button>
        <button type="button" className={btn.danger} disabled={!failReason || !failPhoto} onClick={() => {
          setOrderStatus(o.id, 'failed_delivery', { by: rider.name, note: `${failReason} · photo ${failPhoto}` });
          toast.error(`${o.number} marked as failed`, { description: 'Dispatcher and customer notified.' });
          setFailing(false);
        }}>Submit report</button>
      </div>
    );
    hint = !failReason ? 'Choose a reason' : !failPhoto ? 'Take a photo as evidence' : undefined;
  } else if (o.status === 'ready') {
    const allChecked = items.every((_, i) => checked[i]);
    const needsBag = !!o.coldChain;
    const canConfirm = allChecked && (!needsBag || bagOk);
    detail = (
      <div className="space-y-3">
        <div className={cn(card, 'p-4')}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2a2322] text-white"><Store className="h-5 w-5" strokeWidth={1.75} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-stone-900">Pickup · Jovanne’s {b.name}</p>
              <p className="text-sm text-stone-600">{b.address}</p>
              <p className="mt-0.5 text-sm text-stone-600">{b.pickupInstructions}</p>
            </div>
          </div>
          {!arrivedBranch && <div className="mt-3"><NavButtons lat={b.lat} lng={b.lng} to={b.name} /></div>}
        </div>

        {arrivedBranch && (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-stone-900">Check items vs packing slip</p>
              <span className="text-sm text-stone-600">{Object.values(checked).filter(Boolean).length}/{items.length} · {o.bagCount ?? Math.max(1, Math.ceil(items.length / 4))} bags</span>
            </div>
            <div className={cn(card, 'divide-y divide-stone-100 overflow-hidden')}>
              {items.map((it, i) => {
                const sub = it.substitute?.status === 'accepted' ? it.substitute : undefined;
                return (
                  <button type="button" role="checkbox" aria-checked={!!checked[i]} key={i} onClick={() => setChecked({ ...checked, [i]: !checked[i] })}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-stone-50">
                    <CheckBox on={!!checked[i]} />
                    <span className="text-lg" aria-hidden><ProductImage image={sub?.image ?? it.image} /></span>
                    <span className="min-w-0 flex-1 text-sm text-stone-800">{sub ? `${sub.name} (sub)` : it.name}</span>
                    <span className="text-sm font-semibold text-stone-700">{it.soldByWeight ? `${it.actualWeightKg ?? it.estWeightKg ?? it.qty} kg` : `×${it.qty}`}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="mt-1 min-h-12 px-1 text-sm font-medium text-[#c8151d] hover:underline" onClick={() => setChecked(Object.fromEntries(items.map((_, i) => [i, true])))}>Check all</button>
            {needsBag && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900"><Snowflake className="h-4 w-4" /> Cold-chain order</p>
                <p className="mt-0.5 text-sm text-sky-900">
                  Fresh/frozen meat{o.maxDeliveryMins ? ` · deliver within ${o.maxDeliveryMins} min of pickup` : ''}.{o.insulatedPacked ? ' Branch packed it in an insulated bag with ice packs.' : ''}
                </p>
                <button type="button" role="checkbox" aria-checked={bagOk} onClick={() => setBagOk((v) => !v)}
                  className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-left">
                  <CheckBox on={bagOk} />
                  <span className="text-sm font-medium text-stone-900">Insulated bag received</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
    if (!arrivedBranch) {
      action = (
        <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => {
          riderNote(o.id, rider.name, NOTE.arrivedBranch, { title: `${o.number}: rider at branch`, body: `${rider.name} is at the pickup counter.` });
          toast.success('Branch notified you have arrived');
        }}><MapPin className="h-5 w-5" /> Arrived at branch</button>
      );
    } else {
      action = (
        <button type="button" className={cn(btn.primary, 'w-full')} disabled={!canConfirm} onClick={() => {
          mutate((d) => {
            const x = d.orders.find((y) => y.id === o.id);
            if (x?.coldChain) {
              x.riderBagConfirmed = true;
              x.timeline.push({ status: 'rider', at: new Date().toISOString(), by: rider.name, note: 'Insulated bag received by rider (cold chain)' });
            }
            applyStatus(d, o.id, 'out_for_delivery', { by: rider.name });
          });
          toast.success('Pickup confirmed', { description: o.maxDeliveryMins ? `Deliver within ${o.maxDeliveryMins} min — customer notified.` : 'Customer notified — you are on the way!' });
        }}><Package className="h-5 w-5" /> Confirm pickup</button>
      );
      hint = canConfirm ? undefined : !allChecked ? 'Tick every item to confirm pickup' : 'Confirm you received the insulated bag';
    }
  } else {
    // Delivering / handover
    detail = (
      <div className="space-y-3">
        <div className={cn(card, 'p-4')}>
          <p className="font-semibold text-stone-900">{o.customerName}</p>
          <p className="text-sm text-stone-700">{o.address?.line}</p>
          {o.address?.landmark && <p className="text-sm text-stone-600">Landmark: {o.address.landmark}</p>}
          {o.riderInstructions && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-sm text-amber-900">“{o.riderInstructions}”</p>}
          {isCod && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900"><Banknote className="h-4 w-4" /> Collect {peso(o.total)} cash</p>}
          {!arrivedDrop && <div className="mt-3"><NavButtons lat={dest.lat} lng={dest.lng} to={o.customerName} /></div>}
        </div>

        {arrivedDrop && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-stone-900">Proof of delivery <span className="text-sm font-normal text-stone-600">· {method}</span></p>
            {method.includes('Photo') && <PhotoCapture value={photo} onChange={setPhoto} />}
            {method.includes('PIN') && <PinEntry value={pin} onChange={setPin} expected={o.pickupPin} />}
            {method === 'Signature' && <SignaturePad onChange={setSigned} />}

            {isCod && (
              <div className="space-y-2 rounded-2xl border border-stone-200 bg-stone-50 p-3">
                <div className="flex justify-between text-sm"><span className="text-stone-700">Amount to collect</span><b className="text-stone-900">{peso(o.total)}</b></div>
                <label className="block text-sm text-stone-700">Cash received
                  <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00"
                    className="mt-1 h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-lg font-semibold outline-none focus:border-[#c8151d] focus:ring-2 focus:ring-[#c8151d]/20" />
                </label>
                <div className="flex gap-2">
                  {[Math.ceil(o.total / 100) * 100, Math.ceil(o.total / 500) * 500, Math.ceil(o.total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                    <button type="button" key={v} onClick={() => setCash(String(v))} className="min-h-12 flex-1 rounded-lg border border-stone-300 bg-white text-sm font-medium hover:border-[#c8151d]">{pesoShort(v)}</button>
                  ))}
                </div>
                <div className="flex justify-between text-sm"><span className="text-stone-700">Change to give</span><b className={cashNum >= o.total ? 'text-green-700' : 'text-stone-400'}>{cashNum >= o.total ? peso(cashNum - o.total) : '—'}</b></div>
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={() => setFailing(true)} className="min-h-12 w-full rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50">Can’t deliver? Report a problem</button>
      </div>
    );
    if (!arrivedDrop) {
      action = (
        <button type="button" className={cn(btn.primary, 'w-full')} onClick={() => {
          riderNote(o.id, rider.name, NOTE.arrivedDrop, undefined, `${rider.name} has arrived at your address.`);
          toast.success('Customer notified you have arrived');
        }}><MapPin className="h-5 w-5" /> Arrived at customer</button>
      );
    } else {
      action = (
        <button type="button" className={cn(btn.primary, 'w-full')} disabled={!podOk || !codOk} onClick={() => {
          mutate((d) => {
            const notes = [`POD: ${method}${photo ? ` (${photo})` : ''}${method.includes('PIN') ? ' · PIN verified' : ''}${method === 'Signature' ? ' · signed' : ''}`];
            if (isCod) notes.push(`COD ${peso(o.total)} · cash ${peso(cashNum)} · change ${peso(cashNum - o.total)}`);
            applyStatus(d, o.id, 'delivered', { by: rider.name, note: notes.join(' · ') });
          });
          toast.success(`${o.number} delivered!`, { description: `+${pesoShort(tripEarnings(s, o, rider))} earned${isCod ? ` · ${peso(o.total)} cash added to COD held` : ''}` });
        }}><CheckCircle2 className="h-5 w-5" /> {isCod ? 'Cash collected · Delivered' : 'Mark as delivered'}</button>
      );
      hint = !podOk ? 'Complete proof of delivery' : !codOk ? 'Enter cash received' : undefined;
    }
  }

  return (
    <div className="pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Job header */}
      <div className="mb-4 flex items-center gap-2">
        <Link href="/rider" aria-label="Back to jobs" className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-stone-700 hover:bg-stone-200/60"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#ae754d]">Current job · {o.number}</p>
          <h1 className="truncate text-xl font-bold text-[#2a2322]" style={HEADING}>{o.customerName}</h1>
        </div>
        <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-sm font-semibold text-green-800">+{pesoShort(tripEarnings(s, o, rider))}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {mapColumn}
        <div className="space-y-4">
          {!failed && <Steps step={step} />}
          {detail}
          <ActionBar hint={hint}>{action}</ActionBar>
        </div>
      </div>
    </div>
  );
}
