'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeftRight, Boxes, Camera, ClipboardCheck, Download, PackageX, Plus, Search, ShieldAlert, Truck, Wallet, Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, StatCard, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { addAudit, addNotification, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import { branchName, can, exportCsv, fmtDateTime, getSetting, num, onHand, peso, pesoShort, stockSummary, timeAgo } from '@/src/lib/logic';
import type { AppState, MovementType, Product, Transfer } from '@/src/lib/types';
import {
  Field, MOVEMENT_LABEL, MovementBadge, StateBadge, categoryPath, categoryTree, descendantIds, stockState,
} from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };

export default function InventoryPage() {
  const s = useStore();
  if (!can(s, 'inventory.view')) {
    return (
      <DashboardLayout title="Inventory" eyebrow="Stock Ledger">
        <AccessDenied permission="inventory.view" />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout title="Inventory" eyebrow="Stock Ledger">
      <InventoryInner s={s} />
    </DashboardLayout>
  );
}

type Level = { p: Product; onHand: number; reserved: number; buffer: number; available: number; state: 'ok' | 'low' | 'out'; value: number };

function useLevels(s: AppState, branchId: string): Level[] {
  return useMemo(
    () =>
      s.products
        .filter((p) => p.status !== 'discontinued')
        .map((p) => {
          const st = stockSummary(s, p.id, branchId);
          return { p, ...st, state: stockState(st.available, st.onHand, p.reorderPoint), value: Math.max(0, st.onHand) * p.costPrice };
        }),
    [s, branchId],
  );
}

function InventoryInner({ s }: { s: AppState }) {
  const branchId = s.session.branchId;
  const canEdit = can(s, 'inventory.edit') || can(s, 'inventory.create');
  const levels = useLevels(s, branchId);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordPid, setRecordPid] = useState<string | undefined>();
  const [cardPid, setCardPid] = useState<string | null>(null);

  const low = levels.filter((l) => l.state === 'low').length;
  const out = levels.filter((l) => l.state === 'out').length;
  const value = levels.reduce((n, l) => n + l.value, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Stock for <b className="text-gray-800">{branchName(s, branchId)}</b> is calculated from recorded movements — it is never edited directly.
          Safety buffer: <b>{num(getSetting(s, 'safetyBuffer', branchId))} units</b>.
        </p>
        {canEdit && <Button onClick={() => { setRecordPid(undefined); setRecordOpen(true); }}><Plus {...ICON} /> Record movement</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="SKUs stocked" value={levels.length} sub={`${levels.filter((l) => l.onHand > 0).length} with stock on hand`} icon={<Boxes className="w-5 h-5" {...ICON} />} />
        <StatCard title="Low stock" value={low} sub="At or below reorder point" accent="border-l-amber-500" valueClass="text-amber-600" icon={<AlertTriangle className="w-5 h-5" {...ICON} />} />
        <StatCard title="Out of stock" value={out} sub="Hidden from online sale" accent="border-l-[#dc2626]" valueClass="text-[#dc2626]" icon={<PackageX className="w-5 h-5" {...ICON} />} />
        <StatCard title="Stock value (cost)" value={pesoShort(value)} sub="On hand × cost price" accent="border-l-green-500" icon={<Wallet className="w-5 h-5" {...ICON} />} />
      </div>

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Stock levels</TabsTrigger>
          <TabsTrigger value="ledger">Movements ledger</TabsTrigger>
          <TabsTrigger value="count">Stock take</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>
        <TabsContent value="levels" className="mt-4">
          <StockLevels s={s} levels={levels} onCard={setCardPid} onRecord={canEdit ? (pid) => { setRecordPid(pid); setRecordOpen(true); } : undefined} />
        </TabsContent>
        <TabsContent value="ledger" className="mt-4"><Ledger s={s} branchId={branchId} onCard={setCardPid} /></TabsContent>
        <TabsContent value="count" className="mt-4"><StockTake s={s} branchId={branchId} canEdit={canEdit} /></TabsContent>
        <TabsContent value="transfers" className="mt-4"><Transfers s={s} branchId={branchId} canEdit={canEdit} /></TabsContent>
      </Tabs>

      {recordOpen && <RecordDialog s={s} branchId={branchId} initialPid={recordPid} onClose={() => setRecordOpen(false)} />}
      {cardPid && <StockCard s={s} branchId={branchId} productId={cardPid} onClose={() => setCardPid(null)} />}
    </div>
  );
}

// ---------------- (a) Stock levels ----------------
function StockLevels({ s, levels, onCard, onRecord }: { s: AppState; levels: Level[]; onCard: (id: string) => void; onRecord?: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'attention'>('all');
  const [cat, setCat] = useState('all');
  const tree = categoryTree(s);
  const rows = levels.filter((l) => {
    if (filter === 'low' && l.state !== 'low') return false;
    if (filter === 'out' && l.state !== 'out') return false;
    if (filter === 'attention' && l.state === 'ok') return false;
    if (cat !== 'all' && !descendantIds(s, cat).includes(l.p.categoryId)) return false;
    const t = q.trim().toLowerCase();
    return !t || `${l.p.name} ${l.p.sku} ${l.p.brand}`.toLowerCase().includes(t);
  });

  return (
    <Panel bodyClass="p-4">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" {...ICON} />
          <input className={cn(inputClass, 'pl-8 w-60')} placeholder="Search product or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={selectClass} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          {(['all', 'attention', 'low', 'out'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1 text-xs rounded-md', filter === f ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}>
              {f === 'all' ? 'All' : f === 'attention' ? 'Low + out' : f === 'low' ? 'Low stock' : 'Out of stock'}
            </button>
          ))}
        </div>
        <Button variant="outline" className="ml-auto" onClick={() => exportCsv('stock-levels.csv', [['SKU', 'Product', 'On hand', 'Reserved', 'Buffer', 'Available', 'Reorder point', 'Status', 'Value at cost'], ...rows.map((l) => [l.p.sku, l.p.name, l.onHand, l.reserved, l.buffer, l.available, l.p.reorderPoint, l.state, l.value.toFixed(2)])])}>
          <Download {...ICON} /> Export
        </Button>
      </Toolbar>
      {rows.length === 0 ? <EmptyState title="Nothing to show" sub="No products match this filter" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reserved</TableHead>
              <TableHead className="text-right">Safety buffer</TableHead><TableHead className="text-right">Available to sell</TableHead><TableHead className="text-right">Reorder pt</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Value at cost</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.p.id} className="cursor-pointer" onClick={() => onCard(l.p.id)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{l.p.image}</span>
                    <div><p className="font-medium text-gray-900">{l.p.name}</p><p className="text-[11px] text-gray-400">{l.p.sku} · {categoryPath(s, l.p.categoryId)}</p></div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold">{l.onHand}</TableCell>
                <TableCell className="text-right text-gray-600">{l.reserved}</TableCell>
                <TableCell className="text-right text-gray-400">{l.buffer}</TableCell>
                <TableCell className={cn('text-right font-bold', l.state === 'out' ? 'text-[#dc2626]' : l.state === 'low' ? 'text-amber-600' : 'text-[#1e40af]')}>{l.available}</TableCell>
                <TableCell className="text-right text-gray-500">{l.p.reorderPoint}</TableCell>
                <TableCell><StateBadge value={l.state} label={l.state === 'ok' ? 'OK' : l.state === 'low' ? 'Low' : 'Out'} /></TableCell>
                <TableCell className="text-right">{peso(l.value)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {onRecord && <Button variant="ghost" size="sm" onClick={() => onRecord(l.p.id)}>Record</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

// ---------------- (b) Movements ledger ----------------
function Ledger({ s, branchId, onCard }: { s: AppState; branchId: string; onCard: (id: string) => void }) {
  const [type, setType] = useState<'all' | MovementType>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return s.movements
      .filter((m) => m.branchId === branchId && (type === 'all' || m.type === type))
      .filter((m) => {
        if (!t) return true;
        const p = s.products.find((x) => x.id === m.productId);
        return `${p?.name} ${p?.sku} ${m.ref ?? ''} ${m.reason} ${m.user}`.toLowerCase().includes(t);
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [s, branchId, type, q]);

  return (
    <Panel bodyClass="p-4">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" {...ICON} />
          <input className={cn(inputClass, 'pl-8 w-60')} placeholder="Product, ref, reason, user" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">All movement types</option>
          {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
        </select>
        <span className="text-xs text-gray-400">{rows.length} movements</span>
        <Button variant="outline" className="ml-auto" onClick={() => exportCsv(`stock-movements-${branchId}.csv`, [['Date', 'SKU', 'Product', 'Type', 'Qty', 'Reason', 'User', 'Reference'], ...rows.map((m) => { const p = s.products.find((x) => x.id === m.productId); return [fmtDateTime(m.at), p?.sku ?? '', p?.name ?? m.productId, MOVEMENT_LABEL[m.type], m.qty, m.reason, m.user, m.ref ?? '']; })])}>
          <Download {...ICON} /> Export CSV
        </Button>
      </Toolbar>
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Reason</TableHead><TableHead>User</TableHead><TableHead>Ref</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.slice(0, limit).map((m) => {
            const p = s.products.find((x) => x.id === m.productId);
            return (
              <TableRow key={m.id}>
                <TableCell className="text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(m.at)}<p className="text-[10px] text-gray-400">{timeAgo(m.at)}</p></TableCell>
                <TableCell><button className="text-left hover:text-[#1e40af]" onClick={() => onCard(m.productId)}>{p?.image} {p?.name ?? m.productId}</button></TableCell>
                <TableCell><MovementBadge type={m.type} /></TableCell>
                <TableCell className={cn('text-right font-semibold tabular-nums', m.qty > 0 ? 'text-green-700' : 'text-[#dc2626]')}>{m.qty > 0 ? '+' : ''}{m.qty}</TableCell>
                <TableCell className="text-sm text-gray-600 max-w-64 truncate" title={m.reason}>{m.reason}</TableCell>
                <TableCell className="text-sm">{m.user}</TableCell>
                <TableCell className="font-mono text-xs text-gray-500">{m.ref ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.length > limit && <div className="mt-3 text-center"><Button variant="outline" size="sm" onClick={() => setLimit((n) => n + 200)}>Show more ({rows.length - limit} older)</Button></div>}
    </Panel>
  );
}

// ---------------- (c) Record movement ----------------
const RECORD_TYPES: { type: MovementType; label: string; sign: 1 | -1 | 0; reasons: string[] }[] = [
  { type: 'receiving', label: 'Receiving (no PO)', sign: 1, reasons: ['Direct delivery', 'Supplier replacement', 'Consignment'] },
  { type: 'wastage', label: 'Wastage / damage', sign: -1, reasons: ['Damaged in handling', 'Spoiled / wilted', 'Broken packaging', 'Pest damage'] },
  { type: 'expiry', label: 'Expiry write-off', sign: -1, reasons: ['Past expiry date', 'Near expiry — pulled from shelf'] },
  { type: 'adjustment', label: 'Adjustment (+/−)', sign: 0, reasons: ['Found stock', 'System error correction', 'Sample / demo use', 'Theft / shrinkage'] },
  { type: 'return', label: 'Customer return', sign: 1, reasons: ['Returned — resellable', 'Wrong item delivered — restocked'] },
];

function RecordDialog({ s, branchId, initialPid, onClose }: { s: AppState; branchId: string; initialPid?: string; onClose: () => void }) {
  const [type, setType] = useState<MovementType>('wastage');
  const [pid, setPid] = useState(initialPid ?? s.products[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [dir, setDir] = useState<1 | -1>(-1);
  const [reason, setReason] = useState(RECORD_TYPES[1].reasons[0]);
  const [note, setNote] = useState('');
  const [ref, setRef] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [approved, setApproved] = useState(false);
  const cfg = RECORD_TYPES.find((r) => r.type === type)!;
  const sign = cfg.sign === 0 ? dir : cfg.sign;
  const limit = num(getSetting(s, 'adjustApprovalUnits', branchId));
  const needsApproval = type === 'adjustment' && qty > limit;
  const current = onHand(s, pid, branchId);
  const p = s.products.find((x) => x.id === pid);

  function save() {
    if (!p) return toast.error('Choose a product');
    if (!(qty > 0)) return toast.error('Quantity must be greater than zero');
    if (needsApproval && !approved) return toast.error('Manager approval is required for this adjustment');
    if (sign < 0 && qty > current) return toast.error(`Only ${current} on hand — cannot remove ${qty}`);
    if (type === 'wastage' && !photo) toast.message('No photo attached — recorded without photo evidence');
    const fullReason = [reason, note, batch && `Batch ${batch}`, expiry && `Exp ${expiry}`, photo && `Photo: ${photo}`, needsApproval && 'Manager-approved'].filter(Boolean).join(' · ');
    mutate((d) => {
      d.movements.push({ id: uid('m'), productId: p.id, branchId, qty: sign * qty, type, reason: fullReason, user: currentUserName(d), at: new Date().toISOString(), ref: ref || undefined });
      addAudit(d, { module: 'Inventory', action: `Stock ${MOVEMENT_LABEL[type].toLowerCase()}`, detail: `${p.name} ${sign > 0 ? '+' : '−'}${qty} · ${reason}`, branchId, oldValue: String(current), newValue: String(current + sign * qty) });
      const after = current + sign * qty;
      if (sign < 0 && after <= p.reorderPoint) addNotification(d, { audience: 'staff', targetId: branchId, title: `Low stock: ${p.name}`, body: `${after} left at ${branchName(d, branchId)} (reorder point ${p.reorderPoint})` });
    });
    toast.success(`${MOVEMENT_LABEL[type]} recorded`, { description: `${p.name} ${sign > 0 ? '+' : '−'}${qty} · on hand ${current} → ${current + sign * qty}` });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Record stock movement</DialogTitle>
          <DialogDescription>{branchName(s, branchId)} · writes a ledger entry; stock is recalculated automatically.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {RECORD_TYPES.map((r) => (
            <button key={r.type} onClick={() => { setType(r.type); setReason(r.reasons[0]); setApproved(false); }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border', type === r.type ? 'bg-[#1e40af] text-white border-[#1e40af]' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product" className="col-span-2">
            <select className={selectClass} value={pid} onChange={(e) => setPid(e.target.value)}>
              {s.products.map((x) => <option key={x.id} value={x.id}>{x.image} {x.name} ({x.size}) — {x.sku}</option>)}
            </select>
          </Field>
          {cfg.sign === 0 && (
            <Field label="Direction">
              <select className={selectClass} value={dir} onChange={(e) => setDir(Number(e.target.value) as 1 | -1)}>
                <option value={1}>Add (+)</option><option value={-1}>Remove (−)</option>
              </select>
            </Field>
          )}
          <Field label="Quantity" hint={`On hand now: ${current} → after: ${current + sign * (qty || 0)}`}>
            <input type="number" min={1} className={inputClass} value={qty} onChange={(e) => { setQty(Number(e.target.value)); setApproved(false); }} />
          </Field>
          <Field label="Reason">
            <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>{cfg.reasons.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
          <Field label="Reference (optional)"><input className={inputClass} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="DR no., order no." /></Field>
          {type === 'receiving' && (
            <>
              <Field label="Batch no."><input className={inputClass} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="B-2311" /></Field>
              <Field label="Expiry date"><input type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
            </>
          )}
          <Field label="Notes" className="col-span-2"><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Details for the audit trail" /></Field>
          {(type === 'wastage' || type === 'expiry') && (
            <label className="col-span-2 flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 p-3 cursor-pointer hover:bg-gray-50">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} />
              <Camera className="w-6 h-6 text-gray-400" {...ICON} />
              <div className="text-sm">
                {photo ? <span className="text-green-700 font-medium">📷 {photo} attached</span> : <span className="text-gray-600">Attach photo evidence <span className="text-gray-400">(tap to take or upload)</span></span>}
              </div>
              {!photo && <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={(e) => { e.preventDefault(); setPhoto(`IMG_${Date.now().toString().slice(-6)}.jpg`); }}>Simulate photo</Button>}
            </label>
          )}
        </div>
        {needsApproval && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
            <p className="flex items-center gap-2 font-medium"><ShieldAlert className="w-4 h-4" {...ICON} /> Manager approval required — adjustment exceeds {limit} units</p>
            <label className="flex items-center gap-2"><Checkbox checked={approved} onCheckedChange={(v) => setApproved(v === true)} /> I confirm a branch manager approved this adjustment</label>
          </div>
        )}
        <DialogFooter className="justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={sign < 0 ? 'destructive' : 'default'} disabled={needsApproval && !approved} onClick={save}>Record {sign > 0 ? '+' : '−'}{qty || 0}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- (d) Stock take ----------------
function StockTake({ s, branchId, canEdit }: { s: AppState; branchId: string; canEdit: boolean }) {
  const tree = categoryTree(s);
  const [cat, setCat] = useState('cat-dairy');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Cycle count');
  const [approved, setApproved] = useState(false);
  const limit = num(getSetting(s, 'adjustApprovalUnits', branchId));
  const ids = descendantIds(s, cat);
  const items = s.products.filter((p) => ids.includes(p.categoryId) && p.status !== 'discontinued');
  const rows = items.map((p) => {
    const sys = onHand(s, p.id, branchId);
    const raw = counts[p.id];
    const counted = raw === undefined || raw === '' ? null : Number(raw);
    const variance = counted === null ? 0 : counted - sys;
    return { p, sys, counted, variance };
  });
  const counted = rows.filter((r) => r.counted !== null);
  const withVar = counted.filter((r) => r.variance !== 0);
  const large = withVar.some((r) => Math.abs(r.variance) > limit);
  const valueVar = withVar.reduce((n, r) => n + r.variance * r.p.costPrice, 0);

  function approve() {
    if (!counted.length) return toast.error('Enter at least one counted quantity');
    if (large && !approved) return toast.error('Large variances need manager approval');
    const label = s.categories.find((c) => c.id === cat)?.name ?? 'Category';
    mutate((d) => {
      const now = new Date().toISOString();
      for (const r of withVar) {
        d.movements.push({ id: uid('m'), productId: r.p.id, branchId, qty: r.variance, type: 'count_correction', reason: `${reason} (${label}) · system ${r.sys}, counted ${r.counted}${large ? ' · manager-approved' : ''}`, user: currentUserName(d), at: now, ref: `CNT-${now.slice(0, 10)}` });
      }
      addAudit(d, { module: 'Inventory', action: 'Stock take approved', detail: `${label} · ${counted.length} counted, ${withVar.length} corrected · variance ${peso(valueVar)}`, branchId });
    });
    toast.success(`Stock take approved: ${withVar.length} corrections posted`);
    setCounts({});
    setApproved(false);
  }

  return (
    <Panel title="Stock take (cycle count)" action={
      <div className="flex items-center gap-2">
        <select className={selectClass} value={cat} onChange={(e) => { setCat(e.target.value); setCounts({}); }}>
          {tree.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.icon} {c.name}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => setCounts(Object.fromEntries(rows.map((r) => [r.p.id, String(r.sys)])))}>Pre-fill system qty</Button>
      </div>
    } bodyClass="p-4">
      <Table>
        <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">System qty</TableHead><TableHead className="text-right w-36">Counted qty</TableHead><TableHead className="text-right">Variance</TableHead><TableHead className="text-right">Value impact</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.p.id} className={Math.abs(r.variance) > limit ? 'bg-amber-50/60' : ''}>
              <TableCell>{r.p.image} {r.p.name} <span className="text-xs text-gray-400">{r.p.sku}</span></TableCell>
              <TableCell className="text-right">{r.sys}</TableCell>
              <TableCell className="text-right"><input type="number" min={0} className={cn(inputClass, 'w-24 text-right')} value={counts[r.p.id] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [r.p.id]: e.target.value }))} placeholder="—" /></TableCell>
              <TableCell className={cn('text-right font-semibold', r.variance > 0 ? 'text-green-700' : r.variance < 0 ? 'text-[#dc2626]' : 'text-gray-400')}>{r.counted === null ? '—' : `${r.variance > 0 ? '+' : ''}${r.variance}`}</TableCell>
              <TableCell className="text-right text-sm">{r.counted === null || !r.variance ? '—' : peso(r.variance * r.p.costPrice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Pill>{counted.length}/{rows.length} counted</Pill>
        <Pill className={withVar.length ? 'bg-amber-100 text-amber-800' : ''}>{withVar.length} variances</Pill>
        <Pill className={valueVar < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}>Net {peso(valueVar)}</Pill>
        <input className={cn(inputClass, 'w-56')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        {large && (
          <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
            <Checkbox checked={approved} onCheckedChange={(v) => setApproved(v === true)} /> Manager approval (variance &gt; {limit} units)
          </label>
        )}
        <Button className="ml-auto" disabled={!canEdit || !counted.length || (large && !approved)} onClick={approve}><ClipboardCheck {...ICON} /> Approve corrections</Button>
      </div>
    </Panel>
  );
}

// ---------------- (e) Transfers ----------------
function Transfers({ s, branchId, canEdit }: { s: AppState; branchId: string; canEdit: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Transfer | null>(null);
  const list = s.transfers.filter((t) => showAll || t.fromBranchId === branchId || t.toBranchId === branchId).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function advance(t: Transfer, to: 'approved' | 'dispatched') {
    mutate((d) => {
      const x = d.transfers.find((y) => y.id === t.id);
      if (!x) return;
      x.status = to;
      const now = new Date().toISOString();
      if (to === 'dispatched') {
        for (const l of x.lines) {
          d.movements.push({ id: uid('m'), productId: l.productId, branchId: x.fromBranchId, qty: -l.qty, type: 'transfer_out', reason: `Transfer to ${branchName(d, x.toBranchId)}`, user: currentUserName(d), at: now, ref: x.number });
        }
      }
      addAudit(d, { module: 'Inventory', action: `Transfer ${to}`, detail: `${x.number} · ${branchName(d, x.fromBranchId)} → ${branchName(d, x.toBranchId)}`, branchId: x.fromBranchId, oldValue: t.status, newValue: to });
      if (to === 'dispatched') addNotification(d, { audience: 'staff', targetId: x.toBranchId, title: `Transfer ${x.number} dispatched`, body: `From ${branchName(d, x.fromBranchId)} · ${x.lines.length} line(s)` });
    });
    toast.success(`${t.number} ${to}`);
  }

  return (
    <>
      <Panel title="Inter-branch transfers" action={
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600"><Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} /> All branches</label>
          {canEdit && <Button onClick={() => setCreating(true)}><Plus {...ICON} /> New transfer</Button>}
        </div>
      } bodyClass="p-0">
        {list.length === 0 ? <EmptyState title="No transfers for this branch" icon={<ArrowLeftRight className="w-10 h-10" {...ICON} />} /> : (
          <Table>
            <TableHeader><TableRow><TableHead className="pl-5">Transfer</TableHead><TableHead>Route</TableHead><TableHead>Items</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead className="text-right pr-5">Action</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="pl-5 font-mono text-sm font-medium">{t.number}</TableCell>
                  <TableCell className="text-sm"><span className={cn(t.fromBranchId === branchId && 'font-semibold')}>{branchName(s, t.fromBranchId)}</span> <span className="text-gray-400">→</span> <span className={cn(t.toBranchId === branchId && 'font-semibold')}>{branchName(s, t.toBranchId)}</span></TableCell>
                  <TableCell className="text-xs text-gray-600">{t.lines.map((l, i) => { const p = s.products.find((x) => x.id === l.productId); return <p key={i}>{p?.image} {p?.name ?? l.productId} ×{l.qty}</p>; })}</TableCell>
                  <TableCell className="text-xs text-gray-500">{fmtDateTime(t.createdAt)}</TableCell>
                  <TableCell><StateBadge value={t.status} /></TableCell>
                  <TableCell className="text-right pr-5">
                    {canEdit && t.status === 'requested' && <Button size="sm" onClick={() => advance(t, 'approved')}>Approve</Button>}
                    {canEdit && t.status === 'approved' && <Button size="sm" onClick={() => advance(t, 'dispatched')}><Truck {...ICON} /> Dispatch</Button>}
                    {canEdit && t.status === 'dispatched' && <Button size="sm" onClick={() => setReceiving(t)}>Receive</Button>}
                    {t.status === 'received' && <span className="text-xs text-gray-400">Completed</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      {creating && <NewTransferDialog s={s} branchId={branchId} onClose={() => setCreating(false)} />}
      {receiving && <ReceiveTransferDialog s={s} transfer={receiving} onClose={() => setReceiving(null)} />}
    </>
  );
}

function NewTransferDialog({ s, branchId, onClose }: { s: AppState; branchId: string; onClose: () => void }) {
  const others = s.branches.filter((b) => b.id !== branchId);
  const [from, setFrom] = useState(branchId);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [lines, setLines] = useState<{ productId: string; qty: number }[]>([{ productId: s.products[0]?.id ?? '', qty: 6 }]);

  function save() {
    if (from === to) return toast.error('Choose two different branches');
    const valid = lines.filter((l) => l.productId && l.qty > 0);
    if (!valid.length) return toast.error('Add at least one product line');
    for (const l of valid) {
      const oh = onHand(s, l.productId, from);
      if (l.qty > oh) return toast.error(`${s.products.find((p) => p.id === l.productId)?.name}: only ${oh} on hand at ${branchName(s, from)}`);
    }
    let number = '';
    mutate((d) => {
      number = `TR-${String(d.counters.transfer).padStart(4, '0')}`;
      d.counters.transfer += 1;
      d.transfers.unshift({ id: uid('tr'), number, fromBranchId: from, toBranchId: to, status: 'requested', createdAt: new Date().toISOString(), lines: valid });
      addAudit(d, { module: 'Inventory', action: 'Transfer requested', detail: `${number} · ${branchName(d, from)} → ${branchName(d, to)} · ${valid.length} line(s)`, branchId: from });
      addNotification(d, { audience: 'staff', targetId: from, title: `Transfer request ${number}`, body: `${branchName(d, to)} requests ${valid.length} item(s)` });
    });
    toast.success(`Transfer ${number} requested`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New transfer request</DialogTitle><DialogDescription>Request → approve → dispatch (stock leaves source) → receive (stock arrives).</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From branch"><select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="To branch"><select className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className={cn(selectClass, 'flex-1')} value={l.productId} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, productId: e.target.value } : x)))}>
                {s.products.map((p) => <option key={p.id} value={p.id}>{p.image} {p.name} ({p.size}) — {onHand(s, p.id, from)} at source</option>)}
              </select>
              <input type="number" min={1} className={cn(inputClass, 'w-20')} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Trash2 className="text-[#dc2626]" {...ICON} /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { productId: s.products[0]?.id ?? '', qty: 6 }])}><Plus {...ICON} /> Add line</Button>
        </div>
        <DialogFooter className="justify-end"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Create request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveTransferDialog({ s, transfer, onClose }: { s: AppState; transfer: Transfer; onClose: () => void }) {
  const [got, setGot] = useState<Record<string, number>>(Object.fromEntries(transfer.lines.map((l) => [l.productId, l.qty])));
  function save() {
    mutate((d) => {
      const x = d.transfers.find((y) => y.id === transfer.id);
      if (!x) return;
      x.status = 'received';
      const now = new Date().toISOString();
      const issues: string[] = [];
      for (const l of x.lines) {
        const q = Math.max(0, got[l.productId] ?? l.qty);
        const pname = d.products.find((p) => p.id === l.productId)?.name ?? l.productId;
        if (q !== l.qty) issues.push(`${pname} sent ${l.qty}, received ${q}`);
        if (q > 0) d.movements.push({ id: uid('m'), productId: l.productId, branchId: x.toBranchId, qty: q, type: 'transfer_in', reason: `Transfer from ${branchName(d, x.fromBranchId)}${q !== l.qty ? ` · discrepancy (sent ${l.qty})` : ''}`, user: currentUserName(d), at: now, ref: x.number });
      }
      addAudit(d, { module: 'Inventory', action: issues.length ? 'Transfer received with discrepancy' : 'Transfer received', detail: `${x.number}${issues.length ? ` · ${issues.join('; ')}` : ''}`, branchId: x.toBranchId });
    });
    toast.success(`${transfer.number} received`);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Receive {transfer.number}</DialogTitle><DialogDescription>{branchName(s, transfer.fromBranchId)} → {branchName(s, transfer.toBranchId)} · enter quantities actually received.</DialogDescription></DialogHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Dispatched</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
          <TableBody>
            {transfer.lines.map((l) => {
              const p = s.products.find((x) => x.id === l.productId);
              return (
                <TableRow key={l.productId}>
                  <TableCell>{p?.image} {p?.name}</TableCell>
                  <TableCell className="text-right">{l.qty}</TableCell>
                  <TableCell className="text-right"><input type="number" min={0} className={cn(inputClass, 'w-20 text-right', got[l.productId] !== l.qty && 'border-amber-400')} value={got[l.productId]} onChange={(e) => setGot((g) => ({ ...g, [l.productId]: Number(e.target.value) }))} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DialogFooter className="justify-end"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Confirm receipt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- (f) Product stock card ----------------
function StockCard({ s, branchId, productId, onClose }: { s: AppState; branchId: string; productId: string; onClose: () => void }) {
  const p = s.products.find((x) => x.id === productId);
  const st = stockSummary(s, productId, branchId);
  const rows = useMemo(() => {
    let bal = 0;
    return s.movements
      .filter((m) => m.productId === productId && m.branchId === branchId)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((m) => ({ m, bal: (bal += m.qty) }))
      .reverse();
  }, [s, productId, branchId]);
  if (!p) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="text-2xl">{p.image}</span> Stock card · {p.name}</DialogTitle>
          <DialogDescription>{p.sku} · {p.size} · {branchName(s, branchId)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {[['On hand', st.onHand], ['Reserved', st.reserved], ['Buffer', st.buffer], ['Available', st.available]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{k}</p><p className="text-xl font-bold text-[#1e40af]">{v}</p></div>
          ))}
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-100">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Reason</TableHead><TableHead>User / Ref</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ m, bal }) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(m.at)}</TableCell>
                  <TableCell><MovementBadge type={m.type} /></TableCell>
                  <TableCell className={cn('text-right font-semibold', m.qty > 0 ? 'text-green-700' : 'text-[#dc2626]')}>{m.qty > 0 ? '+' : ''}{m.qty}</TableCell>
                  <TableCell className="text-right font-bold">{bal}</TableCell>
                  <TableCell className="text-xs text-gray-600 max-w-56">{m.reason}</TableCell>
                  <TableCell className="text-xs">{m.user}<p className="font-mono text-gray-400">{m.ref ?? ''}</p></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter className="justify-end">
          <Button variant="outline" onClick={() => exportCsv(`stock-card-${p.sku}-${branchId}.csv`, [['Date', 'Type', 'Qty', 'Balance', 'Reason', 'User', 'Ref'], ...rows.map(({ m, bal }) => [fmtDateTime(m.at), MOVEMENT_LABEL[m.type], m.qty, bal, m.reason, m.user, m.ref ?? ''])])}><Download {...ICON} /> Export</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
