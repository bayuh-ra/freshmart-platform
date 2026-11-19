'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon, ArrowLeft, Banknote, Check, CheckCircle2, ChevronDown, Circle, Clock, MapPin, MessageSquareText, Navigation, Package, Phone, Snowflake, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Order, Rider } from '@/src/lib/types';
import { mutate, useStore } from '@/src/lib/store';
import { distanceKm, fmtTime, peso, pesoShort, riderPosition, setOrderStatus } from '@/src/lib/logic';
import { MapView } from '@/src/components/MapView';
import { markOrderDelivered, startDelivery } from '@/src/components/delivery/actions';
import { orderDistance, tripEarnings, useNow } from '@/src/components/delivery/helpers';
import {
  NOTE, areaOf, deliveryWindow, hasStep, isCodDue, itemName, liveItems, mapsLinks, maxMins, podMethod, riderNote, sendRiderChat, stageOf,
} from './flow';
import { PhotoCapture, PinEntry, SignaturePad } from './ProofOfDelivery';
import { ActionBar, HEADING, btn, card } from './ui';
import { cn } from '@/src/lib/utils';

const FAIL_REASONS = ['Customer unreachable', 'Wrong address', 'Refused by customer', 'Unsafe location'];
const QUICK_CHAT = ["I'm on my way 🛵", "I've arrived at your gate", "I can't find the address — can you share a landmark?", 'Running ~5 min late, sorry!'];

