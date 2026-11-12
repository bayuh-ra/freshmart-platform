'use client';

import { useState } from 'react';
import {
  AlertOctagon, ArrowLeft, Banknote, Check, CheckCircle2, MapPin, MessageCircle, Navigation, Package, Phone, Store, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Order, Rider } from '@/src/lib/types';
import { mutate, useStore } from '@/src/lib/store';
import { applyStatus, distanceKm, peso, pesoShort, riderPosition, setOrderStatus } from '@/src/lib/logic';
import { MapView } from '@/src/components/MapView';
import { Button } from '@/src/components/ui/shadcn/button';
import { NOTE, hasStep, mapsLinks, podMethod, riderNote, sendRiderChat } from './flow';
import { PhotoCapture, PinEntry, SignaturePad } from './ProofOfDelivery';
import { tripEarnings } from '@/src/components/delivery/helpers';

const FAIL_REASONS = ['Customer unreachable', 'Wrong address', 'Refused by customer', 'Unsafe location'];
const QUICK_CHAT = ["I'm on my way 🛵", "I've arrived at your gate", "I can't find the address — can you share a landmark?", 'Running ~5 min late, sorry!'];

function NavButtons({ lat, lng }: { lat: number; lng: number }) {
  const l = mapsLinks(lat, lng);
  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={l.google} target="_blank" rel="noreferrer" className="h-10 rounded-xl bg-[#1e40af] text-white text-sm font-medium flex items-center justify-center gap-1.5"><Navigation className="w-4 h-4" /> Google Maps</a>
      <a href={l.waze} target="_blank" rel="noreferrer" className="h-10 rounded-xl bg-sky-500 text-white text-sm font-medium flex items-center justify-center gap-1.5"><Navigation className="w-4 h-4" /> Waze</a>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ['Pickup', 'Deliver', 'Proof'];
  return (
    <div className="flex items-center gap-1 px-4 pt-3">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={`h-1.5 rounded-full ${i < step ? 'bg-green-500' : i === step ? 'bg-[#1e40af]' : 'bg-gray-200'}`} />
          <p className={`text-[10px] mt-1 ${i === step ? 'text-[#1e40af] font-semibold' : 'text-gray-400'}`}>{l}</p>
        </div>
      ))}
    </div>
  );
}

