'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2, MapPin, Phone, Clock, Plus, Pencil, Users, Bike, ShoppingBag, Copy, Sparkles, BarChart3, Store, Mail, Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, StatCard, Pill, inputClass, selectClass } from '@/src/components/common';
import { MapView } from '@/src/components/MapView';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Toggle, Field, EntityStatus, Tip } from '@/src/components/admin/ui';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { can, cityName, isToday, onHand, peso, pesoShort } from '@/src/lib/logic';
import type { AppState, Branch, City } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

type ServiceKey = keyof Branch['services'];
const SERVICES: { key: ServiceKey; label: string }[] = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'walkIn', label: 'Walk-in' },
  { key: 'phone', label: 'Phone' },
  { key: 'picker', label: 'Picker role' },
];

function staffForBranch(s: AppState, b: Branch) {
  return s.staff.filter((u) =>
    (u.scope.type === 'branches' && u.scope.ids.includes(b.id)) || (u.scope.type === 'cities' && u.scope.ids.includes(b.cityId)),
  );
}

function branchMetrics(s: AppState, b: Branch) {
  const orders = s.orders.filter((o) => o.branchId === b.id && o.status !== 'cancelled');
  const sales = orders.reduce((a, o) => a + o.total, 0);
  const done = orders.filter((o) => o.completedAt);
  const speed = done.length
    ? done.reduce((a, o) => a + (new Date(o.completedAt!).getTime() - new Date(o.placedAt).getTime()) / 60000, 0) / done.length
    : 0;
  const active = s.products.filter((p) => p.status === 'active');
  const healthy = active.filter((p) => onHand(s, p.id, b.id) > p.reorderPoint).length;
  return {
    orders: orders.length,
    sales,
    avg: orders.length ? sales / orders.length : 0,
    speed,
    stock: active.length ? Math.round((healthy / active.length) * 100) : 0,
    today: s.orders.filter((o) => o.branchId === b.id && isToday(o.placedAt)).length,
  };
}

// ---------------------------------------------------------------------------

