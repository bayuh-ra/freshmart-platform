'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftRight, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Download, Info, Layers, List, Package, PackageCheck, Pencil, Plus, Search, ShieldAlert, Trash2, Truck, X,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { addAudit, addNotification, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import { branchName, can, exportCsv, fmtDateTime, getSetting, num, onHand, peso, pesoShort, stockSummary, timeAgo } from '@/src/lib/logic';
import type { AppState, Category, MovementType, Product, Receiving, Transfer } from '@/src/lib/types';
import {
  Field, MOVEMENT_LABEL, MovementBadge, StateBadge, categoryTree, inCategory, stockState, topCategories,
} from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { ProductImage } from '@/src/components/ProductImage';
import { CatalogCard, ICON, OSWALD, OutlineButton, RedButton, stripes, urlParam } from '../catalog/_ui';

const CRUMBS = [{ label: 'Operations' }, { label: 'Inventory' }];
/** Light restyle for the Receiving / Movements / Stock take / Transfers panels: same card look as the catalog pages. */
const CARD = 'rounded-2xl border-[#eadfd6] bg-[#fffdfb] shadow-none';

type TabKey = 'stock' | 'receiving' | 'movements' | 'stock-take' | 'transfers';
const TABS: { key: TabKey; label: string; icon: typeof Layers }[] = [
  { key: 'stock', label: 'Stock levels', icon: Layers },
  { key: 'receiving', label: 'Receiving', icon: Truck },
  { key: 'movements', label: 'Movements', icon: List },
  { key: 'stock-take', label: 'Stock take', icon: ClipboardList },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
];

export default function InventoryPage() {
  const s = useStore();
  return (
    <DashboardLayout title="Inventory" crumbs={CRUMBS}>
      {can(s, 'inventory.view') ? <InventoryInner s={s} /> : <AccessDenied permission="inventory.view" />}
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

function InventoryInner({ s }: { s: AppState }) {
  const branchId = s.session.branchId;
  const branch = branchName(s, branchId);
  const canEdit = can(s, 'inventory.edit') || can(s, 'inventory.create');
  const levels = useLevels(s, branchId);
  const [tab, setTabState] = useState<TabKey>(() => {
    const t = urlParam('tab');
    return TABS.find((x) => x.key === t)?.key ?? 'stock';
  });
  const [view, setView] = useState<View>({ q: '', seg: 'all', cat: 'all', reservedOnly: false, page: 1, size: 10 });
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordPid, setRecordPid] = useState<string | undefined>();
  const [receivePid, setReceivePid] = useState<string | null>(null);
  const [cardPid, setCardPid] = useState<string | null>(null);

  /** Switch tab and keep ?tab= in the address bar (no navigation). */
  const setTab = (t: TabKey) => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === 'stock') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };
  /** Changing a filter starts again at page 1. */
  const patchView = (p: Partial<View>) => setView((v) => ({ ...v, page: 1, ...p }));

  const rows = useMemo(() => filterLevels(levels, view), [levels, view]);
  const pendingRcv = (s.receivings ?? []).filter((r) => r.branchId === branchId && r.status === 'pending_approval').length;
  const openRecord = (pid?: string) => { setRecordPid(pid); setRecordOpen(true); };
  const openReceive = (pid: string) => { setReceivePid(pid); setTab('receiving'); };

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="mb-5 md:mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{branch} · Counted from recorded movements</p>
            <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Inventory</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OutlineButton onClick={() => exportLevels(rows, `stock-levels-${branchId}.csv`)}><Download className="w-4 h-4" {...ICON} />Export</OutlineButton>
            {canEdit && <RedButton onClick={() => openRecord()}><Plus className="w-4 h-4" />Record movement</RedButton>}
          </div>
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
        <DirectReceiving s={s} branchId={branchId} canCreate={canEdit} canApprove={can(s, 'inventory.approve')} prefillPid={receivePid} onPrefillDone={() => setReceivePid(null)} />
      )}
      {tab === 'movements' && <Ledger s={s} branchId={branchId} onCard={setCardPid} />}
      {tab === 'stock-take' && <StockTake s={s} branchId={branchId} canEdit={canEdit} />}
      {tab === 'transfers' && <Transfers s={s} branchId={branchId} canEdit={canEdit} />}

      {recordOpen && <RecordDialog s={s} branchId={branchId} initialPid={recordPid} onClose={() => setRecordOpen(false)} />}
      {cardPid && <StockCard s={s} branchId={branchId} productId={cardPid} onClose={() => setCardPid(null)} />}
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

            {/* Footer */}
            <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 border-t border-[#f0e8e2]">
              <span className="text-sm text-gray-500">Showing {start + 1}–{start + shown.length} of {rows.length} product{rows.length === 1 ? '' : 's'}</span>
              <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 whitespace-nowrap">Rows per page</span>
                  <div className="inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Rows per page">
                    {PAGE_SIZES.map((n) => (
                      <button key={n} type="button" aria-pressed={view.size === n} onClick={() => patchView({ size: n })}
                        className={cn('h-8 min-w-9 px-2 rounded-lg text-xs tabular-nums', view.size === n ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{n}</button>
                    ))}
                  </div>
                </div>
                <Pager page={page} pages={pages} onPage={goPage} />
              </div>
            </div>
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
    <Panel className={CARD} bodyClass="p-4">
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
    <Panel className={CARD} title="Stock take (cycle count)" action={
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
      <Panel className={CARD} title="Inter-branch transfers" action={
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

function DirectReceiving({ s, branchId, canCreate, canApprove, prefillPid, onPrefillDone }: { s: AppState; branchId: string; canCreate: boolean; canApprove: boolean; prefillPid?: string | null; onPrefillDone?: () => void }) {
  // Opened from a Low / Out row on Stock levels: start with the delivery dialog open for that product.
  const [open, setOpen] = useState(() => canCreate && !!prefillPid);
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
      <Panel className={CARD}
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
      {open && <ReceiveDialog s={s} branchId={branchId} threshold={threshold} initialPid={prefillPid ?? undefined} onClose={() => { setOpen(false); onPrefillDone?.(); }} onPosted={(id) => setDetailId(id)} />}
      {detail && <ReceivingDetail s={s} r={detail} canApprove={canApprove} onApprove={() => approve(detail)} onClose={() => setDetailId(null)} />}
    </>
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
