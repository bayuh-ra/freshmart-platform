'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Archive, ArchiveRestore, ArrowDownUp, Copy, Eye, EyeOff, ImageOff, MoreHorizontal, Package, Pencil, Plus, Search, Star, X,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';
import { Textarea } from '@/src/components/ui/shadcn/textarea';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { guardLimit } from '@/src/lib/platform';
import { branchName, can, cutFeeText, getPriceInfo, peso, stockSummary } from '@/src/lib/logic';
import type { AppState, Category, Product, StorageType, TaxType, UnitOfMeasure } from '@/src/lib/types';
import {
  Field, Toggle, categoryPath, isOnlineAt, offlineTag, stockState, subcategoriesOf, topCategories, visibleTags,
} from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { ProductImage, isPhoto } from '@/src/components/ProductImage';
import { PhotoField } from '@/src/components/catalog/PhotoField';
import { CatalogCard, CatalogHeader, GreenToggle, ICON, OSWALD, RedButton, outlineLinkClass, urlParam } from '../_ui';

const STATUSES: Product['status'][] = ['draft', 'active', 'hidden', 'discontinued'];
const UNITS: UnitOfMeasure[] = ['pc', 'pack', 'kg', 'g', 'L'];
const TAX_LABEL: Record<TaxType, string> = { vat: 'VAT-able (12%)', exempt: 'VAT-exempt', zero: 'Zero-rated' };
const STORAGE_LABEL: Record<StorageType, string> = { fresh: 'Fresh / chilled', frozen: 'Frozen', shelf: 'Shelf-stable' };
const fmtKg = (n: number) => `${Number(n.toFixed(3))}`;
const CRUMBS = [{ label: 'Catalog' }, { label: 'Products' }];
const PAGE = 40;

type Flag = 'out' | 'low' | 'hidden' | 'override' | 'nophoto';
type SortKey = 'category' | 'stock' | 'price';
const SORTS: { key: SortKey; label: string }[] = [{ key: 'category', label: 'Category' }, { key: 'stock', label: 'Lowest stock' }, { key: 'price', label: 'Price' }];

/** One product with the branch numbers the list needs. */
interface Row {
  p: Product; idx: number; top?: Category; sub?: Category;
  price: number; override: boolean; available: number; state: 'ok' | 'low' | 'out'; online: boolean; photo: boolean;
}

export default function ProductsPage() {
  const s = useStore();
  return (
    <DashboardLayout title="Products" crumbs={CRUMBS}>
      {can(s, 'catalog.view') ? <ProductsInner s={s} /> : <AccessDenied permission="catalog.view" />}
    </DashboardLayout>
  );
}

const unitWord = (p: Product) => (p.soldByWeight ? 'kg' : p.unit === 'pack' ? 'packs' : 'pcs');
const perUnit = (p: Product) => (p.soldByWeight ? '/kg' : p.unit === 'pack' ? '/pack' : p.unit === 'L' ? '/bottle' : '/pc');
const qty = (n: number) => `${Number(n.toFixed(2))}`;
function soldLine(p: Product) {
  const cuts = p.cutOptionIds?.length ?? 0;
  const base = p.soldByWeight ? 'Sold by kg' : `${p.unit === 'pack' ? 'Per pack' : 'Per piece'} · ${p.size}`;
  return cuts ? `${base} · ${cuts} cut${cuts === 1 ? '' : 's'}` : base;
}