export default function BranchesPage() {
  const s = useStore();
  const [cityDlg, setCityDlg] = useState<City | 'new' | null>(null);
  const [branchDlg, setBranchDlg] = useState<Branch | 'new' | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState('all');

  const metrics = useMemo(() => Object.fromEntries(s.branches.map((b) => [b.id, branchMetrics(s, b)])), [s]);

  if (!can(s, 'settings.view')) {
    return <DashboardLayout title="Cities & Branches" eyebrow="Administration" hideBranch><AccessDenied permission="settings.view" /></DashboardLayout>;
  }
  const editable = can(s, 'settings.edit');

  const toggleService = (b: Branch, key: ServiceKey) => {
    if (!editable) return toast.error('You need settings.edit to change services');
    const next = !b.services[key];
    mutate((d) => {
      const x = d.branches.find((y) => y.id === b.id)!;
      x.services[key] = next;
      addAudit(d, { module: 'Branches', action: 'Service switch', detail: `${b.name}: ${SERVICES.find((v) => v.key === key)!.label} turned ${next ? 'on' : 'off'}`, branchId: b.id, oldValue: next ? 'off' : 'on', newValue: next ? 'on' : 'off' });
    });
    toast.success(`${SERVICES.find((v) => v.key === key)!.label} ${next ? 'enabled' : 'disabled'} at ${b.name}`, { description: 'Shopper app updates instantly.' });
  };

  const setCityStatus = (c: City, status: City['status']) => {
    mutate((d) => {
      d.cities.find((x) => x.id === c.id)!.status = status;
      addAudit(d, { module: 'Branches', action: 'City status', detail: `${c.name} set to ${status}`, oldValue: c.status, newValue: status });
    });
    toast.success(`${c.name} is now ${status}`);
  };

  const visibleCities = s.cities.filter((c) => cityFilter === 'all' || c.id === cityFilter);
  const activeBranches = s.branches.filter((b) => b.status === 'active').length;
  const todayTotal = s.branches.reduce((a, b) => a + (metrics[b.id]?.today ?? 0), 0);
  const detailBranch = s.branches.find((b) => b.id === detail);

  return (
    <DashboardLayout title="Cities & Branches" eyebrow="Administration" hideBranch>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Cities" value={s.cities.length} sub={`${s.cities.filter((c) => c.status === 'active').length} active`} icon={<Building2 className="w-5 h-5" strokeWidth={1.75} />} />
          <StatCard title="Branches" value={s.branches.length} sub={`${activeBranches} active · ${s.branches.length - activeBranches} paused/closed`} icon={<Store className="w-5 h-5" strokeWidth={1.75} />} />
          <StatCard title="Orders today" value={todayTotal} sub="All branches" accent="border-l-emerald-500" icon={<ShoppingBag className="w-5 h-5" strokeWidth={1.75} />} />
          <StatCard title="Staff accounts" value={s.staff.filter((u) => u.status !== 'deactivated').length} sub={`${s.riders.length} riders`} accent="border-l-amber-500" icon={<Users className="w-5 h-5" strokeWidth={1.75} />} />
        </div>

        <Tip>
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
          <span><b>No code change needed to expand.</b> Opening a new branch (or a whole new city, e.g. Chain C) is done here: add it, clone settings from an existing branch, and it appears in the Shopper App, Order Desk and Rider App immediately.</span>
        </Tip>

        {/* Cities */}
        <Panel
          title="Cities"
          action={editable && <Button size="sm" onClick={() => setCityDlg('new')}><Plus className="w-4 h-4" strokeWidth={1.75} />Add city</Button>}
          bodyClass="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">City</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Branches</TableHead>
                <TableHead>Orders today</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.cities.map((c) => {
                const bs = s.branches.filter((b) => b.cityId === c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-5 font-medium text-gray-900">{c.name}</TableCell>
                    <TableCell className="text-gray-600">{c.region}</TableCell>
                    <TableCell>{bs.length}</TableCell>
                    <TableCell className="font-semibold text-[#1e40af]">{bs.reduce((a, b) => a + (metrics[b.id]?.today ?? 0), 0)}</TableCell>
                    <TableCell><EntityStatus status={c.status} /></TableCell>
                    <TableCell className="text-right pr-5">
                      {editable && (
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setCityDlg(c)}><Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />Edit</Button>
                          {c.status !== 'active' && <Button size="sm" variant="outline" onClick={() => setCityStatus(c, 'active')}>Activate</Button>}
                          {c.status === 'active' && <Button size="sm" variant="outline" onClick={() => setCityStatus(c, 'paused')}>Pause</Button>}
                          {c.status !== 'closed' && <Button size="sm" variant="ghost" className="text-[#dc2626]" onClick={() => setCityStatus(c, 'closed')}>Close</Button>}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>

        {/* Branches */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Branches</h2>
          <div className="flex items-center gap-2">
            <select className={selectClass} value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
              <option value="all">All cities</option>
              {s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {editable && <Button onClick={() => setBranchDlg('new')}><Plus className="w-4 h-4" strokeWidth={1.75} />Add branch</Button>}
          </div>
        </div>

        {visibleCities.map((c) => {
          const bs = s.branches.filter((b) => b.cityId === c.id);
          return (
            <div key={c.id} className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <MapPin className="w-4 h-4" strokeWidth={1.75} />
                <span className="font-medium text-gray-700">{c.name}</span>
                <span>· {c.region}</span>
                <EntityStatus status={c.status} />
              </div>
              {bs.length === 0 && <p className="text-sm text-gray-400 pl-6">No branches yet in this city.</p>}
              <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
                {bs.map((b) => {
                  const m = metrics[b.id];
                  return (
                    <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-semibold bg-[#1e40af]/10 text-[#1e40af] rounded px-1.5 py-0.5">{b.code}</span>
                            <h3 className="font-semibold text-gray-900 truncate">{b.name}</h3>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" strokeWidth={1.75} />{b.address}</p>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" strokeWidth={1.75} />{b.phone}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" strokeWidth={1.75} />{b.hours}</span>
                          </p>
                        </div>
                        <EntityStatus status={b.status} />
                      </div>
                      {b.status === 'paused' && b.pausedMessage && (
                        <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">Shoppers see: “{b.pausedMessage}”</p>
                      )}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-gray-50 py-2"><p className="text-lg font-bold text-[#1e40af]">{m?.today ?? 0}</p><p className="text-[11px] text-gray-500">Orders today</p></div>
                        <div className="rounded-lg bg-gray-50 py-2"><p className="text-lg font-bold text-[#1e40af]">{staffForBranch(s, b).length}</p><p className="text-[11px] text-gray-500">Staff</p></div>
                        <div className="rounded-lg bg-gray-50 py-2"><p className="text-lg font-bold text-[#1e40af]">{s.riders.filter((r) => r.branchIds.includes(b.id)).length}</p><p className="text-[11px] text-gray-500">Riders</p></div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {SERVICES.map((sv) => (
                          <label key={sv.key} className="flex items-center gap-1.5 text-xs text-gray-700">
                            <Toggle size="sm" checked={b.services[sv.key]} disabled={!editable} onChange={() => toggleService(b, sv.key)} label={sv.label} />
                            {sv.label}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-1 border-t border-gray-100 -mx-5 px-5 pt-3 mt-auto">
                        <Button size="sm" variant="outline" onClick={() => setDetail(b.id)}>Details</Button>
                        {editable && <Button size="sm" variant="ghost" onClick={() => setBranchDlg(b)}><Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />Edit</Button>}
                        <Button size="sm" variant="ghost" asChild><Link href="/admin/settings"><Settings className="w-3.5 h-3.5" strokeWidth={1.75} />Settings</Link></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <ComparisonPanel metrics={metrics} />
      </div>

      {cityDlg && <CityDialog city={cityDlg === 'new' ? null : cityDlg} onClose={() => setCityDlg(null)} />}
      {branchDlg && <BranchDialog branch={branchDlg === 'new' ? null : branchDlg} onClose={() => setBranchDlg(null)} />}
      {detailBranch && <BranchDetail branch={detailBranch} metrics={metrics[detailBranch.id]} onClose={() => setDetail(null)} />}
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------

function ComparisonPanel({ metrics }: { metrics: Record<string, ReturnType<typeof branchMetrics>> }) {
  const s = useStore();
  const [ids, setIds] = useState<string[]>(() => s.branches.slice(0, 4).map((b) => b.id));
  const bs = s.branches.filter((b) => ids.includes(b.id));
  const rows: { label: string; get: (m: ReturnType<typeof branchMetrics>) => number; fmt: (n: number) => string; better: 'high' | 'low' }[] = [
    { label: 'Sales (all time in demo)', get: (m) => m.sales, fmt: pesoShort, better: 'high' },
    { label: 'Orders', get: (m) => m.orders, fmt: (n) => String(n), better: 'high' },
    { label: 'Average basket', get: (m) => m.avg, fmt: peso, better: 'high' },
    { label: 'Fulfilment speed (placed → done)', get: (m) => m.speed, fmt: (n) => (n ? `${Math.round(n)} min` : '—'), better: 'low' },
    { label: 'Stock health (SKUs above reorder point)', get: (m) => m.stock, fmt: (n) => `${n}%`, better: 'high' },
  ];
  return (
    <Panel
      title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#1e40af]" strokeWidth={1.75} />Branch comparison</h2>}
      action={
        <div className="flex flex-wrap gap-1">
          {s.branches.map((b) => (
            <button key={b.id} onClick={() => setIds((x) => (x.includes(b.id) ? x.filter((y) => y !== b.id) : [...x, b.id]))}
              className={cn('text-xs rounded-full px-2.5 py-1 border transition-colors', ids.includes(b.id) ? 'bg-[#1e40af] text-white border-[#1e40af]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')}>
              {b.name}
            </button>
          ))}
        </div>
      }
      bodyClass="p-0 overflow-x-auto"
    >
      {bs.length === 0 ? <p className="p-5 text-sm text-gray-400">Pick branches to compare.</p> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Metric</TableHead>
              {bs.map((b) => <TableHead key={b.id}>{b.name} <span className="text-gray-400 font-normal">({cityName(s, b.cityId)})</span></TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const vals = bs.map((b) => r.get(metrics[b.id]));
              const valid = vals.filter((v) => v > 0);
              const best = valid.length ? (r.better === 'high' ? Math.max(...valid) : Math.min(...valid)) : null;
              const max = Math.max(...vals, 1);
              return (
                <TableRow key={r.label}>
                  <TableCell className="pl-5 text-gray-600">{r.label}</TableCell>
                  {bs.map((b, i) => (
                    <TableCell key={b.id}>
                      <div className="flex flex-col gap-1 min-w-[110px]">
                        <span className={cn('font-semibold', vals[i] === best ? 'text-emerald-700' : 'text-gray-900')}>
                          {r.fmt(vals[i])}{vals[i] === best && bs.length > 1 && <span className="ml-1 text-[10px] font-medium text-emerald-600">best</span>}
                        </span>
                        <div className="h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-[#1e40af]/70" style={{ width: `${(vals[i] / max) * 100}%` }} /></div>
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function CityDialog({ city, onClose }: { city: City | null; onClose: () => void }) {
  const [f, setF] = useState<Omit<City, 'id'>>({ name: city?.name ?? '', region: city?.region ?? 'Luzon', status: city?.status ?? 'active' });
  const save = () => {
    if (!f.name.trim()) return toast.error('City name is required');
    mutate((d) => {
      if (city) {
        const x = d.cities.find((c) => c.id === city.id)!;
        addAudit(d, { module: 'Branches', action: 'Edit city', detail: `${city.name} updated`, oldValue: `${city.name} · ${city.region} · ${city.status}`, newValue: `${f.name} · ${f.region} · ${f.status}` });
        Object.assign(x, f);
      } else {
        d.cities.push({ id: uid('c'), ...f });
        addAudit(d, { module: 'Branches', action: 'Add city', detail: `New city ${f.name} (${f.region})`, newValue: f.status });
      }
    });
    toast.success(city ? 'City updated' : `${f.name} added`, { description: city ? undefined : 'Now add its first branch.' });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{city ? 'Edit city' : 'Add city'}</DialogTitle>
          <DialogDescription>Cities group branches and can carry their own setting overrides.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="City name"><input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Iloilo City" /></Field>
          <Field label="Region">
            <select className={selectClass} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>
              {['Luzon', 'NCR', 'Visayas', 'Mindanao'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectClass} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as City['status'] })}>
              <option value="active">Active</option><option value="paused">Paused</option><option value="closed">Closed</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{city ? 'Save changes' : 'Add city'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({
    name: branch?.name ?? '', code: branch?.code ?? '', cityId: branch?.cityId ?? s.cities[0]?.id ?? '',
    address: branch?.address ?? '', lat: String(branch?.lat ?? ''), lng: String(branch?.lng ?? ''),
    phone: branch?.phone ?? '', email: branch?.email ?? '', hours: branch?.hours ?? '8:00 AM – 9:00 PM',
    status: branch?.status ?? 'active', pausedMessage: branch?.pausedMessage ?? '',
    pickupInstructions: branch?.pickupInstructions ?? 'Pickup counter near the entrance',
    services: branch?.services ?? { delivery: true, pickup: true, walkIn: true, phone: true, picker: true },
  });
  const [cloneFrom, setCloneFrom] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    if (!f.name.trim() || !f.code.trim()) return toast.error('Name and code are required');
    const code = f.code.trim().toUpperCase();
    if (s.branches.some((b) => b.code === code && b.id !== branch?.id)) return toast.error(`Code ${code} is already used`);
    const city = s.cities.find((c) => c.id === f.cityId);
    const lat = Number(f.lat) || (s.branches.find((b) => b.cityId === f.cityId)?.lat ?? 7.07);
    const lng = Number(f.lng) || (s.branches.find((b) => b.cityId === f.cityId)?.lng ?? 125.6);
    const data = {
      name: f.name.trim(), code, cityId: f.cityId, address: f.address, lat, lng, phone: f.phone, email: f.email, hours: f.hours,
      status: f.status as Branch['status'], pausedMessage: f.status === 'paused' ? f.pausedMessage : undefined,
      pickupInstructions: f.pickupInstructions, services: { ...f.services },
    };
    let clonedSettings = 0;
    let clonedZones = 0;
    mutate((d) => {
      if (branch) {
        const x = d.branches.find((b) => b.id === branch.id)!;
        const changes: string[] = [];
        if (x.status !== data.status) changes.push(`status ${x.status} → ${data.status}`);
        if (x.hours !== data.hours) changes.push(`hours ${x.hours} → ${data.hours}`);
        if (x.name !== data.name) changes.push(`name ${x.name} → ${data.name}`);
        addAudit(d, { module: 'Branches', action: 'Edit branch', detail: `${data.name} updated${changes.length ? ': ' + changes.join(', ') : ''}`, branchId: branch.id, oldValue: branch.status, newValue: data.status });
        Object.assign(x, data);
      } else {
        let id = `b-${code.toLowerCase()}`;
        if (d.branches.some((b) => b.id === id)) id = uid('b');
        d.branches.push({ id, ...data });
        if (cloneFrom) {
          for (const st of d.settings) {
            if (st.branch[cloneFrom] !== undefined) { st.branch[id] = st.branch[cloneFrom]; clonedSettings++; }
          }
          for (const z of d.zones.filter((z) => z.branchId === cloneFrom)) {
            d.zones.push({ ...structuredClone(z), id: uid('z'), branchId: id });
            clonedZones++;
          }
        }
        const from = d.branches.find((b) => b.id === cloneFrom);
        addAudit(d, {
          module: 'Branches', action: 'Add branch', branchId: id,
          detail: `New branch ${data.name} (${code}) in ${city?.name ?? '—'}${from ? ` — cloned ${clonedSettings} setting override(s) and ${clonedZones} delivery zone(s) from ${from.name}` : ''}`,
          newValue: data.status,
        });
      }
    });
    toast.success(branch ? 'Branch updated' : `${data.name} branch is live`, {
      description: branch ? undefined : `No code change needed${cloneFrom ? ` · cloned ${clonedSettings} overrides, ${clonedZones} zones` : ''}. It now appears in all apps.`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{branch ? `Edit ${branch.name}` : 'Add branch'}</DialogTitle>
          <DialogDescription>{branch ? 'Changes apply immediately in every app.' : 'A new branch goes live in the Shopper App, Order Desk and Rider App without any code change.'}</DialogDescription>
        </DialogHeader>
        {!branch && (
          <div className="rounded-lg border border-[#1e40af]/20 bg-[#1e40af]/5 p-3">
            <Field label="Clone settings from branch (optional)" hint="Copies that branch's setting overrides and delivery zones to the new branch. You can adjust them afterwards.">
              <select className={selectClass} value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)}>
                <option value="">Start from global defaults</option>
                {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code}) — {cityName(s, b.cityId)}</option>)}
              </select>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Branch name"><input className={inputClass} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Bajada" /></Field>
          <Field label="Code (order prefix)"><input className={cn(inputClass, 'uppercase font-mono')} maxLength={4} value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="BJD" /></Field>
          <Field label="City">
            <select className={selectClass} value={f.cityId} onChange={(e) => set('cityId', e.target.value)}>
              {s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Opening hours"><input className={inputClass} value={f.hours} onChange={(e) => set('hours', e.target.value)} /></Field>
          <Field label="Address" className="sm:col-span-2"><input className={inputClass} value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, barangay, city" /></Field>
          <Field label="Latitude" hint="Leave blank to use the city centre"><input className={inputClass} value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="7.0731" /></Field>
          <Field label="Longitude"><input className={inputClass} value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="125.6128" /></Field>
          <Field label="Phone"><input className={inputClass} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(082) 297-1004" /></Field>
          <Field label="Email"><input className={inputClass} value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="bajada@freshmart.ph" /></Field>
          <Field label="Pickup instructions" className="sm:col-span-2"><input className={inputClass} value={f.pickupInstructions} onChange={(e) => set('pickupInstructions', e.target.value)} /></Field>
          <Field label="Status">
            <select className={selectClass} value={f.status} onChange={(e) => set('status', e.target.value as Branch['status'])}>
              <option value="active">Active</option><option value="paused">Temporarily paused</option><option value="closed">Closed</option>
            </select>
          </Field>
          {f.status === 'paused' && (
            <Field label="Message to shoppers"><input className={inputClass} value={f.pausedMessage} onChange={(e) => set('pausedMessage', e.target.value)} placeholder="Back tomorrow at 8 AM" /></Field>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Services</p>
          <div className="flex flex-wrap gap-4">
            {SERVICES.map((sv) => (
              <label key={sv.key} className="flex items-center gap-2 text-sm">
                <Toggle checked={f.services[sv.key]} onChange={(v) => set('services', { ...f.services, [sv.key]: v })} label={sv.label} />{sv.label}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{branch ? 'Save changes' : <><Copy className="w-4 h-4" strokeWidth={1.75} />Create branch</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchDetail({ branch: b, metrics: m, onClose }: { branch: Branch; metrics?: ReturnType<typeof branchMetrics>; onClose: () => void }) {
  const s = useStore();
  const staff = staffForBranch(s, b);
  const riders = s.riders.filter((r) => r.branchIds.includes(b.id));
  const overrides = s.settings.filter((x) => x.branch[b.id] !== undefined);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold bg-[#1e40af]/10 text-[#1e40af] rounded px-1.5 py-0.5">{b.code}</span>
            {b.name} <EntityStatus status={b.status} />
          </DialogTitle>
          <DialogDescription>{b.address} · {cityName(s, b.cityId)}</DialogDescription>
        </DialogHeader>
        <MapView center={[b.lat, b.lng]} zoom={15} className="h-56 rounded-lg overflow-hidden" markers={[{ id: b.id, lat: b.lat, lng: b.lng, label: '🏪', color: '#1e40af', title: b.name }]} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Orders today</p><p className="font-bold text-[#1e40af] text-lg">{m?.today ?? 0}</p></div>
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Avg basket</p><p className="font-bold text-[#1e40af] text-lg">{pesoShort(m?.avg ?? 0)}</p></div>
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Fulfilment</p><p className="font-bold text-[#1e40af] text-lg">{m?.speed ? `${Math.round(m.speed)} min` : '—'}</p></div>
          <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Stock health</p><p className="font-bold text-[#1e40af] text-lg">{m?.stock ?? 0}%</p></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-gray-700"><Phone className="w-4 h-4 text-gray-400" strokeWidth={1.75} />{b.phone}</p>
            <p className="flex items-center gap-2 text-gray-700"><Mail className="w-4 h-4 text-gray-400" strokeWidth={1.75} />{b.email}</p>
            <p className="flex items-center gap-2 text-gray-700"><Clock className="w-4 h-4 text-gray-400" strokeWidth={1.75} />{b.hours}</p>
            <p className="flex items-center gap-2 text-gray-700"><Store className="w-4 h-4 text-gray-400" strokeWidth={1.75} />{b.pickupInstructions}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {SERVICES.map((sv) => <Pill key={sv.key} className={b.services[sv.key] ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-400 line-through'}>{sv.label}</Pill>)}
            </div>
            <p className="text-xs text-gray-500 pt-2">{overrides.length} branch-level setting override(s){overrides.length ? `: ${overrides.map((o) => o.label).join(', ')}` : ''}</p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" strokeWidth={1.75} />Staff ({staff.length})</p>
              <ul className="space-y-1">
                {staff.map((u) => <li key={u.id} className="flex justify-between text-gray-700"><span>{u.name}</span><span className="text-xs text-gray-400">{s.roles.find((r) => r.id === u.roleId)?.name}</span></li>)}
                {staff.length === 0 && <li className="text-gray-400 text-xs">No staff assigned</li>}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Bike className="w-3.5 h-3.5" strokeWidth={1.75} />Riders ({riders.length})</p>
              <ul className="space-y-1">
                {riders.map((r) => <li key={r.id} className="flex justify-between text-gray-700"><span>{r.name}</span><span className="text-xs text-gray-400 capitalize">{r.type} · {r.status}</span></li>)}
                {riders.length === 0 && <li className="text-gray-400 text-xs">No riders assigned</li>}
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
