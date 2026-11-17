'use client';

import { useState } from 'react';
import { Calculator, CirclePause, MapPinned, Pencil, Plus, Store } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, inputClass, selectClass } from '@/src/components/common';
import { MapView } from '@/src/components/MapView';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { calcDeliveryFee, can, getSetting, num, peso, pesoShort } from '@/src/lib/logic';
import type { DeliveryZone } from '@/src/lib/types';

const ZONE_COLORS = ['#c8151d', '#7c3aed', '#0891b2', '#16a34a', '#d97706'];
const FEE_LABEL: Record<DeliveryZone['feeModel'], string> = { flat: 'Flat fee', distance: 'Base + per km', tiers: 'Order-value tiers' };

function feeSummary(z: DeliveryZone) {
  if (z.feeModel === 'flat') return `${pesoShort(z.flatFee)} flat`;
  if (z.feeModel === 'distance') return `${pesoShort(z.baseFee)} + ${pesoShort(z.perKm)}/km`;
  return `${pesoShort(z.flatFee)} · ₱39 from ₱1,000 · free from ₱2,000`;
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-[#c8151d]' : 'bg-gray-300'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

/** Point `km` east of the branch, used when the calculator is given a plain distance. */
function pointAt(lat: number, lng: number, km: number) {
  return { lat, lng: lng + km / (111.32 * Math.cos((lat * Math.PI) / 180)) };
}

export default function ZonesPage() {
  const s = useStore();
  const [branchId, setBranchId] = useState(s.session.branchId);
  const [edit, setEdit] = useState<DeliveryZone | undefined>();
  const [msgDraft, setMsgDraft] = useState<string | undefined>();
  const [calcMode, setCalcMode] = useState<'distance' | 'customer'>('distance');
  const [km, setKm] = useState(2.5);
  const [custKey, setCustKey] = useState('');
  const [subtotal, setSubtotal] = useState(850);

  if (!can(s, 'settings.view')) {
    return <DashboardLayout title="Zones & Fees" eyebrow="Delivery"><AccessDenied permission="settings.view" /></DashboardLayout>;
  }
  const canEdit = can(s, 'settings.edit');
  const branch = s.branches.find((b) => b.id === branchId) ?? s.branches[0];
  const zones = s.zones.filter((z) => z.branchId === branch.id).sort((a, b) => a.radiusKm - b.radiusKm);
  const paused = getSetting(s, 'deliveryPaused', branch.id) === true;
  const message = msgDraft ?? branch.pausedMessage ?? '';
  const slotCap = num(getSetting(s, 'slotCapacity', branch.id));

  // Slot capacity: today's open scheduled delivery orders by slot label.
  const openSched = s.orders.filter((o) => o.branchId === branch.id && o.fulfillment === 'delivery' && o.slot !== 'ASAP' && !['delivered', 'cancelled', 'failed_delivery'].includes(o.status));
  const nowH = new Date().getHours();
  const slots = Array.from({ length: 5 }, (_, i) => nowH + 1 + i).filter((h) => h < 22).map((h) => {
    const fmt = (x: number) => `${((x + 11) % 12) + 1}:00`;
    const label = `Today ${fmt(h)}–${fmt(h + 1)} ${h + 1 >= 12 ? 'PM' : 'AM'}`;
    const used = openSched.filter((o) => o.slot === label).length + ((h * 7 + branch.id.length) % 5);
    return { label, used: Math.min(used, slotCap) };
  });

  const togglePause = (v: boolean) => {
    mutate((d) => {
      const st = d.settings.find((x) => x.key === 'deliveryPaused');
      const b = d.branches.find((x) => x.id === branch.id);
      if (!st || !b) return;
      st.branch[branch.id] = v;
      if (v) b.pausedMessage = message || 'Delivery is paused right now. Pickup is still available.';
      addAudit(d, { module: 'Settings', action: v ? 'Delivery paused' : 'Delivery resumed', branchId: branch.id, detail: `${b.name}${v ? ` — “${b.pausedMessage}”` : ''}`, oldValue: String(!v), newValue: String(v) });
    });
    toast.success(v ? `Delivery paused at ${branch.name}` : `Delivery resumed at ${branch.name}`, { description: v ? 'Shoppers now see your message and can still choose pickup.' : undefined });
  };
  const saveMessage = () => {
    mutate((d) => {
      const b = d.branches.find((x) => x.id === branch.id);
      if (!b) return;
      addAudit(d, { module: 'Settings', action: 'Pause message updated', branchId: b.id, detail: b.name, oldValue: b.pausedMessage ?? '', newValue: message });
      b.pausedMessage = message;
    });
    setMsgDraft(undefined);
    toast.success('Message saved');
  };

  const toggleZone = (z: DeliveryZone) => {
    mutate((d) => {
      const x = d.zones.find((y) => y.id === z.id);
      if (!x) return;
      x.active = !x.active;
      addAudit(d, { module: 'Settings', action: x.active ? 'Zone activated' : 'Zone deactivated', branchId: z.branchId, detail: z.name, oldValue: String(!x.active), newValue: String(x.active) });
    });
  };

  // Fee calculator
  const custOptions = s.customers.flatMap((c) => c.addresses.map((a, i) => ({ key: `${c.id}:${i}`, label: `${c.name} · ${a.label} · ${a.line}`, a })));
  const custAddr = custOptions.find((x) => x.key === custKey)?.a;
  const addr = calcMode === 'customer' && custAddr ? custAddr : pointAt(branch.lat, branch.lng, km);
  const fee = calcDeliveryFee(s, branch.id, subtotal, addr);
  const belowMin = fee.zone && subtotal < fee.zone.minOrder;

  const markers = [
    { id: branch.id, lat: branch.lat, lng: branch.lng, label: '🏪', color: '#dc2626', title: branch.name },
    { id: 'calc', lat: addr.lat, lng: addr.lng, label: '📍', color: fee.outside ? '#9ca3af' : '#16a34a', title: `Fee calculator point · ${fee.distance} km` },
  ];
  const circles = zones.filter((z) => z.active).map((z, i) => ({ lat: branch.lat, lng: branch.lng, radiusKm: z.radiusKm, color: ZONE_COLORS[i % ZONE_COLORS.length] }));

  return (
    <DashboardLayout title="Zones & Fees" eyebrow="Delivery">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Store className="w-4 h-4 text-gray-400" strokeWidth={1.75} />
        <select className={`${selectClass} max-w-full`} value={branch.id} onChange={(e) => { setBranchId(e.target.value); setMsgDraft(undefined); setCustKey(''); }}>
          {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
        </select>
        {!branch.services.delivery && <Pill className="bg-gray-200 text-gray-700">Delivery service is off for this branch (pickup only)</Pill>}
        {paused && <Pill className="bg-amber-100 text-amber-800"><CirclePause className="w-3 h-3" /> Delivery paused</Pill>}
        <span className="text-xs text-gray-500 ml-auto">{zones.filter((z) => z.active).length} active zones · {branch.address}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6">
        <div className="space-y-6">
          <Panel title="Delivery zones" action={canEdit && <Button size="sm" onClick={() => setEdit({ id: '', branchId: branch.id, name: `${branch.name} ${zones.length ? 'outer' : '0–3 km'}`, type: 'radius', radiusKm: zones.length ? Math.max(...zones.map((z) => z.radiusKm)) + 3 : 3, feeModel: 'flat', flatFee: 49, baseFee: 49, perKm: 10, freeAbove: 1500, minOrder: 300, etaMins: 45, active: true })}><Plus className="w-4 h-4" /> Add zone</Button>} bodyClass="p-0">
            {zones.length === 0 ? (
              <EmptyState title="No delivery zones" sub="Shoppers outside every zone see a pickup suggestion" icon={<MapPinned className="w-8 h-8" />} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {zones.map((z, i) => (
                  <li key={z.id} className={`px-4 sm:px-5 py-4 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 ${z.active ? '' : 'opacity-60'}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{z.name} <Pill className="ml-1">{z.type === 'radius' ? `Radius ${z.radiusKm} km` : `Areas · ${z.radiusKm} km`}</Pill></p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {FEE_LABEL[z.feeModel]}: <b className="text-gray-700">{feeSummary(z)}</b> · Min order {pesoShort(z.minOrder)}
                        {z.freeAbove ? ` · Free above ${pesoShort(z.freeAbove)}` : ''} · ETA {z.etaMins} min
                      </p>
                      {z.areas?.length ? <p className="text-xs text-gray-400 mt-0.5">Areas: {z.areas.join(', ')}</p> : null}
                    </div>
                    <Toggle on={z.active} disabled={!canEdit} onChange={() => toggleZone(z)} />
                    {canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit({ ...z })}><Pencil className="w-3.5 h-3.5" /> Edit</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Zone map" bodyClass="p-3">
            <MapView key={branch.id} center={[branch.lat, branch.lng]} zoom={12} markers={markers} circles={circles} className="h-72 sm:h-96" />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={<div className="flex items-center gap-2"><CirclePause className="w-4 h-4 text-amber-600" strokeWidth={1.75} /><h2 className="text-base font-semibold text-gray-900">Delivery paused</h2></div>}
            action={<Toggle on={paused} disabled={!canEdit} onChange={togglePause} />}>
            <p className="text-xs text-gray-500 mb-3">Use for rider shortage, storms or system issues. Pickup stays open; shoppers see this message at checkout.</p>
            <textarea className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus-glow outline-none" rows={3} value={message} disabled={!canEdit}
              placeholder="e.g. Delivery is paused due to heavy rain. Pickup is available." onChange={(e) => setMsgDraft(e.target.value)} />
            {msgDraft !== undefined && msgDraft !== (branch.pausedMessage ?? '') && <Button size="sm" className="mt-2" onClick={saveMessage}>Save message</Button>}
          </Panel>

          <Panel title="Slot capacity" action={<span className="text-xs text-gray-500">{slotCap} orders / slot</span>}>
            <div className="space-y-2.5">
              {slots.length === 0 && <p className="text-sm text-gray-500">No more slots today.</p>}
              {slots.map((sl) => (
                <div key={sl.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700">{sl.label.replace('Today ', '')}</span>
                    <span className={sl.used >= slotCap ? 'text-[#dc2626] font-semibold' : 'text-gray-500'}>{sl.used >= slotCap ? 'Full' : `${sl.used}/${slotCap}`}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${sl.used >= slotCap ? 'bg-[#dc2626]' : 'bg-[#c8151d]'}`} style={{ width: `${(sl.used / Math.max(1, slotCap)) * 100}%` }} /></div>
                </div>
              ))}
              <p className="text-[11px] text-gray-400">Capacity comes from the “Orders per delivery slot” setting (branch override wins).</p>
            </div>
          </Panel>

          <Panel title={<div className="flex items-center gap-2"><Calculator className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} /><h2 className="text-base font-semibold text-gray-900">Fee calculator</h2></div>}>
            <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3 text-xs">
              {(['distance', 'customer'] as const).map((m) => (
                <button key={m} onClick={() => setCalcMode(m)} className={`flex-1 rounded-md py-1.5 font-medium ${calcMode === m ? 'bg-white shadow-sm text-[#c8151d]' : 'text-gray-600'}`}>{m === 'distance' ? 'By distance' : 'Customer address'}</button>
              ))}
            </div>
            <div className="space-y-3">
              {calcMode === 'distance' ? (
                <Field label={`Distance from ${branch.name}: ${km} km`}>
                  <input type="range" min={0.5} max={12} step={0.5} value={km} onChange={(e) => setKm(Number(e.target.value))} className="w-full accent-[#c8151d]" />
                </Field>
              ) : (
                <Field label="Customer address">
                  <select className={`${selectClass} w-full`} value={custKey} onChange={(e) => setCustKey(e.target.value)}>
                    <option value="">Choose a saved address…</option>
                    {custOptions.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Basket subtotal (₱)">
                <input type="number" className={`${inputClass} w-full`} value={subtotal} min={0} onChange={(e) => setSubtotal(Number(e.target.value) || 0)} />
              </Field>
              <div className={`rounded-lg p-3 ${fee.outside ? 'bg-gray-50 border border-gray-200' : 'bg-red-50/60 border border-red-100'}`}>
                {fee.outside ? (
                  <>
                    <p className="text-sm font-semibold text-gray-800">Outside delivery zones ({fee.distance} km)</p>
                    <p className="text-xs text-gray-500 mt-0.5">Shopper sees: “We don&apos;t deliver here yet — pick up at {branch.name} instead.”</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-gray-500">Delivery fee</span>
                      <span className="text-2xl font-bold text-[#c8151d]">{peso(fee.fee)}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">Rule: {fee.rule}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Distance {fee.distance} km · ETA {fee.zone?.etaMins} min</p>
                    {belowMin && <p className="text-xs text-[#dc2626] mt-1">Below zone minimum order of {pesoShort(fee.zone!.minOrder)} — checkout blocked.</p>}
                  </>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <ZoneDialog zone={edit} onClose={() => setEdit(undefined)} />
    </DashboardLayout>
  );
}

function ZoneDialog({ zone, onClose }: { zone?: DeliveryZone; onClose: () => void }) {
  const [f, setF] = useState<DeliveryZone | undefined>(zone);
  const [areasText, setAreasText] = useState('');
  const [prevId, setPrevId] = useState<string | undefined>();
  // Reset the form when a different zone is opened.
  const key = zone ? zone.id || 'new' : undefined;
  if (key !== prevId) {
    setPrevId(key);
    setF(zone);
    setAreasText(zone?.areas?.join(', ') ?? '');
  }
  if (!f) return <Dialog open={false} />;
  const set = <K extends keyof DeliveryZone>(k: K, v: DeliveryZone[K]) => setF({ ...f, [k]: v });
  const n = (v: string) => Number(v) || 0;

  const save = () => {
    if (!f.name.trim()) { toast.error('Zone name is required'); return; }
    const next: DeliveryZone = { ...f, areas: f.type === 'areas' ? areasText.split(',').map((x) => x.trim()).filter(Boolean) : undefined, freeAbove: f.freeAbove || undefined };
    mutate((d) => {
      const b = d.branches.find((x) => x.id === f.branchId);
      if (!f.id) {
        next.id = uid('z');
        d.zones.push(next);
        addAudit(d, { module: 'Settings', action: 'Delivery zone added', branchId: f.branchId, detail: `${b?.name}: ${next.name} (${next.radiusKm} km, ${FEE_LABEL[next.feeModel]})` });
      } else {
        const i = d.zones.findIndex((x) => x.id === f.id);
        const old = d.zones[i];
        d.zones[i] = next;
        addAudit(d, { module: 'Settings', action: 'Delivery zone updated', branchId: f.branchId, detail: `${b?.name}: ${next.name}`, oldValue: `${old.radiusKm} km · ${feeSummary(old)} · min ${old.minOrder}`, newValue: `${next.radiusKm} km · ${feeSummary(next)} · min ${next.minOrder}` });
      }
    });
    toast.success(f.id ? 'Zone updated' : 'Zone added', { description: 'New fees apply to the next checkout in the Customer App and Order Desk.' });
    onClose();
  };

  return (
    <Dialog open={!!zone} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{f.id ? 'Edit zone' : 'Add zone'}</DialogTitle>
          <DialogDescription>Fees are calculated at checkout and the rule applied is stored with the order.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Zone name"><input className={`${inputClass} w-full`} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field></div>
          <Field label="Zone type">
            <select className={`${selectClass} w-full`} value={f.type} onChange={(e) => set('type', e.target.value as DeliveryZone['type'])}>
              <option value="radius">Radius from branch</option><option value="areas">List of areas</option>
            </select>
          </Field>
          <Field label="Radius (km)"><input type="number" step="0.5" className={`${inputClass} w-full`} value={f.radiusKm} onChange={(e) => set('radiusKm', n(e.target.value))} /></Field>
          {f.type === 'areas' && <div className="col-span-2"><Field label="Areas / barangays (comma-separated)"><input className={`${inputClass} w-full`} value={areasText} onChange={(e) => setAreasText(e.target.value)} /></Field></div>}
          <div className="col-span-2">
            <Field label="Fee model">
              <select className={`${selectClass} w-full`} value={f.feeModel} onChange={(e) => set('feeModel', e.target.value as DeliveryZone['feeModel'])}>
                <option value="flat">Flat fee</option><option value="distance">Distance-based (base + per km)</option><option value="tiers">Order-value tiers</option>
              </select>
            </Field>
          </div>
          {f.feeModel !== 'distance' && <Field label={f.feeModel === 'tiers' ? 'Fee below ₱1,000 (₱)' : 'Flat fee (₱)'} hint={f.feeModel === 'tiers' ? '₱39 from ₱1,000 · free from ₱2,000' : undefined}><input type="number" className={`${inputClass} w-full`} value={f.flatFee} onChange={(e) => set('flatFee', n(e.target.value))} /></Field>}
          {f.feeModel === 'distance' && <>
            <Field label="Base fee (₱)"><input type="number" className={`${inputClass} w-full`} value={f.baseFee} onChange={(e) => set('baseFee', n(e.target.value))} /></Field>
            <Field label="Per km (₱)"><input type="number" className={`${inputClass} w-full`} value={f.perKm} onChange={(e) => set('perKm', n(e.target.value))} /></Field>
          </>}
          <Field label="Free delivery above (₱)" hint="0 = never free"><input type="number" className={`${inputClass} w-full`} value={f.freeAbove ?? 0} onChange={(e) => set('freeAbove', n(e.target.value))} /></Field>
          <Field label="Minimum order (₱)"><input type="number" className={`${inputClass} w-full`} value={f.minOrder} onChange={(e) => set('minOrder', n(e.target.value))} /></Field>
          <Field label="Estimated time (min)"><input type="number" className={`${inputClass} w-full`} value={f.etaMins} onChange={(e) => set('etaMins', n(e.target.value))} /></Field>
          <label className="flex items-center gap-2 text-sm mt-5"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="accent-[#c8151d] w-4 h-4" /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{f.id ? 'Save changes' : 'Add zone'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
