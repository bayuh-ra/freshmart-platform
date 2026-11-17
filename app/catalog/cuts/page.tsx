'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Clock, Minus, Plus, Slice, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { can, cutFeeText } from '@/src/lib/logic';
import type { AppState, Category, CutFeeType, CutOption, Product } from '@/src/lib/types';
import { topCategories } from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { CatalogCard, CatalogHeader, CardHeading, GreenToggle, ICON, OSWALD, OutlineButton, RedButton, fieldClass } from '../_ui';

const CRUMBS = [{ label: 'Catalog' }, { label: 'Products', href: '/catalog/products' }, { label: 'Cuts & prep options' }];
const MAX_PREP = 60;
const PREVIEW_MAX = 5;

/** "Processed Meats" → "Processed" for pills and chips. */
const shortName = (c: Category) => c.name.replace(/\s+Meats?$/i, '');
/** Categories an option is offered on (no list = every category). */
const offeredOn = (c: CutOption, catId: string) => !c.categoryIds || c.categoryIds.includes(catId);

export default function CutsPage() {
  const s = useStore();
  return (
    <DashboardLayout title="Cuts & prep options" crumbs={CRUMBS}>
      {can(s, 'catalog.view') ? <CutsInner s={s} /> : <AccessDenied permission="catalog.view" />}
    </DashboardLayout>
  );
}

