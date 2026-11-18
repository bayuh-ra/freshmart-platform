'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, CalendarX, Camera, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Clock, Download, EyeOff, Minus, Funnel, HandHelping, ImageIcon, Info, Layers, Leaf, List, Package, PackageCheck,
  Pencil, Plus, ReceiptText, ScanBarcode, Search, ShieldAlert, SlidersHorizontal, Smartphone, Store, Trash2, Truck, Undo2, X,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/src/components/ui/shadcn/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { addAudit, addNotification, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import { branchName, can, exportCsv, fmtDateTime, fmtTime, getSetting, num, onHand, peso, pesoShort, stockSummary } from '@/src/lib/logic';
import type { AppState, Category, MovementType, Product, Receiving, StockCount, Transfer } from '@/src/lib/types';
import {
  Field, MOVEMENT_LABEL, inCategory, stockState, topCategories,
} from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';
import { CardHeading, CatalogCard, ICON, OSWALD, OutlineButton, RedButton, stripes, urlParam } from '../catalog/_ui';

const CRUMBS = [{ label: 'Operations' }, { label: 'Inventory' }];

type TabKey = 'stock' | 'receiving' | 'movements' | 'stock-take' | 'transfers';
const TABS: { key: TabKey; label: string; icon: typeof Layers; title: string; eyebrow: string }[] = [
  { key: 'stock', label: 'Stock levels', icon: Layers, title: 'Inventory', eyebrow: 'Counted from recorded movements' },
  { key: 'receiving', label: 'Receiving', icon: Truck, title: 'Receiving', eyebrow: 'Supplier deliveries straight into stock' },
  { key: 'movements', label: 'Movements', icon: List, title: 'Movements', eyebrow: 'Every stock change, newest first' },
  { key: 'stock-take', label: 'Stock take', icon: ClipboardList, title: 'Stock take', eyebrow: 'Physical count' },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight, title: 'Transfers', eyebrow: 'Stock between branches' },
];

const noopSubscribe = () => () => {};

export default function InventoryPage() {
  const s = useStore();
  // ?tab= is read only after hydration so the server-rendered breadcrumb matches the first client render.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<TabKey | null>(null);
  const tab: TabKey = picked ?? (hydrated ? (TABS.find((x) => x.key === urlParam('tab'))?.key ?? 'stock') : 'stock');

  /** Switch tab and keep ?tab= in the address bar (no navigation). */
  const setTab = (t: TabKey) => {
    setPicked(t);
    const url = new URL(window.location.href);
    if (t === 'stock') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };
  const crumbs = tab === 'stock' ? CRUMBS : [...CRUMBS, { label: TABS.find((t) => t.key === tab)!.label }];

  return (
    <DashboardLayout title="Inventory" crumbs={crumbs}>
      {can(s, 'inventory.view') ? <InventoryInner s={s} tab={tab} setTab={setTab} /> : <AccessDenied permission="inventory.view" />}
    </DashboardLayout>
  );
}

type StockState = 'ok' | 'low' | 'out';
type Level = { p: Product; top?: Category; onHand: number; reserved: number; buffer: number; available: number; state: StockState; value: number };

function useLevels(s: AppState, branchId: string): Level[] {
  return useMemo(
    () =>
      s.products
        .filter((p) => p.status !== 'discontinued')
        .map((p) => {
          const st = stockSummary(s, p.id, branchId);
          return {
            p, top: s.categories.find((c) => c.id === p.categoryId), ...st,
            state: stockState(st.available, st.onHand, p.reorderPoint), value: Math.max(0, st.onHand) * p.costPrice,
          };
        }),
    [s, branchId],
  );
}

// ---------------- Stock list filters (kept in the page so the header Export sees them) ----------------
type Seg = 'all' | StockState;
interface View { q: string; seg: Seg; cat: string; reservedOnly: boolean; page: number; size: number }
const PAGE_SIZES = [10, 25, 50, 100];
const SEGS: { key: Seg; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'ok', label: 'In stock' }, { key: 'low', label: 'Low' }, { key: 'out', label: 'Out' }];

/** Apply the list filters. `skip` leaves one filter out so the segment / pill counts stay live. */
function filterLevels(levels: Level[], v: View, skip?: 'seg' | 'cat') {
  const t = v.q.trim().toLowerCase();
  return levels.filter((l) => {
    if (t && !`${l.p.name} ${l.p.sku} ${l.p.brand}`.toLowerCase().includes(t)) return false;
    if (v.reservedOnly && l.reserved <= 0) return false;
    if (skip !== 'seg' && v.seg !== 'all' && l.state !== v.seg) return false;
    if (skip !== 'cat' && v.cat !== 'all' && l.p.categoryId !== v.cat) return false;
    return true;
  });
}

const unitOf = (p: Product) => (p.soldByWeight ? 'kg' : p.unit === 'pack' ? 'packs' : 'pcs');
const qty = (n: number) => `${Number(n.toFixed(2))}`;
const STATUS: Record<StockState, { label: string; cls: string; dot: string; bar: string }> = {
  ok: { label: 'In stock', cls: 'bg-[#e8f4eb] text-[#2e6b3a]', dot: '#2e9a4a', bar: '#2e6b3a' },
  low: { label: 'Low', cls: 'bg-[#fdf1e3] text-[#b45a12]', dot: '#d9822b', bar: '#d9822b' },
  out: { label: 'Out', cls: 'bg-[#fdecec] text-[#c8151d]', dot: '#c8151d', bar: '#c8151d' },
};

function exportLevels(rows: Level[], filename: string) {
  if (!rows.length) return toast.info('Nothing to export');
  exportCsv(filename, [
    ['SKU', 'Product', 'Category', 'Unit', 'On hand', 'Reserved', 'Safety buffer', 'Available', 'Reorder point', 'Status', 'Cost price', 'Value at cost'],
    ...rows.map((l) => [l.p.sku, l.p.name, l.top?.name ?? '', unitOf(l.p), l.onHand, l.reserved, l.buffer, l.available, l.p.reorderPoint, STATUS[l.state].label, l.p.costPrice, l.value.toFixed(2)]),
  ]);
  toast.success(`Exported ${rows.length} product${rows.length === 1 ? '' : 's'}`);
}

