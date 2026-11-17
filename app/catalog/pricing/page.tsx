'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Calculator, Download, History, ListOrdered, Pencil, Plus, RotateCcw, ShieldAlert, Trash2, Trophy } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, StatCard, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { addAudit, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import { CHANNEL_LABEL, can, cityName, exportCsv, fmtDate, fmtDateTime, getPriceInfo, getSetting, num, peso } from '@/src/lib/logic';
import type { AppState, OrderChannel, PriceList } from '@/src/lib/types';
import { Field, StateBadge, Toggle, categoryPath, categoryTree, descendantIds, roundPrice, today } from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };
const BULK_KEY = 'freshmart-last-bulk-price';
type Batch = { at: string; by: string; label: string; items: { id: string; name: string; old: number; next: number }[] };

export default function PricingPage() {
  const s = useStore();
  if (!can(s, 'pricing.view')) {
    return (
      <DashboardLayout title="Price Lists" eyebrow="Pricing">
        <AccessDenied permission="pricing.view" />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout title="Price Lists" eyebrow="Pricing">
      <PricingInner s={s} />
    </DashboardLayout>
  );
}

function scopeLabel(s: AppState, l: PriceList) {
  if (l.scope === 'global') return 'All branches';
  if (l.scope === 'city') return cityName(s, l.scopeId);
  if (l.scope === 'branch') return `Branch ${s.branches.find((b) => b.id === l.scopeId)?.name ?? '—'}`;
  return `${CHANNEL_LABEL[l.channel ?? 'app']} channel`;
}

function listState(l: PriceList): { v: 'active' | 'scheduled' | 'inactive'; label: string } {
  if (!l.active) return { v: 'inactive', label: 'Inactive' };
  const t = today();
  if (l.endDate && t > l.endDate) return { v: 'inactive', label: 'Expired' };
  if (l.startDate && t < l.startDate) return { v: 'scheduled', label: 'Scheduled' };
  if (l.startDate) return { v: 'scheduled', label: 'Scheduled · live' };
  return { v: 'active', label: 'Active' };
}

function PricingInner({ s }: { s: AppState }) {
  const canEdit = can(s, 'pricing.edit');
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [isNew, setIsNew] = useState(false);
  const pricingAudit = s.audit.filter((a) => a.module === 'Pricing');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Price lists" value={s.priceLists.length} sub={`${s.priceLists.filter((l) => listState(l).label !== 'Inactive' && listState(l).label !== 'Expired').length} in effect`} icon={<ListOrdered className="w-5 h-5" {...ICON} />} />
        <StatCard title="Scheduled lists" value={s.priceLists.filter((l) => l.startDate).length} sub="Beat the default during their dates" accent="border-l-purple-500" />
        <StatCard title="Price overrides" value={s.priceLists.reduce((n, l) => n + Object.keys(l.items).length, 0)} sub="Product prices across all lists" accent="border-l-green-500" />
        <StatCard title="Approval threshold" value={`${num(getSetting(s, 'priceApprovalPct'))}%`} sub={`Rounding: ${getSetting(s, 'rounding')}`} accent="border-l-amber-500" />
      </div>

      <Tabs defaultValue="lists">
        <TabsList>
          <TabsTrigger value="lists">Price lists</TabsTrigger>
          <TabsTrigger value="explorer">Price resolution explorer</TabsTrigger>
          <TabsTrigger value="bulk">Bulk price update</TabsTrigger>
          <TabsTrigger value="history">Price history</TabsTrigger>
        </TabsList>

        <TabsContent value="lists" className="mt-4">
          <Panel
            title="Price lists"
            action={canEdit && (
              <Button onClick={() => { setIsNew(true); setEditing({ id: uid('pl'), name: '', scope: 'branch', scopeId: s.session.branchId, active: true, items: {} }); }}>
                <Plus {...ICON} /> New price list
              </Button>
            )}
            bodyClass="p-0"
          >
            <div className="px-5 py-3 text-xs text-gray-500 bg-blue-50/50 border-b border-gray-100">
              Priority rule: <b>Branch</b> list beats <b>City</b> list beats <b>Channel</b> beats <b>Global</b>; within a level, a <b>scheduled</b> list beats the default during its dates. No match → product base price.
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Name</TableHead><TableHead>Scope</TableHead><TableHead>Applies to</TableHead><TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right"># items</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.priceLists.map((l) => {
                  const st = listState(l);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="pl-5 font-medium text-gray-900">{l.name}</TableCell>
                      <TableCell><Pill className="capitalize">{l.scope}</Pill></TableCell>
                      <TableCell className="text-sm text-gray-600">{scopeLabel(s, l)}</TableCell>
                      <TableCell className="text-xs text-gray-600">{l.startDate ? `${fmtDate(l.startDate)} → ${l.endDate ? fmtDate(l.endDate) : 'open'}` : 'Always'}</TableCell>
                      <TableCell><StateBadge value={st.v} label={st.label} /></TableCell>
                      <TableCell className="text-right font-semibold text-[#1e40af]">{Object.keys(l.items).length}</TableCell>
                      <TableCell className="text-right pr-5">
                        <Button variant="outline" size="sm" onClick={() => { setIsNew(false); setEditing(l); }}><Pencil {...ICON} /> {canEdit ? 'Edit items' : 'View'}</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="explorer" className="mt-4"><Explorer s={s} /></TabsContent>
        <TabsContent value="bulk" className="mt-4"><BulkUpdate s={s} canEdit={canEdit} /></TabsContent>

        <TabsContent value="history" className="mt-4">
          <Panel title="Price history" action={<Button variant="outline" size="sm" onClick={() => exportCsv('price-history.csv', [['When', 'User', 'Action', 'Detail', 'Old', 'New'], ...pricingAudit.map((a) => [fmtDateTime(a.at), a.user, a.action, a.detail, a.oldValue ?? '', a.newValue ?? ''])])}><Download {...ICON} /> Export</Button>} bodyClass="p-0">
            {pricingAudit.length === 0 ? <EmptyState title="No price changes yet" icon={<History className="w-10 h-10" {...ICON} />} /> : (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-5">When</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Detail</TableHead><TableHead className="text-right">Old</TableHead><TableHead /><TableHead>New</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pricingAudit.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-5 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(a.at)}</TableCell>
                      <TableCell className="text-sm">{a.user}</TableCell>
                      <TableCell className="text-sm font-medium">{a.action}</TableCell>
                      <TableCell className="text-sm text-gray-600">{a.detail}</TableCell>
                      <TableCell className="text-right text-gray-400 line-through">{a.oldValue}</TableCell>
                      <TableCell>{a.oldValue && <ArrowRight className="w-3.5 h-3.5 text-gray-300" {...ICON} />}</TableCell>
                      <TableCell className="font-semibold text-[#1e40af]">{a.newValue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {editing && <ListDialog s={s} list={editing} isNew={isNew} canEdit={canEdit} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------- Edit price list ----------------
function ListDialog({ s, list, isNew, canEdit, onClose }: { s: AppState; list: PriceList; isNew: boolean; canEdit: boolean; onClose: () => void }) {
  const [f, setF] = useState<PriceList>({ ...list, items: { ...list.items } });
  const [addPid, setAddPid] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const set = <K extends keyof PriceList>(k: K, v: PriceList[K]) => setF((x) => ({ ...x, [k]: v }));
  const unused = s.products.filter((p) => f.items[p.id] === undefined);

  function addItem() {
    const p = s.products.find((x) => x.id === addPid);
    const price = Number(addPrice);
    if (!p) return toast.error('Pick a product');
    if (!(price > 0)) return toast.error('Enter a valid price');
    setF((x) => ({ ...x, items: { ...x.items, [p.id]: price } }));
    setAddPid(''); setAddPrice('');
  }

  function save() {
    if (!f.name.trim()) return toast.error('List name is required');
    if ((f.scope === 'city' || f.scope === 'branch') && !f.scopeId) return toast.error('Choose the scope');
    if (f.startDate && f.endDate && f.endDate < f.startDate) return toast.error('End date is before start date');
    const next: PriceList = { ...f, name: f.name.trim(), scopeId: f.scope === 'city' || f.scope === 'branch' ? f.scopeId : undefined, channel: f.scope === 'channel' ? f.channel ?? 'app' : undefined, startDate: f.startDate || undefined, endDate: f.endDate || undefined };
    mutate((d) => {
      if (isNew) {
        d.priceLists.push(next);
        addAudit(d, { module: 'Pricing', action: 'Price list created', detail: `${next.name} · ${next.scope}${next.startDate ? ` · ${next.startDate} → ${next.endDate ?? 'open'}` : ''}`, newValue: `${Object.keys(next.items).length} items` });
        return;
      }
      const i = d.priceLists.findIndex((x) => x.id === next.id);
      if (i < 0) return;
      const old = d.priceLists[i];
      const ids = new Set([...Object.keys(old.items), ...Object.keys(next.items)]);
      for (const pid of ids) {
        const o = old.items[pid];
        const n = next.items[pid];
        if (o === n) continue;
        const pname = d.products.find((p) => p.id === pid)?.name ?? pid;
        addAudit(d, { module: 'Pricing', action: n === undefined ? 'Price list item removed' : o === undefined ? 'Price list item added' : 'Price list updated', detail: `${next.name} · ${pname}`, oldValue: o === undefined ? '—' : peso(o), newValue: n === undefined ? '—' : peso(n) });
      }
      if (old.active !== next.active || old.startDate !== next.startDate || old.endDate !== next.endDate || old.name !== next.name || old.scope !== next.scope || old.scopeId !== next.scopeId) {
        addAudit(d, { module: 'Pricing', action: 'Price list settings changed', detail: next.name, oldValue: `${old.active ? 'active' : 'inactive'} ${old.startDate ?? ''}→${old.endDate ?? ''}`, newValue: `${next.active ? 'active' : 'inactive'} ${next.startDate ?? ''}→${next.endDate ?? ''}` });
      }
      d.priceLists[i] = next;
    });
    toast.success(isNew ? `Price list “${next.name}” created` : `“${next.name}” saved`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New price list' : list.name}</DialogTitle>
          <DialogDescription>Prices in this list override the base price for the chosen scope. Leave dates empty for an always-on list.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Name" className="col-span-2"><input className={inputClass} value={f.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Payday Promo Matina" /></Field>
          <Field label="Scope">
            <select className={selectClass} value={f.scope} disabled={!canEdit} onChange={(e) => { const sc = e.target.value as PriceList['scope']; setF((x) => ({ ...x, scope: sc, scopeId: sc === 'city' ? s.cities[0].id : sc === 'branch' ? s.session.branchId : undefined })); }}>
              <option value="global">Global</option><option value="city">City</option><option value="branch">Branch</option><option value="channel">Channel</option>
            </select>
          </Field>
          <Field label="Applies to">
            {f.scope === 'city' ? (
              <select className={selectClass} value={f.scopeId} disabled={!canEdit} onChange={(e) => set('scopeId', e.target.value)}>{s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            ) : f.scope === 'branch' ? (
              <select className={selectClass} value={f.scopeId} disabled={!canEdit} onChange={(e) => set('scopeId', e.target.value)}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            ) : f.scope === 'channel' ? (
              <select className={selectClass} value={f.channel ?? 'app'} disabled={!canEdit} onChange={(e) => set('channel', e.target.value as OrderChannel)}>{(['app', 'walk_in', 'phone'] as OrderChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
            ) : <input className={inputClass} disabled value="All branches" />}
          </Field>
          <Field label="Start date"><input type="date" className={inputClass} value={f.startDate ?? ''} disabled={!canEdit} onChange={(e) => set('startDate', e.target.value || undefined)} /></Field>
          <Field label="End date"><input type="date" className={inputClass} value={f.endDate ?? ''} disabled={!canEdit} onChange={(e) => set('endDate', e.target.value || undefined)} /></Field>
          <div className="col-span-2 flex items-end pb-2"><Toggle checked={f.active} disabled={!canEdit} onChange={(v) => set('active', v)} label="List active" /></div>
        </div>
        <div className="rounded-lg border border-gray-100">
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Base price</TableHead><TableHead className="text-right">List price</TableHead><TableHead className="text-right">Diff</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {Object.entries(f.items).map(([pid, price]) => {
                const p = s.products.find((x) => x.id === pid);
                const diff = p ? ((price - p.basePrice) / p.basePrice) * 100 : 0;
                return (
                  <TableRow key={pid}>
                    <TableCell>{p?.image} {p?.name ?? pid} <span className="text-xs text-gray-400">{p?.size}</span></TableCell>
                    <TableCell className="text-right text-gray-500">{p ? peso(p.basePrice) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <input type="number" step="0.25" className={cn(inputClass, 'w-28 text-right')} disabled={!canEdit} value={price} onChange={(e) => setF((x) => ({ ...x, items: { ...x.items, [pid]: Number(e.target.value) } }))} />
                    </TableCell>
                    <TableCell className={cn('text-right text-xs font-medium', diff < 0 ? 'text-green-700' : diff > 0 ? 'text-[#dc2626]' : 'text-gray-400')}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}%</TableCell>
                    <TableCell>{canEdit && <Button variant="ghost" size="icon" onClick={() => setF((x) => { const items = { ...x.items }; delete items[pid]; return { ...x, items }; })}><Trash2 className="text-[#dc2626]" {...ICON} /></Button>}</TableCell>
                  </TableRow>
                );
              })}
              {Object.keys(f.items).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-gray-400 py-6">No items yet — add products below.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add product" className="flex-1 min-w-56">
              <select className={selectClass} value={addPid} onChange={(e) => { setAddPid(e.target.value); const p = s.products.find((x) => x.id === e.target.value); if (p) setAddPrice(String(p.basePrice)); }}>
                <option value="">Select product…</option>
                {unused.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.size}) — base {peso(p.basePrice)}</option>)}
              </select>
            </Field>
            <Field label="Price"><input type="number" step="0.25" className={cn(inputClass, 'w-28')} value={addPrice} onChange={(e) => setAddPrice(e.target.value)} /></Field>
            <Button variant="outline" onClick={addItem}><Plus {...ICON} /> Add</Button>
          </div>
        )}
        <DialogFooter className="justify-end">
          <Button variant="outline" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</Button>
          {canEdit && <Button onClick={save}>{isNew ? 'Create list' : 'Save list'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Price resolution explorer ----------------
function Explorer({ s }: { s: AppState }) {
  const [pid, setPid] = useState(() => s.priceLists.find((l) => l.items['p-mango'] !== undefined) ? 'p-mango' : s.products[0]?.id ?? '');
  const [channel, setChannel] = useState<OrderChannel>('app');
  const p = s.products.find((x) => x.id === pid);
  const t = today();

  return (
    <Panel title="Price resolution explorer" action={
      <div className="flex gap-2">
        <select className={selectClass} value={pid} onChange={(e) => setPid(e.target.value)}>
          {s.products.map((x) => <option key={x.id} value={x.id}>{x.image} {x.name} ({x.size}){s.priceLists.some((l) => l.items[x.id] !== undefined) ? ' ★' : ''}</option>)}
        </select>
        <select className={selectClass} value={channel} onChange={(e) => setChannel(e.target.value as OrderChannel)}>
          {(['app', 'walk_in', 'phone'] as OrderChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
      </div>
    } bodyClass="p-0">
      <p className="px-5 py-3 text-xs text-gray-500 border-b border-gray-100">★ = product has at least one price-list override. Every branch resolves the price independently; the winning list is highlighted, losing candidates are struck through.</p>
      {p && (
        <Table>
          <TableHeader><TableRow><TableHead className="pl-5">Branch</TableHead><TableHead>City</TableHead><TableHead className="text-right">Base price</TableHead><TableHead>Candidate lists (highest priority first)</TableHead><TableHead className="text-right">Effective price</TableHead><TableHead>Won by</TableHead></TableRow></TableHeader>
          <TableBody>
            {s.branches.map((b) => {
              const info = getPriceInfo(s, p.id, b.id, channel);
              const cands = s.priceLists.filter((l) => {
                if (!l.active || l.items[p.id] === undefined) return false;
                if (l.startDate && t < l.startDate) return false;
                if (l.endDate && t > l.endDate) return false;
                if (l.scope === 'branch') return l.scopeId === b.id;
                if (l.scope === 'city') return l.scopeId === b.cityId;
                if (l.scope === 'channel') return l.channel === channel;
                return true;
              });
              const rank = (l: PriceList) => (l.scope === 'branch' ? 40 : l.scope === 'city' ? 30 : l.scope === 'channel' ? 20 : 10) + (l.startDate ? 5 : 0);
              cands.sort((a, c) => rank(c) - rank(a));
              return (
                <TableRow key={b.id}>
                  <TableCell className="pl-5 font-medium">{b.name}</TableCell>
                  <TableCell className="text-sm text-gray-600">{cityName(s, b.cityId)}</TableCell>
                  <TableCell className="text-right text-gray-500">{peso(p.basePrice)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {cands.length === 0 && <span className="text-xs text-gray-400">none</span>}
                      {cands.map((l, i) => (
                        <Pill key={l.id} className={i === 0 ? 'bg-blue-100 text-[#1e40af]' : 'line-through text-gray-400'}>
                          {l.name} · {l.scope}{l.startDate ? ' (scheduled)' : ''} · {peso(l.items[p.id])}
                        </Pill>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-[#1e40af]">{peso(info.price)}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', info.source === 'Base price' ? 'text-gray-500' : 'text-green-700')}>
                      {info.source !== 'Base price' && <Trophy className="w-3.5 h-3.5" {...ICON} />}{info.source}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

// ---------------- Bulk price update ----------------
function BulkUpdate({ s, canEdit }: { s: AppState; canEdit: boolean }) {
  const [by, setBy] = useState<'category' | 'brand' | 'supplier'>('category');
  const [target, setTarget] = useState('cat-pork');
  const [mode, setMode] = useState<'pct' | 'fixed'>('pct');
  const [value, setValue] = useState(5);
  const rounding = String(getSetting(s, 'rounding'));
  const threshold = num(getSetting(s, 'priceApprovalPct'));
  const canApprove = can(s, 'pricing.approve');
  const [approved, setApproved] = useState(false);
  const [last, setLast] = useState<Batch | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(BULK_KEY); if (raw) setLast(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const brands = useMemo(() => Array.from(new Set(s.products.map((p) => p.brand))).sort(), [s.products]);
  const tree = categoryTree(s);

  const preview = useMemo(() => {
    const catIds = by === 'category' ? descendantIds(s, target) : [];
    return s.products
      .filter((p) => (by === 'category' ? catIds.includes(p.categoryId) : by === 'brand' ? p.brand === target : p.supplierId === target))
      .map((p) => {
        const raw = mode === 'pct' ? p.basePrice * (1 + value / 100) : p.basePrice + value;
        const next = Math.max(0.25, roundPrice(raw, rounding));
        const change = ((next - p.basePrice) / p.basePrice) * 100;
        const oldMargin = ((p.basePrice - p.costPrice) / p.basePrice) * 100;
        const newMargin = ((next - p.costPrice) / next) * 100;
        return { p, next, change, oldMargin, newMargin };
      });
  }, [s, by, target, mode, value, rounding]);

  const needsApproval = preview.some((r) => Math.abs(r.change) > threshold);
  const belowCost = preview.filter((r) => r.next < r.p.costPrice).length;

  function changeBy(v: typeof by) {
    setBy(v);
    setTarget(v === 'category' ? tree[0]?.id ?? '' : v === 'brand' ? brands[0] : s.suppliers[0]?.id ?? '');
  }

  function targetLabel() {
    if (by === 'category') return categoryPath(s, target);
    if (by === 'supplier') return s.suppliers.find((x) => x.id === target)?.name ?? '';
    return target;
  }

  function apply() {
    if (!preview.length) return;
    if (needsApproval && !approved) return toast.error(`Changes above ${threshold}% need Super Admin approval`);
    const label = `${by}: ${targetLabel()} · ${mode === 'pct' ? `${value > 0 ? '+' : ''}${value}%` : `${value > 0 ? '+' : ''}${peso(value)}`}`;
    const batch: Batch = { at: new Date().toISOString(), by: currentUserName(s), label, items: preview.map((r) => ({ id: r.p.id, name: r.p.name, old: r.p.basePrice, next: r.next })) };
    mutate((d) => {
      for (const it of batch.items) {
        const p = d.products.find((x) => x.id === it.id);
        if (!p || p.basePrice === it.next) continue;
        p.basePrice = it.next;
        addAudit(d, { module: 'Pricing', action: 'Bulk price update', detail: `${p.name} (${p.sku}) · ${label}${needsApproval ? ' · approved' : ''}`, oldValue: peso(it.old), newValue: peso(it.next) });
      }
    });
    try { localStorage.setItem(BULK_KEY, JSON.stringify(batch)); } catch { /* ignore */ }
    setLast(batch);
    setApproved(false);
    toast.success(`Updated ${batch.items.length} base prices`, { description: label });
  }

  function rollback() {
    if (!last) return;
    mutate((d) => {
      for (const it of last.items) {
        const p = d.products.find((x) => x.id === it.id);
        if (!p) continue;
        const cur = p.basePrice;
        p.basePrice = it.old;
        addAudit(d, { module: 'Pricing', action: 'Bulk change rolled back', detail: `${p.name} (${p.sku}) · ${last.label}`, oldValue: peso(cur), newValue: peso(it.old) });
      }
    });
    try { localStorage.removeItem(BULK_KEY); } catch { /* ignore */ }
    toast.success(`Rolled back ${last.items.length} prices`);
    setLast(null);
  }

  return (
    <div className="space-y-4">
      {last && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <RotateCcw className="w-4 h-4 text-amber-700" {...ICON} />
          <span className="text-amber-900">Last bulk change: <b>{last.label}</b> · {last.items.length} products · {last.by}, {fmtDateTime(last.at)}</span>
          {canEdit && <Button variant="outline" size="sm" className="ml-auto" onClick={rollback}><RotateCcw {...ICON} /> Rollback last bulk change</Button>}
        </div>
      )}
      <Panel title="Bulk price update" action={<span className="text-xs text-gray-400">Preview every change before applying</span>}>
        <Toolbar>
          <select className={selectClass} value={by} onChange={(e) => changeBy(e.target.value as typeof by)}>
            <option value="category">By category</option><option value="brand">By brand</option><option value="supplier">By supplier</option>
          </select>
          <select className={cn(selectClass, 'min-w-48')} value={target} onChange={(e) => setTarget(e.target.value)}>
            {by === 'category' && tree.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.icon} {c.name}</option>)}
            {by === 'brand' && brands.map((b) => <option key={b} value={b}>{b}</option>)}
            {by === 'supplier' && s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="pct">% change</option><option value="fixed">Fixed ₱ change</option>
          </select>
          <input type="number" step={mode === 'pct' ? 1 : 0.25} className={cn(inputClass, 'w-24')} value={value} onChange={(e) => { setValue(Number(e.target.value)); setApproved(false); }} />
          <Pill className="bg-gray-100"><Calculator className="w-3 h-3" {...ICON} /> Rounding: {rounding}</Pill>
          <Pill className="bg-gray-100">Approval above {threshold}%</Pill>
        </Toolbar>
        {preview.length === 0 ? <EmptyState title="No products match this selection" /> : (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Old price</TableHead><TableHead /><TableHead className="text-right">New price</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="text-right">Margin old → new</TableHead></TableRow></TableHeader>
              <TableBody>
                {preview.map((r) => (
                  <TableRow key={r.p.id} className={Math.abs(r.change) > threshold ? 'bg-amber-50/60' : ''}>
                    <TableCell>{r.p.image} {r.p.name} <span className="text-xs text-gray-400">{r.p.size}</span></TableCell>
                    <TableCell className="text-right text-gray-500">{peso(r.p.costPrice)}</TableCell>
                    <TableCell className="text-right text-gray-500">{peso(r.p.basePrice)}</TableCell>
                    <TableCell><ArrowRight className="w-3.5 h-3.5 text-gray-300" {...ICON} /></TableCell>
                    <TableCell className="text-right font-semibold text-[#1e40af]">{peso(r.next)}</TableCell>
                    <TableCell className={cn('text-right text-xs font-medium', Math.abs(r.change) > threshold ? 'text-amber-700' : r.change < 0 ? 'text-green-700' : 'text-gray-700')}>{r.change > 0 ? '+' : ''}{r.change.toFixed(1)}%</TableCell>
                    <TableCell className={cn('text-right text-xs', r.newMargin < 0 ? 'text-[#dc2626] font-semibold' : 'text-gray-600')}>{r.oldMargin.toFixed(1)}% → {r.newMargin.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {needsApproval && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <ShieldAlert className="w-4 h-4" {...ICON} />
                  <span>Approval required: at least one change exceeds {threshold}%.</span>
                  <label className="flex items-center gap-2 font-medium">
                    <Checkbox checked={approved} disabled={!canApprove} onCheckedChange={(v) => setApproved(v === true)} />
                    {canApprove ? `Approved by ${currentUserName(s)} (Super Admin)` : 'Waiting for Super Admin approval'}
                  </label>
                </div>
              )}
              {belowCost > 0 && <span className="text-xs text-[#dc2626] font-medium">{belowCost} product(s) would sell below cost</span>}
              <Button className="ml-auto" disabled={!canEdit || (needsApproval && !approved)} onClick={apply}>Apply to {preview.length} products</Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