export function ActiveJob({ order, rider, onBack }: { order: Order; rider: Rider; onBack?: () => void }) {
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
  const step = o.status === 'ready' ? 0 : o.status === 'out_for_delivery' && !arrivedDrop ? 1 : 2;

  const header = (
    <div className="px-4 pt-3 flex items-center gap-2">
      {onBack && <button onClick={onBack} className="p-1 -ml-1 rounded-full hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>}
      <div className="flex-1">
        <p className="text-xs text-gray-500">Current job</p>
        <p className="font-bold text-gray-900">{o.number} · {o.customerName}</p>
      </div>
      <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-1">+{pesoShort(tripEarnings(s, o, rider))}</span>
    </div>
  );

  // ---------- Failed delivery: return to branch ----------
  if (o.status === 'failed_delivery') {
    return (
      <div className="pb-4">
        {header}
        <div className="m-4 rounded-2xl bg-orange-50 border border-orange-200 p-4">
          <p className="font-semibold text-orange-900 flex items-center gap-2"><AlertOctagon className="w-5 h-5" /> Delivery failed</p>
          <p className="text-sm text-orange-800 mt-1">{[...o.timeline].reverse().find((e) => e.status === 'failed_delivery')?.note}</p>
          <p className="text-xs text-orange-700 mt-2">Bring the items back to {b.name}. The branch will re-attempt, restock or cancel per policy.</p>
        </div>
        <div className="px-4 space-y-2">
          <NavButtons lat={b.lat} lng={b.lng} />
          <Button className="w-full h-11 rounded-xl" onClick={() => {
            riderNote(o.id, rider.name, NOTE.returned, { title: `${o.number}: returned to branch`, body: `${rider.name} returned ${items.length} items to ${b.name}.` });
            toast.success('Return recorded', { description: 'Branch notified to check the items back in.' });
          }}><Undo2 className="w-4 h-4" /> Items returned to branch</Button>
        </div>
      </div>
    );
  }

  // ---------- Failed-delivery form ----------
  if (failing) {
    return (
      <div className="pb-4">
        {header}
        <div className="px-4 mt-4 space-y-3">
          <p className="font-semibold text-gray-900">Report failed delivery</p>
          <div className="space-y-2">
            {FAIL_REASONS.map((r) => (
              <button key={r} onClick={() => setFailReason(r)} className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm ${failReason === r ? 'border-[#dc2626] bg-red-50 text-[#dc2626] font-medium' : 'border-gray-200'}`}>{r}</button>
            ))}
          </div>
          <PhotoCapture value={failPhoto} onChange={setFailPhoto} label="Photo evidence (gate / location)" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setFailing(false)}>Back</Button>
            <Button variant="destructive" className="h-11 rounded-xl" disabled={!failReason || !failPhoto} onClick={() => {
              setOrderStatus(o.id, 'failed_delivery', { by: rider.name, note: `${failReason} · photo ${failPhoto}` });
              toast.error(`${o.number} marked as failed`, { description: 'Dispatcher and shopper notified.' });
              setFailing(false);
            }}>Submit</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Pickup at branch ----------
  if (o.status === 'ready') {
    const allChecked = items.every((_, i) => checked[i]);
    return (
      <div className="pb-4">
        {header}
        <Steps step={step} />
        <div className="m-4 rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-[#dc2626] flex items-center justify-center"><Store className="w-5 h-5" strokeWidth={1.75} /></div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">FreshMart {b.name}</p>
              <p className="text-xs text-gray-500">{b.address}</p>
              <p className="text-xs text-gray-500 mt-0.5">{b.pickupInstructions} · {distanceKm(rider, b)} km away</p>
            </div>
          </div>
          {!arrivedBranch && (
            <div className="mt-3 space-y-2">
              <NavButtons lat={b.lat} lng={b.lng} />
              <Button className="w-full h-11 rounded-xl" onClick={() => {
                riderNote(o.id, rider.name, NOTE.arrivedBranch, { title: `${o.number}: rider at branch`, body: `${rider.name} is at the pickup counter.` });
                toast.success('Branch notified you have arrived');
              }}><MapPin className="w-4 h-4" /> Arrived at branch</Button>
            </div>
          )}
        </div>

        {arrivedBranch && (
          <div className="px-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900 text-sm">Check items vs packing slip</p>
              <span className="text-xs text-gray-500">{Object.values(checked).filter(Boolean).length}/{items.length} · {o.bagCount ?? Math.max(1, Math.ceil(items.length / 4))} bags</span>
            </div>
            <div className="rounded-2xl border border-gray-100 divide-y divide-gray-100">
              {items.map((it, i) => {
                const sub = it.substitute?.status === 'accepted' ? it.substitute : undefined;
                return (
                  <button key={i} onClick={() => setChecked({ ...checked, [i]: !checked[i] })} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${checked[i] ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>{checked[i] && <Check className="w-3.5 h-3.5" />}</span>
                    <span className="text-lg">{sub?.image ?? it.image}</span>
                    <span className="flex-1 text-sm text-gray-800">{sub ? `${sub.name} (sub)` : it.name}</span>
                    <span className="text-xs font-semibold text-gray-600">{it.soldByWeight ? `${it.actualWeightKg ?? it.estWeightKg ?? it.qty} kg` : `×${it.qty}`}</span>
                  </button>
                );
              })}
            </div>
            <button className="text-xs text-[#1e40af] mt-2" onClick={() => setChecked(Object.fromEntries(items.map((_, i) => [i, true])))}>Check all</button>
            <Button className="w-full h-11 rounded-xl mt-3" disabled={!allChecked} onClick={() => {
              setOrderStatus(o.id, 'out_for_delivery', { by: rider.name });
              toast.success('Pickup confirmed', { description: 'Shopper notified — your rider is on the way!' });
            }}><Package className="w-4 h-4" /> Confirm pickup</Button>
            {!allChecked && <p className="text-[11px] text-gray-400 text-center mt-1">Tick every item to confirm pickup</p>}
          </div>
        )}
      </div>
    );
  }

  // ---------- Delivering ----------
  return (
    <div className="pb-4">
      {header}
      <Steps step={step} />
      <div className="px-4 mt-3">
        <MapView center={[pos.lat, pos.lng]} zoom={14} fitToMarkers className="h-56"
          markers={[
            { id: 'b', lat: b.lat, lng: b.lng, label: '🏪', color: '#dc2626', title: b.name },
            { id: 'd', lat: dest.lat, lng: dest.lng, label: '🏠', color: '#16a34a', title: o.address?.line },
            { id: 'r', lat: pos.lat, lng: pos.lng, label: '🛵', color: '#1e40af', pulse: true, title: 'You' },
          ]}
          lines={[{ points: [[pos.lat, pos.lng], [dest.lat, dest.lng]], color: '#1e40af', dashed: true }]} />
        <div className="flex items-center justify-between mt-2">
          <div>
            <p className="text-2xl font-bold text-[#1e40af]">{arrivedDrop ? 'Arrived' : `${pos.etaMins} min`}</p>
            <p className="text-xs text-gray-500">{arrivedDrop ? 'Complete the handover' : `ETA · ${distanceKm(pos, dest)} km to go`}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toast.info('Calling via masked number', { description: `0917-***-${o.id.length * 731 % 9000 + 1000} · your number stays hidden` })}
              className="w-11 h-11 rounded-full bg-green-50 text-green-700 flex items-center justify-center"><Phone className="w-5 h-5" /></button>
            <button onClick={() => setChatOpen((v) => !v)} className="w-11 h-11 rounded-full bg-blue-50 text-[#1e40af] flex items-center justify-center"><MessageCircle className="w-5 h-5" /></button>
          </div>
        </div>
        {chatOpen && (
          <div className="mt-2 rounded-xl border border-gray-100 p-2 space-y-1.5">
            <p className="text-[11px] text-gray-500 px-1">Quick message to {o.customerName.split(' ')[0]} (masked chat)</p>
            {QUICK_CHAT.map((m) => (
              <button key={m} onClick={() => { sendRiderChat(o, rider, m); toast.success('Message sent'); setChatOpen(false); }}
                className="w-full text-left text-sm rounded-lg bg-gray-50 hover:bg-blue-50 px-3 py-2">{m}</button>
            ))}
          </div>
        )}

        <div className="mt-3 rounded-2xl border border-gray-100 p-3">
          <p className="font-semibold text-gray-900 text-sm">{o.customerName}</p>
          <p className="text-xs text-gray-600">{o.address?.line}</p>
          {o.address?.landmark && <p className="text-xs text-gray-500">Landmark: {o.address.landmark}</p>}
          {o.riderInstructions && <p className="text-xs mt-1.5 rounded-lg bg-amber-50 text-amber-900 px-2 py-1.5">“{o.riderInstructions}”</p>}
          {isCod && <p className="text-xs mt-1.5 font-semibold text-[#dc2626] flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Collect {peso(o.total)} cash</p>}
        </div>

        {!arrivedDrop ? (
          <div className="mt-3 space-y-2">
            <NavButtons lat={dest.lat} lng={dest.lng} />
            <Button className="w-full h-11 rounded-xl" onClick={() => {
              riderNote(o.id, rider.name, NOTE.arrivedDrop, undefined, `${rider.name} has arrived at your address.`);
              toast.success('Shopper notified you have arrived');
            }}><MapPin className="w-4 h-4" /> Arrived</Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Proof of delivery <span className="text-xs font-normal text-gray-500">· {method}</span></p>
            {method.includes('Photo') && <PhotoCapture value={photo} onChange={setPhoto} />}
            {method.includes('PIN') && <PinEntry value={pin} onChange={setPin} expected={o.pickupPin} />}
            {method === 'Signature' && <SignaturePad onChange={setSigned} />}

            {isCod && (
              <div className="rounded-2xl bg-gray-50 p-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Amount to collect</span><b className="text-gray-900">{peso(o.total)}</b></div>
                <label className="block text-xs text-gray-600">Cash received
                  <input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00"
                    className="mt-1 w-full h-11 rounded-xl border border-gray-300 bg-white px-3 text-lg font-semibold outline-none focus:border-[#1e40af]" />
                </label>
                <div className="flex gap-1.5">
                  {[Math.ceil(o.total / 100) * 100, Math.ceil(o.total / 500) * 500, Math.ceil(o.total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                    <button key={v} onClick={() => setCash(String(v))} className="flex-1 text-xs rounded-lg bg-white border border-gray-200 py-1.5">{pesoShort(v)}</button>
                  ))}
                </div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Change to give</span><b className={cashNum >= o.total ? 'text-green-700' : 'text-gray-400'}>{cashNum >= o.total ? peso(cashNum - o.total) : '—'}</b></div>
              </div>
            )}

            <Button className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-base" disabled={!podOk || !codOk} onClick={() => {
              mutate((d) => {
                const notes = [`POD: ${method}${photo ? ` (${photo})` : ''}${method.includes('PIN') ? ' · PIN verified' : ''}${method === 'Signature' ? ' · signed' : ''}`];
                if (isCod) notes.push(`COD ${peso(o.total)} · cash ${peso(cashNum)} · change ${peso(cashNum - o.total)}`);
                applyStatus(d, o.id, 'delivered', { by: rider.name, note: notes.join(' · ') });
              });
              toast.success(`${o.number} delivered!`, { description: `+${pesoShort(tripEarnings(s, o, rider))} earned${isCod ? ` · ${peso(o.total)} cash added to COD held` : ''}` });
            }}><CheckCircle2 className="w-5 h-5" /> Delivered</Button>
            {(!podOk || !codOk) && <p className="text-[11px] text-gray-400 text-center -mt-1">{!podOk ? 'Complete proof of delivery' : 'Enter cash received'}</p>}
          </div>
        )}
        <button onClick={() => setFailing(true)} className="w-full mt-3 text-sm text-[#dc2626] font-medium py-2">Can&apos;t deliver? Report a problem</button>
      </div>
    </div>
  );
}