// Map pins: round markers with lucide icon paths (plain HTML, no image assets).
const svg = (paths: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICON_STORE = svg('<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>');
const ICON_HOME = svg('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
const ICON_BIKE = svg('<path d="m18 14-1-3"/><path d="m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81"/><path d="M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5"/><circle cx="19" cy="17" r="3"/><circle cx="5" cy="17" r="3"/>');
const pin = (bg: string, icon: string, pulse = false) =>
  `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:${bg};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${pulse ? `<span class="rider-pulse" style="position:absolute;inset:-3px;border-radius:999px;border:3px solid ${bg}"></span>` : ''}${icon}</div>`;

function NavButtons({ lat, lng, to, pref }: { lat: number; lng: number; to: string; pref: 'google' | 'waze' }) {
  const l = mapsLinks(lat, lng);
  const google = { key: 'google', label: 'Google Maps', href: l.google };
  const waze = { key: 'waze', label: 'Waze', href: l.waze };
  // The rider's preferred app (Profile › Preferences) comes first, in black.
  const apps = pref === 'waze' ? [waze, google] : [google, waze];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {apps.map((a, i) => (
        <a key={a.key} href={a.href} target="_blank" rel="noreferrer" aria-label={`Navigate to ${to} with ${a.label}`} className={cn(i === 0 ? btn.dark : btn.secondary, 'px-2 text-[15px] sm:text-base')}>
          <Navigation className="h-4 w-4 shrink-0 -rotate-90 sm:h-5 sm:w-5" /> {a.label}
        </a>
      ))}
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Pickup', 'Deliver', 'Proof'];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Job progress">
      {labels.map((l, i) => {
        const done = i < step;
        const cur = i === step;
        return (
          <li key={l} aria-current={cur ? 'step' : undefined}>
            <div className={cn('h-1 rounded-full', done ? 'bg-[#1f6b3f]' : cur ? 'bg-[#c8151d]' : 'bg-[#e5d6c8]')} />
            <p className={cn('mt-2 flex items-center gap-1.5 text-sm', done ? 'font-medium text-[#1f6b3f]' : cur ? 'font-semibold text-[#2a2322]' : 'text-stone-500')}>
              {done ? <Check className="h-4 w-4" /> : cur ? <span className="h-2.5 w-2.5 rounded-full bg-[#2a2322]" /> : <Circle className="h-3.5 w-3.5" />}
              {l}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2', on ? 'border-[#1f6b3f] bg-[#1f6b3f] text-white' : 'border-stone-400 bg-white')}>
      {on && <Check className="h-4 w-4" />}
    </span>
  );
}

function itemDetail(i: Order['items'][number]) {
  const qty = i.soldByWeight ? `${i.actualWeightKg ?? i.estWeightKg ?? i.qty} kg` : `${i.qty} pc`;
  return i.cut ? `${qty} · ${i.cut.name.toLowerCase()}` : qty;
}

/** Collapsible "N items in this order" card (also the pickup checklist when `check` is given). */
function ItemsCard({ o, open, onToggle, check }: { o: Order; open: boolean; onToggle: () => void; check?: { checked: Record<number, boolean>; set: (v: Record<number, boolean>) => void } }) {
  const items = liveItems(o);
  return (
    <section className={cn(card, 'overflow-hidden')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f8f3ee] sm:px-5">
        <Package className="h-5 w-5 shrink-0 text-[#2a2322]" strokeWidth={1.75} />
        <span className="flex-1 text-[15px] font-semibold text-[#2a2322] sm:text-base">
          {check ? `Check ${items.length} items vs packing slip` : `${items.length} item${items.length === 1 ? '' : 's'} in this order`}
          {check && <span className="ml-2 text-sm font-normal text-stone-600">{Object.values(check.checked).filter(Boolean).length}/{items.length}</span>}
        </span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-stone-600 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="divide-y divide-[#eadfd6] border-t border-[#eadfd6]">
          {items.map((it, i) => check ? (
            <li key={i}>
              <button type="button" role="checkbox" aria-checked={!!check.checked[i]} onClick={() => check.set({ ...check.checked, [i]: !check.checked[i] })}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f8f3ee] sm:px-5">
                <CheckBox on={!!check.checked[i]} />
                <span className="min-w-0 flex-1 text-[15px] text-[#2a2322]">{itemName(it)}</span>
                <span className="shrink-0 text-sm text-stone-600">{itemDetail(it)}</span>
              </button>
            </li>
          ) : (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0 text-[15px] text-[#2a2322]">{itemName(it)}</span>
              <span className="shrink-0 text-right text-[15px] text-stone-600">{itemDetail(it)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The active job flow: pickup → deliver → proof of delivery (and failed delivery / return to shop). */
export function ActiveJob({ order, rider }: { order: Order; rider: Rider }) {
  const s = useStore();
  const o = s.orders.find((x) => x.id === order.id) ?? order;
  const b = s.branches.find((x) => x.id === o.branchId)!;
  const dest = o.address ?? b;
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [signed, setSigned] = useState(false);
  const [cash, setCash] = useState('');
  const [failing, setFailing] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [failPhoto, setFailPhoto] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(true);
  const [bagOk, setBagOk] = useState(false);
  const now = useNow(1000);

  const items = liveItems(o);
  const arrivedBranch = hasStep(o, NOTE.arrivedBranch);
  const arrivedDrop = hasStep(o, NOTE.arrivedDrop);
  const method = podMethod(s, o.branchId);
  const isCod = isCodDue(o);
  const cashNum = Number(cash) || 0;
  const podOk =
    (method.includes('Photo') ? !!photo : true) &&
    (method.includes('PIN') ? pinCode === o.pickupPin : true) &&
    (method === 'Signature' ? signed : true);
  const codOk = !isCod || cashNum >= o.total;
  const delivering = o.status === 'out_for_delivery';
  const failed = o.status === 'failed_delivery';
  const pickup = o.status === 'ready';
  const step = pickup ? 0 : delivering && !arrivedDrop ? 1 : 2;
  const win = delivering ? deliveryWindow(s, o, now) : undefined;
  const pref = rider.navApp ?? 'google';
  const pay = tripEarnings(s, o, rider);

  // Rider position: moving along the delivery, else last known GPS (at the shop once arrived there).
  const live = riderPosition(s, o);
  const pos = delivering ? live : arrivedBranch || failed ? { lat: b.lat, lng: b.lng, etaMins: 0 } : { lat: rider.lat, lng: rider.lng, etaMins: 0 };
  const target = delivering ? dest : b;
  const kmLeft = distanceKm(pos, target);
  const etaMins = delivering ? (arrivedDrop ? 0 : live.etaMins) : Math.max(1, Math.round(kmLeft * 2.4));
  const atTarget = (delivering && arrivedDrop) || (pickup && arrivedBranch);

  // ---------- Map ----------
  const markers = [
    { id: 'b', lat: b.lat, lng: b.lng, label: '', html: pin('#2a2322', ICON_STORE), size: [40, 40] as [number, number], title: `Jovanne’s ${b.name}`, z: 1 },
    ...(o.address ? [{ id: 'd', lat: dest.lat, lng: dest.lng, label: '', html: pin('#1f6b3f', ICON_HOME), size: [40, 40] as [number, number], title: o.address.line, z: 2 }] : []),
    { id: 'r', lat: pos.lat, lng: pos.lng, label: '', html: pin('#c8151d', ICON_BIKE, true), size: [40, 40] as [number, number], title: 'You', z: 3 },
  ];
  const lines = delivering
    ? [
      { points: [[b.lat, b.lng], [pos.lat, pos.lng]] as [number, number][], color: '#9b8f88', dashed: true, weight: 3 },
      { points: [[pos.lat, pos.lng], [dest.lat, dest.lng]] as [number, number][], color: '#c8151d', weight: 5 },
    ]
    : [
      { points: [[pos.lat, pos.lng], [b.lat, b.lng]] as [number, number][], color: '#c8151d', weight: 5 },
      ...(o.address ? [{ points: [[b.lat, b.lng], [dest.lat, dest.lng]] as [number, number][], color: '#9b8f88', dashed: true, weight: 3 }] : []),
    ];
  const mapCard = (
    <div className="relative isolate lg:sticky lg:top-28">
      <MapView center={[pos.lat, pos.lng]} zoom={14} fitToMarkers zoomPosition="bottomright" markers={markers} lines={lines}
        frameClass="rounded-xl border border-[#eadfd6]" className="h-64 sm:h-80 lg:h-[calc(100dvh-15rem)] lg:min-h-[520px] lg:max-h-[720px]" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-white px-3.5 py-2 shadow-md">
        <p className="text-2xl font-bold leading-tight text-[#2a2322] sm:text-[28px]" style={HEADING}>{atTarget ? 'Arrived' : `${etaMins} min`}</p>
        <p className="text-xs text-stone-600 sm:text-sm">{atTarget ? (pickup ? 'at the shop' : 'at the customer') : `${kmLeft} km to ${delivering ? 'go' : 'the shop'}`}</p>
      </div>
    </div>
  );

  // ---------- Shared right-column pieces ----------
  const windowCard = win ? (
    <section role="status" className={cn('rounded-xl border p-4 sm:px-5', win.overdue ? 'border-red-200 bg-red-50' : 'border-[#cfdaf0] bg-[#e6ecf8]')}>
      <div className={cn('flex items-center justify-between gap-2 text-base font-semibold sm:text-[17px]', win.overdue ? 'text-red-800' : 'text-[#2c4f9e]')}>
        <span className="flex items-center gap-2"><Clock className="h-5 w-5" /> Deliver by {fmtTime(win.due)}</span>
        <span>{win.overdue ? `${-win.minsLeft} min late` : `${win.minsLeft} min left`}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
        <div className={cn('h-full rounded-full', win.overdue ? 'bg-red-600' : 'bg-[#2c4f9e]')} style={{ width: `${win.overdue ? 100 : win.left * 100}%` }} />
      </div>
      {o.coldChain && <p className="mt-2.5 flex items-center gap-1.5 text-sm text-stone-700"><Snowflake className="h-4 w-4 text-[#2c4f9e]" /> Cold chain · deliver within {win.mins} min of pickup</p>}
    </section>
  ) : null;

  const codBox = isCod ? (
    <p className="flex items-center gap-2.5 rounded-lg bg-[#fbf0e3] px-4 py-3 text-base font-semibold text-[#8a4b1c] sm:text-[17px]">
      <Banknote className="h-5 w-5 shrink-0" /> Collect {peso(o.total)} cash
    </p>
  ) : null;

  const customerCard = (withNav: boolean) => (
    <section className={cn(card, 'space-y-3 p-4 sm:p-5')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-[#2a2322] sm:text-xl">{o.customerName}</p>
          <p className="text-[15px] text-[#2a2322]">{o.address?.line}</p>
          {o.address?.landmark && <p className="mt-1 text-sm text-stone-600">Landmark: {o.address.landmark.charAt(0).toLowerCase() + o.address.landmark.slice(1)}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <a href={`tel:${o.customerMobile.replace(/[^\d+]/g, '')}`} aria-label={`Call ${o.customerName}`}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e3efe6] text-[#1f6b3f] hover:bg-[#d3e6d9] sm:h-14 sm:w-14"><Phone className="h-5 w-5" /></a>
          <button type="button" aria-label={`Message ${o.customerName}`} aria-expanded={chatOpen} onClick={() => setChatOpen((v) => !v)}
            className={cn('flex h-12 w-12 items-center justify-center rounded-full text-[#2a2322] sm:h-14 sm:w-14', chatOpen ? 'bg-[#e5d6c8]' : 'bg-[#f1e9e1] hover:bg-[#e9ded3]')}><MessageSquareText className="h-5 w-5" /></button>
        </div>
      </div>
      {chatOpen && (
        <div className="space-y-1.5 rounded-lg border border-[#eadfd6] bg-white p-2">
          <p className="px-1 text-xs text-stone-600">Quick message to {o.customerName.split(' ')[0]} (masked chat — your number stays hidden)</p>
          {QUICK_CHAT.map((m) => (
            <button type="button" key={m} onClick={() => { sendRiderChat(o, rider, m); toast.success('Message sent'); setChatOpen(false); }}
              className="min-h-11 w-full rounded-md bg-[#f8f3ee] px-3 py-2 text-left text-sm hover:bg-[#fbf0e3]">{m}</button>
          ))}
        </div>
      )}
      {o.riderInstructions && <p className="rounded-lg bg-[#fbf3e8] px-4 py-3 text-[15px] text-[#2a2322]">“{o.riderInstructions}”</p>}
      {codBox}
      {withNav && <NavButtons lat={dest.lat} lng={dest.lng} to={o.customerName} pref={pref} />}
    </section>
  );

  const reportLink = (
    <button type="button" onClick={() => setFailing(true)} className="min-h-11 w-full text-center text-[15px] font-semibold text-[#c8151d] hover:underline">
      Can’t complete this? Report a problem
    </button>
  );

  // ---------- Right column: details and the main action ----------
  let detail: React.ReactNode;
  let action: React.ReactNode;
  let hint: string | undefined;

  if (failed) {
    detail = (
      <>
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-4 sm:p-5">
          <p className="flex items-center gap-2 font-semibold text-orange-900"><AlertOctagon className="h-5 w-5" /> Delivery failed</p>
          <p className="mt-1 text-sm text-orange-900">{[...o.timeline].reverse().find((e) => e.status === 'failed_delivery')?.note}</p>
          <p className="mt-2 text-sm text-orange-800">Bring the items back to Jovanne’s {b.name}. The branch will re-attempt, restock or cancel per policy.</p>
        </section>
        <section className={cn(card, 'p-4 sm:p-5')}>
          <p className="mb-3 text-[15px] font-semibold text-[#2a2322]">Back to Jovanne’s {b.name}</p>
          <NavButtons lat={b.lat} lng={b.lng} to={b.name} pref={pref} />
        </section>
      </>
    );
    action = (
      <button type="button" className={cn(btn.primary, 'min-h-14 w-full text-lg')} onClick={() => {
        riderNote(o.id, rider.name, NOTE.returned, { title: `${o.number}: returned to branch`, body: `${rider.name} returned ${items.length} items to ${b.name}.` });
        toast.success('Return recorded', { description: 'Branch notified to check the items back in.' });
      }}><Undo2 className="h-5 w-5" /> Items returned to shop</button>
    );
  } else if (failing) {
    detail = (
      <section className={cn(card, 'space-y-3 p-4 sm:p-5')}>
        <p className="text-lg font-semibold text-[#2a2322]">Report a problem</p>
        <div className="space-y-2" role="radiogroup" aria-label="Reason">
          {FAIL_REASONS.map((x) => (
            <button type="button" role="radio" aria-checked={failReason === x} key={x} onClick={() => setFailReason(x)}
              className={cn('min-h-12 w-full rounded-lg border px-3 py-2.5 text-left text-[15px]', failReason === x ? 'border-[#c8151d] bg-red-50 font-semibold text-[#a3111a]' : 'border-[#eadfd6] bg-white')}>{x}</button>
          ))}
        </div>
        <PhotoCapture value={failPhoto} onChange={setFailPhoto} label="Photo evidence (gate / location)" />
      </section>
    );
    action = (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2.5">
        <button type="button" className={btn.secondary} onClick={() => setFailing(false)}>Back</button>
        <button type="button" className={btn.danger} disabled={!failReason || !failPhoto} onClick={() => {
          setOrderStatus(o.id, 'failed_delivery', { by: rider.name, note: `${failReason} · photo ${failPhoto}` });
          toast.error(`${o.number} marked as failed`, { description: 'Dispatch and the customer were notified.' });
          setFailing(false);
        }}>Submit report</button>
      </div>
    );
    hint = !failReason ? 'Choose a reason' : !failPhoto ? 'Take a photo as evidence' : undefined;
  } else if (pickup) {
    const allChecked = items.every((_, i) => checked[i]);
    const needsBag = !!o.coldChain;
    const canConfirm = allChecked && (!needsBag || bagOk);
    detail = (
      <>
        <section className="rounded-xl border border-[#cfdaf0] bg-[#e6ecf8] p-4 sm:px-5">
          <p className="flex items-center gap-2 text-base font-semibold text-[#2c4f9e] sm:text-[17px]"><Snowflake className="h-5 w-5" /> Deliver within {maxMins(s, o)} min of pickup</p>
          <p className="mt-1 text-sm text-stone-700">The cold-chain timer starts when you confirm pickup.{o.insulatedPacked ? ' Packed in an insulated bag with ice packs.' : ''}</p>
        </section>
        <section className={cn(card, 'space-y-3 p-4 sm:p-5')}>
          <div>
            <p className="text-lg font-semibold text-[#2a2322] sm:text-xl">Pick up at Jovanne’s {b.name}</p>
            <p className="text-[15px] text-[#2a2322]">{b.address}</p>
            {b.pickupInstructions && <p className="mt-1 text-sm text-stone-600">{b.pickupInstructions}</p>}
          </div>
          <p className="rounded-lg bg-[#f8f3ee] px-4 py-3 text-sm text-stone-700">
            Then deliver to <b className="text-[#2a2322]">{o.customerName}</b> · {areaOf(o)} · {orderDistance(s, o)} km · {o.bagCount ?? 1} bag{(o.bagCount ?? 1) > 1 ? 's' : ''}
          </p>
          {codBox}
          {!arrivedBranch && <NavButtons lat={b.lat} lng={b.lng} to={`Jovanne’s ${b.name}`} pref={pref} />}
        </section>
        {arrivedBranch ? (
          <>
            <ItemsCard o={o} open={checkOpen} onToggle={() => setCheckOpen((v) => !v)} check={{ checked, set: setChecked }} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="min-h-11 px-1 text-sm font-semibold text-[#c8151d] hover:underline" onClick={() => setChecked(Object.fromEntries(items.map((_, i) => [i, true])))}>Check all</button>
            </div>
            {needsBag && (
              <button type="button" role="checkbox" aria-checked={bagOk} onClick={() => setBagOk((v) => !v)}
                className={cn(card, 'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left sm:px-5')}>
                <CheckBox on={bagOk} />
                <span className="text-[15px] font-medium text-[#2a2322]">Insulated bag with ice packs received</span>
              </button>
            )}
          </>
        ) : (
          <ItemsCard o={o} open={itemsOpen} onToggle={() => setItemsOpen((v) => !v)} />
        )}
      </>
    );
    if (!arrivedBranch) {
      action = (
        <button type="button" className={cn(btn.primary, 'min-h-14 w-full text-lg')} onClick={() => {
          riderNote(o.id, rider.name, NOTE.arrivedBranch, { title: `${o.number}: rider at branch`, body: `${rider.name} is at the pickup counter.` });
          toast.success('The shop knows you have arrived');
        }}><MapPin className="h-5 w-5" /> Arrived at shop</button>
      );
    } else {
      action = (
        <button type="button" className={cn(btn.primary, 'min-h-14 w-full text-lg')} disabled={!canConfirm} onClick={() => {
          if (o.coldChain) {
            mutate((d) => {
              d.orders.find((y) => y.id === o.id)?.timeline.push({ status: 'rider', at: new Date().toISOString(), by: rider.name, note: 'Insulated bag received by rider (cold chain)' });
            });
          }
          startDelivery(o, rider.name, { bagChecked: !!o.coldChain, by: rider.name, note: `Picked up by ${rider.name} · ${items.length} items checked`, quiet: true });
          toast.success('Picked up', { description: `Deliver within ${maxMins(s, o)} min — the customer was notified.` });
        }}><Package className="h-5 w-5" /> Picked up — bag checked</button>
      );
      hint = canConfirm ? undefined : !allChecked ? 'Tick every item to confirm pickup' : 'Confirm you received the insulated bag';
    }
  } else if (!arrivedDrop) {
    // Deliver
    detail = (
      <>
        {windowCard}
        {customerCard(true)}
        <ItemsCard o={o} open={itemsOpen} onToggle={() => setItemsOpen((v) => !v)} />
        {reportLink}
      </>
    );
    action = (
      <button type="button" className={cn(btn.primary, 'min-h-14 w-full text-lg')} onClick={() => {
        riderNote(o.id, rider.name, NOTE.arrivedDrop, undefined, `${rider.name} has arrived at your address.`);
        toast.success('The customer knows you have arrived');
      }}><MapPin className="h-5 w-5" /> Arrived at customer</button>
    );
  } else {
    // Proof of delivery
    detail = (
      <>
        {windowCard}
        {customerCard(false)}
        <section className={cn(card, 'space-y-3 p-4 sm:p-5')}>
          <p className="text-lg font-semibold text-[#2a2322]">Proof of delivery <span className="text-sm font-normal text-stone-600">· {method}</span></p>
          {method.includes('Photo') && <PhotoCapture value={photo} onChange={setPhoto} />}
          {method.includes('PIN') && <PinEntry value={pinCode} onChange={setPinCode} expected={o.pickupPin} />}
          {method === 'Signature' && <SignaturePad onChange={setSigned} />}
        </section>
        {isCod && (
          <section className="space-y-3 rounded-xl border border-[#f0dcc4] bg-[#fbf0e3] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 text-[#8a4b1c]">
              <span className="flex items-center gap-2 font-semibold"><Banknote className="h-5 w-5" /> Collect cash</span>
              <b className="text-xl" style={HEADING}>{peso(o.total)}</b>
            </div>
            <label className="block text-sm text-stone-700">Cash received
              <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00"
                className="mt-1 h-12 w-full rounded-lg border border-[#e0c9ad] bg-white px-3 text-lg font-semibold outline-none focus:border-[#c8151d] focus:ring-2 focus:ring-[#c8151d]/20" />
            </label>
            <div className="flex gap-2">
              {[o.total, Math.ceil(o.total / 100) * 100, Math.ceil(o.total / 500) * 500, Math.ceil(o.total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).map((v) => (
                <button type="button" key={v} onClick={() => setCash(String(v))} className="min-h-11 flex-1 rounded-lg border border-[#e0c9ad] bg-white text-sm font-semibold hover:border-[#c8151d]">{v === o.total ? 'Exact' : pesoShort(v)}</button>
              ))}
            </div>
            <div className="flex justify-between text-sm"><span className="text-stone-700">Change to give</span><b className={cashNum >= o.total ? 'text-[#1f6b3f]' : 'text-stone-400'}>{cashNum >= o.total ? peso(cashNum - o.total) : '—'}</b></div>
          </section>
        )}
        {reportLink}
      </>
    );
    action = (
      <button type="button" className={cn(btn.primary, 'min-h-14 w-full text-lg')} disabled={!podOk || !codOk} onClick={() => {
        const notes = [`POD: ${method}${photo ? ` (${photo})` : ''}${method.includes('PIN') ? ' · PIN verified' : ''}${method === 'Signature' ? ' · signed' : ''}`];
        if (isCod) notes.push(`COD ${peso(o.total)} · cash ${peso(cashNum)} · change ${peso(cashNum - o.total)}`);
        markOrderDelivered(o, { by: rider.name, note: notes.join(' · '), quiet: true });
        toast.success(`${o.number} delivered!`, { description: `+${pesoShort(pay)} earned${isCod ? ` · ${peso(o.total)} cash added to COD held` : ''}` });
      }}><CheckCircle2 className="h-5 w-5" /> {isCod ? 'Cash collected · Mark delivered' : 'Mark as delivered'}</button>
    );
    hint = !podOk ? 'Complete proof of delivery' : !codOk ? 'Enter the cash you received' : undefined;
  }

  return (
    <div className="pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0">
      {/* Job header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <Link href="/rider" aria-label="Back to jobs" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#eadfd6] bg-[#fffdfb] text-[#2a2322] hover:bg-white sm:h-14 sm:w-14"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.08em] text-[#c8151d] sm:text-sm">{o.number} · {stageOf(o)}</p>
          <h1 className="truncate text-[28px] font-bold uppercase leading-tight text-[#2a2322] sm:text-4xl" style={HEADING}>{o.customerName}</h1>
        </div>
        <span className="shrink-0 rounded-full bg-[#e3efe6] px-3 py-1.5 text-sm font-bold text-[#1f6b3f] sm:text-base">+{pesoShort(pay)}</span>
      </div>

      {!failed && <div className="mt-5"><Steps step={step} /></div>}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-start">
        {mapCard}
        <div className="space-y-4">
          {detail}
          <ActionBar hint={hint}>{action}</ActionBar>
        </div>
      </div>
    </div>
  );
}