function InventoryInner({ s, tab, setTab }: { s: AppState; tab: TabKey; setTab: (t: TabKey) => void }) {
  const branchId = s.session.branchId;
  const branch = branchName(s, branchId);
  const canEdit = can(s, 'inventory.edit') || can(s, 'inventory.create');
  const canApprove = can(s, 'inventory.approve');
  const levels = useLevels(s, branchId);
  const [view, setView] = useState<View>({ q: '', seg: 'all', cat: 'all', reservedOnly: false, page: 1, size: 10 });
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordPid, setRecordPid] = useState<string | undefined>();
  const [cardPid, setCardPid] = useState<string | null>(null);
  // Receiving: list filters, the receive dialog (optionally prefilled with a product), the detail drawer and the reject dialog.
  const [rcvView, setRcvView] = useState<RcvView>({ q: '', supplier: 'all', status: 'all', page: 1, size: 10 });
  const [rcvDialog, setRcvDialog] = useState<{ pid?: string } | null>(null);
  const [rcvDetailId, setRcvDetailId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  // Movements: list filters (kept here so the header Export CSV sees them).
  const [mvView, setMvView] = useState<MvView>({ q: '', range: '7d', type: 'all', group: true, page: 1, size: 25 });
  // Stock take: blind count hides the system quantity so counters aren't biased.
  const [blind, setBlind] = useState(false);
  // Transfers: only possible once the account has a second branch.
  const [trNew, setTrNew] = useState(false);
  const multiBranch = s.branches.some((b) => b.id !== branchId);

  /** Changing a filter starts again at page 1. */
  const patchView = (p: Partial<View>) => setView((v) => ({ ...v, page: 1, ...p }));
  const patchRcvView = (p: Partial<RcvView>) => setRcvView((v) => ({ ...v, page: 1, ...p }));
  const patchMvView = (p: Partial<MvView>) => setMvView((v) => ({ ...v, page: 1, ...p }));
  const mvRows = useMemo(() => filterMovements(s, branchId, mvView), [s, branchId, mvView]);
  /** Stock card → Stock levels tab, searched to that SKU. */
  const openInLevels = (p: Product) => { setCardPid(null); setView((v) => ({ ...v, q: p.sku, seg: 'all', cat: 'all', reservedOnly: false, page: 1 })); setTab('stock'); };

  const rows = useMemo(() => filterLevels(levels, view), [levels, view]);
  const rcvList = useMemo(
    () => (s.receivings ?? []).filter((r) => r.branchId === branchId).sort((a, b) => b.number.localeCompare(a.number, undefined, { numeric: true })),
    [s.receivings, branchId],
  );
  const rcvRows = useMemo(() => filterReceivings(s, rcvList, rcvView), [s, rcvList, rcvView]);
  const pendingRcv = rcvList.filter((r) => r.status === 'awaiting').length;
  const rcvDetail = rcvList.find((r) => r.id === rcvDetailId);
  const rejecting = rcvList.find((r) => r.id === rejectId);
  const openRecord = (pid?: string) => { setRecordPid(pid); setRecordOpen(true); };
  const openReceive = (pid: string) => { setRcvDialog({ pid }); setTab('receiving'); };
  const approve = (r: Receiving) => (canApprove ? approveReceiving(r) : toast.error('You need the inventory.approve permission'));
  const head = TABS.find((t) => t.key === tab)!;

  return (
    <div className="min-w-0">
      {/* Header: title, eyebrow and buttons follow the active tab */}
      <div className="mb-5 md:mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{branch} · {head.eyebrow}</p>
            <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>{head.title}</h1>
          </div>
          {tab === 'stock' && (
            <div className="flex flex-wrap items-center gap-2">
              <OutlineButton onClick={() => exportLevels(rows, `stock-levels-${branchId}.csv`)}><Download className="w-4 h-4" {...ICON} />Export</OutlineButton>
              {canEdit && <RedButton onClick={() => openRecord()}><Plus className="w-4 h-4" />Record movement</RedButton>}
            </div>
          )}
          {tab === 'receiving' && (
            <div className="flex flex-wrap items-center gap-2">
              <OutlineButton onClick={() => exportReceivings(s, rcvRows, `deliveries-${branchId}.csv`)}><Download className="w-4 h-4" {...ICON} />Export</OutlineButton>
              {canEdit && <RedButton onClick={() => setRcvDialog({})}><Truck className="w-4 h-4" {...ICON} />Receive delivery</RedButton>}
            </div>
          )}
          {tab === 'movements' && (
            <div className="flex flex-wrap items-center gap-2">
              <OutlineButton onClick={() => exportMovements(s, mvRows, `stock-movements-${branchId}.csv`)}><Download className="w-4 h-4" {...ICON} />Export CSV</OutlineButton>
            </div>
          )}
          {tab === 'stock-take' && (
            <div className="flex flex-wrap items-center gap-2">
              <OutlineButton aria-pressed={blind} onClick={() => setBlind((b) => !b)} title="Hide the system quantity while counting"
                className={cn(blind && 'border-[#2a2322] bg-[#2a2322] text-white hover:bg-[#3a3130]')}>
                <EyeOff className="w-4 h-4" {...ICON} />Blind count
              </OutlineButton>
            </div>
          )}
          {tab === 'transfers' && canEdit && multiBranch && (
            <div className="flex flex-wrap items-center gap-2">
              <RedButton onClick={() => setTrNew(true)}><Plus className="w-4 h-4" />New transfer</RedButton>
            </div>
          )}
        </div>
        <nav aria-label="Inventory sections" className="mt-5 border-b border-[#e8ddd4] overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <div role="tablist" className="flex gap-1 min-w-max">
            {TABS.map((t) => {
              const active = t.key === tab;
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => setTab(t.key)}
                  className={cn('relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 text-sm whitespace-nowrap transition-colors',
                    active ? 'font-semibold text-[#c8151d]' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
                  <Icon className="w-4 h-4" {...ICON} />{t.label}
                  {t.key === 'receiving' && pendingRcv > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#ae754d] text-white text-[11px] font-semibold inline-flex items-center justify-center" aria-label={`${pendingRcv} waiting for approval`}>{pendingRcv}</span>
                  )}
                  {active && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[#c8151d]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {tab === 'stock' && (
        <StockLevels s={s} branch={branch} levels={levels} rows={rows} view={view} setView={setView} patchView={patchView}
          onCard={setCardPid} onRecord={canEdit ? openRecord : undefined} onReceive={canEdit ? openReceive : undefined} />
      )}
      {tab === 'receiving' && (
        <ReceivingTab s={s} list={rcvList} rows={rcvRows} view={rcvView} setView={setRcvView} patchView={patchRcvView} canApprove={canApprove}
          threshold={num(getSetting(s, 'receivingApprovalAbove', branchId)) || 20000} onOpen={setRcvDetailId} onApprove={approve} onReject={(r) => setRejectId(r.id)} />
      )}
      {tab === 'movements' && <Ledger s={s} branchId={branchId} rows={mvRows} view={mvView} setView={setMvView} patchView={patchMvView} onCard={setCardPid} />}
      {tab === 'stock-take' && <StockTake s={s} branchId={branchId} canEdit={canEdit} blind={blind} />}
      {tab === 'transfers' && <Transfers s={s} branchId={branchId} canEdit={canEdit} />}
      {trNew && canEdit && multiBranch && <NewTransferDialog s={s} branchId={branchId} onClose={() => setTrNew(false)} />}

      {recordOpen && <RecordDialog s={s} branchId={branchId} initialPid={recordPid} onClose={() => setRecordOpen(false)} />}
      {cardPid && <StockCard s={s} branchId={branchId} productId={cardPid} onClose={() => setCardPid(null)} onOpenLevels={openInLevels} />}
      {rcvDialog && canEdit && (
        <ReceiveDialog s={s} branchId={branchId} threshold={num(getSetting(s, 'receivingApprovalAbove', branchId)) || 20000} initialPid={rcvDialog.pid}
          onClose={() => setRcvDialog(null)} onPosted={(id) => setRcvDetailId(id)} />
      )}
      {rcvDetail && (
        <ReceivingSheet s={s} r={rcvDetail} canApprove={canApprove} onClose={() => setRcvDetailId(null)} onApprove={() => approve(rcvDetail)} onReject={() => setRejectId(rcvDetail.id)} />
      )}
      {rejecting && <RejectDialog s={s} r={rejecting} onClose={() => setRejectId(null)} />}
    </div>
  );
}

// ---------------- (a) Stock levels ----------------
interface StockLevelsProps {
  s: AppState; branch: string; levels: Level[]; rows: Level[]; view: View;
  setView: (fn: (v: View) => View) => void; patchView: (p: Partial<View>) => void;
  onCard: (id: string) => void; onRecord?: (id: string) => void; onReceive?: (id: string) => void;
}

function StockLevels({ s, branch, levels, rows, view, setView, patchView, onCard, onRecord, onReceive }: StockLevelsProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const buffer = num(getSetting(s, 'safetyBuffer', s.session.branchId));
  const tops = useMemo(() => topCategories(s), [s]);

  // Stat cards
  const low = levels.filter((l) => l.state === 'low').length;
  const out = levels.filter((l) => l.state === 'out').length;
  const reservedUnits = levels.reduce((n, l) => n + l.reserved, 0);
  const value = levels.reduce((n, l) => n + l.value, 0);
  const skusOnHand = levels.filter((l) => l.onHand > 0).length;

  // Live counts: the segment counts ignore the segment, the pill counts ignore the category.
  const segBase = filterLevels(levels, view, 'seg');
  const segCount = (k: Seg) => (k === 'all' ? segBase.length : segBase.filter((l) => l.state === k).length);
  const catBase = filterLevels(levels, view, 'cat');
  const pills = [
    { id: 'all', name: 'All', color: '#2a2322', n: catBase.length },
    ...tops.map((c) => ({ id: c.id, name: c.name, color: c.color ?? '#8a7f7a', n: catBase.filter((l) => l.p.categoryId === c.id).length })),
  ];

  // Pagination
  const pages = Math.max(1, Math.ceil(rows.length / view.size));
  const page = Math.min(view.page, pages);
  const start = (page - 1) * view.size;
  const shown = rows.slice(start, start + view.size);
  const shownIds = shown.map((l) => l.p.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.includes(id));
  const someShownSelected = shownIds.some((id) => selected.includes(id));
  const toggleSel = (id: string, on: boolean) => setSelected((xs) => (on ? [...xs.filter((x) => x !== id), id] : xs.filter((x) => x !== id)));
  const goPage = (n: number) => setView((v) => ({ ...v, page: Math.max(1, Math.min(pages, n)) }));

  const filtered = view.q || view.seg !== 'all' || view.cat !== 'all' || view.reservedOnly;
  const rowProps = { selected, toggleSel, onCard, onRecord, onReceive };

  return (
    <>
      {/* Stat cards: tap to filter, tap again to clear */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
        <div className="rounded-2xl bg-[#2a2322] px-4 sm:px-5 py-4 min-w-0 text-white">
          <p className="text-[11px] sm:text-xs uppercase tracking-[0.14em] text-[#d9c7b9]" style={OSWALD}>Stock value at cost</p>
          <p className="mt-1.5 text-2xl sm:text-4xl leading-none font-semibold text-[#ff4b4f] tabular-nums break-words" style={OSWALD}>{pesoShort(value)}</p>
          <p className="mt-2 text-xs text-[#cfc3bb]">{skusOnHand} SKUs on hand at {branch}</p>
        </div>
        <StatButton active={view.seg === 'low'} onClick={() => patchView({ seg: view.seg === 'low' ? 'all' : 'low' })} color="#ae754d" title="Low stock" value={low} sub="Available at or below reorder point" />
        <StatButton active={view.seg === 'out'} onClick={() => patchView({ seg: view.seg === 'out' ? 'all' : 'out' })} color="#c8151d" title="Out of stock" value={out} sub="Hidden from ordering until restocked" />
        <StatButton active={view.reservedOnly} onClick={() => patchView({ reservedOnly: !view.reservedOnly })} color="#2f4a9e" title="Reserved" value={qty(reservedUnits)} sub="Units held for open orders" />
      </div>

      <CatalogCard className="overflow-hidden">
        <div className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0 basis-full md:basis-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
              <input value={view.q} onChange={(e) => patchView({ q: e.target.value })} placeholder="Search product or SKU" aria-label="Search product or SKU"
                className="w-full h-11 rounded-xl border border-[#e3d6cc] bg-white pl-9 pr-9 text-sm outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
              {view.q && <button type="button" onClick={() => patchView({ q: '' })} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex w-full md:w-auto rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Filter by stock status">
              {SEGS.map((o) => (
                <button key={o.key} type="button" aria-pressed={view.seg === o.key} onClick={() => patchView({ seg: o.key })}
                  className={cn('flex-1 md:flex-none h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap', view.seg === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>
                  {o.label} <span className="text-gray-400 font-normal tabular-nums">{segCount(o.key)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="-mx-3 sm:mx-0 px-3 sm:px-0 flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none]">
            {pills.map((c) => {
              const on = view.cat === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => patchView({ cat: c.id })}
                  className={cn('shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm whitespace-nowrap transition-colors',
                    on ? 'border-[#2a2322] bg-[#2a2322] text-white font-semibold' : 'border-[#e3d6cc] bg-white text-[#1d1716] font-medium hover:border-[#d9c7b9]')}>
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: on && c.id === 'all' ? '#ffffff' : c.color }} />{c.name}
                  <span className={cn('text-xs font-normal tabular-nums', on ? 'text-white/70' : 'text-gray-400')}>{c.n}</span>
                </button>
              );
            })}
          </div>

          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" {...ICON} />
            <span>Status compares available stock with the reorder point. Available = on hand − reserved for open orders − {buffer}-unit safety buffer, and shoppers can only order what&apos;s available.</span>
          </p>

          {(view.reservedOnly || selected.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {view.reservedOnly && (
                <button type="button" onClick={() => patchView({ reservedOnly: false })} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-[#eef1fa] text-xs font-medium text-[#2f4a9e]">
                  Reserved for open orders<X className="w-3.5 h-3.5" />
                </button>
              )}
              {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <span className="text-sm font-semibold text-[#1d1716]">{selected.length} selected</span>
                  <button type="button" onClick={() => exportLevels(levels.filter((l) => selected.includes(l.p.id)), `stock-levels-selected.csv`)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#e3d6cc] bg-white text-sm font-medium hover:bg-[#faf6f2]">
                    <Download className="w-4 h-4" {...ICON} />Export selected
                  </button>
                  <button type="button" onClick={() => setSelected([])} className="h-9 px-2 text-sm text-gray-500 hover:text-[#1d1716]">Clear</button>
                </div>
              )}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center border-t border-[#f0e8e2]">
            <Package className="w-9 h-9 mx-auto text-gray-300" {...ICON} />
            <p className="mt-2 font-medium text-[#1d1716]">No products match these filters</p>
            {filtered && <button type="button" onClick={() => patchView({ q: '', seg: 'all', cat: 'all', reservedOnly: false })} className="mt-1 text-sm font-semibold text-[#c8151d] hover:underline">Clear filters</button>}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden xl:table w-full text-sm">
              <thead>
                <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="w-12 py-3 pl-4 text-left">
                    <Checkbox checked={allShownSelected ? true : someShownSelected ? 'indeterminate' : false} aria-label="Select this page"
                      onCheckedChange={(v) => setSelected((xs) => (v === true ? Array.from(new Set([...xs, ...shownIds])) : xs.filter((x) => !shownIds.includes(x))))} />
                  </th>
                  <th className="text-left font-semibold py-3">Product</th>
                  <th className="text-right font-semibold py-3 w-[88px]">On hand</th>
                  <th className="text-right font-semibold py-3 w-[92px]">Reserved</th>
                  <th className="text-left font-semibold py-3 pl-4 w-[170px]">Available</th>
                  <th className="text-right font-semibold py-3 w-[96px]">Reorder at</th>
                  <th className="text-left font-semibold py-3 pl-4 w-[104px]">Status</th>
                  <th className="text-right font-semibold py-3 w-[118px]">Value at cost</th>
                  <th className="w-[128px] pr-4"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => <LevelRow key={l.p.id} l={l} {...rowProps} />)}
              </tbody>
            </table>

            {/* Phone / tablet cards */}
            <ul className="xl:hidden">
              {shown.map((l) => <LevelCard key={l.p.id} l={l} {...rowProps} />)}
            </ul>

            <ListFooter start={start} count={shown.length} total={rows.length} noun={['product', 'products']} size={view.size}
              onSize={(n) => patchView({ size: n })} page={page} pages={pages} onPage={goPage} />
          </>
        )}
      </CatalogCard>
    </>
  );
}

function StatButton({ active, onClick, color, title, value, sub }: { active: boolean; onClick: () => void; color: string; title: string; value: number | string; sub: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn('rounded-2xl border px-4 sm:px-5 py-4 text-left min-w-0 transition-colors',
        active ? 'border-[#c8151d] bg-[#fdf0ef] ring-1 ring-[#c8151d]' : 'border-[#eadfd6] bg-[#fffdfb] hover:border-[#d9c7b9]')}>
      <span className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#1d1716]"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />{title}</span>
      <span className="block mt-1.5 text-3xl sm:text-4xl leading-none font-semibold tabular-nums" style={{ ...OSWALD, color }}>{value}</span>
      <span className="block mt-2 text-xs text-gray-500 leading-snug">{sub}</span>
    </button>
  );
}

/** "Showing 1–10 of 124 …", rows per page and the pager. */
function ListFooter({ start, count, total, noun, size, onSize, page, pages, onPage }: {
  start: number; count: number; total: number; noun: [string, string]; size: number; onSize: (n: number) => void; page: number; pages: number; onPage: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 sm:px-5 py-3 border-t border-[#f0e8e2]">
      <span className="text-sm text-gray-500">Showing {start + 1}–{start + count} of {total} {total === 1 ? noun[0] : noun[1]}</span>
      <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Rows per page</span>
          <div className="inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Rows per page">
            {PAGE_SIZES.map((n) => (
              <button key={n} type="button" aria-pressed={size === n} onClick={() => onSize(n)}
                className={cn('h-8 min-w-9 px-2 rounded-lg text-xs tabular-nums', size === n ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{n}</button>
            ))}
          </div>
        </div>
        <Pager page={page} pages={pages} onPage={onPage} />
      </div>
    </div>
  );
}

/** Numbered pages with "…"; phones get a compact "page / pages". */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const list: (number | '…')[] = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1)
    : page <= 4 ? [1, 2, 3, 4, 5, '…', pages]
      : page >= pages - 3 ? [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages]
        : [1, '…', page - 1, page, page + 1, '…', pages];
  const btn = 'h-10 min-w-10 px-2 inline-flex items-center justify-center rounded-xl text-sm tabular-nums';
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={cn(btn, 'border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40')}><ChevronLeft className="w-4 h-4" {...ICON} /></button>
      <span className="sm:hidden px-2 text-sm text-gray-600 tabular-nums">{page} / {pages}</span>
      {list.map((n, i) => (n === '…'
        ? <span key={`gap-${i}`} className="hidden sm:inline-flex w-8 justify-center text-gray-400">…</span>
        : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
            className={cn(btn, 'hidden sm:inline-flex', n === page ? 'bg-[#2a2322] text-white font-semibold' : 'text-[#1d1716] hover:bg-[#f3ece6]')}>{n}</button>))}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className={cn(btn, 'border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40')}><ChevronRight className="w-4 h-4" {...ICON} /></button>
    </nav>
  );
}

// ---------------- Stock list rows ----------------
interface LevelRowProps {
  l: Level; selected: string[]; toggleSel: (id: string, on: boolean) => void;
  onCard: (id: string) => void; onRecord?: (id: string) => void; onReceive?: (id: string) => void;
}

function Thumb({ l }: { l: Level }) {
  return (
    <span className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-[#f0e4da] text-xl" style={stripes(l.top?.color ?? '#b9aaa0')}>
      <ProductImage image={l.p.image} fill alt="" />
    </span>
  );
}

function NameCell({ l, onCard }: { l: Level; onCard: (id: string) => void }) {
  return (
    <div className="min-w-0">
      <button type="button" onClick={() => onCard(l.p.id)} title="Open stock card" className="block max-w-full truncate text-left font-semibold text-[#1d1716] hover:text-[#c8151d] hover:underline underline-offset-2">{l.p.name}</button>
      <p className="text-xs text-gray-500 truncate">{l.p.sku} · {l.top?.name ?? 'Uncategorised'}</p>
    </div>
  );
}

function StatusPill({ state }: { state: StockState }) {
  const st = STATUS[state];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap', st.cls)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
    </span>
  );
}

function AvailableCell({ l }: { l: Level }) {
  const pct = l.state === 'out' ? 0 : Math.max(4, Math.min(100, (l.available / Math.max(10, l.p.reorderPoint * 4)) * 100));
  const tone = STATUS[l.state].bar;
  return (
    <div className="w-full max-w-[132px]">
      <p className="whitespace-nowrap leading-tight">
        <span className="font-bold tabular-nums" style={{ color: l.state === 'ok' ? '#1d1716' : tone }}>{qty(l.available)}</span>{' '}
        <span className="text-[11px] text-gray-400">{unitOf(l.p)}</span>
      </p>
      <div className="mt-1 h-1 rounded-full bg-[#efe7e0]"><div className="h-1 rounded-full" style={{ width: `${pct}%`, background: tone }} /></div>
    </div>
  );
}

function RowAction({ l, onRecord, onReceive, compact }: Pick<LevelRowProps, 'l' | 'onRecord' | 'onReceive'> & { compact?: boolean }) {
  const size = compact ? 'h-9 px-3' : 'h-10 px-3.5';
  if (l.state !== 'ok' && onReceive) {
    return (
      <button type="button" onClick={() => onReceive(l.p.id)} aria-label={`Receive ${l.p.name}`}
        className={cn('inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#2a2322] text-sm font-semibold text-white hover:bg-[#1d1716] whitespace-nowrap', size)}>
        <Truck className="w-4 h-4" {...ICON} />Receive
      </button>
    );
  }
  if (!onRecord) return null;
  return (
    <button type="button" onClick={() => onRecord(l.p.id)} aria-label={`Record movement for ${l.p.name}`}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] whitespace-nowrap', size)}>
      <Pencil className="w-3.5 h-3.5" {...ICON} />Record
    </button>
  );
}

function LevelRow({ l, selected, toggleSel, onCard, onRecord, onReceive }: LevelRowProps) {
  const sel = selected.includes(l.p.id);
  const u = unitOf(l.p);
  return (
    <tr className={cn('border-t border-[#f0e8e2] align-middle', sel ? 'bg-[#fdf6f4]' : 'hover:bg-[#fbf7f3]')}>
      <td className="py-3 pl-4"><Checkbox checked={sel} onCheckedChange={(v) => toggleSel(l.p.id, v === true)} aria-label={`Select ${l.p.name}`} /></td>
      <td className="py-3 pr-3"><div className="flex items-center gap-3 min-w-0"><Thumb l={l} /><NameCell l={l} onCard={onCard} /></div></td>
      <td className="py-3 text-right font-semibold text-[#1d1716] tabular-nums whitespace-nowrap">{qty(l.onHand)} {u}</td>
      <td className="py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">{l.reserved > 0 ? `${qty(l.reserved)} ${u}` : <span className="text-gray-300">—</span>}</td>
      <td className="py-3 pl-4"><AvailableCell l={l} /></td>
      <td className="py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">{l.p.reorderPoint} {u}</td>
      <td className="py-3 pl-4"><StatusPill state={l.state} /></td>
      <td className="py-3 text-right font-semibold text-[#1d1716] tabular-nums whitespace-nowrap">{pesoShort(l.value)}</td>
      <td className="py-3 pr-4 text-right"><RowAction l={l} onRecord={onRecord} onReceive={onReceive} /></td>
    </tr>
  );
}

function LevelCard({ l, selected, toggleSel, onCard, onRecord, onReceive }: LevelRowProps) {
  const sel = selected.includes(l.p.id);
  const u = unitOf(l.p);
  return (
    <li className={cn('border-t border-[#f0e8e2] px-3 sm:px-4 py-3 flex gap-3', sel && 'bg-[#fdf6f4]')}>
      <div className="pt-3"><Checkbox checked={sel} onCheckedChange={(v) => toggleSel(l.p.id, v === true)} aria-label={`Select ${l.p.name}`} /></div>
      <Thumb l={l} />
      <div className="flex-1 min-w-0">
        <NameCell l={l} onCard={onCard} />
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
          <span>On hand <b className="text-[#1d1716] tabular-nums">{qty(l.onHand)} {u}</b></span>
          <span>Available <b className="tabular-nums" style={{ color: l.state === 'ok' ? '#1d1716' : STATUS[l.state].bar }}>{qty(l.available)} {u}</b></span>
          {l.reserved > 0 && <span className="hidden sm:inline">Reserved <b className="text-[#1d1716] tabular-nums">{qty(l.reserved)} {u}</b></span>}
          <span className="hidden sm:inline">Value <b className="text-[#1d1716] tabular-nums">{pesoShort(l.value)}</b></span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-2 shrink-0">
        <StatusPill state={l.state} />
        <RowAction l={l} onRecord={onRecord} onReceive={onReceive} compact />
      </div>
    </li>
  );
}

// ---------------- (b) Movements ledger ----------------
type Range = 'today' | '7d' | '30d';
type MvType = 'all' | 'nosales' | MovementType;
interface MvView { q: string; range: Range; type: MvType; group: boolean; page: number; size: number }
type Mv = AppState['movements'][number];
/** One list row: a single movement, or (Group orders on) every line of one online order. */
type Entry = { kind: 'one'; key: string; at: string; m: Mv } | { kind: 'order'; key: string; at: string; ref: string; lines: Mv[] };

const RANGES: { key: Range; label: string; sub: string }[] = [
  { key: 'today', label: 'Today', sub: 'today' }, { key: '7d', label: '7 days', sub: 'last 7 days' }, { key: '30d', label: '30 days', sub: 'last 30 days' },
];
const SALE_TYPES: MovementType[] = ['online_sale', 'walkin_sale'];
const MV_TYPES: MovementType[] = ['receiving', 'online_sale', 'walkin_sale', 'return', 'wastage', 'expiry', 'adjustment', 'count_correction', 'transfer_in', 'transfer_out'];
const MV_STYLE: Record<MovementType, { icon: typeof Layers; cls: string }> = {
  receiving: { icon: Truck, cls: 'bg-[#e6f2ea] text-[#1f6b3f]' },
  online_sale: { icon: Smartphone, cls: 'bg-[#f1ece8] text-[#3d3230]' },
  walkin_sale: { icon: Store, cls: 'bg-[#e9effb] text-[#2f4a9e]' },
  return: { icon: Undo2, cls: 'bg-[#ecf0f4] text-[#46576e]' },
  wastage: { icon: Trash2, cls: 'bg-[#fdecec] text-[#c8151d]' },
  expiry: { icon: CalendarX, cls: 'bg-[#fdecec] text-[#a3121a]' },
  adjustment: { icon: SlidersHorizontal, cls: 'bg-[#f1ece8] text-[#5b4f4b]' },
  count_correction: { icon: ClipboardCheck, cls: 'bg-[#fdf3e1] text-[#a15c07]' },
  transfer_in: { icon: ArrowDownLeft, cls: 'bg-[#e6f2ea] text-[#1f6b3f]' },
  transfer_out: { icon: ArrowUpRight, cls: 'bg-[#f1ece8] text-[#5b4f4b]' },
};

/** Start of the range in local time: today, or the last 7 / 30 calendar days including today. */
function rangeStart(r: Range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === '7d') d.setDate(d.getDate() - 6);
  if (r === '30d') d.setDate(d.getDate() - 29);
  return d.getTime();
}
const typeMatch = (t: MovementType, f: MvType) => f === 'all' || (f === 'nosales' ? !SALE_TYPES.includes(t) : t === f);
/** Singular stock unit: "kg", "pack" or "pc". */
const unit1 = (p?: Product) => (!p ? '' : p.soldByWeight ? 'kg' : p.unit === 'pack' ? 'pack' : 'pc');
/** "+25 kg" / "−0.5 kg". */
const signed = (n: number, p?: Product) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${qty(Math.abs(n))} ${unit1(p)}`.trim();
const qtyTone = (n: number) => (n > 0 ? 'text-[#1f6b3f]' : n < 0 ? 'text-[#c8151d]' : 'text-[#1d1716]');
/** "12m ago", "3h ago", "2d ago". */
function ago(at: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
/** "Today · Wed, Nov 18", "Yesterday · Tue, Nov 17" or "Mon, Nov 16". */
function dayLabel(at: string) {
  const d = new Date(at);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  const base = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toDateString() === today.toDateString() ? `Today · ${base}` : d.toDateString() === yest.toDateString() ? `Yesterday · ${base}` : base;
}
const dayKey = (at: string) => new Date(at).toDateString();

/** Branch + range + search + type, newest first. `skipType` leaves the type out so the pill counts stay live. */
function filterMovements(s: AppState, branchId: string, v: MvView, skipType?: boolean) {
  const from = rangeStart(v.range);
  const t = v.q.trim().toLowerCase();
  const byId = new Map(s.products.map((p) => [p.id, p]));
  return s.movements
    .filter((m) => {
      if (m.branchId !== branchId || new Date(m.at).getTime() < from) return false;
      if (!skipType && !typeMatch(m.type, v.type)) return false;
      if (t) {
        const p = byId.get(m.productId);
        if (!`${p?.name ?? m.productId} ${p?.sku ?? ''} ${m.ref ?? ''} ${m.reason} ${m.user} ${MOVEMENT_LABEL[m.type]}`.toLowerCase().includes(t)) return false;
      }
      return true;
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

/** Group orders: online-sale lines sharing one order number become one entry (orders with one line stay a plain row). */
function toEntries(rows: Mv[], group: boolean): Entry[] {
  if (!group) return rows.map((m) => ({ kind: 'one', key: m.id, at: m.at, m }));
  const orders = new Map<string, Mv[]>();
  for (const m of rows) {
    if (m.type !== 'online_sale' || !m.ref) continue;
    const xs = orders.get(m.ref);
    if (xs) xs.push(m); else orders.set(m.ref, [m]);
  }
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const m of rows) {
    const lines = m.type === 'online_sale' && m.ref ? orders.get(m.ref) : undefined;
    if (!lines || lines.length < 2) { out.push({ kind: 'one', key: m.id, at: m.at, m }); continue; }
    if (seen.has(m.ref!)) continue;
    seen.add(m.ref!);
    out.push({ kind: 'order', key: `order-${m.ref}`, at: m.at, ref: m.ref!, lines });
  }
  return out;
}

function exportMovements(s: AppState, rows: Mv[], filename: string) {
  if (!rows.length) return toast.info('Nothing to export');
  const byId = new Map(s.products.map((p) => [p.id, p]));
  exportCsv(filename, [
    ['Date', 'SKU', 'Product', 'Type', 'Qty', 'Unit', 'Value at cost', 'Reason', 'User', 'Reference'],
    ...rows.map((m) => {
      const p = byId.get(m.productId);
      return [fmtDateTime(m.at), p?.sku ?? '', p?.name ?? m.productId, MOVEMENT_LABEL[m.type], m.qty, unit1(p), (Math.abs(m.qty) * (p?.costPrice ?? 0)).toFixed(2), m.reason, m.user, m.ref ?? ''];
    }),
  ]);
  toast.success(`Exported ${rows.length} movement${rows.length === 1 ? '' : 's'}`);
}

function TypePill({ type }: { type: MovementType }) {
  const st = MV_STYLE[type];
  const Icon = st.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap', st.cls)}>
      <Icon className="w-3.5 h-3.5 shrink-0" {...ICON} />{MOVEMENT_LABEL[type]}
    </span>
  );
}

function ProductThumb({ p, color, className }: { p?: Product; color?: string; className?: string }) {
  return (
    <span className={cn('relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-[#f0e4da] text-lg', className)} style={stripes(color ?? '#b9aaa0')}>
      <ProductImage image={p?.image} fill alt="" />
    </span>
  );
}

function MvStat({ icon: Icon, title, value, sub, color }: { icon: typeof Layers; title: string; value: number; sub: string; color: string }) {
  return (
    <div className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] px-4 sm:px-5 py-4 min-w-0">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#1d1716]"><Icon className="w-4 h-4 text-[#5b4f4b]" {...ICON} />{title}</p>
      <p className="mt-1.5 text-3xl sm:text-4xl leading-none font-semibold tabular-nums break-words" style={{ ...OSWALD, color }}>{pesoShort(value)}</p>
      <p className="mt-2 text-xs text-gray-500 leading-snug">{sub}</p>
    </div>
  );
}

interface LedgerProps {
  s: AppState; branchId: string; rows: Mv[]; view: MvView;
  setView: (fn: (v: MvView) => MvView) => void; patchView: (p: Partial<MvView>) => void; onCard: (id: string) => void;
}

function Ledger({ s, branchId, rows, view, setView, patchView, onCard }: LedgerProps) {
  const [open, setOpen] = useState<string[]>([]);
  const byId = useMemo(() => new Map(s.products.map((p) => [p.id, p])), [s.products]);
  const colorOf = (p?: Product) => s.categories.find((c) => c.id === p?.categoryId)?.color;

  // Stat cards follow the range only (not search or type), valued at cost.
  const stats = useMemo(() => {
    const from = rangeStart(view.range);
    const t = { received: 0, sold: 0, lost: 0 };
    for (const m of s.movements) {
      if (m.branchId !== branchId || new Date(m.at).getTime() < from) continue;
      const v = Math.abs(m.qty) * (byId.get(m.productId)?.costPrice ?? 0);
      if (m.type === 'receiving' || m.type === 'return' || m.type === 'transfer_in') t.received += v;
      else if (SALE_TYPES.includes(m.type)) t.sold += v;
      else if (m.type === 'wastage' || m.type === 'expiry') t.lost += v;
    }
    return t;
  }, [s.movements, branchId, view.range, byId]);

  // Live pill counts: same range + search, any type.
  const base = useMemo(() => filterMovements(s, branchId, view, true), [s, branchId, view]);
  const pills: { key: MvType; label: string; icon: typeof Layers; n: number }[] = [
    { key: 'all', label: 'All', icon: List, n: base.length },
    { key: 'nosales', label: 'Hide sales', icon: Funnel, n: base.filter((m) => !SALE_TYPES.includes(m.type)).length },
    ...MV_TYPES.map((k) => ({ key: k, label: MOVEMENT_LABEL[k], icon: MV_STYLE[k].icon, n: base.filter((m) => m.type === k).length })),
  ];

  const entries = useMemo(() => toEntries(rows, view.group), [rows, view.group]);
  const days = useMemo(() => {
    const map = new Map<string, { n: number; inN: number; outN: number }>();
    for (const m of rows) {
      const k = dayKey(m.at);
      const d = map.get(k) ?? { n: 0, inN: 0, outN: 0 };
      d.n++;
      if (m.qty > 0) d.inN++; else if (m.qty < 0) d.outN++;
      map.set(k, d);
    }
    return map;
  }, [rows]);

  const pages = Math.max(1, Math.ceil(entries.length / view.size));
  const page = Math.min(view.page, pages);
  const start = (page - 1) * view.size;
  const shown = entries.slice(start, start + view.size);
  const goPage = (n: number) => setView((v) => ({ ...v, page: Math.max(1, Math.min(pages, n)) }));
  const toggle = (key: string) => setOpen((xs) => (xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]));
  const filtered = view.q || view.type !== 'all';
  const sub = RANGES.find((r) => r.key === view.range)!.sub;

  // Shown entries split into day sections.
  const sections: { key: string; at: string; items: Entry[] }[] = [];
  for (const e of shown) {
    const k = dayKey(e.at);
    const last = sections[sections.length - 1];
    if (last && last.key === k) last.items.push(e); else sections.push({ key: k, at: e.at, items: [e] });
  }
  const dayStat = (k: string) => {
    const d = days.get(k);
    return d ? `${d.n} movement${d.n === 1 ? '' : 's'} · ${d.inN} in · ${d.outN} out` : '';
  };
  const orderNames = (lines: Mv[]) => {
    const names = lines.map((m) => byId.get(m.productId)?.name ?? m.productId);
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  };
  const orderQty = (lines: Mv[]) => lines.map((m) => signed(m.qty, byId.get(m.productId))).join(', ');

  /** Product name + SKU; the name opens the stock card. */
  const productCell = (m: Mv) => {
    const p = byId.get(m.productId);
    return (
      <div className="flex items-center gap-3 min-w-0">
        <ProductThumb p={p} color={colorOf(p)} />
        <div className="min-w-0">
          <button type="button" onClick={() => onCard(m.productId)} title="Open stock card"
            className="block max-w-full truncate text-left font-semibold text-[#1d1716] hover:text-[#c8151d] hover:underline underline-offset-2">{p?.name ?? m.productId}</button>
          <p className="text-xs text-gray-500 truncate">{p?.sku ?? '—'}</p>
        </div>
      </div>
    );
  };
  const orderHead = (e: Extract<Entry, { kind: 'order' }>, isOpen: boolean) => (
    <button type="button" onClick={() => toggle(e.key)} aria-expanded={isOpen} className="group flex items-center gap-3 min-w-0 max-w-full text-left">
      <span className="w-10 h-10 rounded-lg border border-[#eadfd6] bg-[#f6f0eb] flex items-center justify-center shrink-0 text-[#5b4f4b]"><ReceiptText className="w-4 h-4" {...ICON} /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-[#1d1716] group-hover:text-[#c8151d]">Order {e.ref} · {e.lines.length} items</span>
          <ChevronDown className={cn('w-4 h-4 shrink-0 text-gray-500 transition-transform', isOpen && 'rotate-180')} {...ICON} />
        </span>
        <span className="block text-xs text-gray-500 truncate">{orderNames(e.lines)}</span>
      </span>
    </button>
  );
  const td = 'py-3 align-middle';

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 mb-5">
        <MvStat icon={Truck} title="Received" value={stats.received} color="#1f6b3f" sub={`At cost, ${sub} · incl. returns & transfers in`} />
        <MvStat icon={ReceiptText} title="Sold" value={stats.sold} color="#1d1716" sub={`At cost, ${sub} · online + walk-in`} />
        <MvStat icon={Trash2} title="Lost" value={stats.lost} color="#c8151d" sub={`At cost, ${sub} · wastage + expiry`} />
      </div>

      <CatalogCard className="overflow-hidden">
        <div className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0 basis-full md:basis-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
              <input value={view.q} onChange={(e) => patchView({ q: e.target.value })} placeholder="Product, ref, reason, user" aria-label="Search product, ref, reason or user"
                className="w-full h-11 rounded-xl border border-[#e3d6cc] bg-white pl-9 pr-9 text-sm outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
              {view.q && <button type="button" onClick={() => patchView({ q: '' })} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex flex-1 md:flex-none rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Date range">
              {RANGES.map((o) => (
                <button key={o.key} type="button" aria-pressed={view.range === o.key} onClick={() => patchView({ range: o.key })}
                  className={cn('flex-1 md:flex-none h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap', view.range === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{o.label}</button>
              ))}
            </div>
            <button type="button" role="switch" aria-checked={view.group} onClick={() => patchView({ group: !view.group })}
              className="inline-flex items-center gap-2.5 h-11 px-3 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] whitespace-nowrap">
              <span className={cn('relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors', view.group ? 'bg-[#d6202a]' : 'bg-[#d9d0c9]')}>
                <span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform', view.group ? 'translate-x-5' : 'translate-x-1')} />
              </span>
              Group orders
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="group" aria-label="Filter by movement type">
            {pills.map((c) => {
              const on = view.type === c.key;
              const Icon = c.icon;
              return (
                <button key={c.key} type="button" aria-pressed={on} onClick={() => patchView({ type: c.key })}
                  className={cn('shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm whitespace-nowrap transition-colors',
                    on ? 'border-[#2a2322] bg-[#2a2322] text-white font-semibold' : 'border-[#e3d6cc] bg-white text-[#1d1716] font-medium hover:border-[#d9c7b9]')}>
                  <Icon className="w-4 h-4" {...ICON} />{c.label}
                  <span className={cn('text-xs font-normal tabular-nums', on ? 'text-white/70' : 'text-gray-400')}>{c.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="px-5 py-14 text-center border-t border-[#f0e8e2]">
            <List className="w-9 h-9 mx-auto text-gray-300" {...ICON} />
            <p className="mt-2 font-medium text-[#1d1716]">No movements {filtered ? 'match these filters' : sub === 'today' ? 'today' : `in the ${sub}`}</p>
            {filtered && <button type="button" onClick={() => patchView({ q: '', type: 'all' })} className="mt-1 text-sm font-semibold text-[#c8151d] hover:underline">Clear filters</button>}
          </div>
        ) : (
          <>
            {/* Desktop table (fixed columns so long quantities wrap instead of running into Reason) */}
            <table className="hidden xl:table w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[96px]" /><col /><col className="w-[164px]" /><col className="w-[150px]" /><col className="w-[20%]" /><col className="w-[112px]" /><col className="w-[118px]" />
              </colgroup>
              <thead>
                <tr className="border-t border-[#f0e8e2] text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="text-left font-semibold py-3 pl-5">When</th>
                  <th className="text-left font-semibold py-3 pr-3">Product</th>
                  <th className="text-left font-semibold py-3">Type</th>
                  <th className="text-right font-semibold py-3 pr-4">Qty</th>
                  <th className="text-left font-semibold py-3 pr-3">Reason</th>
                  <th className="text-left font-semibold py-3 pr-3">User</th>
                  <th className="text-left font-semibold py-3 pr-5">Ref</th>
                </tr>
              </thead>
              {sections.map((sec) => (
                <tbody key={sec.key}>
                  <tr className="bg-[#f6f0eb] border-t border-[#eadfd6]">
                    <td colSpan={7} className="px-5 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[17px] leading-none uppercase text-[#1d1716]" style={OSWALD}>{dayLabel(sec.at)}</span>
                        <span className="text-xs text-gray-500 tabular-nums">{dayStat(sec.key)}</span>
                      </div>
                    </td>
                  </tr>
                  {sec.items.map((e) => {
                    if (e.kind === 'one') {
                      const m = e.m;
                      return (
                        <tr key={e.key} className="border-t border-[#f0e8e2] hover:bg-[#fbf7f3]">
                          <td className={cn(td, 'pl-5')}><p className="font-medium text-[#1d1716] whitespace-nowrap">{fmtTime(m.at)}</p><p className="text-xs text-gray-400 whitespace-nowrap">{ago(m.at)}</p></td>
                          <td className={cn(td, 'pr-3')}>{productCell(m)}</td>
                          <td className={td}><TypePill type={m.type} /></td>
                          <td className={cn(td, 'pr-4 text-right font-bold tabular-nums break-words', qtyTone(m.qty))}>{signed(m.qty, byId.get(m.productId))}</td>
                          <td className={cn(td, 'pr-3 text-[#3d3230]')}><p className="truncate" title={m.reason}>{m.reason}</p></td>
                          <td className={cn(td, 'pr-3 text-[#3d3230]')}><p className="truncate" title={m.user}>{m.user}</p></td>
                          <td className={cn(td, 'pr-5 text-gray-600')}><p className="truncate" title={m.ref}>{m.ref ?? '—'}</p></td>
                        </tr>
                      );
                    }
                    const isOpen = open.includes(e.key);
                    const first = e.lines[0];
                    return [
                      <tr key={e.key} className="border-t border-[#f0e8e2] hover:bg-[#fbf7f3]">
                        <td className={cn(td, 'pl-5')}><p className="font-medium text-[#1d1716] whitespace-nowrap">{fmtTime(e.at)}</p><p className="text-xs text-gray-400 whitespace-nowrap">{ago(e.at)}</p></td>
                        <td className={cn(td, 'pr-3')}>{orderHead(e, isOpen)}</td>
                        <td className={td}><TypePill type="online_sale" /></td>
                        <td className={cn(td, 'pr-4 text-right font-bold tabular-nums text-[#c8151d]')}><p className="line-clamp-2 break-words" title={orderQty(e.lines)}>{orderQty(e.lines)}</p></td>
                        <td className={cn(td, 'pr-3 text-[#3d3230]')}><p className="truncate" title={first.reason}>{first.reason}</p></td>
                        <td className={cn(td, 'pr-3 text-[#3d3230]')}><p className="truncate">{first.user}</p></td>
                        <td className={cn(td, 'pr-5 text-gray-600')}><p className="truncate">{e.ref}</p></td>
                      </tr>,
                      ...(isOpen ? e.lines.map((m) => (
                        <tr key={`${e.key}-${m.id}`} className="bg-[#fcfaf8] hover:bg-[#fbf7f3]">
                          <td className="py-2 pl-5" />
                          <td className="py-2 pr-3 pl-6"><div className="border-l-2 border-[#eadfd6] pl-3">{productCell(m)}</div></td>
                          <td className="py-2"><TypePill type={m.type} /></td>
                          <td className={cn('py-2 pr-4 text-right font-bold tabular-nums', qtyTone(m.qty))}>{signed(m.qty, byId.get(m.productId))}</td>
                          <td className="py-2 pr-3 text-[#3d3230]"><p className="truncate" title={m.reason}>{m.reason}</p></td>
                          <td className="py-2 pr-3 text-[#3d3230]"><p className="truncate">{m.user}</p></td>
                          <td className="py-2 pr-5 text-gray-600"><p className="truncate">{m.ref}</p></td>
                        </tr>
                      )) : []),
                    ];
                  })}
                </tbody>
              ))}
            </table>

            {/* Phone / tablet cards */}
            <div className="xl:hidden">
              {sections.map((sec) => (
                <section key={sec.key}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 sm:px-5 py-2.5 bg-[#f6f0eb] border-t border-[#eadfd6]">
                    <h3 className="text-[16px] leading-none uppercase text-[#1d1716]" style={OSWALD}>{dayLabel(sec.at)}</h3>
                    <span className="text-xs text-gray-500 tabular-nums">{dayStat(sec.key)}</span>
                  </div>
                  <ul>
                    {sec.items.map((e) => {
                      if (e.kind === 'one') {
                        const m = e.m;
                        const p = byId.get(m.productId);
                        return (
                          <li key={e.key} className="border-t border-[#f0e8e2] px-3 sm:px-5 py-3 flex gap-3 min-w-0">
                            <ProductThumb p={p} color={colorOf(p)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <button type="button" onClick={() => onCard(m.productId)} className="min-w-0 truncate text-left font-semibold text-[#1d1716] hover:text-[#c8151d]">{p?.name ?? m.productId}</button>
                                <span className={cn('shrink-0 font-bold tabular-nums', qtyTone(m.qty))}>{signed(m.qty, p)}</span>
                              </div>
                              <p className="text-xs text-gray-500 truncate">{p?.sku ?? '—'} · {fmtTime(m.at)} · {ago(m.at)}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                <TypePill type={m.type} /><span className="min-w-0 text-xs text-[#3d3230] break-words">{m.reason}</span>
                              </div>
                              <p className="mt-1 text-xs text-gray-400 truncate">{m.user}{m.ref ? ` · ${m.ref}` : ''}</p>
                            </div>
                          </li>
                        );
                      }
                      const isOpen = open.includes(e.key);
                      return (
                        <li key={e.key} className="border-t border-[#f0e8e2] px-3 sm:px-5 py-3 min-w-0">
                          {orderHead(e, isOpen)}
                          <div className="mt-1.5 pl-[52px] flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                            <TypePill type="online_sale" />
                            <span className="min-w-0 text-sm font-bold text-[#c8151d] tabular-nums break-words">{orderQty(e.lines)}</span>
                          </div>
                          <p className="mt-1 pl-[52px] text-xs text-gray-400 truncate">{fmtTime(e.at)} · {ago(e.at)} · {e.lines[0].user} · {e.ref}</p>
                          {isOpen && (
                            <ul className="mt-2 ml-[52px] border-l-2 border-[#eadfd6] pl-3 space-y-2">
                              {e.lines.map((m) => {
                                const p = byId.get(m.productId);
                                return (
                                  <li key={m.id} className="flex items-center justify-between gap-2 min-w-0">
                                    <button type="button" onClick={() => onCard(m.productId)} className="min-w-0 truncate text-left text-sm font-semibold text-[#1d1716] hover:text-[#c8151d]">{p?.name ?? m.productId}</button>
                                    <span className={cn('shrink-0 text-sm font-bold tabular-nums', qtyTone(m.qty))}>{signed(m.qty, p)}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <ListFooter start={start} count={shown.length} total={entries.length} noun={['entry', 'entries']} size={view.size}
              onSize={(n) => patchView({ size: n })} page={page} pages={pages} onPage={goPage} />
          </>
        )}
      </CatalogCard>
    </>
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
type CountSeg = 'all' | 'todo' | 'var';
type CountRow = { p: Product; top?: Category; sys: number; raw: string; counted: number | null; variance: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Weighed products count in 0.5 kg steps, packs and pieces in whole units. */
const countStep = (p: Product) => (p.soldByWeight ? 0.5 : 1);
const countUnit = (p: Product) => (p.soldByWeight ? 'kg' : p.unit);
/** "−₱706" / "+₱210" / "₱0" */
const signedPeso = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${pesoShort(Math.abs(n))}`;
const signedQty = (n: number, unit: string) => `${n < 0 ? '−' : '+'}${qty(Math.abs(n))} ${unit}`;

function StockTake({ s, branchId, canEdit, blind }: { s: AppState; branchId: string; canEdit: boolean; blind: boolean }) {
  const draft = s.stockCountDraft?.branchId === branchId ? s.stockCountDraft : undefined;
  const tops = useMemo(() => topCategories(s), [s]);
  const [pick, setPick] = useState('cat-beef');
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState<CountSeg>('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [confirming, setConfirming] = useState(false);
  const limit = num(getSetting(s, 'adjustApprovalUnits', branchId));
  const scope = draft?.scope ?? pick;

  const all = useMemo<CountRow[]>(() => {
    const counts = draft?.counts ?? {};
    return s.products.filter((p) => p.status !== 'discontinued').map((p) => {
      const sys = round2(onHand(s, p.id, branchId));
      const raw = counts[p.id];
      const counted = raw === undefined || raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
      return { p, top: tops.find((c) => inCategory(s, p, c.id)), sys, raw: raw ?? '', counted, variance: counted === null ? 0 : round2(counted - sys) };
    });
  }, [s, branchId, draft, tops]);

  const inScope = (r: CountRow, id: string) => id === 'all' || r.top?.id === id;
  const scopeName = (id: string) => (id === 'all' ? 'All products' : tops.find((c) => c.id === id)?.name ?? 'Category');
  const scopes = [{ id: 'all', name: 'All products' }, ...tops.map((c) => ({ id: c.id, name: c.name }))].map((x) => {
    const rs = all.filter((r) => inScope(r, x.id));
    return { ...x, done: rs.filter((r) => r.counted !== null).length, total: rs.length };
  });
  const active = scopes.find((x) => x.id === scope) ?? scopes[0];

  // Scope → search → segment → page
  const scopeRows = all.filter((r) => inScope(r, scope));
  const t = q.trim().toLowerCase();
  const searched = t ? scopeRows.filter((r) => `${r.p.name} ${r.p.sku}`.toLowerCase().includes(t)) : scopeRows;
  const segCount: Record<CountSeg, number> = {
    all: searched.length,
    todo: searched.filter((r) => r.counted === null).length,
    var: searched.filter((r) => r.counted !== null && r.variance !== 0).length,
  };
  const segOf = blind && seg === 'var' ? 'all' : seg; // the Variance filter would give the blind count away
  const rows = searched.filter((r) => (segOf === 'todo' ? r.counted === null : segOf === 'var' ? r.counted !== null && r.variance !== 0 : true));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * size;
  const shown = rows.slice(start, start + size);

  // Banner + submit
  const scopeVar = scopeRows.reduce((n, r) => n + r.variance * r.p.costPrice, 0);
  const notCounted = scopeRows.filter((r) => r.counted === null).length;
  const entered = all.filter((r) => r.counted !== null);
  const withVar = entered.filter((r) => r.variance !== 0);
  const largeRows = withVar.filter((r) => Math.abs(r.variance) > limit);
  const editable = !!draft && canEdit;

  const setScope = (id: string) => {
    setPage(1);
    if (draft) mutate((d) => { if (d.stockCountDraft) d.stockCountDraft.scope = id; });
    else setPick(id);
  };
  const startCount = () => {
    if (!canEdit) return toast.error('You need the inventory.edit permission');
    mutate((d) => {
      d.stockCountDraft = { branchId, scope, startedAt: new Date().toISOString(), startedBy: currentUserName(d), counts: {} };
      addAudit(d, { module: 'Inventory', action: 'Stock take started', detail: scopeName(scope), branchId });
    });
    toast.success(`Count started: ${scopeName(scope)}`);
  };
  const setCount = (pid: string, v: string) => {
    if (!/^\d*\.?\d{0,2}$/.test(v)) return;
    mutate((d) => {
      const c = d.stockCountDraft;
      if (!c) return;
      if (v === '') delete c.counts[pid];
      else c.counts[pid] = v;
    });
  };
  const bump = (r: CountRow, dir: 1 | -1) => {
    const base = r.counted ?? (blind ? 0 : r.sys);
    setCount(r.p.id, qty(Math.max(0, round2(base + dir * countStep(r.p)))));
  };

  function submit() {
    if (!draft) return;
    if (!entered.length) return toast.error('Enter at least one counted quantity');
    if (largeRows.length) setConfirming(true);
    else post(false);
  }

  /** Posts a count_correction for every variance, audits it, saves it to Recent counts and ends the count. */
  function post(managerApproved: boolean) {
    if (!draft) return;
    if (largeRows.length && !managerApproved) return toast.error('Large variances need manager approval');
    const recordScope = entered.every((r) => inScope(r, draft.scope)) ? draft.scope : 'all';
    const label = scopeName(recordScope);
    const value = round2(withVar.reduce((n, r) => n + r.variance * r.p.costPrice, 0));
    const large = largeRows.length > 0;
    mutate((d) => {
      const now = new Date().toISOString();
      const user = currentUserName(d);
      for (const r of withVar) {
        d.movements.push({ id: uid('m'), productId: r.p.id, branchId, qty: r.variance, type: 'count_correction', reason: `Stock take (${label}) · system ${qty(r.sys)}, counted ${qty(r.counted ?? 0)}${large ? ' · manager-approved' : ''}`, user, at: now, ref: `CNT-${now.slice(0, 10)}` });
      }
      addAudit(d, { module: 'Inventory', action: 'Stock take approved', detail: `${label} · ${entered.length} counted, ${withVar.length} corrected · variance ${peso(value)}`, branchId });
      const rec: StockCount = { id: uid('sc'), branchId, scope: recordScope, scopeName: label, startedAt: draft.startedAt, at: now, by: user, counted: entered.length, variances: withVar.length, value };
      d.stockCounts = [rec, ...(d.stockCounts ?? [])];
      delete d.stockCountDraft;
    });
    setConfirming(false);
    setPage(1);
    toast.success(`Stock take submitted: ${withVar.length} correction${withVar.length === 1 ? '' : 's'} posted`);
  }

  const recent = (s.stockCounts ?? []).filter((c) => c.branchId === branchId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  const pct = active.total ? (active.done / active.total) * 100 : 0;

  return (
    <>
      {/* Progress banner (or the "start a count" card) */}
      {draft ? (
        <section className="rounded-2xl bg-[#2a2322] text-white px-4 sm:px-5 py-4 sm:py-5 mb-5 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs uppercase tracking-[0.14em] text-[#d29a6f]" style={OSWALD}>Count in progress · Started {fmtTime(draft.startedAt)}</p>
              <h2 className="mt-1 text-3xl sm:text-4xl font-semibold uppercase leading-none break-words" style={OSWALD}>{active.name}</h2>
            </div>
            <div className="flex items-end gap-5 sm:gap-6">
              <div>
                <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[#cfc3bb]" style={OSWALD}>Counted</p>
                <p className="mt-1 text-2xl sm:text-3xl leading-none tabular-nums" style={OSWALD}>{active.done}/{active.total}</p>
              </div>
              <div>
                <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[#cfc3bb]" style={OSWALD}>Variance</p>
                {blind
                  ? <p className="mt-1 text-2xl sm:text-3xl leading-none text-[#cfc3bb]" style={OSWALD}>Hidden</p>
                  : <p className={cn('mt-1 text-2xl sm:text-3xl leading-none tabular-nums', scopeVar < 0 ? 'text-[#ff4b4f]' : scopeVar > 0 ? 'text-[#8fb0ff]' : 'text-white')} style={OSWALD}>{signedPeso(scopeVar)}</p>}
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-label="Counted" aria-valuemin={0} aria-valuemax={active.total} aria-valuenow={active.done}>
            <div className="h-full rounded-full bg-[#d6202a] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <ScopePills scopes={scopes} value={scope} onPick={setScope} dark />
        </section>
      ) : (
        <section className="rounded-2xl border border-[#eadfd6] bg-[#f7f3ef] px-4 sm:px-5 py-4 sm:py-5 mb-5 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs uppercase tracking-[0.14em] text-[#ae754d]" style={OSWALD}>No count in progress</p>
              <h2 className="mt-1 text-3xl sm:text-4xl font-semibold uppercase leading-none text-[#1d1716]" style={OSWALD}>Start a count</h2>
              <p className="mt-2 text-sm text-[#5b4f4b]">Pick what to count, then start. Entered quantities are saved as you go.</p>
            </div>
            {canEdit && <RedButton onClick={startCount} className="w-full sm:w-auto"><ClipboardCheck className="w-4 h-4" {...ICON} />Start count</RedButton>}
          </div>
          <ScopePills scopes={scopes} value={scope} onPick={setScope} />
        </section>
      )}

      {/* Count list */}
      <CatalogCard>
        <div className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0 basis-full md:basis-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Find product" aria-label="Find product"
              className="w-full h-11 rounded-xl border border-[#e3d6cc] bg-white pl-9 pr-9 text-sm outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
            {q && <button type="button" onClick={() => { setQ(''); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
          </div>
          <div className="flex w-full md:w-auto rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Filter by count status">
            {([['all', 'All'], ['todo', 'Not counted'], ['var', 'Variance']] as const).map(([k, label]) => {
              const off = blind && k === 'var';
              return (
                <button key={k} type="button" aria-pressed={segOf === k} disabled={off} title={off ? 'Hidden during a blind count' : undefined} onClick={() => { setSeg(k); setPage(1); }}
                  className={cn('flex-1 md:flex-none h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap disabled:opacity-40', segOf === k ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>
                  {label} <span className="text-gray-400 font-normal tabular-nums">{off ? '–' : segCount[k]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center border-t border-[#f0e8e2]">
            <ClipboardList className="w-9 h-9 mx-auto text-gray-300" {...ICON} />
            <p className="mt-2 font-medium text-[#1d1716]">{segOf === 'todo' && !t ? 'Everything here is counted' : 'No products match'}</p>
          </div>
        ) : (
          <>
            <ul>
              {shown.map((r) => <CountLine key={r.p.id} r={r} blind={blind} editable={editable} onChange={(v) => setCount(r.p.id, v)} onBump={(dir) => bump(r, dir)} />)}
            </ul>
            <ListFooter start={start} count={shown.length} total={rows.length} noun={['product', 'products']} size={size}
              onSize={(n) => { setSize(n); setPage(1); }} page={cur} pages={pages} onPage={(n) => setPage(Math.max(1, Math.min(pages, n)))} />
          </>
        )}

        {draft && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 px-3 sm:px-5 py-3 border-t border-[#eadfd6] bg-[#fffdfb]/95 backdrop-blur-sm rounded-b-2xl shadow-[0_-10px_20px_-14px_rgba(42,35,34,0.35)]">
            <p className="flex-1 min-w-0 basis-56 text-sm text-[#5b4f4b]">
              {notCounted ? `${notCounted} not counted yet. Uncounted items keep their system quantity.` : `Everything in ${active.name} is counted.`}
            </p>
            {canEdit && (
              <RedButton onClick={submit} disabled={!entered.length} className="w-full sm:w-auto">
                Submit {entered.length} count{entered.length === 1 ? '' : 's'}
              </RedButton>
            )}
          </div>
        )}
      </CatalogCard>

      {/* Recent counts */}
      <section className="mt-8">
        <h2 className="text-2xl md:text-3xl font-semibold uppercase leading-none text-[#1d1716]" style={OSWALD}>Recent counts</h2>
        <CatalogCard className="mt-3">
          {recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">No stock takes submitted yet.</p>
          ) : (
            <ul>
              {recent.map((c, i) => (
                <li key={c.id} className={cn('grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center gap-x-6 gap-y-1 px-3 sm:px-5 py-3', i > 0 && 'border-t border-[#f0e8e2]')}>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1d1716] truncate">{c.scopeName}</p>
                    <p className="text-xs text-gray-500 truncate">{fmtDateTime(c.at)} · {c.by}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 min-w-0">
                    <span className="text-xs text-gray-600">{c.counted} counted · {c.variances} variance{c.variances === 1 ? '' : 's'}</span>
                    <span className={cn('min-w-16 text-right text-sm font-semibold tabular-nums', c.value < 0 ? 'text-[#c8151d]' : c.value > 0 ? 'text-[#2f4a9e]' : 'text-gray-500')}>{signedPeso(c.value)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CatalogCard>
      </section>

      {confirming && draft && (
        <Dialog open onOpenChange={(o) => !o && setConfirming(false)}>
          <CountApproval rows={largeRows} limit={limit} total={withVar.length} value={withVar.reduce((n, r) => n + r.variance * r.p.costPrice, 0)}
            onCancel={() => setConfirming(false)} onConfirm={() => post(true)} />
        </Dialog>
      )}
    </>
  );
}

/** "All products 7/100", "Beef 7/18", …: on the dark banner or the light start card. */
function ScopePills({ scopes, value, onPick, dark }: { scopes: { id: string; name: string; done: number; total: number }[]; value: string; onPick: (id: string) => void; dark?: boolean }) {
  return (
    <div className="mt-4 -mx-4 sm:mx-0 px-4 sm:px-0 flex gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none]" role="group" aria-label="Count scope">
      {scopes.map((c) => {
        const on = c.id === value;
        return (
          <button key={c.id} type="button" aria-pressed={on} onClick={() => onPick(c.id)}
            className={cn('shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm whitespace-nowrap transition-colors',
              dark
                ? on ? 'border-white bg-white text-[#1d1716] font-semibold' : 'border-white/25 text-white font-medium hover:border-white/50'
                : on ? 'border-[#2a2322] bg-[#2a2322] text-white font-semibold' : 'border-[#e3d6cc] bg-white text-[#1d1716] font-medium hover:border-[#d9c7b9]')}>
            {c.name}
            <span className={cn('text-xs font-normal tabular-nums', on ? (dark ? 'text-[#5b4f4b]' : 'text-white/70') : dark ? 'text-white/60' : 'text-gray-400')}>{c.done}/{c.total}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One product: name, SYSTEM qty, − [qty unit] +, and the match / variance text. Stacks on phones. */
function CountLine({ r, blind, editable, onChange, onBump }: { r: CountRow; blind: boolean; editable: boolean; onChange: (v: string) => void; onBump: (dir: 1 | -1) => void }) {
  const unit = countUnit(r.p);
  const counted = r.counted !== null;
  const off = counted && r.variance !== 0;
  const status = !counted ? { text: 'Not counted', cls: 'text-gray-400 font-medium' }
    : blind ? { text: 'Counted', cls: 'text-[#1d1716]' }
      : r.variance === 0 ? { text: 'Matches', cls: 'text-[#1f6b3f]' }
        : { text: signedQty(r.variance, unit), cls: r.variance < 0 ? 'text-[#c8151d]' : 'text-[#2f4a9e]' };
  const step = 'w-9 h-10 sm:w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40 disabled:pointer-events-none';
  return (
    <li className={cn('grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center gap-x-4 gap-y-2 px-3 sm:px-5 py-3 border-t border-[#f0e8e2]', off && !blind && 'bg-[#fdf4f2]')}>
      <div className="min-w-0">
        <p className="font-semibold text-[#1d1716] truncate">{r.p.name}</p>
        <p className="text-xs text-gray-500 truncate">{r.p.sku} · {r.top?.name ?? 'Uncategorised'}</p>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <div className="w-14 shrink-0 text-left sm:text-right mr-auto sm:mr-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500">System</p>
          {blind
            ? <p className="text-sm text-gray-400 inline-flex items-center gap-1" title="Hidden during a blind count"><EyeOff className="w-3.5 h-3.5" {...ICON} /><span className="sr-only">Hidden</span></p>
            : <p className="text-sm font-semibold text-[#1d1716] tabular-nums whitespace-nowrap">{qty(r.sys)} {unit}</p>}
        </div>
        <button type="button" className={step} disabled={!editable || (counted && (r.counted ?? 0) <= 0)} onClick={() => onBump(-1)} aria-label={`Less ${r.p.name}`}><Minus className="w-4 h-4" {...ICON} /></button>
        <div className="relative w-[76px] sm:w-[88px] shrink-0">
          <input type="text" inputMode="decimal" value={r.raw} disabled={!editable} placeholder="—"
            onChange={(e) => onChange(e.target.value.replace(',', '.'))} aria-label={`Counted ${unit} of ${r.p.name}`}
            className={cn('w-full h-10 rounded-xl border bg-white pl-3 pr-8 text-[15px] font-semibold tabular-nums text-[#1d1716] outline-none placeholder:font-normal placeholder:text-gray-400 focus:ring-4 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb]',
              !counted ? 'border-[#e3d6cc]' : blind ? 'border-[#9c8f88]' : r.variance === 0 ? 'border-[#1f6b3f]/60' : 'border-[#e59a9e]')} />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>
        </div>
        <button type="button" className={step} disabled={!editable} onClick={() => onBump(1)} aria-label={`More ${r.p.name}`}><Plus className="w-4 h-4" {...ICON} /></button>
        <span className={cn('w-[76px] sm:w-[88px] shrink-0 text-right text-xs sm:text-sm font-semibold leading-tight tabular-nums', status.cls)}>{status.text}</span>
      </div>
    </li>
  );
}

function CountApproval({ rows, limit, total, value, onCancel, onConfirm }: { rows: CountRow[]; limit: number; total: number; value: number; onCancel: () => void; onConfirm: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>Manager approval needed</DialogTitle>
        <DialogDescription>
          {rows.length} item{rows.length === 1 ? '' : 's'} differ by more than {limit} unit{limit === 1 ? '' : 's'}. {total} correction{total === 1 ? '' : 's'} will post, net {signedPeso(value)} at cost.
        </DialogDescription>
      </DialogHeader>
      <ul className="rounded-xl border border-[#eadfd6] divide-y divide-[#f0e8e2] max-h-56 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-[#1d1716]">{r.p.name}</span>
            <span className={cn('shrink-0 font-semibold tabular-nums', r.variance < 0 ? 'text-[#c8151d]' : 'text-[#2f4a9e]')}>{signedQty(r.variance, countUnit(r.p))}</span>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <Checkbox checked={ok} onCheckedChange={(v) => setOk(v === true)} className="mt-0.5" />
        <span>A manager checked these variances and approves the corrections.</span>
      </label>
      <DialogFooter className="justify-end flex-wrap gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <RedButton onClick={onConfirm} disabled={!ok}><ClipboardCheck className="w-4 h-4" {...ICON} />Approve &amp; submit</RedButton>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------------- (e) Transfers ----------------
type TrStatusKey = 'requested' | 'transit' | 'received' | 'cancelled';
type TrDir = 'all' | 'in' | 'out';
const TR_STATUS: Record<TrStatusKey, { label: string; cls: string; dot: string }> = {
  requested: { label: 'Requested', cls: 'bg-[#fdf1e3] text-[#b45a12]', dot: '#d9822b' },
  transit: { label: 'In transit', cls: 'bg-[#e9eef9] text-[#2c4f9e]', dot: '#2c4f9e' },
  received: { label: 'Received', cls: 'bg-[#e8f4eb] text-[#1f6b3f]', dot: '#2e9a4a' },
  cancelled: { label: 'Cancelled', cls: 'bg-[#efebe8] text-[#5b4f4b]', dot: '#8a7f7a' },
};
/** approved (older flow) and dispatched both read "In transit". */
const trStatus = (st: Transfer['status']): TrStatusKey => (st === 'approved' || st === 'dispatched' ? 'transit' : st);
const TR_DIRS: { key: TrDir; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'in', label: 'Incoming' }, { key: 'out', label: 'Outgoing' }];
/** Branch that started the transfer. Older records have no requestedBy: they were requests from the receiving branch. */
const requesterOf = (t: Transfer) => t.requestedBy ?? t.toBranchId;
/** A request = the receiving branch asked for the stock (vs. the sending branch just sending it). */
const isRequest = (t: Transfer) => requesterOf(t) === t.toBranchId;

function TrPill({ status }: { status: Transfer['status'] }) {
  const st = TR_STATUS[trStatus(status)];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap', st.cls)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
    </span>
  );
}

/** "Today, 8:15 AM", "Yesterday" or "Nov 16". */
function trWhen(at: string) {
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today, ${fmtTime(at)}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const trValue = (s: AppState, t: Transfer) => t.lines.reduce((n, l) => n + l.qty * (s.products.find((p) => p.id === l.productId)?.costPrice ?? 0), 0);
/** "Beef Flank, Pork Tenderloin +2". */
function trItemNames(s: AppState, t: Transfer) {
  const names = t.lines.map((l) => productName(s, l.productId));
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}
const trQty = (p: Product | undefined, n: number) => `${qty(n)} ${!p ? '' : p.soldByWeight ? 'kg' : n === 1 ? unit1(p) : unitOf(p)}`.trim();
/** "9 kg Pork Liver · 3 kg Ground Chicken". */
const trItemSummary = (s: AppState, t: Transfer) => t.lines.map((l) => `${trQty(s.products.find((p) => p.id === l.productId), l.qty)} ${productName(s, l.productId)}`).join(' · ');

// ---------- Transfer stock actions (each writes ledger movements + an audit entry) ----------
function logStatus(d: AppState, x: Transfer, status: Transfer['status'], at: string) {
  x.status = status;
  (x.history ??= []).push({ status, at, by: currentUserName(d) });
}
function postTransferOut(d: AppState, x: Transfer, at: string) {
  for (const l of x.lines) {
    d.movements.push({ id: uid('m'), productId: l.productId, branchId: x.fromBranchId, qty: -l.qty, type: 'transfer_out', reason: `Transfer to ${branchName(d, x.toBranchId)}`, user: currentUserName(d), at, ref: x.number });
  }
}
/** First line the sending branch can't cover, as an error message (null when all lines fit). */
function trShortfall(s: AppState, branchId: string, lines: Transfer['lines']) {
  for (const l of lines) {
    const oh = onHand(s, l.productId, branchId);
    if (l.qty > oh) return `${productName(s, l.productId)}: only ${qty(oh)} on hand at ${branchName(s, branchId)}`;
  }
  return null;
}

/** "Approve & send": stock leaves the sending branch now and the transfer is in transit. */
function approveAndSend(s: AppState, t: Transfer) {
  const err = trShortfall(s, t.fromBranchId, t.lines);
  if (err) return toast.error(err);
  mutate((d) => {
    const x = d.transfers.find((y) => y.id === t.id);
    if (!x || x.status !== 'requested') return;
    const now = new Date().toISOString();
    postTransferOut(d, x, now);
    logStatus(d, x, 'dispatched', now);
    addAudit(d, { module: 'Inventory', action: 'Transfer approved & sent', detail: `${x.number} · ${branchName(d, x.fromBranchId)} → ${branchName(d, x.toBranchId)} · ${x.lines.length} line(s)`, branchId: x.fromBranchId, oldValue: 'requested', newValue: 'dispatched' });
    addNotification(d, { audience: 'staff', targetId: x.toBranchId, title: `Transfer ${x.number} on the way`, body: `From ${branchName(d, x.fromBranchId)} · ${x.lines.length} line(s)` });
  });
  toast.success(`${t.number} sent`, { description: 'Stock left this branch and is in transit.' });
}

function declineTransfer(t: Transfer) {
  mutate((d) => {
    const x = d.transfers.find((y) => y.id === t.id);
    if (!x || x.status !== 'requested') return;
    logStatus(d, x, 'cancelled', new Date().toISOString());
    addAudit(d, { module: 'Inventory', action: 'Transfer declined', detail: `${x.number} · ${branchName(d, x.fromBranchId)} → ${branchName(d, x.toBranchId)}`, branchId: x.fromBranchId, oldValue: 'requested', newValue: 'cancelled' });
    addNotification(d, { audience: 'staff', targetId: x.toBranchId, title: `Transfer ${x.number} declined`, body: `${branchName(d, x.fromBranchId)} declined the request` });
  });
  toast.success(`${t.number} declined`);
}

/** Stock arrives at the receiving branch. `got` holds counted quantities when they differ from what was sent. */
function receiveTransfer(t: Transfer, got?: Record<string, number>) {
  mutate((d) => {
    const x = d.transfers.find((y) => y.id === t.id);
    if (!x || (x.status !== 'approved' && x.status !== 'dispatched')) return;
    const now = new Date().toISOString();
    // Approved under the old flow but never dispatched: take it out of the source now so both branches balance.
    if (x.status === 'approved') postTransferOut(d, x, now);
    const issues: string[] = [];
    for (const l of x.lines) {
      const q = Math.max(0, got?.[l.productId] ?? l.qty);
      if (q !== l.qty) issues.push(`${productName(d, l.productId)} sent ${l.qty}, received ${q}`);
      if (q > 0) d.movements.push({ id: uid('m'), productId: l.productId, branchId: x.toBranchId, qty: q, type: 'transfer_in', reason: `Transfer from ${branchName(d, x.fromBranchId)}${q !== l.qty ? ` · discrepancy (sent ${l.qty})` : ''}`, user: currentUserName(d), at: now, ref: x.number });
    }
    logStatus(d, x, 'received', now);
    addAudit(d, { module: 'Inventory', action: issues.length ? 'Transfer received with discrepancy' : 'Transfer received', detail: `${x.number}${issues.length ? ` · ${issues.join('; ')}` : ''}`, branchId: x.toBranchId, oldValue: t.status, newValue: 'received' });
  });
  toast.success(`${t.number} received`, { description: 'Added to stock at this branch.' });
}

function Transfers({ s, branchId, canEdit }: { s: AppState; branchId: string; canEdit: boolean }) {
  const [dir, setDir] = useState<TrDir>('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [openId, setOpenId] = useState<string | null>(null);
  const [counting, setCounting] = useState<Transfer | null>(null);
  const hasOthers = s.branches.some((b) => b.id !== branchId);
  const mine = useMemo(
    () => s.transfers.filter((t) => t.fromBranchId === branchId || t.toBranchId === branchId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [s.transfers, branchId],
  );
  const open = mine.find((t) => t.id === openId);

  // Phase 1: one branch. Nothing to transfer to, so show why instead of empty lists.
  if (!hasOthers && mine.length === 0) {
    return (
      <CatalogCard className="px-5 py-14 sm:py-20 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-[#f6f0eb] text-[#ae754d] flex items-center justify-center"><ArrowLeftRight className="w-7 h-7" {...ICON} /></span>
        <h2 className="mt-4 text-[26px] md:text-[28px] leading-none uppercase text-[#1d1716]" style={OSWALD}>No other branches yet</h2>
        <p className="mt-3 mx-auto max-w-md text-sm text-[#5b4f4b] leading-relaxed">Transfers move stock between branches. They appear here once your account has more than one branch.</p>
      </CatalogCard>
    );
  }

  const incoming = mine.filter((t) => t.toBranchId === branchId && (t.status === 'approved' || t.status === 'dispatched'));
  const asks = mine.filter((t) => t.fromBranchId === branchId && t.status === 'requested' && requesterOf(t) !== branchId);
  const dirCount = (k: TrDir) => (k === 'all' ? mine.length : mine.filter((t) => (k === 'in' ? t.toBranchId : t.fromBranchId) === branchId).length);
  const rows = dir === 'all' ? mine : mine.filter((t) => (dir === 'in' ? t.toBranchId : t.fromBranchId) === branchId);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * size;
  const shown = rows.slice(start, start + size);
  const decline = (t: Transfer) => { if (window.confirm(`Decline ${t.number} from ${branchName(s, t.toBranchId)}? No stock moves.`)) declineTransfer(t); };

  /** "Davao – Matina → Digos" plus "(we asked)" / "(they asked)" on requests. */
  const route = (t: Transfer) => {
    const inbound = t.toBranchId === branchId;
    const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
    return (
      <span className="inline-flex items-start gap-2 min-w-0">
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', inbound ? 'text-[#1f6b3f]' : 'text-[#c8151d]')} {...ICON} aria-label={inbound ? 'Incoming' : 'Outgoing'} />
        <span className="min-w-0 break-words">
          {branchName(s, t.fromBranchId)} <span className="text-gray-400">→</span> {branchName(s, t.toBranchId)}
          {isRequest(t) && <span className="text-gray-500"> ({requesterOf(t) === branchId ? 'we asked' : 'they asked'})</span>}
        </span>
      </span>
    );
  };

  return (
    <>
      {(incoming.length > 0 || asks.length > 0) && (
        <section aria-labelledby="tr-needs" className="mb-6">
          <h2 id="tr-needs" className="mb-3 text-[26px] md:text-[28px] leading-none uppercase text-[#1d1716]" style={OSWALD}>Needs action</h2>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
            {incoming.map((t) => (
              <article key={t.id} className="flex flex-col rounded-2xl border border-[#b9c6e6] bg-[#fffdfb] p-4 min-w-0">
                <div className="flex items-start gap-3">
                  <Truck className="w-6 h-6 shrink-0 text-[#2c4f9e]" {...ICON} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold leading-snug text-[#1d1716] break-words">Incoming from {branchName(s, t.fromBranchId)}</h3>
                    <p className="mt-1 text-xs text-gray-500">{t.number} · {trWhen(t.createdAt)}</p>
                  </div>
                  <TrPill status={t.status} />
                </div>
                <p className="mt-3 text-sm text-[#3d3230] leading-relaxed">{trItemSummary(s, t)}</p>
                <button type="button" onClick={() => setOpenId(t.id)} className="mt-2 self-start inline-flex items-center gap-1 text-sm font-semibold text-[#ae754d] hover:underline underline-offset-2">
                  View details<ArrowRight className="w-4 h-4" {...ICON} />
                </button>
                <div className="mt-auto pt-3">
                  {canEdit ? (
                    <button type="button" onClick={() => receiveTransfer(t)}
                      className="w-full h-11 px-3 rounded-xl bg-[#2a2322] text-sm font-semibold text-white hover:bg-[#1d1716]">Mark received · add to stock</button>
                  ) : (
                    <p className="flex items-center gap-2 h-11 text-sm text-gray-500"><Clock className="w-4 h-4" {...ICON} />Waiting for staff to receive</p>
                  )}
                </div>
              </article>
            ))}
            {asks.map((t) => (
              <article key={t.id} className="flex flex-col rounded-2xl border border-[#ecc4a3] bg-[#fffdfb] p-4 min-w-0">
                <div className="flex items-start gap-3">
                  <HandHelping className="w-6 h-6 shrink-0 text-[#ae754d]" {...ICON} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold leading-snug text-[#1d1716] break-words">{branchName(s, t.toBranchId)} is asking for stock</h3>
                    <p className="mt-1 text-xs text-gray-500">{t.number} · {trWhen(t.createdAt)}</p>
                  </div>
                  <TrPill status={t.status} />
                </div>
                <p className="mt-3 text-sm text-[#3d3230] leading-relaxed">{trItemSummary(s, t)}</p>
                <button type="button" onClick={() => setOpenId(t.id)} className="mt-2 self-start inline-flex items-center gap-1 text-sm font-semibold text-[#ae754d] hover:underline underline-offset-2">
                  View details<ArrowRight className="w-4 h-4" {...ICON} />
                </button>
                <div className="mt-auto pt-3">
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => approveAndSend(s, t)}
                        className="flex-1 h-11 px-3 rounded-xl bg-[#2a2322] text-sm font-semibold text-white hover:bg-[#1d1716] whitespace-nowrap">Approve &amp; send</button>
                      <button type="button" onClick={() => decline(t)} className="h-11 px-3 text-sm font-semibold text-[#c8151d] hover:underline underline-offset-2">Decline</button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 h-11 text-sm text-gray-500"><Clock className="w-4 h-4" {...ICON} />Waiting for a manager</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <CatalogCard className="overflow-hidden">
        <div className="p-3 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <CardHeading className="uppercase">All transfers</CardHeading>
          <div className="flex w-full sm:w-auto rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Filter by direction">
            {TR_DIRS.map((o) => (
              <button key={o.key} type="button" aria-pressed={dir === o.key} onClick={() => { setDir(o.key); setPage(1); }}
                className={cn('flex-1 sm:flex-none h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap', dir === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>
                {o.label} <span className="text-gray-400 font-normal tabular-nums">{dirCount(o.key)}</span>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center border-t border-[#f0e8e2]">
            <ArrowLeftRight className="w-9 h-9 mx-auto text-gray-300" {...ICON} />
            <p className="mt-2 font-medium text-[#1d1716]">{mine.length ? `No ${dir === 'in' ? 'incoming' : 'outgoing'} transfers` : 'No transfers yet'}</p>
            {!mine.length && canEdit && <p className="mt-1 text-sm text-gray-500">Use New transfer to send or request stock.</p>}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden xl:table w-full text-sm">
              <thead>
                <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="text-left font-semibold py-3 pl-5 w-[104px]">Ref</th>
                  <th className="text-left font-semibold py-3 pr-3">Route</th>
                  <th className="text-left font-semibold py-3 pr-3">Items</th>
                  <th className="text-right font-semibold py-3 w-[120px]">Value at cost</th>
                  <th className="text-left font-semibold py-3 pl-4 w-[150px]">Created</th>
                  <th className="text-left font-semibold py-3 pr-5 w-[130px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} tabIndex={0} onClick={() => setOpenId(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(t.id); } }}
                    aria-label={`Open ${t.number}`}
                    className="border-t border-[#f0e8e2] cursor-pointer hover:bg-[#fbf7f3] focus-visible:outline-2 focus-visible:outline-[#c8151d]/40 focus-visible:-outline-offset-2">
                    <td className="py-4 pl-5 font-semibold text-[#1d1716] whitespace-nowrap">{t.number}</td>
                    <td className="py-4 pr-3 text-[#1d1716]">{route(t)}</td>
                    <td className="py-4 pr-3 text-[#3d3230]">{trItemNames(s, t)}</td>
                    <td className="py-4 text-right font-bold text-[#1d1716] tabular-nums whitespace-nowrap">{pesoShort(trValue(s, t))}</td>
                    <td className="py-4 pl-4 text-gray-600 whitespace-nowrap">{trWhen(t.createdAt)}</td>
                    <td className="py-4 pr-5"><TrPill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phone / tablet cards */}
            <ul className="xl:hidden">
              {shown.map((t) => (
                <li key={t.id} className="border-t border-[#f0e8e2]">
                  <button type="button" onClick={() => setOpenId(t.id)} className="w-full text-left px-3 sm:px-5 py-3 hover:bg-[#fbf7f3] min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-[#1d1716]">{route(t)}</span>
                      <TrPill status={t.status} />
                    </span>
                    <span className="block mt-0.5 text-xs text-gray-500">{t.number} · {trWhen(t.createdAt)}</span>
                    <span className="mt-1.5 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-[#3d3230]">{trItemNames(s, t)}</span>
                      <span className="shrink-0 font-bold text-[#1d1716] tabular-nums">{pesoShort(trValue(s, t))}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <ListFooter start={start} count={shown.length} total={rows.length} noun={['transfer', 'transfers']} size={size}
              onSize={(n) => { setSize(n); setPage(1); }} page={cur} pages={pages} onPage={(n) => setPage(Math.max(1, Math.min(pages, n)))} />
          </>
        )}
      </CatalogCard>

      {open && (
        <TransferSheet s={s} t={open} branchId={branchId} canEdit={canEdit} onClose={() => setOpenId(null)}
          onReceive={() => receiveTransfer(open)} onCount={() => setCounting(open)} onSend={() => approveAndSend(s, open)} onDecline={() => decline(open)} />
      )}
      {counting && <ReceiveTransferDialog s={s} transfer={counting} onClose={() => setCounting(null)} />}
    </>
  );
}

// ---------- Transfer detail drawer ----------
function TransferSheet({ s, t, branchId, canEdit, onClose, onReceive, onCount, onSend, onDecline }: {
  s: AppState; t: Transfer; branchId: string; canEdit: boolean; onClose: () => void; onReceive: () => void; onCount: () => void; onSend: () => void; onDecline: () => void;
}) {
  const inbound = t.toBranchId === branchId;
  const from = branchName(s, t.fromBranchId);
  const to = branchName(s, t.toBranchId);
  const transit = t.status === 'approved' || t.status === 'dispatched';
  const canReceive = canEdit && inbound && transit;
  const canSend = canEdit && !inbound && t.status === 'requested' && requesterOf(t) !== branchId;
  const STEP: Record<Transfer['status'], string> = {
    requested: 'Requested', approved: 'Approved', dispatched: `Sent · stock left ${from}`, received: `Received · added to stock at ${to}`, cancelled: `Declined by ${from}`,
  };
  const steps = [
    { label: isRequest(t) ? `Requested by ${branchName(s, requesterOf(t))}` : `Created by ${branchName(s, requesterOf(t))}`, at: t.createdAt, by: '' },
    ...(t.history ?? []).filter((h) => h.status !== 'requested').map((h) => ({ label: STEP[h.status], at: h.at, by: h.by })),
  ];
  const next = t.status === 'requested' ? `Waiting for ${from} to approve & send` : transit ? `Waiting for ${to} to receive` : null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full max-w-full sm:max-w-[560px] bg-[#fffdfb] border-[#eadfd6] text-[#1d1716]">
        <div className="px-4 sm:px-5 pt-5 pb-4 border-b border-[#eadfd6] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-[#5b4f4b]"><span className="font-medium">{t.number}</span><TrPill status={t.status} /></p>
              <SheetTitle className="mt-2 text-3xl leading-none uppercase font-normal text-[#1d1716] break-words" style={OSWALD}>{inbound ? `From ${from}` : `To ${to}`}</SheetTitle>
              <SheetDescription className="mt-2 text-[13px] text-[#6b5f5a]">{from} → {to} · created {trWhen(t.createdAt)}</SheetDescription>
            </div>
            <SheetClose className="w-11 h-11 rounded-xl border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
              <X className="w-5 h-5" {...ICON} />
            </SheetClose>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-5 space-y-6">
          <section>
            <h3 className={LABEL}>{t.lines.length} item{t.lines.length === 1 ? '' : 's'}</h3>
            <ul className="mt-2 divide-y divide-[#f0e8e2] rounded-xl border border-[#eadfd6] bg-white">
              {t.lines.map((l, i) => {
                const p = s.products.find((x) => x.id === l.productId);
                return (
                  <li key={`${l.productId}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 break-words font-medium text-[#1d1716]">{productName(s, l.productId)}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-[#1d1716]">{trQty(p, l.qty)}</span>
                      <span className="block text-xs text-gray-500">{pesoShort(l.qty * (p?.costPrice ?? 0))}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className={LABEL}>Timeline</h3>
            <ol className="mt-3 space-y-3">
              {steps.map((st, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-[#2a2322] shrink-0" />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium text-[#1d1716]">{st.label}</span>
                    <span className="block text-xs text-gray-500">{fmtDateTime(st.at)}{st.by ? ` · ${st.by}` : ''}</span>
                  </span>
                </li>
              ))}
              {next && (
                <li className="flex gap-3">
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#cbbdb2] shrink-0" />
                  <span className="text-sm text-gray-500">{next}</span>
                </li>
              )}
            </ol>
          </section>

          {t.note && (
            <section>
              <h3 className={LABEL}>Note</h3>
              <p className="mt-2 text-sm text-[#1d1716] break-words">{t.note}</p>
            </section>
          )}
        </div>

        <div className="shrink-0 border-t border-[#eadfd6] bg-[#fffdfb] px-4 sm:px-5 py-4 space-y-3">
          <div>
            <p className="text-xs text-[#5b4f4b]">Value at cost</p>
            <p className="text-3xl sm:text-4xl leading-none text-[#1d1716] tabular-nums" style={OSWALD}>{peso(trValue(s, t))}</p>
          </div>
          {canReceive && (
            <div className="space-y-2">
              <button type="button" onClick={() => { onReceive(); onClose(); }} className="w-full h-12 px-4 rounded-xl bg-[#2a2322] text-sm sm:text-base font-semibold text-white hover:bg-[#1d1716]">Mark received · add to stock</button>
              <button type="button" onClick={onCount} className="text-sm font-semibold text-[#ae754d] hover:underline underline-offset-2">Received a different amount?</button>
            </div>
          )}
          {canSend && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { onSend(); onClose(); }} className="flex-1 h-12 px-4 rounded-xl bg-[#2a2322] text-sm sm:text-base font-semibold text-white hover:bg-[#1d1716]">Approve &amp; send</button>
              <button type="button" onClick={onDecline} className="h-12 px-3 text-sm font-semibold text-[#c8151d] hover:underline underline-offset-2">Decline</button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- New transfer dialog ----------
type TrDraftLine = { key: string; productId: string; qty: string };
const blankTrLine = (): TrDraftLine => ({ key: uid('tl'), productId: '', qty: '' });

function NewTransferDialog({ s, branchId, onClose }: { s: AppState; branchId: string; onClose: () => void }) {
  const others = s.branches.filter((b) => b.id !== branchId);
  const products = useMemo(() => s.products.filter((p) => p.status !== 'discontinued').sort((a, b) => a.name.localeCompare(b.name)), [s.products]);
  const [mode, setMode] = useState<'send' | 'request'>('send');
  const [other, setOther] = useState(others[0]?.id ?? '');
  const [lines, setLines] = useState<TrDraftLine[]>([blankTrLine()]);
  const [note, setNote] = useState('');
  const source = mode === 'send' ? branchId : other;
  const update = (key: string, p: Partial<TrDraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  function save() {
    if (!other) return toast.error('Choose the other branch');
    // Same product on two lines → one line.
    const merged = new Map<string, number>();
    for (const l of lines) {
      const n = Number(l.qty);
      if (l.productId && n > 0) merged.set(l.productId, round2((merged.get(l.productId) ?? 0) + n));
    }
    const valid = Array.from(merged, ([productId, q]) => ({ productId, qty: q }));
    if (!valid.length) return toast.error('Add at least one product and quantity');
    if (mode === 'send') {
      const err = trShortfall(s, branchId, valid);
      if (err) return toast.error(err);
    }
    const fromId = mode === 'send' ? branchId : other;
    const toId = mode === 'send' ? other : branchId;
    let number = '';
    mutate((d) => {
      number = `TR-${String(d.counters.transfer).padStart(4, '0')}`;
      d.counters.transfer += 1;
      const now = new Date().toISOString();
      const x: Transfer = { id: uid('tr'), number, fromBranchId: fromId, toBranchId: toId, status: 'requested', createdAt: now, lines: valid, requestedBy: branchId, note: note.trim() || undefined, history: [] };
      const detail = `${number} · ${branchName(d, fromId)} → ${branchName(d, toId)} · ${valid.length} line(s)`;
      if (mode === 'send') {
        // Sending: stock leaves this branch right away and the transfer is in transit.
        postTransferOut(d, x, now);
        logStatus(d, x, 'dispatched', now);
        addAudit(d, { module: 'Inventory', action: 'Transfer sent', detail, branchId: fromId, newValue: 'dispatched' });
        addNotification(d, { audience: 'staff', targetId: toId, title: `Transfer ${number} on the way`, body: `From ${branchName(d, fromId)} · ${valid.length} line(s)` });
      } else {
        addAudit(d, { module: 'Inventory', action: 'Transfer requested', detail, branchId: toId, newValue: 'requested' });
        addNotification(d, { audience: 'staff', targetId: fromId, title: `Transfer request ${number}`, body: `${branchName(d, toId)} is asking for ${valid.length} item(s)` });
      }
      d.transfers.unshift(x);
    });
    toast.success(mode === 'send' ? `${number} sent to ${branchName(s, other)}` : `${number} requested from ${branchName(s, other)}`);
    onClose();
  }

  const total = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (s.products.find((p) => p.id === l.productId)?.costPrice ?? 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>{mode === 'send' ? 'Stock leaves this branch now and arrives when the other branch marks it received.' : 'The other branch approves and sends it; stock arrives when you mark it received.'}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
          {([['send', 'Send to another branch', ArrowUpRight], ['request', 'Request from another branch', ArrowDownLeft]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
              className={cn('flex items-center gap-2 h-11 px-3 rounded-xl border text-sm font-semibold text-left',
                mode === k ? 'border-[#2a2322] bg-[#2a2322] text-white' : 'border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2]')}>
              <Icon className="w-4 h-4 shrink-0" {...ICON} />{label}
            </button>
          ))}
        </div>

        <Field label={mode === 'send' ? 'Send to' : 'Request from'}>
          <select className={cn(selectClass, 'w-full')} value={other} onChange={(e) => setOther(e.target.value)}>
            {others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">Items</p>
          {lines.map((l) => {
            const p = s.products.find((x) => x.id === l.productId);
            return (
              <div key={l.key} className="flex items-center gap-2">
                <select aria-label="Product" className={cn(selectClass, 'flex-1 min-w-0')} value={l.productId} onChange={(e) => update(l.key, { productId: e.target.value })}>
                  <option value="">Choose product…</option>
                  {products.map((x) => <option key={x.id} value={x.id}>{x.name} — {trQty(x, onHand(s, x.id, source))} at {branchName(s, source)}</option>)}
                </select>
                <div className="relative w-28 shrink-0">
                  <input type="number" min={0} step={p?.soldByWeight ? 0.5 : 1} inputMode="decimal" aria-label="Quantity" placeholder="0"
                    className={cn(inputClass, 'w-full pr-11')} value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">{p ? unitOf(p) : ''}</span>
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 className="text-[#dc2626]" {...ICON} />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankTrLine()])}><Plus {...ICON} /> Add line</Button>
        </div>

        <Field label="Note (optional)"><input className={cn(inputClass, 'w-full')} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. For the weekend rush" /></Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#5b4f4b]">Value at cost <span className="ml-1 font-bold text-[#1d1716] tabular-nums">{peso(total)}</span></p>
          <div className="flex gap-2 ml-auto">
            <OutlineButton onClick={onClose}>Cancel</OutlineButton>
            <RedButton onClick={save} disabled={!others.length}>{mode === 'send' ? <ArrowUpRight className="w-4 h-4" {...ICON} /> : <ArrowDownLeft className="w-4 h-4" {...ICON} />}{mode === 'send' ? 'Send' : 'Request'}</RedButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveTransferDialog({ s, transfer, onClose }: { s: AppState; transfer: Transfer; onClose: () => void }) {
  const [got, setGot] = useState<Record<string, number>>(Object.fromEntries(transfer.lines.map((l) => [l.productId, l.qty])));
  function save() {
    receiveTransfer(transfer, got);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader><DialogTitle>Receive {transfer.number}</DialogTitle><DialogDescription>{branchName(s, transfer.fromBranchId)} → {branchName(s, transfer.toBranchId)} · enter quantities actually received.</DialogDescription></DialogHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Sent</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
          <TableBody>
            {transfer.lines.map((l) => {
              const p = s.products.find((x) => x.id === l.productId);
              return (
                <TableRow key={l.productId}>
                  <TableCell className="whitespace-normal">{p?.name ?? l.productId}</TableCell>
                  <TableCell className="text-right">{trQty(p, l.qty)}</TableCell>
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
function StockCard({ s, branchId, productId, onClose, onOpenLevels }: { s: AppState; branchId: string; productId: string; onClose: () => void; onOpenLevels: (p: Product) => void }) {
  const [hideSales, setHideSales] = useState(false);
  const p = s.products.find((x) => x.id === productId);
  const top = s.categories.find((c) => c.id === p?.categoryId);
  const st = stockSummary(s, productId, branchId);
  // Running balance after each movement, oldest → newest, then shown newest first (the top balance is on hand).
  const rows = useMemo(() => {
    const sorted = s.movements
      .filter((m) => m.productId === productId && m.branchId === branchId)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const out: { m: Mv; bal: number }[] = [];
    let bal = 0;
    for (const m of sorted) { bal = Math.round((bal + m.qty) * 1000) / 1000; out.push({ m, bal }); }
    return out.reverse();
  }, [s.movements, productId, branchId]);
  const week = useMemo(() => {
    const from = rangeStart('7d');
    const t = { inQ: 0, outQ: 0, n: 0 };
    for (const { m } of rows) {
      if (new Date(m.at).getTime() < from) continue;
      t.n++;
      if (m.qty > 0) t.inQ += m.qty; else t.outQ -= m.qty;
    }
    return t;
  }, [rows]);
  if (!p) return null;
  const u = unit1(p);
  const shown = hideSales ? rows.filter(({ m }) => !SALE_TYPES.includes(m.type)) : rows;
  const boxes: [string, number][] = [['On hand', st.onHand], ['Reserved', st.reserved], ['Buffer', st.buffer], ['Available', st.available]];
  const exportCard = () => {
    if (!rows.length) return toast.info('Nothing to export');
    exportCsv(`stock-card-${p.sku}-${branchId}.csv`, [
      ['Date', 'Type', 'Qty', 'Unit', 'Balance', 'Reason', 'User', 'Reference'],
      ...rows.map(({ m, bal }) => [fmtDateTime(m.at), MOVEMENT_LABEL[m.type], m.qty, u, bal, m.reason, m.user, m.ref ?? '']),
    ]);
    toast.success(`Exported ${rows.length} movement${rows.length === 1 ? '' : 's'} of ${p.name}`);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full max-w-full sm:max-w-[560px] bg-[#fffdfb] border-[#eadfd6] text-[#1d1716]">
        <div className="shrink-0 px-4 sm:px-5 pt-5 pb-4 border-b border-[#eadfd6]">
          <div className="flex items-start gap-3">
            <ProductThumb p={p} color={top?.color} className="w-14 h-14 text-2xl" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ae754d]">Stock card</p>
              <SheetTitle className="mt-0.5 text-2xl sm:text-3xl leading-none uppercase font-normal text-[#1d1716] break-words" style={OSWALD}>{p.name}</SheetTitle>
              <SheetDescription className="mt-1.5 text-[13px] text-[#6b5f5a]">{p.sku} · per {u} · {top?.name ?? 'Uncategorised'} · {branchName(s, branchId)}</SheetDescription>
            </div>
            <SheetClose className="w-11 h-11 rounded-xl border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
              <X className="w-5 h-5" {...ICON} />
            </SheetClose>
          </div>

          <div className="mt-4 grid grid-cols-4 rounded-xl border border-[#eadfd6] bg-white overflow-hidden divide-x divide-[#eadfd6]">
            {boxes.map(([k, v]) => {
              const avail = k === 'Available';
              return (
                <div key={k} className={cn('px-2 sm:px-3 py-2.5 min-w-0', avail && 'bg-[#eaf5ee]')}>
                  <p className="text-[11px] sm:text-xs text-[#5b4f4b] truncate">{k}</p>
                  <p className={cn('mt-0.5 text-xl sm:text-[28px] leading-none tabular-nums whitespace-nowrap', avail ? 'text-[#1f6b3f]' : 'text-[#1d1716]')} style={OSWALD}>
                    {qty(v)}<span className="ml-1 text-sm sm:text-xl">{u}</span>
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-sm text-[#5b4f4b]">Reorder point is {qty(p.reorderPoint)} {u}.</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm text-[#3d3230]">Last 7 days: +{qty(week.inQ)} in · −{qty(week.outQ)} out · {week.n} movement{week.n === 1 ? '' : 's'}</p>
            <button type="button" aria-pressed={hideSales} onClick={() => setHideSales((v) => !v)}
              className={cn('inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors',
                hideSales ? 'border-[#2a2322] bg-[#2a2322] text-white' : 'border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2]')}>
              <Funnel className="w-4 h-4" {...ICON} />Hide sales
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-500">{rows.length ? 'Only sales recorded for this product.' : 'No movements recorded yet.'}</p>
          ) : (
            <ul>
              {shown.map(({ m, bal }) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[#f0e8e2]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><TypePill type={m.type} /><span className="text-xs text-gray-500">{fmtDateTime(m.at)}</span></div>
                    <p className="mt-1.5 text-sm text-[#1d1716] break-words">{m.reason}</p>
                    <p className="mt-0.5 text-xs text-gray-500 truncate">{m.user}{m.ref ? ` · ${m.ref}` : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('font-bold tabular-nums whitespace-nowrap', qtyTone(m.qty))}>{signed(m.qty, p)}</p>
                    <p className="mt-0.5 text-xs text-gray-500 whitespace-nowrap">Balance <b className="text-[#1d1716] tabular-nums">{qty(bal)} {u}</b></p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 flex gap-2 border-t border-[#eadfd6] bg-[#fffdfb] px-4 sm:px-5 py-4">
          <OutlineButton onClick={exportCard} className="h-12"><Download className="w-4 h-4" {...ICON} />Export</OutlineButton>
          <button type="button" onClick={() => onOpenLevels(p)} className="flex-1 h-12 px-4 rounded-xl bg-[#2a2322] text-sm sm:text-base font-semibold text-white hover:bg-[#1d1716] whitespace-nowrap">Open in Stock levels</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------- (g) Receiving (Direct Receiving) ----------------
type RcvLine = Receiving['lines'][number];
type RcvStatusKey = Receiving['status'];
interface RcvView { q: string; supplier: string; status: 'all' | RcvStatusKey; page: number; size: number }

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
/** "58 kg" / "30 packs". */
function rcvQtyText(p: Product | undefined, l: RcvLine) {
  return p?.soldByWeight ? `${(l.weightKg ?? l.qty).toLocaleString('en-PH', { maximumFractionDigits: 3 })} kg` : `${l.qty} ${p ? unitOf(p) : 'pcs'}`;
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

/** Manager approval: add the stock, mark posted, audit. */
function approveReceiving(r: Receiving) {
  let ok = false;
  mutate((d) => {
    const x = d.receivings.find((y) => y.id === r.id);
    if (!x || x.status !== 'awaiting') return;
    const by = currentUserName(d);
    x.status = 'posted';
    x.approvedBy = by;
    x.approvedAt = new Date().toISOString();
    postReceivingStock(d, x, by);
    addAudit(d, { module: 'Inventory', action: 'Direct Receiving approved', detail: `${x.number} · ${x.supplierName} · DR ${x.receiptNo} · ${peso(receivingValue(d, x))}: stock added`, branchId: x.branchId, oldValue: 'awaiting', newValue: 'posted' });
    ok = true;
  });
  if (ok) toast.success(`${r.receiptNo} approved and posted to stock`, { description: `${r.lines.length} line${r.lines.length === 1 ? '' : 's'} added to stock` });
}

/** Manager rejection: no stock is added. */
function rejectReceiving(r: Receiving, reason: string) {
  let ok = false;
  mutate((d) => {
    const x = d.receivings.find((y) => y.id === r.id);
    if (!x || x.status !== 'awaiting') return;
    x.status = 'rejected';
    x.rejectReason = reason;
    x.rejectedBy = currentUserName(d);
    x.rejectedAt = new Date().toISOString();
    addAudit(d, { module: 'Inventory', action: 'Direct Receiving rejected', detail: `${x.number} · ${x.supplierName} · DR ${x.receiptNo} · ${peso(receivingValue(d, x))} · ${reason}`, branchId: x.branchId, oldValue: 'awaiting', newValue: 'rejected' });
    ok = true;
  });
  if (ok) toast.success(`${r.receiptNo} rejected`, { description: 'No stock was added.' });
}

const RCV_STATUS: Record<RcvStatusKey, { label: string; cls: string; dot: string }> = {
  awaiting: { label: 'Awaiting approval', cls: 'bg-[#fdf1e3] text-[#b45a12]', dot: '#d9822b' },
  posted: { label: 'Posted', cls: 'bg-[#e8f4eb] text-[#2e6b3a]', dot: '#2e9a4a' },
  rejected: { label: 'Rejected', cls: 'bg-[#fdecec] text-[#c8151d]', dot: '#c8151d' },
};
const RCV_SEGS: { key: 'all' | RcvStatusKey; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'posted', label: 'Posted' }, { key: 'awaiting', label: 'Awaiting' }, { key: 'rejected', label: 'Rejected' }];

function RcvPill({ status }: { status: RcvStatusKey }) {
  const st = RCV_STATUS[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap', st.cls)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
    </span>
  );
}

/** "Today, 6:00 AM" or "Nov 17, 9:39 AM". */
function whenText(at: string) {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${fmtTime(at)}`;
}
const productName = (s: AppState, id: string) => s.products.find((p) => p.id === id)?.name ?? id;
/** "Pork Chop, Pata (Front)" or "Chicken Feet, Chicken Tinola Cut +1". */
function itemNames(s: AppState, r: Receiving) {
  const names = r.lines.map((l) => productName(s, l.productId));
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}
/** "58 kg Pork Chop · 81 kg Pata (Front)". */
const itemSummary = (s: AppState, r: Receiving) =>
  r.lines.map((l) => `${rcvQtyText(s.products.find((p) => p.id === l.productId), l)} ${productName(s, l.productId)}`).join(' · ');

function filterReceivings(s: AppState, list: Receiving[], v: RcvView, skipStatus?: boolean) {
  const t = v.q.trim().toLowerCase();
  return list.filter((r) => {
    if (v.supplier !== 'all' && r.supplierName !== v.supplier) return false;
    if (!skipStatus && v.status !== 'all' && r.status !== v.status) return false;
    if (t && !`${r.receiptNo} ${r.number} ${r.supplierName} ${r.lines.map((l) => productName(s, l.productId)).join(' ')}`.toLowerCase().includes(t)) return false;
    return true;
  });
}

function exportReceivings(s: AppState, rows: Receiving[], filename: string) {
  if (!rows.length) return toast.info('Nothing to export');
  exportCsv(filename, [
    ['Received', 'DR no.', 'Receiving no.', 'Supplier', 'Items', 'Lines', 'Value', 'Received by', 'Status', 'Approved / rejected by', 'Reject reason', 'Notes'],
    ...rows.map((r) => [
      fmtDateTime(r.at), r.receiptNo, r.number, r.supplierName, itemSummary(s, r), r.lines.length, receivingValue(s, r).toFixed(2), r.by,
      RCV_STATUS[r.status].label, r.approvedBy ?? r.rejectedBy ?? '', r.rejectReason ?? '', r.note ?? '',
    ]),
  ]);
  toast.success(`Exported ${rows.length} deliver${rows.length === 1 ? 'y' : 'ies'}`);
}

interface ReceivingTabProps {
  s: AppState; list: Receiving[]; rows: Receiving[]; view: RcvView; canApprove: boolean; threshold: number;
  setView: (fn: (v: RcvView) => RcvView) => void; patchView: (p: Partial<RcvView>) => void;
  onOpen: (id: string) => void; onApprove: (r: Receiving) => void; onReject: (r: Receiving) => void;
}

function ReceivingTab({ s, list, rows, view, canApprove, threshold, setView, patchView, onOpen, onApprove, onReject }: ReceivingTabProps) {
  const awaiting = list.filter((r) => r.status === 'awaiting');
  const suppliers = useMemo(() => Array.from(new Set(list.map((r) => r.supplierName))).sort((a, b) => a.localeCompare(b)), [list]);
  const segBase = filterReceivings(s, list, view, true);
  const segCount = (k: 'all' | RcvStatusKey) => (k === 'all' ? segBase.length : segBase.filter((r) => r.status === k).length);

  const pages = Math.max(1, Math.ceil(rows.length / view.size));
  const page = Math.min(view.page, pages);
  const start = (page - 1) * view.size;
  const shown = rows.slice(start, start + view.size);
  const goPage = (n: number) => setView((v) => ({ ...v, page: Math.max(1, Math.min(pages, n)) }));
  const filtered = view.q || view.supplier !== 'all' || view.status !== 'all';

  return (
    <>
      {awaiting.length > 0 && (
        <section aria-labelledby="rcv-awaiting" className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-3">
            <h2 id="rcv-awaiting" className="text-[26px] md:text-[28px] leading-none uppercase text-[#1d1716]" style={OSWALD}>Awaiting approval</h2>
            <p className="text-sm text-[#5b4f4b]">Over {pesoShort(threshold)}. Stock is added once approved.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
            {awaiting.map((r) => (
              <article key={r.id} className="flex flex-col rounded-2xl border border-[#ecc4a3] bg-[#fffdfb] p-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-[15px] font-semibold leading-snug text-[#1d1716] break-words">{r.supplierName}</h3>
                  <span className="shrink-0 text-[28px] leading-none text-[#1d1716] tabular-nums" style={OSWALD}>{pesoShort(receivingValue(s, r))}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{r.receiptNo} · {whenText(r.at)} · {r.by}</p>
                <p className="mt-3 text-sm text-[#3d3230] leading-relaxed">{itemSummary(s, r)}</p>
                <button type="button" onClick={() => onOpen(r.id)} className="mt-2 self-start inline-flex items-center gap-1 text-sm font-semibold text-[#ae754d] hover:underline underline-offset-2">
                  View details<ArrowRight className="w-4 h-4" {...ICON} />
                </button>
                <div className="mt-auto pt-3">
                  {canApprove ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onReject(r)}
                        className="h-11 px-4 rounded-xl border border-[#eadfd6] bg-white text-sm font-semibold text-[#c8151d] hover:bg-[#fdf3f2]">Reject</button>
                      <button type="button" onClick={() => onApprove(r)}
                        className="flex-1 h-11 px-3 rounded-xl bg-[#2a2322] text-sm font-semibold text-white hover:bg-[#1d1716] whitespace-nowrap">Approve &amp; post to stock</button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 h-11 text-sm text-gray-500"><Clock className="w-4 h-4" {...ICON} />Waiting for a manager</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <CatalogCard className="overflow-hidden">
        <div className="p-3 sm:p-5 space-y-3">
          <CardHeading className="uppercase">Delivery history</CardHeading>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0 basis-full md:basis-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
              <input value={view.q} onChange={(e) => patchView({ q: e.target.value })} placeholder="Search DR no. or product" aria-label="Search DR no. or product"
                className="w-full h-11 rounded-xl border border-[#e3d6cc] bg-white pl-9 pr-9 text-sm outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
              {view.q && <button type="button" onClick={() => patchView({ q: '' })} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
            </div>
            <label className="relative w-full sm:w-auto">
              <span className="sr-only">Supplier</span>
              <Truck className="w-4 h-4 text-[#1d1716] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
              <select value={view.supplier} onChange={(e) => patchView({ supplier: e.target.value })}
                className="appearance-none w-full sm:w-auto sm:max-w-[240px] h-11 rounded-xl border border-[#e3d6cc] bg-white pl-9 pr-9 text-sm font-semibold text-[#1d1716] truncate outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10">
                <option value="all">All suppliers</option>
                {suppliers.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
            </label>
            <div className="flex w-full lg:w-auto rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Filter by status">
              {RCV_SEGS.map((o) => (
                <button key={o.key} type="button" aria-pressed={view.status === o.key} onClick={() => patchView({ status: o.key })}
                  className={cn('flex-1 lg:flex-none h-9 px-1.5 sm:px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap', view.status === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>
                  {o.label} <span className="text-gray-400 font-normal tabular-nums">{segCount(o.key)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center border-t border-[#f0e8e2]">
            <PackageCheck className="w-9 h-9 mx-auto text-gray-300" {...ICON} />
            <p className="mt-2 font-medium text-[#1d1716]">{list.length ? 'No deliveries match these filters' : 'No deliveries received yet'}</p>
            {filtered && <button type="button" onClick={() => patchView({ q: '', supplier: 'all', status: 'all' })} className="mt-1 text-sm font-semibold text-[#c8151d] hover:underline">Clear filters</button>}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden xl:table w-full text-sm">
              <thead>
                <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="text-left font-semibold py-3 pl-5 w-[150px]">Received</th>
                  <th className="text-left font-semibold py-3 w-[104px]">DR no.</th>
                  <th className="text-left font-semibold py-3 pr-3">Supplier</th>
                  <th className="text-left font-semibold py-3 pr-3">Items</th>
                  <th className="text-right font-semibold py-3 w-[96px]">Value</th>
                  <th className="text-left font-semibold py-3 pl-4 w-[118px]">Received by</th>
                  <th className="text-left font-semibold py-3 pr-5 w-[160px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => onOpen(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.id); } }}
                    aria-label={`Open ${r.receiptNo} from ${r.supplierName}`}
                    className="border-t border-[#f0e8e2] cursor-pointer hover:bg-[#fbf7f3] focus-visible:outline-2 focus-visible:outline-[#c8151d]/40 focus-visible:-outline-offset-2">
                    <td className="py-4 pl-5 text-gray-600 whitespace-nowrap">{whenText(r.at)}</td>
                    <td className="py-4 font-semibold text-[#1d1716] whitespace-nowrap">{r.receiptNo}</td>
                    <td className="py-4 pr-3 font-semibold text-[#1d1716]">{r.supplierName}</td>
                    <td className="py-4 pr-3 text-[#3d3230]">{itemNames(s, r)}</td>
                    <td className="py-4 text-right font-bold text-[#1d1716] tabular-nums whitespace-nowrap">{pesoShort(receivingValue(s, r))}</td>
                    <td className="py-4 pl-4 text-[#3d3230] whitespace-nowrap">{r.by}</td>
                    <td className="py-4 pr-5"><RcvPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phone / tablet cards */}
            <ul className="xl:hidden">
              {shown.map((r) => (
                <li key={r.id} className="border-t border-[#f0e8e2]">
                  <button type="button" onClick={() => onOpen(r.id)} className="w-full text-left px-3 sm:px-5 py-3 hover:bg-[#fbf7f3] min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-semibold text-[#1d1716] break-words">{r.supplierName}</span>
                      <RcvPill status={r.status} />
                    </span>
                    <span className="block mt-0.5 text-xs text-gray-500">{r.receiptNo} · {whenText(r.at)} · {r.by}</span>
                    <span className="mt-1.5 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-[#3d3230]">{itemNames(s, r)}</span>
                      <span className="shrink-0 font-bold text-[#1d1716] tabular-nums">{pesoShort(receivingValue(s, r))}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <ListFooter start={start} count={shown.length} total={rows.length} noun={['delivery', 'deliveries']} size={view.size}
              onSize={(n) => patchView({ size: n })} page={page} pages={pages} onPage={goPage} />
          </>
        )}
      </CatalogCard>
    </>
  );
}

// ---------- Delivery detail drawer ----------
const dayDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const shortDay = (ymd: string) => dayDate(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const DAY_MS = 86_400_000;

/** Where a lot sits between produced and expiry, and how fresh it is today. */
function shelfLife(l: RcvLine) {
  if (!l.expiresOn) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = dayDate(l.expiresOn);
  const left = Math.round((exp.getTime() - today.getTime()) / DAY_MS);
  const prod = l.producedOn ? dayDate(l.producedOn) : null;
  const span = prod ? Math.max(1, Math.round((exp.getTime() - prod.getTime()) / DAY_MS)) : 0;
  const pct = prod ? Math.max(0, Math.min(1, (today.getTime() - prod.getTime()) / DAY_MS / span)) : null;
  if (left < 0) return { left, pct, label: 'Expired', cls: 'bg-[#fdecec] text-[#c8151d]', bar: '#c8151d', Icon: AlertTriangle };
  if (left <= 2) return { left, pct, label: left === 0 ? 'Use today' : `Use soon · ${left} day${left === 1 ? '' : 's'} left`, cls: 'bg-[#fdf1e3] text-[#b45a12]', bar: '#d9822b', Icon: Clock };
  return { left, pct, label: `Fresh · ${left} days left`, cls: 'bg-[#e8f4eb] text-[#2e6b3a]', bar: '#2e9a4a', Icon: Leaf };
}

const LABEL = 'text-xs font-semibold uppercase tracking-[0.12em] text-[#5b4f4b]';

function RcvLineCard({ s, l }: { s: AppState; l: RcvLine }) {
  const p = s.products.find((x) => x.id === l.productId);
  const top = s.categories.find((c) => c.id === p?.categoryId);
  const life = shelfLife(l);
  return (
    <li className="rounded-xl border border-[#eadfd6] bg-white overflow-hidden">
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <span className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-[#f0e4da] text-xl" style={stripes(top?.color ?? '#b9aaa0')}>
          <ProductImage image={p?.image} fill alt="" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] text-[#1d1716] break-words">{p?.name ?? l.productId}</p>
          <p className="text-xs text-gray-500 truncate">{p?.sku ?? '—'} · {top?.name ?? 'Uncategorised'}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold text-[#1d1716] tabular-nums">{peso(rcvLineValue(p, l))}</p>
          <p className="text-xs text-gray-500 whitespace-nowrap"><b className="text-[#1d1716]">{rcvQtyText(p, l)}</b> × {peso(l.cost)}/{p?.soldByWeight ? 'kg' : (p?.unit ?? 'pc')}</p>
        </div>
      </div>
      <div className="border-t border-[#f0e8e2] bg-[#fbf8f5] px-3 sm:px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#eadfd6] bg-white text-xs text-[#5b4f4b]">
            <ScanBarcode className="w-3.5 h-3.5" {...ICON} />Lot <b className="font-semibold text-[#1d1716]">{l.batch || '—'}</b>
          </span>
          {life
            ? <span className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold', life.cls)}><life.Icon className="w-3.5 h-3.5" {...ICON} />{life.label}</span>
            : <span className="text-xs text-gray-400">No expiry recorded</span>}
        </div>
        {life && life.pct !== null && (
          <div className="relative mt-3 h-1.5 rounded-full bg-[#ece4dd]" role="img" aria-label={`${Math.round(life.pct * 100)}% of shelf life used`}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${life.pct * 100}%`, background: life.bar }} />
            <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2" style={{ left: `${life.pct * 100}%`, borderColor: life.bar }} />
          </div>
        )}
        {(l.producedOn || l.expiresOn) && (
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
            <span>{l.producedOn && <>Produced <b className="text-[#1d1716]">{shortDay(l.producedOn)}</b></>}</span>
            <span>{l.expiresOn && <>Expires <b className="text-[#1d1716]">{shortDay(l.expiresOn)}</b></>}</span>
          </div>
        )}
      </div>
    </li>
  );
}

function ReceivingSheet({ s, r, canApprove, onClose, onApprove, onReject }: { s: AppState; r: Receiving; canApprove: boolean; onClose: () => void; onApprove: () => void; onReject: () => void }) {
  const total = receivingValue(s, r);
  const statusLine = r.status === 'awaiting' ? (canApprove ? 'Not in stock until approved' : 'Not in stock until a manager approves')
    : r.status === 'posted' ? `Posted to stock · ${fmtDateTime(r.approvedAt ?? r.at)}`
      : `Rejected · ${r.rejectReason ?? 'No reason given'}`;
  const openPhoto = () => {
    if (r.photo) window.open(r.photo, '_blank', 'noopener');
    else if (r.hasPhoto) toast.info(`Photo of ${r.receiptNo}`, { description: 'Full-size receipt photos are not stored in this demo.' });
    else toast.info(`No photo of ${r.receiptNo} was attached`);
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full max-w-full sm:max-w-[600px] bg-[#fffdfb] border-[#eadfd6] text-[#1d1716]">
        <div className="px-4 sm:px-5 pt-5 pb-4 border-b border-[#eadfd6] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-[#5b4f4b]"><span className="font-medium">{r.receiptNo}</span><RcvPill status={r.status} /></p>
              <SheetTitle className="mt-2 text-3xl leading-none uppercase font-normal text-[#1d1716] break-words" style={OSWALD}>{r.supplierName}</SheetTitle>
              <SheetDescription className="mt-2 text-[13px] text-[#6b5f5a]">Received {whenText(r.at)} by {r.by}</SheetDescription>
            </div>
            <SheetClose className="w-11 h-11 rounded-xl border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
              <X className="w-5 h-5" {...ICON} />
            </SheetClose>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-5 space-y-6">
          <section>
            <h3 className={LABEL}>Delivery receipt</h3>
            <button type="button" onClick={openPhoto}
              className="mt-2 w-full flex items-center gap-3 rounded-xl border-2 border-dashed border-[#e3d6cc] bg-[#faf7f4] px-4 py-5 text-left text-sm text-[#5b4f4b] hover:bg-[#f6f0eb] overflow-hidden">
              {r.photo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.photo} alt={`Delivery receipt ${r.receiptNo}`} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                : <ImageIcon className="w-5 h-5 shrink-0" {...ICON} />}
              <span className="min-w-0">{r.hasPhoto || r.photo ? `Photo of ${r.receiptNo} (tap to view full size)` : `No photo of ${r.receiptNo} attached`}</span>
            </button>
          </section>

          <section>
            <h3 className={LABEL}>{r.lines.length} item{r.lines.length === 1 ? '' : 's'}</h3>
            <ul className="mt-2 space-y-3">
              {r.lines.map((l, i) => <RcvLineCard key={`${l.productId}-${i}`} s={s} l={l} />)}
            </ul>
          </section>

          <section>
            <h3 className={LABEL}>Notes</h3>
            <p className="mt-2 text-sm text-[#1d1716] break-words">{r.note || 'No notes'}</p>
          </section>
        </div>

        <div className="shrink-0 border-t border-[#eadfd6] bg-[#fffdfb] px-4 sm:px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-xs text-[#5b4f4b]">Total value</p>
              <p className="text-3xl sm:text-4xl leading-none text-[#c8151d] tabular-nums" style={OSWALD}>{peso(total)}</p>
            </div>
            <p className={cn('text-sm sm:text-right min-w-0 break-words', r.status === 'rejected' ? 'text-[#c8151d]' : 'text-[#5b4f4b]')}>{statusLine}</p>
          </div>
          {r.status === 'awaiting' && canApprove && (
            <div className="flex gap-2">
              <button type="button" onClick={onReject} className="h-12 px-5 rounded-xl border border-[#eadfd6] bg-white text-sm font-semibold text-[#c8151d] hover:bg-[#fdf3f2]">Reject</button>
              <button type="button" onClick={onApprove} className="flex-1 h-12 px-4 rounded-xl bg-[#2a2322] text-sm sm:text-base font-semibold text-white hover:bg-[#1d1716]">Approve &amp; post to stock</button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const QUICK_REJECT = ['Temperature above 4°C on arrival', 'Short weight against the DR', 'Wrong items delivered', 'Damaged packaging', 'Lot past its use-by date'];

function RejectDialog({ s, r, onClose }: { s: AppState; r: Receiving; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const confirm = () => {
    if (!reason.trim()) return toast.error('Give a reason for rejecting this delivery');
    rejectReceiving(r, reason.trim());
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Reject {r.receiptNo}?</DialogTitle>
          <DialogDescription>{r.supplierName} · {peso(receivingValue(s, r))}. Nothing is added to stock.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REJECT.map((q) => (
            <button key={q} type="button" onClick={() => setReason(q)}
              className={cn('h-8 px-3 rounded-full border text-xs font-medium', reason === q ? 'border-[#2a2322] bg-[#2a2322] text-white' : 'border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2]')}>{q}</button>
          ))}
        </div>
        <Field label="Reason">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this delivery rejected?" autoFocus
            className="w-full rounded-xl border border-[#e3d6cc] bg-white px-3 py-2 text-sm outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
        </Field>
        <DialogFooter className="justify-end flex-wrap gap-2">
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <RedButton onClick={confirm} disabled={!reason.trim()}>Reject delivery</RedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DraftLine = { key: string; q: string; productId: string; amount: string; cost: string; batch: string; producedOn: string; expiresOn: string };
const blankLine = (): DraftLine => ({ key: uid('rl'), q: '', productId: '', amount: '', cost: '', batch: '', producedOn: '', expiresOn: '' });

function ReceiveDialog({ s, branchId, threshold, initialPid, onClose, onPosted }: { s: AppState; branchId: string; threshold: number; initialPid?: string; onClose: () => void; onPosted: (id: string) => void }) {
  const [supplierId, setSupplierId] = useState(s.suppliers[0]?.id ?? '__other');
  const [otherName, setOtherName] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => {
    const p = initialPid ? s.products.find((x) => x.id === initialPid) : undefined;
    return [p ? { ...blankLine(), productId: p.id, cost: String(p.costPrice) } : blankLine()];
  });
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
        status: needsApproval ? 'awaiting' : 'posted', lines: rcvLines,
      };
      d.receivings.unshift(rcv);
      if (!needsApproval) postReceivingStock(d, rcv, by);
      addAudit(d, {
        module: 'Inventory', action: needsApproval ? 'Direct Receiving submitted for approval' : 'Direct Receiving posted',
        detail: `${number} · ${supplierName} · DR ${rcv.receiptNo} · ${rcvLines.length} line(s) · ${peso(total)}${needsApproval ? ` (above ${pesoShort(threshold)})` : ''}`,
        branchId, newValue: peso(total),
      });
      if (needsApproval) addNotification(d, { audience: 'staff', targetId: branchId, title: `Approval needed: ${number}`, body: `${supplierName} delivery ${peso(total)} is above ${pesoShort(threshold)}. Approve it in Inventory → Receiving.` });
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
