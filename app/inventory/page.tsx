'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeftRight, Boxes, Camera, CheckCircle2, ClipboardCheck, Download, PackageCheck, PackageX, Plus, Search, ShieldAlert, Truck, Wallet, Trash2,
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
import type { AppState, MovementType, Product, Receiving, Transfer } from '@/src/lib/types';
import {
  Field, MOVEMENT_LABEL, MovementBadge, StateBadge, categoryPath, categoryTree, inCategory, stockState,
} from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';

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
  const pendingRcv = (s.receivings ?? []).filter((r) => r.branchId === branchId && r.status === 'pending_approval').length;

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 min-w-0">
          Stock for <b className="text-gray-800">{branchName(s, branchId)}</b> is calculated from recorded movements — it is never edited directly.
          Safety buffer: <b>{num(getSetting(s, 'safetyBuffer', branchId))} units</b>.
        </p>
        {canEdit && <Button onClick={() => { setRecordPid(undefined); setRecordOpen(true); }}><Plus {...ICON} /> Record movement</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="SKUs stocked" value={levels.length} sub={`${levels.filter((l) => l.onHand > 0).length} with stock on hand`} icon={<Boxes className="w-5 h-5" {...ICON} />} />
        <StatCard title="Low stock" value={low} sub="At or below reorder point" accent="border-l-amber-500" valueClass="text-amber-600" icon={<AlertTriangle className="w-5 h-5" {...ICON} />} />
        <StatCard title="Out of stock" value={out} sub="Hidden from online sale" accent="border-l-[#dc2626]" valueClass="text-[#dc2626]" icon={<PackageX className="w-5 h-5" {...ICON} />} />
        <StatCard valueClass="text-lg sm:text-2xl xl:text-3xl text-[#c8151d] break-words" title="Stock value (cost)" value={pesoShort(value)} sub="On hand × cost price" accent="border-l-green-500" icon={<Wallet className="w-5 h-5" {...ICON} />} />
      </div>

      <Tabs defaultValue="levels">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="levels">Stock levels</TabsTrigger>
          <TabsTrigger value="receiving">
            Direct Receiving
            {pendingRcv > 0 && <span className="rounded-full bg-amber-500 text-white text-[10px] px-1.5">{pendingRcv}</span>}
          </TabsTrigger>
          <TabsTrigger value="ledger">Movements ledger</TabsTrigger>
          <TabsTrigger value="count">Stock take</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>
        <TabsContent value="levels" className="mt-4">
          <StockLevels s={s} levels={levels} onCard={setCardPid} onRecord={canEdit ? (pid) => { setRecordPid(pid); setRecordOpen(true); } : undefined} />
        </TabsContent>
        <TabsContent value="receiving" className="mt-4">
          <DirectReceiving s={s} branchId={branchId} canCreate={canEdit} canApprove={can(s, 'inventory.approve')} />
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
    if (cat !== 'all' && !inCategory(s, l.p, cat)) return false;
    const t = q.trim().toLowerCase();
    return !t || `${l.p.name} ${l.p.sku} ${l.p.brand}`.toLowerCase().includes(t);
  });

  return (
    <Panel bodyClass="p-4">
      <Toolbar>
        <div className="relative w-full sm:w-auto">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" {...ICON} />
          <input className={cn(inputClass, 'pl-8 w-full sm:w-60')} placeholder="Search product or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={selectClass} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {tree.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
        </select>
        <div className="flex flex-wrap rounded-lg border border-gray-200 p-0.5">
          {(['all', 'attention', 'low', 'out'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1 text-xs rounded-md', filter === f ? 'bg-[#c8151d] text-white' : 'text-gray-600 hover:bg-gray-50')}>
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
                    <span className="text-xl"><ProductImage image={l.p.image} /></span>
                    <div><p className="font-medium text-gray-900">{l.p.name}</p><p className="text-[11px] text-gray-400">{l.p.sku} · {categoryPath(s, l.p.categoryId)}</p></div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold">{l.onHand}</TableCell>
                <TableCell className="text-right text-gray-600">{l.reserved}</TableCell>
                <TableCell className="text-right text-gray-400">{l.buffer}</TableCell>
                <TableCell className={cn('text-right font-bold', l.state === 'out' ? 'text-[#dc2626]' : l.state === 'low' ? 'text-amber-600' : 'text-[#c8151d]')}>{l.available}</TableCell>
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
        <div className="relative w-full sm:w-auto">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" {...ICON} />
          <input className={cn(inputClass, 'pl-8 w-full sm:w-60')} placeholder="Product, ref, reason, user" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <TableCell><button className="text-left hover:text-[#c8151d]" onClick={() => onCard(m.productId)}><ProductImage image={p?.image} /> {p?.name ?? m.productId}</button></TableCell>
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
  const [reason, setReason] = useState(RECORD_TYPES[0].reasons[0]);
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
      <DialogContent className="max-w-xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Record stock movement</DialogTitle>
          <DialogDescription>{branchName(s, branchId)} · writes a ledger entry; stock is recalculated automatically.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {RECORD_TYPES.map((r) => (
            <button key={r.type} onClick={() => { setType(r.type); setReason(r.reasons[0]); setApproved(false); }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border', type === r.type ? 'bg-[#c8151d] text-white border-[#c8151d]' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product" className="col-span-2">
            <select className={selectClass} value={pid} onChange={(e) => setPid(e.target.value)}>
              {s.products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.size}) — {x.sku}</option>)}
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
        <DialogFooter className="justify-end flex-wrap">
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
  const [cat, setCat] = useState('cat-pork');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Cycle count');
  const [approved, setApproved] = useState(false);
  const limit = num(getSetting(s, 'adjustApprovalUnits', branchId));
  const items = s.products.filter((p) => inCategory(s, p, cat) && p.status !== 'discontinued');
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
      <div className="flex flex-wrap items-center gap-2">
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
              <TableCell><ProductImage image={r.p.image} /> {r.p.name} <span className="text-xs text-gray-400">{r.p.sku}</span></TableCell>
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
        <input className={cn(inputClass, 'w-full sm:w-56')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
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
                  <TableCell className="text-xs text-gray-600">{t.lines.map((l, i) => { const p = s.products.find((x) => x.id === l.productId); return <p key={i}><ProductImage image={p?.image} /> {p?.name ?? l.productId} ×{l.qty}</p>; })}</TableCell>
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
      <DialogContent className="max-w-xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader><DialogTitle>New transfer request</DialogTitle><DialogDescription>Request → approve → dispatch (stock leaves source) → receive (stock arrives).</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From branch"><select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="To branch"><select className={selectClass} value={to} onChange={(e) => setTo(e.target.value)}>{s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select className={cn(selectClass, 'flex-1')} value={l.productId} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, productId: e.target.value } : x)))}>
                {s.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.size}) — {onHand(s, p.id, from)} at source</option>)}
              </select>
              <input type="number" min={1} className={cn(inputClass, 'w-20')} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}><Trash2 className="text-[#dc2626]" {...ICON} /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { productId: s.products[0]?.id ?? '', qty: 6 }])}><Plus {...ICON} /> Add line</Button>
        </div>
        <DialogFooter className="justify-end flex-wrap"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Create request</Button></DialogFooter>
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
      <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader><DialogTitle>Receive {transfer.number}</DialogTitle><DialogDescription>{branchName(s, transfer.fromBranchId)} → {branchName(s, transfer.toBranchId)} · enter quantities actually received.</DialogDescription></DialogHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Dispatched</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
          <TableBody>
            {transfer.lines.map((l) => {
              const p = s.products.find((x) => x.id === l.productId);
              return (
                <TableRow key={l.productId}>
                  <TableCell><ProductImage image={p?.image} /> {p?.name}</TableCell>
                  <TableCell className="text-right">{l.qty}</TableCell>
                  <TableCell className="text-right"><input type="number" min={0} className={cn(inputClass, 'w-20 text-right', got[l.productId] !== l.qty && 'border-amber-400')} value={got[l.productId]} onChange={(e) => setGot((g) => ({ ...g, [l.productId]: Number(e.target.value) }))} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <DialogFooter className="justify-end flex-wrap"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Confirm receipt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- (f) Product stock card ----------------
function StockCard({ s, branchId, productId, onClose }: { s: AppState; branchId: string; productId: string; onClose: () => void }) {
  const p = s.products.find((x) => x.id === productId);
  const st = stockSummary(s, productId, branchId);
  const rows = useMemo(() => {
    const sorted = s.movements
      .filter((m) => m.productId === productId && m.branchId === branchId)
      .sort((a, b) => a.at.localeCompare(b.at));
    const out: { m: (typeof sorted)[number]; bal: number }[] = [];
    for (const m of sorted) out.push({ m, bal: (out.length ? out[out.length - 1].bal : 0) + m.qty });
    return out.reverse();
  }, [s, productId, branchId]);
  if (!p) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><span className="text-2xl"><ProductImage image={p.image} /></span> Stock card · {p.name}</DialogTitle>
          <DialogDescription>{p.sku} · {p.size} · {branchName(s, branchId)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['On hand', st.onHand], ['Reserved', st.reserved], ['Buffer', st.buffer], ['Available', st.available]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{k}</p><p className="text-xl font-bold text-[#c8151d]">{v}</p></div>
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
        <DialogFooter className="justify-end flex-wrap">
          <Button variant="outline" onClick={() => exportCsv(`stock-card-${p.sku}-${branchId}.csv`, [['Date', 'Type', 'Qty', 'Balance', 'Reason', 'User', 'Ref'], ...rows.map(({ m, bal }) => [fmtDateTime(m.at), MOVEMENT_LABEL[m.type], m.qty, bal, m.reason, m.user, m.ref ?? ''])])}><Download {...ICON} /> Export</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- (g) Direct Receiving ----------------
type RcvLine = Receiving['lines'][number];

/** Line value: weight × cost per kg for weighed products, otherwise qty × cost per unit. */
function rcvLineValue(p: Product | undefined, l: Pick<RcvLine, 'qty' | 'weightKg' | 'cost'>) {
  return Math.round((p?.soldByWeight ? (l.weightKg ?? l.qty) : l.qty) * l.cost * 100) / 100;
}
function receivingValue(s: AppState, r: Receiving) {
  return Math.round(r.lines.reduce((t, l) => t + rcvLineValue(s.products.find((p) => p.id === l.productId), l), 0) * 100) / 100;
}
/** Stock units for the ledger. Weighed products are counted in whole kg (same as opening stock and earlier receivings). */
function rcvStockUnits(p: Product | undefined, l: RcvLine) {
  return p?.soldByWeight ? Math.max(1, Math.round(l.weightKg ?? l.qty)) : l.qty;
}
function rcvQtyText(p: Product | undefined, l: RcvLine) {
  return p?.soldByWeight ? `${(l.weightKg ?? l.qty).toLocaleString('en-PH', { maximumFractionDigits: 3 })} kg` : `${l.qty} ${p?.unit ?? 'pc'}`;
}
/** Add one stock movement per line (inside a mutate recipe). */
function postReceivingStock(d: AppState, r: Receiving, user: string) {
  const at = new Date().toISOString();
  for (const l of r.lines) {
    const p = d.products.find((x) => x.id === l.productId);
    const extra = [`DR ${r.receiptNo}`, `Batch ${l.batch}`, l.producedOn && `Produced ${l.producedOn}`, l.expiresOn && `Exp ${l.expiresOn}`, p?.soldByWeight && `${l.weightKg} kg`].filter(Boolean).join(' · ');
    d.movements.push({ id: uid('m'), productId: l.productId, branchId: r.branchId, qty: rcvStockUnits(p, l), type: 'receiving', reason: `Direct Receiving · ${r.supplierName} · ${extra}`, user, at, ref: r.number });
  }
}

function RcvStatus({ status }: { status: Receiving['status'] }) {
  return status === 'posted'
    ? <Pill className="bg-green-100 text-green-800">Posted</Pill>
    : <Pill className="bg-amber-100 text-amber-800">Pending approval</Pill>;
}

function DirectReceiving({ s, branchId, canCreate, canApprove }: { s: AppState; branchId: string; canCreate: boolean; canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const threshold = num(getSetting(s, 'receivingApprovalAbove', branchId)) || 20000;
  const list = (s.receivings ?? []).filter((r) => r.branchId === branchId).slice().sort((a, b) => b.at.localeCompare(a.at));
  const pending = list.filter((r) => r.status === 'pending_approval');
  const detail = list.find((r) => r.id === detailId);

  function approve(r: Receiving) {
    if (!canApprove) return toast.error('You need the inventory.approve permission');
    let ok = false;
    mutate((d) => {
      const x = d.receivings.find((y) => y.id === r.id);
      if (!x || x.status !== 'pending_approval') return;
      const by = currentUserName(d);
      x.status = 'posted';
      x.note = [x.note, `Approved by ${by} on ${fmtDateTime(new Date().toISOString())}`].filter(Boolean).join(' · ');
      postReceivingStock(d, x, by);
      addAudit(d, { module: 'Inventory', action: 'Direct Receiving approved', detail: `${x.number} · ${x.supplierName} · DR ${x.receiptNo} · ${peso(receivingValue(d, x))} — stock added`, branchId: x.branchId, oldValue: 'pending_approval', newValue: 'posted' });
      ok = true;
    });
    if (ok) toast.success(`${r.number} approved`, { description: `${r.lines.length} line(s) added to stock` });
  }

  return (
    <>
      <Panel
        title={<div className="min-w-0"><h2 className="text-base font-semibold text-gray-900">Direct Receiving</h2><p className="text-xs text-gray-500">Supplier deliveries go straight into stock. Above {pesoShort(threshold)} a manager must approve before stock is added.</p></div>}
        action={canCreate ? <Button className="shrink-0" onClick={() => setOpen(true)}><Plus {...ICON} /> <span className="hidden sm:inline">Receive delivery</span><span className="sm:hidden">Receive</span></Button> : undefined}
        bodyClass="p-0"
      >
        {pending.length > 0 && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex flex-wrap items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" {...ICON} />
            <span>{pending.length} delivery{pending.length > 1 ? 'ies' : ''} waiting for manager approval — stock is not added yet.</span>
            {!canApprove && <span className="text-xs">A user with Inventory approval rights must approve.</span>}
          </div>
        )}
        {list.length === 0 ? (
          <EmptyState title="No deliveries received yet" sub="Use Receive delivery when a supplier drops off stock" icon={<PackageCheck className="w-10 h-10" {...ICON} />} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Number</TableHead><TableHead>Supplier</TableHead><TableHead>Receipt no.</TableHead><TableHead>Items</TableHead>
                <TableHead className="text-right">Value</TableHead><TableHead>Status</TableHead><TableHead>By</TableHead><TableHead>When</TableHead><TableHead className="pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
                  <TableCell className="pl-5 font-mono text-sm font-medium text-[#c8151d] whitespace-nowrap">{r.number}</TableCell>
                  <TableCell className="text-sm min-w-36">{r.supplierName}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{r.receiptNo}{r.hasPhoto && <span className="ml-1" title="Photo attached">📷</span>}</TableCell>
                  <TableCell className="text-xs text-gray-600 min-w-44">
                    {r.lines.slice(0, 2).map((l, i) => { const p = s.products.find((x) => x.id === l.productId); return <p key={i}><ProductImage image={p?.image} /> {p?.name ?? l.productId} · {rcvQtyText(p, l)}</p>; })}
                    {r.lines.length > 2 && <p className="text-gray-400">+{r.lines.length - 2} more</p>}
                  </TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap">{peso(receivingValue(s, r))}</TableCell>
                  <TableCell><RcvStatus status={r.status} /></TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{r.by}</TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(r.at)}<p className="text-[10px] text-gray-400">{timeAgo(r.at)}</p></TableCell>
                  <TableCell className="pr-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'pending_approval' && canApprove
                      ? <Button size="sm" onClick={() => approve(r)}><CheckCircle2 {...ICON} /> Approve</Button>
                      : <Button size="sm" variant="ghost" onClick={() => setDetailId(r.id)}>View</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      {open && <ReceiveDialog s={s} branchId={branchId} threshold={threshold} onClose={() => setOpen(false)} onPosted={(id) => setDetailId(id)} />}
      {detail && <ReceivingDetail s={s} r={detail} canApprove={canApprove} onApprove={() => approve(detail)} onClose={() => setDetailId(null)} />}
    </>
  );
}

type DraftLine = { key: string; q: string; productId: string; amount: string; cost: string; batch: string; producedOn: string; expiresOn: string };
const blankLine = (): DraftLine => ({ key: uid('rl'), q: '', productId: '', amount: '', cost: '', batch: '', producedOn: '', expiresOn: '' });

function ReceiveDialog({ s, branchId, threshold, onClose, onPosted }: { s: AppState; branchId: string; threshold: number; onClose: () => void; onPosted: (id: string) => void }) {
  const [supplierId, setSupplierId] = useState(s.suppliers[0]?.id ?? '__other');
  const [otherName, setOtherName] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => [blankLine()]);
  const products = s.products.filter((p) => p.status !== 'discontinued');
  const productOf = (id: string) => s.products.find((p) => p.id === id);
  const supplierName = supplierId === '__other' ? otherName.trim() : (s.suppliers.find((x) => x.id === supplierId)?.name ?? '');

  const parsed = lines.map((l) => {
    const p = productOf(l.productId);
    const amount = Number(l.amount) || 0;
    const cost = Number(l.cost) || 0;
    const value = p ? rcvLineValue(p, { qty: amount, weightKg: p.soldByWeight ? amount : undefined, cost }) : 0;
    return { l, p, amount, cost, value };
  });
  const total = Math.round(parsed.reduce((t, x) => t + x.value, 0) * 100) / 100;
  const needsApproval = total > threshold;

  const update = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const pickProduct = (key: string, id: string) => {
    const p = productOf(id);
    update(key, { productId: id, cost: p ? String(p.costPrice) : '' });
  };

  function post() {
    if (!supplierName) return toast.error('Choose or type the supplier');
    if (!receiptNo.trim()) return toast.error('Enter the supplier delivery receipt number');
    const filled = parsed.filter((x) => x.l.productId);
    if (!filled.length) return toast.error('Add at least one product line');
    for (const x of filled) {
      const name = x.p?.name ?? 'Product';
      if (!(x.amount > 0)) return toast.error(`${name}: enter the ${x.p?.soldByWeight ? 'weight in kg' : 'quantity'}`);
      if (!x.p?.soldByWeight && !Number.isInteger(x.amount)) return toast.error(`${name}: quantity must be a whole number`);
      if (!(x.cost > 0)) return toast.error(`${name}: enter the cost`);
      if (!x.l.batch.trim()) return toast.error(`${name}: enter the batch / lot number`);
      if (x.l.producedOn && x.l.expiresOn && x.l.expiresOn < x.l.producedOn) return toast.error(`${name}: expiry date is before the produced date`);
    }
    const rcvLines: RcvLine[] = filled.map((x) => {
      const weighted = !!x.p?.soldByWeight;
      const kg = Math.round(x.amount * 1000) / 1000;
      return {
        productId: x.l.productId,
        qty: weighted ? Math.max(1, Math.round(kg)) : x.amount,
        weightKg: weighted ? kg : undefined,
        cost: x.cost,
        batch: x.l.batch.trim(),
        producedOn: x.l.producedOn || undefined,
        expiresOn: x.l.expiresOn || undefined,
      };
    });
    let number = '';
    let id = '';
    mutate((d) => {
      if (!d.receivings) d.receivings = [];
      number = `RCV-${String(d.counters.receiving).padStart(4, '0')}`;
      d.counters.receiving += 1;
      id = uid('rcv');
      const by = currentUserName(d);
      const rcv: Receiving = {
        id, number, branchId, supplierId: supplierId === '__other' ? undefined : supplierId, supplierName, receiptNo: receiptNo.trim(),
        hasPhoto: !!photo, at: new Date().toISOString(), by, note: note.trim() || undefined,
        status: needsApproval ? 'pending_approval' : 'posted', lines: rcvLines,
      };
      d.receivings.unshift(rcv);
      if (!needsApproval) postReceivingStock(d, rcv, by);
      addAudit(d, {
        module: 'Inventory', action: needsApproval ? 'Direct Receiving submitted for approval' : 'Direct Receiving posted',
        detail: `${number} · ${supplierName} · DR ${rcv.receiptNo} · ${rcvLines.length} line(s) · ${peso(total)}${needsApproval ? ` (above ${pesoShort(threshold)})` : ''}`,
        branchId, newValue: peso(total),
      });
      if (needsApproval) addNotification(d, { audience: 'staff', targetId: branchId, title: `Approval needed: ${number}`, body: `${supplierName} delivery ${peso(total)} is above ${pesoShort(threshold)}. Approve it in Inventory → Direct Receiving.` });
    });
    if (needsApproval) toast.warning(`${number} waiting for manager approval`, { description: `${peso(total)} is above ${pesoShort(threshold)} — stock is added after approval.` });
    else toast.success(`${number} posted to stock`, { description: `${rcvLines.length} line(s) · ${peso(total)}` });
    onClose();
    onPosted(id);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Receive delivery</DialogTitle>
          <DialogDescription>{branchName(s, branchId)} · Record a supplier delivery straight into stock. Each line adds a stock movement.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Supplier">
            <select className={cn(selectClass, 'w-full')} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              <option value="__other">Other — type the name</option>
            </select>
          </Field>
          {supplierId === '__other' ? (
            <Field label="Supplier name"><input className={cn(inputClass, 'w-full')} value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="e.g. Bansalan Hog Farm" /></Field>
          ) : (
            <Field label="Supplier delivery receipt no."><input className={cn(inputClass, 'w-full')} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="e.g. DR-55121" /></Field>
          )}
          {supplierId === '__other' && (
            <Field label="Supplier delivery receipt no."><input className={cn(inputClass, 'w-full')} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="e.g. DR-55121" /></Field>
          )}
          <label className={cn('flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 p-2.5 cursor-pointer hover:bg-gray-50', supplierId !== '__other' && 'sm:col-span-2')}>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} />
            <Camera className="w-5 h-5 text-gray-400 shrink-0" {...ICON} />
            <span className="text-sm min-w-0 truncate">{photo ? <span className="text-green-700 font-medium">📷 Photo attached ({photo})</span> : <span className="text-gray-600">Photo of the delivery receipt <span className="text-gray-400">(tap to take or upload)</span></span>}</span>
          </label>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">Items received</p>
          {parsed.map(({ l, p, value }, i) => {
            const t = l.q.trim().toLowerCase();
            const options = products.filter((x) => !t || `${x.name} ${x.sku} ${x.brand}`.toLowerCase().includes(t)).slice(0, 60);
            if (p && !options.some((x) => x.id === p.id)) options.unshift(p);
            const weighted = !!p?.soldByWeight;
            return (
              <div key={l.key} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500">Line {i + 1}{p ? ` · ${p.soldByWeight ? 'sold by weight' : `per ${p.unit}`}` : ''}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#c8151d]">{peso(value)}</span>
                    {lines.length > 1 && <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="text-[#dc2626]" {...ICON} /></Button>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" {...ICON} />
                    <input className={cn(inputClass, 'pl-8 w-full')} placeholder="Search product" value={l.q} onChange={(e) => update(l.key, { q: e.target.value })} />
                  </div>
                  <select className={cn(selectClass, 'w-full min-w-0')} value={l.productId} onChange={(e) => pickProduct(l.key, e.target.value)}>
                    <option value="">Choose product…</option>
                    {options.map((x) => <option key={x.id} value={x.id}>{x.name}{x.soldByWeight ? ' (per kg)' : ` (${x.size})`} — {x.sku}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Field label={weighted ? 'Weight (kg)' : 'Quantity'}>
                    <input type="number" min={0} step={weighted ? 0.01 : 1} inputMode="decimal" className={cn(inputClass, 'w-full')} value={l.amount} onChange={(e) => update(l.key, { amount: e.target.value })} placeholder={weighted ? '0.00' : '0'} />
                  </Field>
                  <Field label={weighted ? 'Cost per kg (₱)' : 'Cost per unit (₱)'}>
                    <input type="number" min={0} step={0.01} inputMode="decimal" className={cn(inputClass, 'w-full')} value={l.cost} onChange={(e) => update(l.key, { cost: e.target.value })} />
                  </Field>
                  <Field label="Batch / lot no." className="col-span-2 sm:col-span-1">
                    <input className={cn(inputClass, 'w-full')} value={l.batch} onChange={(e) => update(l.key, { batch: e.target.value })} placeholder="e.g. SPD-1118A" />
                  </Field>
                  <Field label="Produced / slaughter">
                    <input type="date" className={cn(inputClass, 'w-full min-w-0')} value={l.producedOn} onChange={(e) => update(l.key, { producedOn: e.target.value })} />
                  </Field>
                  <Field label="Expiry date">
                    <input type="date" className={cn(inputClass, 'w-full min-w-0')} value={l.expiresOn} onChange={(e) => update(l.key, { expiresOn: e.target.value })} />
                  </Field>
                </div>
                {weighted && Number(l.amount) > 0 && <p className="text-[11px] text-gray-400">Stock ledger counts weighed items in whole kg: +{Math.max(1, Math.round(Number(l.amount)))}.</p>}
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus {...ICON} /> Add line</Button>
        </div>

        <Field label="Notes (optional)"><input className={cn(inputClass, 'w-full')} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition on arrival, temperature, etc." /></Field>

        <div className={cn('rounded-lg p-3 flex flex-wrap items-center justify-between gap-2', needsApproval ? 'bg-amber-50 border border-amber-200' : 'bg-red-50/60 border border-red-100')}>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Total value</p>
            <p className="text-2xl font-bold text-[#c8151d]">{peso(total)}</p>
          </div>
          <p className={cn('text-xs max-w-sm', needsApproval ? 'text-amber-900 font-medium' : 'text-gray-500')}>
            {needsApproval ? `Above ${pesoShort(threshold)}: saved as Pending approval. Stock is added after a manager approves.` : `Up to ${pesoShort(threshold)}: stock is added right away.`}
          </p>
        </div>

        <DialogFooter className="justify-end flex-wrap">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={post}>{needsApproval ? 'Submit for approval' : 'Post to stock'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceivingDetail({ s, r, canApprove, onApprove, onClose }: { s: AppState; r: Receiving; canApprove: boolean; onApprove: () => void; onClose: () => void }) {
  const total = receivingValue(s, r);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{r.number}</span><RcvStatus status={r.status} /></DialogTitle>
          <DialogDescription>{branchName(s, r.branchId)} · received {fmtDateTime(r.at)} by {r.by}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Supplier</dt><dd className="font-medium">{r.supplierName}</dd></div>
          <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Delivery receipt no.</dt><dd className="font-medium">{r.receiptNo}</dd></div>
          <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Receipt photo</dt><dd className="font-medium">{r.hasPhoto ? '📷 Attached' : 'Not attached'}</dd></div>
        </dl>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead><TableHead className="text-right">Qty / weight</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Value</TableHead>
              <TableHead>Batch</TableHead><TableHead>Produced</TableHead><TableHead>Expiry</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.lines.map((l, i) => {
              const p = s.products.find((x) => x.id === l.productId);
              return (
                <TableRow key={i}>
                  <TableCell className="min-w-40"><ProductImage image={p?.image} /> {p?.name ?? l.productId}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{rcvQtyText(p, l)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{peso(l.cost)}{p?.soldByWeight ? '/kg' : ''}</TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap">{peso(rcvLineValue(p, l))}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{l.batch}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{l.producedOn ?? '—'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{l.expiresOn ?? '—'}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-gray-50 font-semibold">
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right text-[#c8151d] whitespace-nowrap">{peso(total)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableBody>
        </Table>
        {r.note && <p className="text-sm text-gray-600"><b>Notes:</b> {r.note}</p>}
        {r.status === 'pending_approval' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Stock is not added yet. {canApprove ? 'Check the delivery, then approve to add it to stock.' : 'A user with Inventory approval rights must approve this delivery.'}
          </p>
        )}
        <DialogFooter className="justify-end flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {r.status === 'pending_approval' && canApprove && <Button onClick={onApprove}><CheckCircle2 {...ICON} /> Approve &amp; add to stock</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
