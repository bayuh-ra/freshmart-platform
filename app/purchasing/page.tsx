'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ClipboardList, Lightbulb, Mail, PackageCheck, Plus, Send, Trash2, Truck, Users, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, StatCard, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { addAudit, addNotification, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import { branchName, can, exportCsv, fmtDateTime, peso, pesoShort, stockSummary } from '@/src/lib/logic';
import type { AppState, PurchaseOrder } from '@/src/lib/types';
import { Field, StateBadge } from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';

const ICON = { strokeWidth: 1.75 };
type Line = { productId: string; qty: number; cost: number };

const poTotal = (po: PurchaseOrder) => po.lines.reduce((n, l) => n + l.qty * l.cost, 0);
const supplierName = (s: AppState, id: string) => s.suppliers.find((x) => x.id === id)?.name ?? '—';

export default function PurchasingPage() {
  const s = useStore();
  if (!can(s, 'inventory.view')) {
    return (
      <DashboardLayout title="Purchasing" eyebrow="Suppliers & POs">
        <AccessDenied permission="inventory.view" />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout title="Purchasing" eyebrow="Suppliers & POs">
      <PurchasingInner s={s} />
    </DashboardLayout>
  );
}

function useSuggestions(s: AppState, branchId: string) {
  return useMemo(() => {
    return s.products
      .filter((p) => p.status === 'active' || p.status === 'hidden')
      .map((p) => {
        const st = stockSummary(s, p.id, branchId);
        const incoming = s.purchaseOrders
          .filter((po) => po.branchId === branchId && (po.status === 'sent' || po.status === 'partial' || po.status === 'draft'))
          .reduce((n, po) => n + po.lines.filter((l) => l.productId === p.id).reduce((m, l) => m + Math.max(0, l.qty - l.received), 0), 0);
        const target = p.reorderPoint * 3;
        const suggested = Math.max(0, Math.ceil((target - st.available - incoming) / 6) * 6);
        return { p, ...st, incoming, suggested };
      })
      .filter((r) => r.available < r.p.reorderPoint)
      .sort((a, b) => a.available - b.available);
  }, [s, branchId]);
}

function PurchasingInner({ s }: { s: AppState }) {
  const branchId = s.session.branchId;
  const canEdit = can(s, 'inventory.create') || can(s, 'inventory.edit');
  const [tab, setTab] = useState('pos');
  const [allBranches, setAllBranches] = useState(false);
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState<{ supplierId?: string; lines?: Line[] } | null>(null);
  const [grn, setGrn] = useState<PurchaseOrder | null>(null);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const suggestions = useSuggestions(s, branchId);

  const pos = s.purchaseOrders
    .filter((po) => (allBranches || po.branchId === branchId) && (status === 'all' || po.status === status))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = s.purchaseOrders.filter((po) => po.branchId === branchId && (po.status === 'sent' || po.status === 'partial'));
  const onOrder = open.reduce((n, po) => n + po.lines.reduce((m, l) => m + Math.max(0, l.qty - l.received) * l.cost, 0), 0);

  function send(po: PurchaseOrder) {
    mutate((d) => {
      const x = d.purchaseOrders.find((y) => y.id === po.id);
      if (!x) return;
      x.status = 'sent';
      const sup = d.suppliers.find((y) => y.id === x.supplierId);
      addAudit(d, { module: 'Inventory', action: 'PO sent to supplier', detail: `${x.number} · ${sup?.name} <${sup?.email}> · ${peso(poTotal(x))}`, branchId: x.branchId, oldValue: 'draft', newValue: 'sent' });
    });
    const sup = s.suppliers.find((y) => y.id === po.supplierId);
    toast.success('PO emailed as PDF', { description: `${po.number}.pdf sent to ${sup?.email}` });
  }

  function cancel(po: PurchaseOrder) {
    mutate((d) => {
      const x = d.purchaseOrders.find((y) => y.id === po.id);
      if (!x) return;
      const old = x.status;
      x.status = 'cancelled';
      addAudit(d, { module: 'Inventory', action: 'PO cancelled', detail: `${x.number} · ${supplierName(d, x.supplierId)}`, branchId: x.branchId, oldValue: old, newValue: 'cancelled' });
    });
    toast.success(`${po.number} cancelled`);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Open purchase orders" value={open.length} sub={`${branchName(s, branchId)} · sent or partially received`} icon={<ClipboardList className="w-5 h-5" {...ICON} />} />
        <StatCard title="Value on order" value={pesoShort(onOrder)} sub="Outstanding at cost" accent="border-l-green-500" />
        <StatCard title="Draft POs" value={s.purchaseOrders.filter((po) => po.branchId === branchId && po.status === 'draft').length} sub="Not yet sent to supplier" accent="border-l-gray-400" />
        <StatCard title="Reorder suggestions" value={suggestions.length} sub="Available below reorder point" accent="border-l-amber-500" valueClass="text-amber-600" icon={<Lightbulb className="w-5 h-5" {...ICON} />} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden justify-start">
          <TabsTrigger value="pos">Purchase orders</TabsTrigger>
          <TabsTrigger value="reorder">Reorder suggestions {suggestions.length > 0 && <span className="ml-1 rounded-full bg-amber-100 text-amber-800 px-1.5 text-[10px]">{suggestions.length}</span>}</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="mt-4">
          <Panel title="Purchase orders" action={
            <div className="flex flex-wrap items-center gap-3">
              <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {['draft', 'sent', 'partial', 'received', 'cancelled'].map((x) => <option key={x} value={x}>{x === 'partial' ? 'Partially received' : x[0].toUpperCase() + x.slice(1)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-gray-600"><Checkbox checked={allBranches} onCheckedChange={(v) => setAllBranches(v === true)} /> All branches</label>
              {canEdit && <Button onClick={() => setCreating({})}><Plus {...ICON} /> Create PO</Button>}
            </div>
          } bodyClass="p-0">
            {pos.length === 0 ? <EmptyState title="No purchase orders" sub="Create one or use reorder suggestions" icon={<ClipboardList className="w-10 h-10" {...ICON} />} /> : (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-5">PO</TableHead><TableHead>Supplier</TableHead><TableHead>Branch</TableHead><TableHead>Created</TableHead><TableHead>Lines</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Received</TableHead><TableHead>Status</TableHead><TableHead className="text-right pr-5">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pos.map((po) => {
                    const ordered = po.lines.reduce((n, l) => n + l.qty, 0);
                    const rec = po.lines.reduce((n, l) => n + l.received, 0);
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="pl-5"><button className="font-mono text-sm font-medium text-[#c8151d] hover:underline" onClick={() => setViewing(po)}>{po.number}</button></TableCell>
                        <TableCell className="text-sm">{supplierName(s, po.supplierId)}</TableCell>
                        <TableCell className="text-sm text-gray-600">{branchName(s, po.branchId)}</TableCell>
                        <TableCell className="text-xs text-gray-500">{fmtDateTime(po.createdAt)}</TableCell>
                        <TableCell className="text-xs text-gray-600"><div className="max-w-52 space-y-0.5">{po.lines.map((l, i) => { const p = s.products.find((x) => x.id === l.productId); return <p key={i} className="truncate"><ProductImage image={p?.image} /> {p?.name ?? l.productId} ×{l.qty}</p>; })}</div></TableCell>
                        <TableCell className="text-right font-semibold">{peso(poTotal(po))}</TableCell>
                        <TableCell>
                          <div className="w-24">
                            <div className="h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-green-500" style={{ width: `${ordered ? Math.min(100, (rec / ordered) * 100) : 0}%` }} /></div>
                            <p className="text-[11px] text-gray-500 mt-0.5">{rec}/{ordered} units</p>
                          </div>
                        </TableCell>
                        <TableCell><StateBadge value={po.status} /></TableCell>
                        <TableCell className="text-right pr-5 whitespace-nowrap">
                          {canEdit && po.status === 'draft' && <Button size="sm" onClick={() => send(po)}><Send {...ICON} /> Send</Button>}
                          {canEdit && (po.status === 'sent' || po.status === 'partial') && <Button size="sm" onClick={() => setGrn(po)}><PackageCheck {...ICON} /> Receive</Button>}
                          {canEdit && (po.status === 'draft' || po.status === 'sent') && <Button size="sm" variant="ghost" onClick={() => cancel(po)} title="Cancel PO"><XCircle className="text-[#dc2626]" {...ICON} /></Button>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="reorder" className="mt-4">
          <Reorder s={s} branchId={branchId} rows={suggestions} canEdit={canEdit} onDone={() => setTab('pos')} />
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4">
          <Panel title="Suppliers" action={<Button variant="outline" size="sm" onClick={() => exportCsv('suppliers.csv', [['Name', 'Contact', 'Phone', 'Email', 'Terms', 'Lead days'], ...s.suppliers.map((x) => [x.name, x.contact, x.phone, x.email, x.terms, x.leadDays])])}>Export</Button>} bodyClass="p-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-5">Supplier</TableHead><TableHead>Contact</TableHead><TableHead>Phone / Email</TableHead><TableHead>Terms</TableHead><TableHead className="text-right">Lead time</TableHead><TableHead>Products supplied</TableHead><TableHead className="text-right">Open POs</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {s.suppliers.map((x) => {
                  const prods = s.products.filter((p) => p.supplierId === x.id);
                  const openPos = s.purchaseOrders.filter((po) => po.supplierId === x.id && (po.status === 'sent' || po.status === 'partial')).length;
                  return (
                    <TableRow key={x.id}>
                      <TableCell className="pl-5 font-medium text-gray-900"><span className="inline-flex items-center gap-2"><Truck className="w-4 h-4 text-gray-400" {...ICON} />{x.name}</span></TableCell>
                      <TableCell className="text-sm">{x.contact}</TableCell>
                      <TableCell className="text-xs text-gray-600">{x.phone}<p className="text-gray-400">{x.email}</p></TableCell>
                      <TableCell><Pill>{x.terms}</Pill></TableCell>
                      <TableCell className="text-right text-sm">{x.leadDays} day{x.leadDays > 1 ? 's' : ''}</TableCell>
                      <TableCell className="text-sm">{prods.slice(0, 6).map((p) => p.image).join(' ')} <span className="text-xs text-gray-400">{prods.length} SKUs</span></TableCell>
                      <TableCell className="text-right font-semibold text-[#c8151d]">{openPos}</TableCell>
                      <TableCell>{canEdit && <Button variant="outline" size="sm" onClick={() => setCreating({ supplierId: x.id })}><Plus {...ICON} /> PO</Button>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>

      {creating && <CreatePODialog s={s} branchId={branchId} init={creating} onClose={() => setCreating(null)} onCreated={() => setTab('pos')} />}
      {grn && <GRNDialog s={s} po={grn} onClose={() => setGrn(null)} />}
      {viewing && <PODetail s={s} po={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ---------------- Create PO ----------------
function CreatePODialog({ s, branchId, init, onClose, onCreated }: { s: AppState; branchId: string; init: { supplierId?: string; lines?: Line[] }; onClose: () => void; onCreated: () => void }) {
  const [supplierId, setSupplierId] = useState(init.supplierId ?? s.suppliers[0]?.id ?? '');
  const [branch, setBranch] = useState(branchId);
  const supplierProducts = s.products.filter((p) => p.supplierId === supplierId);
  const firstProduct = () => supplierProducts[0] ?? s.products[0];
  const [lines, setLines] = useState<Line[]>(init.lines ?? (firstProduct() ? [{ productId: firstProduct().id, qty: 12, cost: firstProduct().costPrice }] : []));
  const total = lines.reduce((n, l) => n + l.qty * l.cost, 0);
  const options = [...supplierProducts, ...s.products.filter((p) => p.supplierId !== supplierId)];

  function save(sendNow: boolean) {
    const valid = lines.filter((l) => l.productId && l.qty > 0 && l.cost >= 0);
    if (!valid.length) return toast.error('Add at least one line with quantity');
    let number = '';
    mutate((d) => {
      number = `PO-${String(d.counters.po).padStart(4, '0')}`;
      d.counters.po += 1;
      const po: PurchaseOrder = { id: uid('po'), number, supplierId, branchId: branch, status: sendNow ? 'sent' : 'draft', createdAt: new Date().toISOString(), lines: valid.map((l) => ({ ...l, received: 0 })) };
      d.purchaseOrders.unshift(po);
      addAudit(d, { module: 'Inventory', action: sendNow ? 'PO created and sent' : 'PO created', detail: `${number} · ${supplierName(d, supplierId)} · ${valid.length} line(s) · ${peso(poTotal(po))}`, branchId: branch });
    });
    toast.success(sendNow ? 'PO emailed as PDF' : `${number} saved as draft`, { description: sendNow ? `${number}.pdf sent to ${s.suppliers.find((x) => x.id === supplierId)?.email}` : undefined });
    onCreated();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-4 sm:p-6">
        <DialogHeader><DialogTitle>Create purchase order</DialogTitle><DialogDescription>Products from the selected supplier are listed first. Costs default to the product cost price.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Supplier"><select className={selectClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.terms}</option>)}</select></Field>
          <Field label="Deliver to branch"><select className={selectClass} value={branch} onChange={(e) => setBranch(e.target.value)}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="w-24">Qty</TableHead><TableHead className="w-28">Unit cost</TableHead><TableHead className="text-right">Line total</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <select className={cn(selectClass, 'w-full min-w-[12rem]')} value={l.productId} onChange={(e) => { const p = s.products.find((x) => x.id === e.target.value); setLines((ls) => ls.map((x, k) => (k === i ? { ...x, productId: e.target.value, cost: p?.costPrice ?? x.cost } : x))); }}>
                    {options.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.size}){p.supplierId !== supplierId ? ' · other supplier' : ''}</option>)}
                  </select>
                </TableCell>
                <TableCell><input type="number" min={1} className={cn(inputClass, 'w-20')} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} /></TableCell>
                <TableCell><input type="number" step="0.25" className={cn(inputClass, 'w-24')} value={l.cost} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, cost: Number(e.target.value) } : x)))} /></TableCell>
                <TableCell className="text-right font-medium">{peso(l.qty * l.cost)}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Trash2 className="text-[#dc2626]" {...ICON} /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => { const p = firstProduct(); if (p) setLines((ls) => [...ls, { productId: p.id, qty: 12, cost: p.costPrice }]); }}><Plus {...ICON} /> Add line</Button>
          <p className="text-sm text-gray-600">Total <span className="text-lg font-bold text-[#c8151d] ml-2">{peso(total)}</span></p>
        </div>
        <DialogFooter className="flex-wrap justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save(false)}>Save draft</Button>
          <Button onClick={() => save(true)}><Mail {...ICON} /> Save &amp; send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Goods received note ----------------
function GRNDialog({ s, po, onClose }: { s: AppState; po: PurchaseOrder; onClose: () => void }) {
  type G = { qty: number; batch: string; expiry: string; damaged: boolean; damagedQty: number };
  const [g, setG] = useState<G[]>(po.lines.map((l, i) => ({ qty: Math.max(0, l.qty - l.received), batch: `B-${po.number.slice(-4)}${i + 1}`, expiry: '', damaged: false, damagedQty: 0 })));
  const upd = (i: number, patch: Partial<G>) => setG((x) => x.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  function save() {
    if (g.every((r) => r.qty <= 0)) return toast.error('Enter received quantities');
    let newStatus = 'partial' as PurchaseOrder['status'];
    mutate((d) => {
      const x = d.purchaseOrders.find((y) => y.id === po.id);
      if (!x) return;
      const now = new Date().toISOString();
      const notes: string[] = [];
      x.lines.forEach((l, i) => {
        const r = g[i];
        if (!r || r.qty <= 0) return;
        const bad = r.damaged ? Math.min(r.qty, Math.max(0, r.damagedQty)) : 0;
        const good = r.qty - bad;
        const pname = d.products.find((p) => p.id === l.productId)?.name ?? l.productId;
        if (good > 0) {
          d.movements.push({ id: uid('m'), productId: l.productId, branchId: x.branchId, qty: good, type: 'receiving', reason: `GRN against ${x.number} · Batch ${r.batch || '—'}${r.expiry ? ` · Exp ${r.expiry}` : ''} · cost ${peso(l.cost)}`, user: currentUserName(d), at: now, ref: x.number });
        }
        l.received += good;
        if (bad) notes.push(`${pname}: ${bad} damaged (rejected)`);
        if (l.received < l.qty) notes.push(`${pname}: short ${l.qty - l.received}`);
      });
      x.status = x.lines.every((l) => l.received >= l.qty) ? 'received' : 'partial';
      newStatus = x.status;
      addAudit(d, { module: 'Inventory', action: 'Goods received (GRN)', detail: `${x.number} · ${supplierName(d, x.supplierId)}${notes.length ? ` · ${notes.join('; ')}` : ''}`, branchId: x.branchId, oldValue: po.status, newValue: x.status });
      if (notes.length) addNotification(d, { audience: 'staff', targetId: x.branchId, title: `${x.number} received with issues`, body: notes.join('; ') });
    });
    toast.success(`GRN posted for ${po.number}`, { description: newStatus === 'received' ? 'PO fully received' : 'PO partially received — remaining qty stays open' });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Goods received note · {po.number}</DialogTitle>
          <DialogDescription>{supplierName(s, po.supplierId)} → {branchName(s, po.branchId)}. Accepted quantities are posted to the stock ledger as receiving movements.</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Prev. rec.</TableHead><TableHead>Receive now</TableHead><TableHead>Batch no.</TableHead><TableHead>Expiry</TableHead><TableHead>Damage</TableHead></TableRow></TableHeader>
          <TableBody>
            {po.lines.map((l, i) => {
              const p = s.products.find((x) => x.id === l.productId);
              const r = g[i];
              return (
                <TableRow key={i}>
                  <TableCell className="text-sm"><ProductImage image={p?.image} /> {p?.name}<p className="text-[11px] text-gray-400">{peso(l.cost)} / unit</p></TableCell>
                  <TableCell className="text-right">{l.qty}</TableCell>
                  <TableCell className="text-right text-gray-500">{l.received}</TableCell>
                  <TableCell><input type="number" min={0} className={cn(inputClass, 'w-20', r.qty < l.qty - l.received && 'border-amber-400')} value={r.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} /></TableCell>
                  <TableCell><input className={cn(inputClass, 'w-28 font-mono text-xs')} value={r.batch} onChange={(e) => upd(i, { batch: e.target.value })} /></TableCell>
                  <TableCell><input type="date" className={cn(inputClass, 'w-36')} value={r.expiry} onChange={(e) => upd(i, { expiry: e.target.value })} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={r.damaged} onCheckedChange={(v) => upd(i, { damaged: v === true, damagedQty: v === true ? Math.max(1, r.damagedQty) : 0 })} />
                      {r.damaged && <input type="number" min={0} className={cn(inputClass, 'w-16 border-red-300')} value={r.damagedQty} onChange={(e) => upd(i, { damagedQty: Number(e.target.value) })} />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-gray-500">Damaged units are rejected (not added to stock) and flagged to the branch manager. Short deliveries keep the PO open as “Partially received”.</p>
        <DialogFooter className="flex-wrap justify-end"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}><PackageCheck {...ICON} /> Post GRN</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PODetail({ s, po: initial, onClose }: { s: AppState; po: PurchaseOrder; onClose: () => void }) {
  const po = s.purchaseOrders.find((x) => x.id === initial.id) ?? initial;
  const sup = s.suppliers.find((x) => x.id === po.supplierId);
  const grns = s.movements.filter((m) => m.ref === po.number && m.type === 'receiving');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">{po.number} <StateBadge value={po.status} /></DialogTitle>
          <DialogDescription>{sup?.name} · {sup?.contact} · {sup?.terms} · deliver to {branchName(s, po.branchId)} · created {fmtDateTime(po.createdAt)}</DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
          <TableBody>
            {po.lines.map((l, i) => { const p = s.products.find((x) => x.id === l.productId); return (
              <TableRow key={i}><TableCell><ProductImage image={p?.image} /> {p?.name}</TableCell><TableCell className="text-right">{l.qty}</TableCell><TableCell className={cn('text-right', l.received < l.qty ? 'text-amber-600' : 'text-green-700')}>{l.received}</TableCell><TableCell className="text-right">{peso(l.cost)}</TableCell><TableCell className="text-right font-medium">{peso(l.qty * l.cost)}</TableCell></TableRow>
            ); })}
          </TableBody>
        </Table>
        <p className="text-right text-sm">PO total <b className="text-[#c8151d] text-lg ml-2">{peso(poTotal(po))}</b></p>
        {grns.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-gray-800">Receipts</p>
            {grns.map((m) => <p key={m.id}>{fmtDateTime(m.at)} · {s.products.find((p) => p.id === m.productId)?.name} +{m.qty} · {m.reason} · {m.user}</p>)}
          </div>
        )}
        <DialogFooter className="flex-wrap justify-end"><Button onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Reorder suggestions ----------------
function Reorder({ s, branchId, rows, canEdit, onDone }: { s: AppState; branchId: string; rows: ReturnType<typeof useSuggestions>; canEdit: boolean; onDone: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const chosen = rows.filter((r) => sel[r.p.id] ?? r.suggested > 0);
  const q = (r: (typeof rows)[number]) => qty[r.p.id] ?? r.suggested;

  function createPOs() {
    const lines = chosen.filter((r) => q(r) > 0);
    if (!lines.length) return toast.error('Select at least one product with a quantity');
    const bySupplier = new Map<string, typeof lines>();
    for (const r of lines) {
      const sid = r.p.supplierId ?? s.suppliers[0].id;
      bySupplier.set(sid, [...(bySupplier.get(sid) ?? []), r]);
    }
    const numbers: string[] = [];
    mutate((d) => {
      for (const [sid, rs] of bySupplier) {
        const number = `PO-${String(d.counters.po).padStart(4, '0')}`;
        d.counters.po += 1;
        numbers.push(number);
        const po: PurchaseOrder = { id: uid('po'), number, supplierId: sid, branchId, status: 'draft', createdAt: new Date().toISOString(), lines: rs.map((r) => ({ productId: r.p.id, qty: q(r), cost: r.p.costPrice, received: 0 })) };
        d.purchaseOrders.unshift(po);
        addAudit(d, { module: 'Inventory', action: 'PO created from reorder suggestions', detail: `${number} · ${supplierName(d, sid)} · ${rs.length} line(s) · ${peso(poTotal(po))}`, branchId });
      }
    });
    toast.success(`${numbers.length} draft PO${numbers.length > 1 ? 's' : ''} created`, { description: `${numbers.join(', ')} — grouped by supplier. Review and send.` });
    setSel({});
    setQty({});
    onDone();
  }

  return (
    <Panel title={`Reorder suggestions · ${branchName(s, branchId)}`} action={canEdit && <Button disabled={!chosen.length} onClick={createPOs}><Plus {...ICON} /> Create PO from suggestions ({chosen.length})</Button>} bodyClass="p-0">
      <p className="px-4 sm:px-5 py-3 text-xs text-gray-500 border-b border-gray-100">Products whose available-to-sell is below the reorder point. Suggested qty tops stock up to 3× the reorder point, net of quantities already on open POs, in cases of 6.</p>
      {rows.length === 0 ? <EmptyState title="All stocked up" sub="No product is below its reorder point at this branch" icon={<Users className="w-10 h-10" {...ICON} />} /> : (
        <Table>
          <TableHeader><TableRow><TableHead className="pl-5 w-10" /><TableHead>Product</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Reorder pt</TableHead><TableHead className="text-right">On order</TableHead><TableHead className="w-28">Order qty</TableHead><TableHead className="text-right">Est. cost</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => {
              const sup = s.suppliers.find((x) => x.id === r.p.supplierId);
              return (
                <TableRow key={r.p.id}>
                  <TableCell className="pl-5"><Checkbox checked={sel[r.p.id] ?? r.suggested > 0} onCheckedChange={(v) => setSel((x) => ({ ...x, [r.p.id]: v === true }))} /></TableCell>
                  <TableCell><ProductImage image={r.p.image} /> {r.p.name} <span className="text-xs text-gray-400">{r.p.size}</span></TableCell>
                  <TableCell className="text-sm text-gray-600">{sup?.name ?? '—'}<p className="text-[11px] text-gray-400">{sup ? `${sup.leadDays}-day lead time` : ''}</p></TableCell>
                  <TableCell className="text-right">{r.onHand}</TableCell>
                  <TableCell className={cn('text-right font-bold', r.available === 0 ? 'text-[#dc2626]' : 'text-amber-600')}>{r.available}</TableCell>
                  <TableCell className="text-right text-gray-500">{r.p.reorderPoint}</TableCell>
                  <TableCell className="text-right text-gray-500">{r.incoming || '—'}</TableCell>
                  <TableCell><input type="number" min={0} className={cn(inputClass, 'w-20')} value={q(r)} onChange={(e) => setQty((x) => ({ ...x, [r.p.id]: Number(e.target.value) }))} /></TableCell>
                  <TableCell className="text-right">{peso(q(r) * r.p.costPrice)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