function CutsInner({ s }: { s: AppState }) {
  const canEdit = can(s, 'catalog.edit');
  const options = s.cutOptions;
  // Meat categories (cold chain) plus any other category an option is offered on.
  const cats = topCategories(s).filter((c) => c.coldChain || options.some((o) => o.categoryIds?.includes(c.id)));
  const [filter, setFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState(() => options[0]?.id ?? '');
  const [resetKey, setResetKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const selected = options.find((c) => c.id === selectedId) ?? options[0];
  const usedBy = (id: string) => s.products.filter((p) => p.cutOptionIds?.includes(id));
  const shown = filter === 'all' ? options : options.filter((o) => offeredOn(o, filter));
  const catNames = (o: CutOption) => {
    const ids = o.categoryIds ?? [...new Set(usedBy(o.id).map((p) => p.categoryId))];
    return topCategories(s).filter((c) => ids.includes(c.id)).map(shortName).join(', ');
  };

  function select(id: string) {
    setSelectedId(id);
    // Phones/tablets: the editor sits under the list, so bring it into view.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  }

  function addOption() {
    if (!canEdit) return;
    const id = uid('co');
    const base = 'New cut option';
    let name = base;
    for (let n = 2; options.some((o) => o.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;
    const categoryIds = filter !== 'all' ? [filter] : [];
    mutate((d) => {
      d.cutOptions.push({ id, name, fee: 0, feeType: 'free', prepMins: 0, categoryIds, active: true });
      addAudit(d, { module: 'Catalog', action: 'Cut option created', detail: name });
    });
    select(id);
    toast.success('Cut option added', { description: 'Name it, pick where it is offered and save. Tick it on products in their Edit form.' });
  }

  return (
    <>
      <CatalogHeader tab="cuts" eyebrow="Catalog · Cut & prep options"
        actions={canEdit && <RedButton onClick={addOption}><Plus className="w-4 h-4" {...ICON} />New cut option</RedButton>} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px] gap-4 md:gap-5 items-start">
        {/* Option list */}
        <CatalogCard className="overflow-hidden @container">
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-4">
            <CardHeading>Cut &amp; prep options</CardHeading>
            <p className="text-sm text-gray-500 mt-0.5">Shoppers pick one on the product page. The longest extra prep time in an order is added to its prep target.</p>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              <FilterPill active={filter === 'all'} label="All" count={options.length} onClick={() => setFilter('all')} />
              {cats.map((c) => (
                <FilterPill key={c.id} active={filter === c.id} label={shortName(c)} count={options.filter((o) => offeredOn(o, c.id)).length} onClick={() => setFilter(c.id)} />
              ))}
            </div>
          </div>
          {shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-gray-500 border-t border-[#f0e8e2]">No cut options offered on this category yet.</p>}
          <ul>
            {shown.map((o) => {
              const sel = selected?.id === o.id;
              const n = usedBy(o.id).length;
              const where = catNames(o);
              return (
                <li key={o.id} className="border-t border-[#f0e8e2]">
                  <button type="button" onClick={() => select(o.id)} aria-current={sel || undefined}
                    className={cn('w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left border-l-[3px] transition-colors',
                      sel ? 'bg-[#fdf0ef] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#fbf7f3]')}>
                    <span className={cn('w-10 h-10 rounded-full shrink-0 flex items-center justify-center', o.active ? 'bg-[#fdecec] text-[#c8151d]' : 'bg-[#f1ece8] text-gray-400')}>
                      <Slice className="w-[18px] h-[18px]" {...ICON} />
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col gap-2 @lg:flex-row @lg:items-center @lg:gap-4">
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cn('font-semibold break-words', o.active ? 'text-[#1d1716]' : 'text-gray-400')}>{o.name}</span>
                          {!o.active && <span className="rounded-md bg-[#f1ece8] px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">Off</span>}
                        </span>
                        <span className={cn('block text-[13px] mt-0.5', o.active ? 'text-gray-500' : 'text-gray-400')}>
                          Used by {n} product{n === 1 ? '' : 's'}{where ? ` · ${where}` : ''}
                        </span>
                      </span>
                      <span className={cn('flex flex-wrap items-center gap-1.5 shrink-0 @lg:justify-end', !o.active && 'opacity-70')}>
                        <PriceChip o={o} />
                        <TimeChip mins={o.prepMins ?? 0} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CatalogCard>

        {/* Editor */}
        <div ref={editorRef} className="scroll-mt-20 lg:sticky lg:top-20 min-w-0">
          {selected ? (
            <Editor key={`${selected.id}-${resetKey}`} s={s} opt={selected} cats={cats} canEdit={canEdit} usedBy={usedBy(selected.id)}
              onCancel={() => setResetKey((k) => k + 1)}
              onDeleted={() => setSelectedId(options.find((o) => o.id !== selected.id)?.id ?? '')} />
          ) : (
            <CatalogCard className="p-5 text-sm text-gray-500">No cut options yet. Add Cubed, Sliced thin, For adobo…</CatalogCard>
          )}
        </div>
      </div>
    </>
  );
}

function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors',
        active ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#e3d6cc] text-[#1d1716] hover:bg-[#faf6f2]')}>
      {label}<span className={cn('font-medium tabular-nums', active ? 'text-white/70' : 'text-gray-400')}>{count}</span>
    </button>
  );
}

function PriceChip({ o }: { o: Pick<CutOption, 'fee' | 'feeType'> }) {
  const fee = cutFeeText(o);
  return fee
    ? <span className="rounded-full bg-[#f8ece3] px-2.5 py-1 text-xs font-semibold text-[#9a6440] whitespace-nowrap tabular-nums">{fee}</span>
    : <span className="rounded-full bg-[#e7f3ea] px-2.5 py-1 text-xs font-semibold text-[#2e6b3a] whitespace-nowrap">Free</span>;
}

function TimeChip({ mins }: { mins: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f3ede8] px-2.5 py-1 text-xs font-semibold text-[#3d3432] whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 text-gray-500" {...ICON} />{mins > 0 ? `+${mins} min` : 'No extra time'}
    </span>
  );
}

// ---------------- Editor ----------------
interface Draft { name: string; instructions: string; feeType: CutFeeType; fee: string; prepMins: number; categoryIds: string[]; active: boolean }
const FEE_TYPES: { key: CutFeeType; label: string }[] = [
  { key: 'free', label: 'Free' },
  { key: 'kg', label: 'Per kg' },
  { key: 'piece', label: 'Per piece' },
];
const FIELD_LABEL: Record<keyof Draft, string> = {
  name: 'name', instructions: 'picker instructions', feeType: 'price type', fee: 'price', prepMins: 'extra prep time', categoryIds: 'offered on', active: 'offered to shoppers',
};

function draftOf(o: CutOption, used: Product[]): Draft {
  // Older options had a flat fee per order line and no type: show them as per piece (one charge per line for weighed items).
  const feeType: CutFeeType = o.feeType ?? (o.fee > 0 ? 'piece' : 'free');
  return {
    name: o.name, instructions: o.instructions ?? '', feeType, fee: feeType === 'free' ? '' : String(o.fee),
    prepMins: o.prepMins ?? 0, categoryIds: o.categoryIds ?? [...new Set(used.map((p) => p.categoryId))], active: o.active,
  };
}
/** Comparable value of a draft field (fee only matters when it is charged; category order does not matter). */
function norm(d: Draft, k: keyof Draft): string {
  if (k === 'fee') return d.feeType === 'free' ? '' : String(Number(d.fee || 0));
  if (k === 'categoryIds') return [...d.categoryIds].sort().join(',');
  if (k === 'name' || k === 'instructions') return d[k].trim();
  return String(d[k]);
}

function Editor({ s, opt, cats, canEdit, usedBy, onCancel, onDeleted }: {
  s: AppState; opt: CutOption; cats: Category[]; canEdit: boolean; usedBy: Product[]; onCancel: () => void; onDeleted: () => void;
}) {
  const original = draftOf(opt, usedBy);
  const [d, setD] = useState<Draft>(original);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const changed = (Object.keys(original) as (keyof Draft)[]).filter((k) => norm(d, k) !== norm(original, k));
  const dirty = changed.length > 0;
  const toggleCat = (id: string) => set('categoryIds', d.categoryIds.includes(id) ? d.categoryIds.filter((x) => x !== id) : [...d.categoryIds, id]);
  const catName = (id: string) => { const c = s.categories.find((x) => x.id === id); return c ? shortName(c) : id; };

  function save() {
    const name = d.name.trim();
    if (!name) return toast.error('Name is required');
    if (s.cutOptions.some((c) => c.id !== opt.id && c.name.toLowerCase() === name.toLowerCase())) return toast.error(`“${name}” already exists`);
    const amount = d.feeType === 'free' ? 0 : Number(d.fee);
    if (d.feeType !== 'free' && (!Number.isFinite(amount) || amount <= 0)) return toast.error('Enter the add-on amount, or choose Free');
    if (d.categoryIds.length === 0) return toast.error('Offer it on at least one category');
    const show = (k: keyof Draft, x: Draft) => {
      if (k === 'fee' || k === 'feeType') return cutFeeText({ fee: Number(x.fee || 0), feeType: x.feeType }) || 'Free';
      if (k === 'prepMins') return `+${x.prepMins} min`;
      if (k === 'categoryIds') return x.categoryIds.map(catName).join(', ') || '—';
      if (k === 'active') return x.active ? 'on' : 'off';
      return x[k].trim() || '—';
    };
    const keys = changed.filter((k) => !(k === 'fee' && changed.includes('feeType')));
    mutate((draft) => {
      const x = draft.cutOptions.find((c) => c.id === opt.id);
      if (!x) return;
      x.name = name;
      x.instructions = d.instructions.trim() || undefined;
      x.feeType = d.feeType;
      x.fee = amount;
      x.prepMins = d.prepMins;
      x.categoryIds = topCategories(s).filter((c) => d.categoryIds.includes(c.id)).map((c) => c.id);
      x.active = d.active;
      addAudit(draft, {
        module: 'Catalog',
        action: changed.length === 1 && changed[0] === 'active' ? (d.active ? 'Cut option turned on' : 'Cut option turned off') : 'Cut option updated',
        detail: `${name} · used by ${usedBy.length} product(s) · ${keys.map((k) => FIELD_LABEL[k]).join(', ')}`,
        oldValue: keys.map((k) => `${FIELD_LABEL[k]}: ${show(k, original)}`).join('; ').slice(0, 200),
        newValue: keys.map((k) => `${FIELD_LABEL[k]}: ${show(k, d)}`).join('; ').slice(0, 200),
      });
    });
    setD((x) => ({ ...x, name, instructions: x.instructions.trim(), fee: x.feeType === 'free' ? '' : String(amount) }));
    toast.success(`${name} saved`, {
      description: d.active !== original.active ? (d.active ? 'Shoppers can pick it again.' : 'Hidden for new orders; existing orders keep it.') : undefined,
    });
  }

  /** Delete the option: removed from every product's cut list. Past orders keep the cut name and fee they were saved with. */
  function remove() {
    const n = usedBy.length;
    if (!window.confirm(`Delete “${opt.name}”?${n ? ` It will be removed from ${n} product${n === 1 ? '' : 's'}.` : ''} Past orders keep it. This cannot be undone.`)) return;
    mutate((draft) => {
      draft.cutOptions = draft.cutOptions.filter((c) => c.id !== opt.id);
      for (const p of draft.products) if (p.cutOptionIds?.includes(opt.id)) p.cutOptionIds = p.cutOptionIds.filter((x) => x !== opt.id);
      // Cart lines with this cut go back to "Choose cut" (merged into a matching no-cut line if one exists).
      for (const l of draft.cart.filter((c) => c.cutId === opt.id)) {
        const twin = draft.cart.find((c) => c !== l && c.productId === l.productId && !c.cutId);
        if (twin) {
          if (twin.weightKg !== undefined && l.weightKg !== undefined) twin.weightKg += l.weightKg; else twin.qty += l.qty;
          draft.cart = draft.cart.filter((c) => c !== l);
        } else l.cutId = undefined;
      }
      addAudit(draft, { module: 'Catalog', action: 'Cut option deleted', detail: `${opt.name} · removed from ${n} product(s)` });
    });
    toast.success(`Deleted ${opt.name}`);
    onDeleted();
  }

  return (
    <CatalogCard className="p-4 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ae754d]">Cut option · Used by {usedBy.length} product{usedBy.length === 1 ? '' : 's'}</p>
      <h2 className="mt-1 text-3xl leading-tight text-[#1d1716] break-words" style={OSWALD}>{d.name.trim() || 'Untitled'}</h2>

      <div className="mt-5 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold text-[#1d1716]">Name shoppers see</span>
          <input className={cn(fieldClass, 'mt-1.5 h-12')} value={d.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#1d1716]">Instructions for pickers</span>
          <textarea rows={3} value={d.instructions} disabled={!canEdit} onChange={(e) => set('instructions', e.target.value)} placeholder="Shown next to the cut on the pick list"
            className="mt-1.5 w-full rounded-xl border border-[#e3d6cc] bg-white px-3 py-2.5 text-[15px] text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb]" />
        </label>

        <div>
          <p className="text-sm font-semibold text-[#1d1716]">Price add-on</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Price add-on type">
              {FEE_TYPES.map((o) => (
                <button key={o.key} type="button" disabled={!canEdit} aria-pressed={d.feeType === o.key} onClick={() => set('feeType', o.key)}
                  className={cn('h-10 px-3 rounded-lg text-sm whitespace-nowrap', d.feeType === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{o.label}</button>
              ))}
            </div>
            <label className={cn('flex items-center h-12 w-[150px] rounded-xl border border-[#e3d6cc] bg-white px-3 focus-within:border-[#c8151d]/50 focus-within:ring-4 focus-within:ring-[#c8151d]/10', d.feeType === 'free' && 'bg-[#f6f0eb]')}>
              <span className="text-[15px] font-semibold text-gray-500">₱</span>
              <input type="number" inputMode="decimal" min="0" step="1" aria-label="Add-on amount" disabled={!canEdit || d.feeType === 'free'}
                value={d.feeType === 'free' ? '' : d.fee} placeholder={d.feeType === 'free' ? '0' : ''} onChange={(e) => set('fee', e.target.value)}
                className="flex-1 min-w-0 bg-transparent px-1.5 text-[17px] font-semibold text-[#1d1716] outline-none disabled:text-gray-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="text-sm text-gray-500">{d.feeType === 'piece' ? '/pc' : '/kg'}</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1d1716]">Extra prep time</p>
            <p className="text-xs text-gray-500 mt-0.5">Added to the order&apos;s prep target</p>
          </div>
          <div className="flex items-center h-12 rounded-xl border border-[#e3d6cc] bg-white">
            <button type="button" aria-label="1 minute less" disabled={!canEdit || d.prepMins <= 0} onClick={() => set('prepMins', Math.max(0, d.prepMins - 1))}
              className="w-12 h-full flex items-center justify-center text-[#1d1716] disabled:text-gray-300"><Minus className="w-4 h-4" {...ICON} /></button>
            <span className="min-w-[88px] text-center text-2xl text-[#1d1716] tabular-nums" style={OSWALD} aria-live="polite">+{d.prepMins} min</span>
            <button type="button" aria-label="1 minute more" disabled={!canEdit || d.prepMins >= MAX_PREP} onClick={() => set('prepMins', Math.min(MAX_PREP, d.prepMins + 1))}
              className="w-12 h-full flex items-center justify-center text-[#1d1716] disabled:text-gray-300"><Plus className="w-4 h-4" {...ICON} /></button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[#1d1716]">Offer on</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {cats.map((c) => {
              const on = d.categoryIds.includes(c.id);
              return (
                <button key={c.id} type="button" disabled={!canEdit} aria-pressed={on} onClick={() => toggleCat(c.id)}
                  className={cn('inline-flex items-center gap-1.5 h-11 px-4 rounded-full border text-sm font-semibold transition-colors disabled:opacity-60',
                    on ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#e3d6cc] text-[#1d1716] hover:bg-[#faf6f2]')}>
                  {on ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Plus className="w-4 h-4" {...ICON} />}{shortName(c)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-[#f6f0eb] px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1d1716]">Offered to shoppers</p>
            <p className="text-xs text-gray-500 mt-0.5">Turn off to stop new orders using it; existing orders keep it</p>
          </div>
          <GreenToggle checked={d.active} disabled={!canEdit} label="Offered to shoppers" onChange={(v) => set('active', v)} />
        </div>

        <Preview s={s} opt={opt} d={d} />
      </div>

      {canEdit ? (
        <div className="mt-6 pt-4 border-t border-[#f0e8e2] flex flex-wrap justify-end gap-2">
          <OutlineButton className="mr-auto text-[#c8151d] hover:bg-red-50" onClick={remove}><Trash2 className="w-4 h-4" {...ICON} />Delete</OutlineButton>
          <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
          <RedButton disabled={!dirty} onClick={save}>Save changes</RedButton>
        </div>
      ) : (
        <p className="mt-4 text-xs text-amber-700">Read only: your role is missing catalog.edit.</p>
      )}
    </CatalogCard>
  );
}

/** How the product page shows the options, using the unsaved draft for this option. */
function Preview({ s, opt, d }: { s: AppState; opt: CutOption; d: Draft }) {
  const draftOpt: CutOption = { ...opt, name: d.name.trim() || 'Untitled', feeType: d.feeType, fee: d.feeType === 'free' ? 0 : Number(d.fee) || 0, categoryIds: d.categoryIds, active: d.active };
  const catId = topCategories(s).find((c) => d.categoryIds.includes(c.id))?.id;
  // Sample product: the one with the most cut options in the first offered category (Beef Brisket for beef).
  const product = catId
    ? s.products.filter((p) => p.categoryId === catId && p.status === 'active').reduce<Product | undefined>((best, p) => ((p.cutOptionIds?.length ?? 0) > (best?.cutOptionIds?.length ?? 0) ? p : best), undefined)
      ?? s.products.find((p) => p.categoryId === catId)
    : undefined;
  let list = catId ? s.cutOptions.map((c) => (c.id === opt.id ? draftOpt : c)).filter((c) => c.active && offeredOn(c, catId)) : [];
  if (list.length > PREVIEW_MAX) {
    const mine = list.find((c) => c.id === opt.id);
    list = list.slice(0, PREVIEW_MAX);
    if (mine && !list.includes(mine)) list = [...list.slice(0, PREVIEW_MAX - 1), mine];
  }

  return (
    <div className="rounded-xl bg-[#f6f0eb] p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">In the app</p>
        {product && <p className="text-sm font-semibold text-[#1d1716] truncate">{product.name}</p>}
      </div>
      {!catId || !product ? (
        <p className="mt-2 px-1 text-sm text-gray-500">Offer it on a category to see how shoppers pick it.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label={`Cut choices for ${product.name}`}>
          {list.map((c) => {
            const on = c.id === opt.id;
            return (
              <li key={c.id} className={cn('flex items-center gap-3 rounded-xl border bg-white px-3 sm:px-4 h-12', on ? 'border-[#d6202a] ring-1 ring-[#d6202a]' : 'border-[#eadfd6]')}>
                <span className={cn('w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center', on ? 'border-[#d6202a]' : 'border-[#cfc3ba]')} aria-hidden>
                  {on && <span className="w-2.5 h-2.5 rounded-full bg-[#d6202a]" />}
                </span>
                <span className="flex-1 min-w-0 truncate text-[15px] text-[#1d1716]">{c.name}</span>
                <span className={cn('text-sm shrink-0 tabular-nums', cutFeeText(c) ? 'font-semibold text-[#c8151d]' : 'text-gray-500')}>{cutFeeText(c) || 'Free'}</span>
              </li>
            );
          })}
          {!d.active && <li className="px-1 text-xs text-gray-500">{d.name.trim() || 'This option'} is off, so shoppers don&apos;t see it.</li>}
        </ul>
      )}
    </div>
  );
}