function ProductsInner({ s }: { s: AppState }) {
  const branchId = s.session.branchId;
  const branch = branchName(s, branchId);
  const canEdit = can(s, 'catalog.edit');
  // ?q= (top-bar search) and ?cat= (Categories › View) open the list already filtered.
  const [q, setQ] = useState(() => urlParam('q') ?? '');
  const [cat, setCat] = useState(() => {
    const c = urlParam('cat');
    return c && s.categories.some((x) => x.id === c) ? c : 'all';
  });
  const [flag, setFlag] = useState<Flag | null>(null);
  const [sort, setSort] = useState<SortKey>('category');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);

  const tops = useMemo(() => topCategories(s), [s]);
  const all = useMemo<Row[]>(() => s.products.map((p, idx) => {
    const pi = getPriceInfo(s, p.id, branchId);
    const st = stockSummary(s, p.id, branchId);
    const sub = s.categories.find((c) => c.id === p.subcategoryId);
    return {
      p, idx, sub, top: s.categories.find((c) => c.id === p.categoryId),
      price: pi.price, override: pi.price !== p.basePrice, available: st.available,
      state: stockState(st.available, st.onHand, p.reorderPoint), online: isOnlineAt(p, branchId), photo: isPhoto(p.image),
    };
  }), [s, branchId]);

  const flagCount = (f: Flag) => all.filter((r) => matchesFlag(r, f)).length;
  const FLAGS: { key: Flag; title: string; sub: string; color: string }[] = [
    { key: 'out', title: 'Out of stock', sub: 'Customers can’t order these', color: '#c8151d' },
    { key: 'low', title: 'Low stock', sub: 'At or below reorder point', color: '#d9822b' },
    { key: 'hidden', title: 'Hidden from app', sub: `Switched off for ${branch}`, color: '#2a2322' },
    { key: 'override', title: 'Price overrides', sub: `${branch} price ≠ base price`, color: '#ae754d' },
    { key: 'nophoto', title: 'Missing photo', sub: 'Shows a blank tile in the app', color: '#8b2f6e' },
  ];

  const catObj = cat === 'all' ? undefined : s.categories.find((c) => c.id === cat);
  const activeTop = catObj ? (catObj.parentId ?? catObj.id) : 'all';
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const topSort = (r: Row) => r.top?.sort ?? 999;
    return all
      .filter((r) => {
        if (cat !== 'all' && r.p.categoryId !== cat && r.p.subcategoryId !== cat) return false;
        if (flag && !matchesFlag(r, flag)) return false;
        if (term && !`${r.p.name} ${r.p.brand} ${r.p.sku} ${r.p.barcode}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => sort === 'stock' ? (a.available - a.p.reorderPoint) - (b.available - b.p.reorderPoint) || a.available - b.available
        : sort === 'price' ? a.price - b.price
          : topSort(a) - topSort(b) || a.idx - b.idx);
  }, [all, cat, flag, q, sort]);
  const shown = rows.slice(0, limit);
  const groupCount = (topId?: string) => rows.filter((r) => r.p.categoryId === topId).length;
  const shownIds = shown.map((r) => r.p.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.includes(id));
  const someShownSelected = shownIds.some((id) => selected.includes(id));

  // Changing what the list shows starts again at the first page.
  const view = { q: (v: string) => { setQ(v); setLimit(PAGE); }, cat: (v: string) => { setCat(v); setLimit(PAGE); }, flag: (v: Flag) => { setFlag((f) => (f === v ? null : v)); setLimit(PAGE); } };
  const toggleSel = (id: string, on: boolean) => setSelected((xs) => (on ? [...xs.filter((x) => x !== id), id] : xs.filter((x) => x !== id)));

  function openNew() {
    const top = catObj ? (catObj.parentId ? s.categories.find((c) => c.id === catObj.parentId) : catObj) : tops[0];
    const kg = (top?.soldBy ?? 'kg') === 'kg';
    setIsNew(true);
    setEditing({
      id: uid('p'), sku: `SKU-${1001 + s.products.length}`, barcode: '', name: '', brand: '', categoryId: top?.id ?? '', subcategoryId: catObj?.parentId ? catObj.id : undefined,
      unit: kg ? 'kg' : top?.soldBy === 'pack' ? 'pack' : 'pc', size: kg ? 'per kg' : '1 pc', description: '', image: top?.icon ?? '🥩', basePrice: 0, costPrice: 0, soldByWeight: kg, tags: [],
      status: 'draft', tax: 'vat', aisle: top?.sort ?? 1, reorderPoint: kg ? 8 : 12, featured: false, storage: top?.coldChain === false ? 'shelf' : 'fresh', cutOptionIds: [],
    });
  }

  function duplicate(p: Product) {
    let sku = `${p.sku}-COPY`;
    for (let n = 2; s.products.some((x) => x.sku.toLowerCase() === sku.toLowerCase()); n++) sku = `${p.sku}-COPY${n}`;
    setIsNew(true);
    setEditing({ ...structuredClone(p), id: uid('p'), sku, barcode: '', name: `${p.name} (copy)`, status: 'draft', featured: false });
  }

  function setOnline(ids: string[], on: boolean) {
    const list = s.products.filter((p) => ids.includes(p.id) && isOnlineAt(p, branchId) !== on);
    if (!list.length) return toast.info(on ? 'Already shown in the app' : 'Already hidden from the app');
    mutate((d) => {
      for (const p of list) {
        const x = d.products.find((y) => y.id === p.id);
        if (!x) continue;
        x.tags = x.tags.filter((t) => t !== offlineTag(branchId));
        if (!on) x.tags.push(offlineTag(branchId));
      }
      addAudit(d, {
        module: 'Catalog', action: on ? 'Product online at branch' : 'Product offline at branch', branchId,
        detail: `${list.length === 1 ? `${list[0].name} (${list[0].sku})` : `${list.length} products: ${list.map((p) => p.name).join(', ').slice(0, 160)}`} · ${branchName(d, branchId)}`,
        oldValue: on ? 'Offline' : 'Online', newValue: on ? 'Online' : 'Offline',
      });
    });
    toast.success(list.length === 1 ? `${list[0].name} is now ${on ? 'shown in' : 'hidden from'} the app at ${branch}` : `${list.length} products ${on ? 'shown in' : 'hidden from'} the app at ${branch}`);
  }

  function setArchived(p: Product, archived: boolean) {
    const next: Product['status'] = archived ? 'discontinued' : 'active';
    mutate((d) => {
      const x = d.products.find((y) => y.id === p.id);
      if (!x) return;
      x.status = next;
      addAudit(d, { module: 'Catalog', action: archived ? 'Product archived' : 'Product restored', detail: `${p.name} (${p.sku})`, oldValue: p.status, newValue: next });
    });
    toast.success(archived ? `${p.name} archived` : `${p.name} restored`, { description: archived ? 'Marked discontinued. Restore it from the ⋯ menu.' : 'Status set to active.' });
  }

  const bulkOnline = (on: boolean) => { setOnline(selected, on); setSelected([]); };
  const edit = (p: Product) => { setIsNew(false); setEditing(p); };
  const rowProps = { s, canEdit, branch, selected, toggleSel, onEdit: edit, onDuplicate: duplicate, onOnline: (p: Product, on: boolean) => setOnline([p.id], on), onArchive: setArchived };

  return (
    <>
      <CatalogHeader tab="products" eyebrow={`Catalog · Prices & stock for ${branch}`}
        actions={<>
          <Link href="/catalog/import" className={outlineLinkClass}><ArrowDownUp className="w-4 h-4" {...ICON} />Import / export</Link>
          {canEdit && <RedButton onClick={openNew}><Plus className="w-4 h-4" />Add product</RedButton>}
        </>} />

      {/* Needs a look */}
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h2 className="text-xl text-[#1d1716]" style={OSWALD}>Needs a look</h2>
        <p className="text-xs text-gray-500">Tap to filter the list</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3 mb-5 md:mb-6">
        {FLAGS.map((f) => {
          const on = flag === f.key;
          return (
            <button key={f.key} type="button" aria-pressed={on} onClick={() => view.flag(f.key)}
              className={cn('flex items-center gap-3 rounded-xl border px-3 sm:px-4 py-3 text-left min-w-0 transition-colors',
                on ? 'border-[#c8151d] bg-[#fdf0ef] ring-1 ring-[#c8151d]' : 'border-[#eadfd6] bg-[#fffdfb] hover:border-[#d9c7b9]')}>
              <span className="text-3xl leading-none font-semibold tabular-nums shrink-0" style={{ ...OSWALD, color: f.color }}>{flagCount(f.key)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#1d1716] leading-tight">{f.title}</span>
                <span className="block text-xs text-gray-500 leading-snug mt-0.5">{f.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 items-start">
        {/* Categories: side panel (desktop) / chips (phones, tablets) */}
        <CatalogCard className="hidden lg:block p-3 lg:sticky lg:top-20">
          <p className="px-2 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400" style={OSWALD}>Categories</p>
          <CatButton active={activeTop === 'all'} onClick={() => view.cat('all')} label="All products" count={s.products.length} color="#2a2322" />
          {tops.map((c) => (
            <CatButton key={c.id} active={activeTop === c.id} onClick={() => view.cat(c.id)} label={c.name} count={s.products.filter((p) => p.categoryId === c.id).length} color={c.color ?? '#6f6764'} />
          ))}
        </CatalogCard>
        <div className="lg:hidden -mx-4 sm:mx-0 px-4 sm:px-0 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[{ id: 'all', name: 'All products', color: '#2a2322', n: s.products.length }, ...tops.map((c) => ({ id: c.id, name: c.name, color: c.color ?? '#6f6764', n: s.products.filter((p) => p.categoryId === c.id).length }))].map((c) => (
            <button key={c.id} type="button" onClick={() => view.cat(c.id)} aria-pressed={activeTop === c.id}
              className={cn('shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-full border text-sm whitespace-nowrap',
                activeTop === c.id ? 'border-[#c8151d] bg-[#fdf0ef] text-[#c8151d] font-semibold' : 'border-[#e3d6cc] bg-white text-[#1d1716]')}>
              <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.name}<span className="text-xs text-gray-400">{c.n}</span>
            </button>
          ))}
        </div>

        {/* List */}
        <CatalogCard className="overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-[#f0e8e2] space-y-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-0 basis-full sm:basis-64">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" {...ICON} />
                <input value={q} onChange={(e) => view.q(e.target.value)} placeholder="Search name, SKU or barcode" aria-label="Search name, SKU or barcode"
                  className="w-full h-11 rounded-xl border border-[#e3d6cc] bg-white pl-9 pr-9 text-sm outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10" />
                {q && <button type="button" onClick={() => view.q('')} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-gray-500">Sort</span>
                <div className="inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Sort products">
                  {SORTS.map((o) => (
                    <button key={o.key} type="button" aria-pressed={sort === o.key} onClick={() => setSort(o.key)}
                      className={cn('h-9 px-3 rounded-lg text-xs sm:text-sm whitespace-nowrap', sort === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{o.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-9">
              <label className="inline-flex items-center gap-2 text-sm text-[#1d1716] cursor-pointer select-none">
                <Checkbox checked={allShownSelected ? true : someShownSelected ? 'indeterminate' : false} disabled={!shownIds.length}
                  onCheckedChange={(v) => setSelected((xs) => (v === true ? Array.from(new Set([...xs, ...shownIds])) : xs.filter((x) => !shownIds.includes(x))))} />
                Select shown
              </label>
              <span className="text-sm text-gray-500">{rows.length} product{rows.length === 1 ? '' : 's'}</span>
              {catObj?.parentId && (
                <button type="button" onClick={() => view.cat(catObj.parentId!)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-[#f3ece6] text-xs font-medium text-[#1d1716]">
                  {categoryPath(s, catObj.id)}<X className="w-3.5 h-3.5" />
                </button>
              )}
              {flag && (
                <button type="button" onClick={() => setFlag(null)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-[#fdf0ef] text-xs font-medium text-[#c8151d]">
                  {FLAGS.find((f) => f.key === flag)?.title}<X className="w-3.5 h-3.5" />
                </button>
              )}
              {selected.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <span className="text-sm font-semibold text-[#1d1716]">{selected.length} selected</span>
                  {canEdit && <>
                    <button type="button" onClick={() => bulkOnline(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#e3d6cc] bg-white text-sm font-medium hover:bg-[#faf6f2]"><Eye className="w-4 h-4" {...ICON} />Show in app</button>
                    <button type="button" onClick={() => bulkOnline(false)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#e3d6cc] bg-white text-sm font-medium hover:bg-[#faf6f2]"><EyeOff className="w-4 h-4" {...ICON} />Hide from app</button>
                  </>}
                  <button type="button" onClick={() => setSelected([])} className="h-9 px-2 text-sm text-gray-500 hover:text-[#1d1716]">Clear</button>
                </div>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Package className="w-9 h-9 mx-auto text-gray-300" {...ICON} />
              <p className="mt-2 font-medium text-[#1d1716]">No products match these filters</p>
              <button type="button" onClick={() => { view.q(''); view.cat('all'); setFlag(null); }} className="mt-1 text-sm font-semibold text-[#c8151d] hover:underline">Clear filters</button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden xl:table w-full text-sm">
                <thead>
                  <tr className="bg-[#f6f0eb] text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="w-12 py-2.5 pl-4"><span className="sr-only">Select</span></th>
                    <th className="text-left font-semibold py-2.5">Product</th>
                    <th className="text-left font-semibold py-2.5 w-[130px]">SKU</th>
                    <th className="text-right font-semibold py-2.5 w-[170px]">{branch} price</th>
                    <th className="text-left font-semibold py-2.5 pl-6 w-[190px]">Stock</th>
                    <th className="text-center font-semibold py-2.5 w-[80px]">In app</th>
                    <th className="w-12 pr-3"><span className="sr-only">More</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <Fragment key={r.p.id}>
                      {sort === 'category' && (i === 0 || shown[i - 1].p.categoryId !== r.p.categoryId) && (
                        <tr className="border-t border-[#f0e8e2]">
                          <td colSpan={7} className="px-4 py-2 bg-[#fbf7f3]"><GroupLabel top={r.top} count={groupCount(r.p.categoryId)} /></td>
                        </tr>
                      )}
                      <TableRow r={r} {...rowProps} />
                    </Fragment>
                  ))}
                </tbody>
              </table>

              {/* Phone / tablet cards */}
              <ul className="xl:hidden">
                {shown.map((r, i) => (
                  <Fragment key={r.p.id}>
                    {sort === 'category' && (i === 0 || shown[i - 1].p.categoryId !== r.p.categoryId) && (
                      <li className="px-4 py-2 bg-[#fbf7f3] border-t border-[#f0e8e2]"><GroupLabel top={r.top} count={groupCount(r.p.categoryId)} /></li>
                    )}
                    <CardRow r={r} {...rowProps} />
                  </Fragment>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4 border-t border-[#f0e8e2]">
                <span className="text-sm text-gray-500">Showing {shown.length} of {rows.length}</span>
                {rows.length > shown.length && (
                  <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="h-10 px-4 rounded-xl border border-[#e3d6cc] bg-white text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]">
                    Show {Math.min(PAGE, rows.length - shown.length)} more
                  </button>
                )}
              </div>
            </>
          )}
        </CatalogCard>
      </div>

      {editing && <ProductDialog s={s} product={editing} isNew={isNew} onClose={() => setEditing(null)} />}
    </>
  );
}

function matchesFlag(r: Row, f: Flag) {
  return f === 'out' ? r.state === 'out' : f === 'low' ? r.state === 'low' : f === 'hidden' ? !r.online : f === 'override' ? r.override : !r.photo;
}

function CatButton({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('w-full flex items-center gap-2.5 rounded-lg px-2 h-10 text-sm text-left', active ? 'bg-[#fdf0ef] text-[#c8151d] font-semibold' : 'text-[#1d1716] hover:bg-[#faf6f2]')}>
      <span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: color }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-gray-400 font-normal">{count}</span>
    </button>
  );
}

function GroupLabel({ top, count }: { top?: Category; count: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#1d1716]">
      <span className="w-2 h-2 rounded-full" style={{ background: top?.color ?? '#6f6764' }} />{top?.name ?? 'Uncategorised'}<span className="text-gray-400 font-medium">{count}</span>
    </span>
  );
}

// ---------------- Row pieces ----------------
interface RowProps {
  r: Row; s: AppState; canEdit: boolean; branch: string; selected: string[];
  toggleSel: (id: string, on: boolean) => void; onEdit: (p: Product) => void; onDuplicate: (p: Product) => void;
  onOnline: (p: Product, on: boolean) => void; onArchive: (p: Product, archived: boolean) => void;
}

function Thumb({ r }: { r: Row }) {
  return r.photo ? (
    <span className="relative w-11 h-11 rounded-lg overflow-hidden bg-[#f6f0eb] shrink-0"><ProductImage image={r.p.image} fill alt="" /></span>
  ) : (
    <span className="w-11 h-11 rounded-lg border border-dashed border-red-200 bg-red-50 text-[#c8151d] flex items-center justify-center shrink-0" title="No photo"><ImageOff className="w-4 h-4" {...ICON} /></span>
  );
}

function ProductCell({ r }: { r: Row }) {
  const p = r.p;
  return (
    <div className="min-w-0">
      <p className={cn('font-semibold text-[#1d1716] flex items-center gap-1 min-w-0', !r.online && 'text-gray-500')}>
        <span className="truncate">{p.name}</span>
        {p.featured && <Star className="w-3.5 h-3.5 shrink-0 text-[#e0a33a] fill-[#e0a33a]" aria-label="Featured" />}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
        <span className="text-xs text-gray-500">{soldLine(p)}</span>
        {(!r.online || p.status === 'hidden') && <span className="rounded-full bg-[#f3ece6] px-2 py-px text-[11px] font-medium text-gray-600">Hidden</span>}
        {p.status === 'draft' && <span className="rounded-full bg-amber-50 px-2 py-px text-[11px] font-medium text-amber-800">Draft</span>}
        {p.status === 'discontinued' && <span className="rounded-full bg-stone-100 px-2 py-px text-[11px] font-medium text-stone-600">Archived</span>}
        {!r.photo && <span className="rounded-full bg-red-50 px-2 py-px text-[11px] font-semibold text-[#c8151d]">No photo</span>}
      </div>
    </div>
  );
}

function PriceCell({ r, canEdit, onEdit, align = 'right' }: { r: Row; canEdit: boolean; onEdit: (p: Product) => void; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className={cn('flex items-baseline gap-1', align === 'right' && 'justify-end')}>
        <span className="font-bold text-[#1d1716] tabular-nums">{peso(r.price)}</span>
        <span className="text-xs text-gray-400">{perUnit(r.p)}</span>
        {canEdit && (
          <button type="button" onClick={() => onEdit(r.p)} aria-label={`Edit price of ${r.p.name}`} className="self-center -my-2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-[#c8151d] hover:bg-[#faf6f2]">
            <Pencil className="w-3.5 h-3.5" {...ICON} />
          </button>
        )}
      </p>
      {r.override && <p className="text-[11px] text-[#ae754d]">Base {peso(r.p.basePrice)} · override</p>}
    </div>
  );
}

function StockCell({ r }: { r: Row }) {
  const pct = Math.max(r.state === 'out' ? 0 : 4, Math.min(100, (r.available / Math.max(20, r.p.reorderPoint * 5)) * 100));
  const tone = r.state === 'out' ? '#c8151d' : r.state === 'low' ? '#d9822b' : '#2e6b3a';
  return (
    <div className="min-w-0">
      <p className="text-sm whitespace-nowrap">
        <span className="font-bold tabular-nums" style={{ color: r.state === 'ok' ? '#1d1716' : tone }}>{qty(r.available)} {unitWord(r.p)}</span>{' '}
        <span className="text-xs" style={{ color: r.state === 'ok' ? '#8a7f7a' : tone }}>{r.state === 'out' ? 'out of stock' : r.state === 'low' ? `reorder at ${r.p.reorderPoint}` : 'in stock'}</span>
      </p>
      <div className="mt-1 h-1 rounded-full bg-[#efe7e0] w-full max-w-[140px]"><div className="h-1 rounded-full" style={{ width: `${pct}%`, background: tone }} /></div>
    </div>
  );
}

function RowMenu({ r, canEdit, onEdit, onDuplicate, onOnline, onArchive }: Pick<RowProps, 'r' | 'canEdit' | 'onEdit' | 'onDuplicate' | 'onOnline' | 'onArchive'>) {
  if (!canEdit) return null;
  const archived = r.p.status === 'discontinued';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`More actions for ${r.p.name}`} className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-[#f3ece6] hover:text-[#1d1716]">
          <MoreHorizontal className="w-5 h-5" {...ICON} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onEdit(r.p)}><Pencil /> Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicate(r.p)}><Copy /> Duplicate</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOnline(r.p, !r.online)}>{r.online ? <><EyeOff /> Hide from app</> : <><Eye /> Show in app</>}</DropdownMenuItem>
        <DropdownMenuSeparator />
        {archived
          ? <DropdownMenuItem onClick={() => onArchive(r.p, false)}><ArchiveRestore /> Restore</DropdownMenuItem>
          : <DropdownMenuItem variant="destructive" onClick={() => onArchive(r.p, true)}><Archive /> Archive</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TableRow(props: RowProps) {
  const { r, canEdit, selected, toggleSel, onEdit, onOnline } = props;
  const sel = selected.includes(r.p.id);
  return (
    <tr className={cn('border-t border-[#f0e8e2] align-middle', sel ? 'bg-[#fdf6f4]' : 'hover:bg-[#fbf7f3]')}>
      <td className="py-3 pl-4"><Checkbox checked={sel} onCheckedChange={(v) => toggleSel(r.p.id, v === true)} aria-label={`Select ${r.p.name}`} /></td>
      <td className="py-3 pr-3">
        <div className="flex items-center gap-3 min-w-0"><Thumb r={r} /><ProductCell r={r} /></div>
      </td>
      <td className="py-3"><p className="font-mono text-xs font-semibold text-[#1d1716]">{r.p.sku}</p><p className="font-mono text-[11px] text-gray-400">{r.p.barcode || '—'}</p></td>
      <td className="py-3"><PriceCell r={r} canEdit={canEdit} onEdit={onEdit} /></td>
      <td className="py-3 pl-6"><StockCell r={r} /></td>
      <td className="py-3 text-center"><GreenToggle checked={r.online} disabled={!canEdit} label={`${r.p.name} in app`} onChange={(v) => onOnline(r.p, v)} /></td>
      <td className="py-3 pr-3 text-right"><RowMenu {...props} /></td>
    </tr>
  );
}

function CardRow(props: RowProps) {
  const { r, canEdit, selected, toggleSel, onEdit, onOnline } = props;
  const sel = selected.includes(r.p.id);
  return (
    <li className={cn('border-t border-[#f0e8e2] px-3 sm:px-4 py-3 flex gap-3', sel && 'bg-[#fdf6f4]')}>
      <div className="pt-3.5"><Checkbox checked={sel} onCheckedChange={(v) => toggleSel(r.p.id, v === true)} aria-label={`Select ${r.p.name}`} /></div>
      <Thumb r={r} />
      <div className="flex-1 min-w-0">
        <ProductCell r={r} />
        <p className="font-mono text-[11px] text-gray-400 mt-0.5 truncate">{r.p.sku}{r.p.barcode ? ` · ${r.p.barcode}` : ''}</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <PriceCell r={r} canEdit={canEdit} onEdit={onEdit} align="left" />
          <StockCell r={r} />
        </div>
      </div>
      <div className="flex flex-col items-end justify-between gap-2 shrink-0">
        <RowMenu {...props} />
        <GreenToggle checked={r.online} disabled={!canEdit} label={`${r.p.name} in app`} onChange={(v) => onOnline(r.p, v)} />
      </div>
    </li>
  );
}

// ---------------- Add / Edit product ----------------
function ProductDialog({ s, product, isNew, onClose }: { s: AppState; product: Product; isNew: boolean; onClose: () => void }) {
  const [f, setF] = useState<Product>({ ...product, tags: [...product.tags], storage: product.storage ?? 'shelf' });
  const [tagText, setTagText] = useState(visibleTags(product).join(', '));
  const [weightText, setWeightText] = useState((product.weightChoices ?? [0.5, 1, 1.5, 2]).map(fmtKg).join(', '));
  const cutIds = f.cutOptionIds ?? [];
  const toggleCut = (id: string, on: boolean) => setF((x) => {
    const cur = x.cutOptionIds ?? [];
    return { ...x, cutOptionIds: on ? [...cur.filter((c) => c !== id), id] : cur.filter((c) => c !== id) };
  });
  const tops = topCategories(s);
  const subs = subcategoriesOf(s, f.categoryId);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setF((x) => ({ ...x, [k]: v }));
  const margin = f.basePrice > 0 ? ((f.basePrice - f.costPrice) / f.basePrice) * 100 : 0;

  function save() {
    if (!f.name.trim()) return toast.error('Product name is required');
    if (!f.sku.trim()) return toast.error('SKU is required');
    if (s.products.some((p) => p.sku.toLowerCase() === f.sku.trim().toLowerCase() && p.id !== f.id)) return toast.error(`SKU ${f.sku} already exists`);
    if (!(f.basePrice > 0)) return toast.error('Base price must be greater than zero');
    let weightChoices: number[] | undefined;
    let minWeightKg: number | undefined;
    if (f.soldByWeight) {
      const parts = weightText.split(',').map((x) => x.trim()).filter(Boolean);
      const nums = parts.map(Number);
      if (!parts.length) return toast.error('Add at least one weight choice (kg), e.g. 0.5, 1, 1.5, 2');
      if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return toast.error('Weight choices must be numbers above 0 (kg), separated by commas');
      weightChoices = Array.from(new Set(nums.map((n) => Math.round(n * 1000) / 1000))).sort((a, b) => a - b);
      minWeightKg = f.minWeightKg && f.minWeightKg > 0 ? f.minWeightKg : undefined;
      if (minWeightKg && weightChoices.some((w) => w < minWeightKg!)) return toast.error(`Weight choices cannot be below the minimum weight (${fmtKg(minWeightKg)} kg)`);
    }
    if (isNew && !guardLimit('products')) return;
    const offline = f.tags.filter((t) => t.startsWith('offline:'));
    const tags = [...tagText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), ...offline];
    const subOk = f.subcategoryId && s.categories.some((c) => c.id === f.subcategoryId && c.parentId === f.categoryId);
    const next: Product = {
      ...f, sku: f.sku.trim(), name: f.name.trim(), tags, estWeightKg: f.soldByWeight ? f.estWeightKg || 1 : undefined,
      weightChoices, minWeightKg, cutOptionIds: cutIds.length ? cutIds : undefined, subcategoryId: subOk ? f.subcategoryId : undefined,
    };
    mutate((d) => {
      if (isNew) {
        d.products.push(next);
        addAudit(d, { module: 'Catalog', action: 'Product created', detail: `${next.name} (${next.sku}) · ${categoryPath(d, next.subcategoryId ?? next.categoryId)}`, newValue: `${peso(next.basePrice)} · ${next.status}` });
      } else {
        const i = d.products.findIndex((p) => p.id === next.id);
        if (i < 0) return;
        const old = d.products[i];
        const changed = (Object.keys(next) as (keyof Product)[]).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(next[k]));
        d.products[i] = next;
        if (old.basePrice !== next.basePrice) {
          addAudit(d, { module: 'Pricing', action: 'Base price changed', detail: `${next.name} (${next.sku})`, oldValue: peso(old.basePrice), newValue: peso(next.basePrice) });
        }
        if (changed.length) {
          addAudit(d, {
            module: 'Catalog', action: 'Product updated', detail: `${next.name} (${next.sku}) · ${changed.join(', ')}`,
            oldValue: changed.map((k) => `${k}: ${String(old[k] ?? '—')}`).join('; ').slice(0, 200),
            newValue: changed.map((k) => `${k}: ${String(next[k] ?? '—')}`).join('; ').slice(0, 200),
          });
        }
      }
    });
    toast.success(isNew ? `${next.name} added to the catalog` : `${next.name} saved`);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add product' : `Edit ${product.name}`}</DialogTitle>
          <DialogDescription>Master catalog record — shared by every branch. Prices per branch come from price lists.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Photo" className="sm:col-span-4">
            <PhotoField value={f.image} fallbackEmoji={s.categories.find((c) => c.id === f.categoryId)?.icon ?? '🥩'} onChange={(v) => set('image', v)} />
          </Field>
          <Field label="Product name" className="sm:col-span-2"><input className={inputClass} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Pork Liempo" /></Field>
          <Field label="Brand"><input className={inputClass} value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
          <Field label="SKU"><input className={cn(inputClass, 'font-mono')} value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
          <Field label="Barcode"><input className={cn(inputClass, 'font-mono')} value={f.barcode} onChange={(e) => set('barcode', e.target.value)} /></Field>
          <Field label="Category">
            <select className={selectClass} value={f.categoryId} onChange={(e) => setF((x) => ({ ...x, categoryId: e.target.value, subcategoryId: undefined }))}>
              {tops.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </Field>
          <Field label="Subcategory">
            <select className={selectClass} value={f.subcategoryId ?? ''} onChange={(e) => set('subcategoryId', e.target.value || undefined)} disabled={!subs.length}>
              <option value="">{subs.length ? '— None —' : 'No subcategories'}</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.hidden ? ' (hidden)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Unit of measure">
            <select className={selectClass} value={f.unit} onChange={(e) => set('unit', e.target.value as UnitOfMeasure)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Pack size"><input className={inputClass} value={f.size} onChange={(e) => set('size', e.target.value)} placeholder="1 L, 500 g" /></Field>
          <Field label={f.soldByWeight ? 'Base price (per kg)' : 'Base price'}><input type="number" step="0.25" className={inputClass} value={f.basePrice} onChange={(e) => set('basePrice', Number(e.target.value))} /></Field>
          <Field label="Cost price" hint={`Margin ${margin.toFixed(1)}%`}><input type="number" step="0.25" className={inputClass} value={f.costPrice} onChange={(e) => set('costPrice', Number(e.target.value))} /></Field>
          <Field label="Compare-at price" hint="Optional markdown display"><input type="number" className={inputClass} value={f.compareAt ?? ''} onChange={(e) => set('compareAt', e.target.value ? Number(e.target.value) : undefined)} /></Field>
          <Field label="Tax">
            <select className={selectClass} value={f.tax} onChange={(e) => set('tax', e.target.value as TaxType)}>
              {(Object.keys(TAX_LABEL) as TaxType[]).map((t) => <option key={t} value={t}>{TAX_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="Storage" hint="Drives the label, packing and cold-chain rules">
            <select className={selectClass} value={f.storage ?? 'shelf'} onChange={(e) => set('storage', e.target.value as StorageType)}>
              {(Object.keys(STORAGE_LABEL) as StorageType[]).map((k) => <option key={k} value={k}>{STORAGE_LABEL[k]}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectClass} value={f.status} onChange={(e) => set('status', e.target.value as Product['status'])}>
              {STATUSES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Reorder point"><input type="number" className={inputClass} value={f.reorderPoint} onChange={(e) => set('reorderPoint', Number(e.target.value))} /></Field>
          <Field label="Aisle (pick order)"><input type="number" className={inputClass} value={f.aisle} onChange={(e) => set('aisle', Number(e.target.value))} /></Field>
          <Field label="Supplier" className="sm:col-span-2">
            <select className={selectClass} value={f.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value || undefined)}>
              <option value="">—</option>
              {s.suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Tags" className="sm:col-span-4" hint="Comma separated: organic, halal, frozen, chilled, imported, local, allergen: nuts…">
            <input className={inputClass} value={tagText} onChange={(e) => setTagText(e.target.value)} />
          </Field>
          <Field label="Description" className="sm:col-span-4"><Textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="sm:col-span-4 rounded-lg bg-gray-50 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Toggle checked={f.soldByWeight} onChange={(v) => set('soldByWeight', v)} label="Sold by weight (final price at weighing)" />
              <Toggle checked={!!f.featured} onChange={(v) => set('featured', v)} label="Featured product" />
            </div>
            {f.soldByWeight && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Weight choices (kg)" className="sm:col-span-2" hint="Comma separated, shown as buttons in the Customer App">
                  <input className={inputClass} value={weightText} onChange={(e) => setWeightText(e.target.value)} placeholder="0.5, 1, 1.5, 2" />
                </Field>
                <Field label="Minimum weight (kg)" hint="Smallest amount a customer may order">
                  <input type="number" step="0.05" min="0" className={inputClass} value={f.minWeightKg ?? ''} onChange={(e) => set('minWeightKg', e.target.value ? Number(e.target.value) : undefined)} placeholder="0.25" />
                </Field>
                <Field label="Est. weight per piece (kg)">
                  <input type="number" step="0.05" className={inputClass} value={f.estWeightKg ?? 1} onChange={(e) => set('estWeightKg', Number(e.target.value))} />
                </Field>
              </div>
            )}
          </div>
          <div className="sm:col-span-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-gray-600">Cut &amp; preparation options <span className="text-gray-400 font-normal">({cutIds.length} selected)</span></p>
              <p className="text-[11px] text-gray-400">Manage the list in the Cuts &amp; prep options tab</p>
            </div>
            {s.cutOptions.length === 0 ? (
              <p className="text-xs text-gray-400">No cut options yet.</p>
            ) : (
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-2">
                {s.cutOptions.map((c) => (
                  <label key={c.id} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer', cutIds.includes(c.id) ? 'border-[#c8151d]/40 bg-red-50/60' : 'border-gray-200', !c.active && 'opacity-60')}>
                    <input type="checkbox" className="accent-[#c8151d] w-4 h-4 shrink-0" checked={cutIds.includes(c.id)} onChange={(e) => toggleCut(c.id, e.target.checked)} />
                    <span className="flex-1 min-w-0 truncate">{c.name}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">{cutFeeText(c) || 'free'}{!c.active && ' · off'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Online availability per branch</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {s.branches.map((b) => {
                const on = !f.tags.includes(offlineTag(b.id));
                return (
                  <div key={b.id} className="rounded-lg border border-gray-200 px-3 py-2">
                    <Toggle checked={on} onChange={(v) => setF((x) => ({ ...x, tags: v ? x.tags.filter((t) => t !== offlineTag(b.id)) : [...x.tags, offlineTag(b.id)] }))} label={<span className="text-xs">{b.name}</span>} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{isNew ? 'Create product' : 'Save changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
