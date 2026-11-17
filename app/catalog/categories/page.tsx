'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Package, Plus, Trash2, Upload } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { can } from '@/src/lib/logic';
import type { AppState, Category } from '@/src/lib/types';
import { CATEGORY_COLORS, categoryPath, subcategoriesOf, topCategories } from '@/src/components/catalog/shared';
import { fileToPhoto } from '@/src/components/catalog/PhotoField';
import { ProductImage, isPhoto } from '@/src/components/ProductImage';
import { cn } from '@/src/lib/utils';
import { CardHeading, CatalogCard, CatalogHeader, GreenToggle, ICON, OSWALD, OutlineButton, RedButton, fieldClass, stripes } from '../_ui';

const CRUMBS = [{ label: 'Catalog' }, { label: 'Products', href: '/catalog/products' }, { label: 'Categories' }];
type SoldBy = NonNullable<Category['soldBy']>;
const SOLD_BY: { key: SoldBy; label: string; meta: string }[] = [
  { key: 'kg', label: 'By kg', meta: 'sold by kg' },
  { key: 'pack', label: 'Per pack', meta: 'per pack' },
  { key: 'piece', label: 'Per piece', meta: 'per piece' },
];
const GREY = '#6f6764';

export default function CategoriesPage() {
  const s = useStore();
  return (
    <DashboardLayout title="Categories" crumbs={CRUMBS}>
      {can(s, 'catalog.view') ? <CategoriesInner s={s} /> : <AccessDenied permission="catalog.view" />}
    </DashboardLayout>
  );
}

function CategoriesInner({ s }: { s: AppState }) {
  const canEdit = can(s, 'catalog.edit');
  const tops = topCategories(s);
  const [selectedId, setSelectedId] = useState(() => tops[0]?.id ?? '');
  const [expanded, setExpanded] = useState<string[]>(() => tops.slice(0, 2).map((c) => c.id));
  const [resetKey, setResetKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const selected = s.categories.find((c) => c.id === selectedId) ?? tops[0];
  const countTop = (id: string) => s.products.filter((p) => p.categoryId === id).length;
  const countSub = (id: string) => s.products.filter((p) => p.subcategoryId === id).length;
  const countOf = (c: Category) => (c.parentId ? countSub(c.id) : countTop(c.id));
  const subTotal = s.categories.filter((c) => c.parentId && tops.some((t) => t.id === c.parentId)).length;

  function select(id: string) {
    setSelectedId(id);
    // Phones/tablets: the editor sits under the tree, so bring it into view.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  }
  const toggle = (id: string) => setExpanded((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  function move(c: Category, dir: -1 | 1) {
    const i = tops.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= tops.length) return;
    mutate((d) => {
      const sib = d.categories.filter((x) => !x.parentId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      [sib[i], sib[j]] = [sib[j], sib[i]];
      sib.forEach((x, k) => (x.sort = k + 1));
      addAudit(d, { module: 'Catalog', action: 'Category reordered', detail: `${c.name} moved ${dir < 0 ? 'left' : 'right'} in the customer app`, oldValue: `#${i + 1}`, newValue: `#${j + 1}` });
    });
  }

  function addCategory() {
    const id = uid('cat');
    mutate((d) => {
      const n = d.categories.filter((c) => !c.parentId).length;
      d.categories.push({ id, name: 'New category', icon: '🛒', sort: n + 1, color: GREY, soldBy: 'piece', coldChain: false, hidden: true });
      addAudit(d, { module: 'Catalog', action: 'Category created', detail: 'New category (hidden until switched on)' });
    });
    setExpanded((xs) => [...xs, id]);
    select(id);
    toast.success('Category added', { description: 'It stays hidden in the app until you switch it on.' });
  }

  function addSubcategory(parent: Category) {
    const id = uid('sub');
    mutate((d) => {
      const n = d.categories.filter((c) => c.parentId === parent.id).length;
      d.categories.push({ id, name: 'New subcategory', parentId: parent.id, icon: parent.icon, sort: n + 1 });
      addAudit(d, { module: 'Catalog', action: 'Subcategory created', detail: `${parent.name} › New subcategory` });
    });
    if (!expanded.includes(parent.id)) setExpanded((xs) => [...xs, parent.id]);
    select(id);
    toast.success(`Subcategory added to ${parent.name}`, { description: 'Name it in the editor and save.' });
  }

  return (
    <>
      <CatalogHeader tab="categories" eyebrow="Catalog · Category tree"
        actions={canEdit && <RedButton onClick={addCategory}><Plus className="w-4 h-4" />Add category</RedButton>} />

      {/* Customer app order */}
      <CatalogCard className="p-4 sm:p-5 lg:p-6 mb-4 md:mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
          <CardHeading>Customer app order</CardHeading>
          <p className="text-sm text-gray-600 sm:text-right sm:pt-1.5">The home screen, left to right. Reorder with the arrows below.</p>
        </div>
        <ol className="mt-4 flex gap-4 sm:gap-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
          {tops.map((c) => {
            const color = c.color ?? GREY;
            return (
              <li key={c.id} className="shrink-0 w-[76px]">
                <button type="button" onClick={() => select(c.id)} className={cn('w-full flex flex-col items-center gap-1.5 text-center', c.hidden && 'opacity-50')}>
                  <span className={cn('relative w-[66px] h-[66px] rounded-full border-2 overflow-hidden bg-white', selected?.id === c.id && 'ring-4 ring-[#c8151d]/15')} style={{ borderColor: color }}>
                    {isPhoto(c.photo)
                      ? <ProductImage image={c.photo} fill alt="" className="rounded-full p-[3px]" />
                      : <span className="absolute inset-[3px] rounded-full" style={stripes(color)} aria-hidden />}
                  </span>
                  <span className="text-xs font-semibold text-[#1d1716] leading-tight">{c.name}</span>
                  {c.hidden && <span className="text-[10px] text-gray-500 -mt-1">Hidden</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </CatalogCard>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-4 md:gap-5 items-start">
        {/* Category tree */}
        <CatalogCard className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
            <div className="min-w-0">
              <CardHeading>Category tree</CardHeading>
              <p className="text-sm text-gray-500 mt-0.5">{tops.length} categories · {subTotal} subcategories · {s.products.length} products</p>
            </div>
            <div className="flex gap-2">
              <OutlineButton className="h-10 px-3" onClick={() => setExpanded(tops.map((c) => c.id))}>Expand all</OutlineButton>
              <OutlineButton className="h-10 px-3" onClick={() => setExpanded([])}>Collapse all</OutlineButton>
            </div>
          </div>
          <ul>
            {tops.map((c, i) => {
              const open = expanded.includes(c.id);
              const subs = subcategoriesOf(s, c.id);
              const sel = selected?.id === c.id;
              const meta = [`${countTop(c.id)} products`, `${subs.length} subcategor${subs.length === 1 ? 'y' : 'ies'}`, SOLD_BY.find((x) => x.key === (c.soldBy ?? 'kg'))?.meta, c.coldChain ? 'cold chain' : ''].filter(Boolean).join(' · ');
              return (
                <li key={c.id} className="border-t border-[#f0e8e2]">
                  <div className={cn('flex items-center gap-1 sm:gap-2 pr-3 sm:pr-5 border-l-[3px]', sel ? 'bg-[#fdf0ef] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#fbf7f3]')}>
                    <button type="button" onClick={() => toggle(c.id)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${c.name}`}
                      className="w-11 h-14 shrink-0 flex items-center justify-center text-gray-500 hover:text-[#1d1716]">
                      {open ? <ChevronDown className="w-4 h-4" {...ICON} /> : <ChevronRight className="w-4 h-4" {...ICON} />}
                    </button>
                    <button type="button" onClick={() => select(c.id)} aria-current={sel || undefined} className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left">
                      <span className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ background: c.color ?? GREY }} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#1d1716] break-words">{c.name}</span>
                          {c.hidden && <HiddenPill />}
                        </span>
                        <span className="block text-xs text-gray-500 mt-0.5">{meta}</span>
                      </span>
                    </button>
                    {canEdit && (
                      <div className="flex gap-1.5 shrink-0">
                        <ArrowButton label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c, -1)}><ArrowUp className="w-4 h-4" {...ICON} /></ArrowButton>
                        <ArrowButton label={`Move ${c.name} down`} disabled={i === tops.length - 1} onClick={() => move(c, 1)}><ArrowDown className="w-4 h-4" {...ICON} /></ArrowButton>
                      </div>
                    )}
                  </div>
                  {open && (
                    <ul>
                      {subs.map((k) => {
                        const ksel = selected?.id === k.id;
                        return (
                          <li key={k.id} className="border-t border-[#f5eee8]">
                            <button type="button" onClick={() => select(k.id)} aria-current={ksel || undefined}
                              className={cn('w-full flex items-center gap-3 min-h-12 pl-12 sm:pl-14 pr-3 sm:pr-5 py-2 text-left border-l-[3px]',
                                ksel ? 'bg-[#fdf0ef] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#fbf7f3]')}>
                              <span className="w-3 h-px bg-gray-300 shrink-0" aria-hidden />
                              <span className={cn('flex-1 min-w-0 break-words', k.hidden ? 'text-gray-400' : 'text-[#1d1716]')}>{k.name}</span>
                              {k.hidden && <HiddenPill />}
                              <span className="w-8 text-right text-sm text-gray-500 tabular-nums">{countSub(k.id)}</span>
                            </button>
                          </li>
                        );
                      })}
                      {canEdit && (
                        <li className="border-t border-[#f5eee8]">
                          <button type="button" onClick={() => addSubcategory(c)} className="w-full flex items-center gap-2 min-h-11 pl-12 sm:pl-14 pr-4 text-sm font-semibold text-[#c8151d] hover:bg-[#fdf6f4] text-left">
                            <Plus className="w-4 h-4" />Add subcategory
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </CatalogCard>

        {/* Editor */}
        <div ref={editorRef} className="scroll-mt-20 lg:sticky lg:top-20">
          {selected ? (
            <Editor key={`${selected.id}-${resetKey}`} s={s} cat={selected} canEdit={canEdit} productCount={countOf(selected)}
              onCancel={() => setResetKey((k) => k + 1)}
              onDeleted={() => setSelectedId(tops.find((t) => t.id !== selected.id && t.id !== selected.parentId)?.id ?? selected.parentId ?? '')} />
          ) : (
            <CatalogCard className="p-5 text-sm text-gray-500">No categories yet. Add one to get started.</CatalogCard>
          )}
        </div>
      </div>
    </>
  );
}

function HiddenPill() {
  return <span className="rounded-full bg-[#f3ece6] px-2 py-0.5 text-[11px] font-medium text-gray-600 whitespace-nowrap">Hidden</span>;
}

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg border border-[#e3d6cc] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] disabled:text-gray-300 disabled:bg-[#fbf8f5] disabled:pointer-events-none">
      {children}
    </button>
  );
}

// ---------------- Editor ----------------
interface Draft { name: string; color: string; soldBy: SoldBy; description: string; photo: string; show: boolean; coldChain: boolean }
const draftOf = (c: Category): Draft => ({
  name: c.name, color: c.color ?? GREY, soldBy: c.soldBy ?? 'kg', description: c.description ?? '', photo: c.photo ?? '', show: !c.hidden, coldChain: !!c.coldChain,
});
const FIELD_LABEL: Record<keyof Draft, string> = { name: 'name', color: 'colour', soldBy: 'sold by', description: 'description', photo: 'cover photo', show: 'shown in app', coldChain: 'cold chain' };

function Editor({ s, cat, canEdit, productCount, onCancel, onDeleted }: {
  s: AppState; cat: Category; canEdit: boolean; productCount: number; onCancel: () => void; onDeleted: () => void;
}) {
  const isTop = !cat.parentId;
  const parent = cat.parentId ? s.categories.find((c) => c.id === cat.parentId) : undefined;
  const original = draftOf(cat);
  const [d, setD] = useState<Draft>(original);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Subcategories only edit name, description, photo and visibility.
  const keys = (Object.keys(original) as (keyof Draft)[]).filter((k) => isTop || ['name', 'description', 'photo', 'show'].includes(k));
  const changed = keys.filter((k) => d[k] !== original[k]);
  const dirty = changed.length > 0;
  const color = isTop ? d.color : parent?.color ?? GREY;
  const subs = isTop ? subcategoriesOf(s, cat.id) : [];

  async function pick(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose a photo (JPG, PNG or WebP)');
    if (file.size > 15 * 1024 * 1024) return toast.error('Photo is too large (max 15 MB)');
    setBusy(true);
    try {
      set('photo', await fileToPhoto(file, 1200, 0.8));
    } catch {
      toast.error('Could not read that photo');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function save() {
    const name = d.name.trim();
    if (!name) return toast.error('Name is required');
    const siblings = s.categories.filter((c) => c.id !== cat.id && (c.parentId ?? '') === (cat.parentId ?? ''));
    if (siblings.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast.error(`“${name}” already exists${parent ? ` in ${parent.name}` : ''}`);
    const show = (k: keyof Draft, v: Draft[keyof Draft]) => (k === 'photo' ? (v ? 'photo set' : 'no photo') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v) || '—');
    mutate((draft) => {
      const x = draft.categories.find((c) => c.id === cat.id);
      if (!x) return;
      x.name = name;
      x.description = d.description.trim() || undefined;
      x.photo = d.photo || undefined;
      x.hidden = d.show ? undefined : true;
      if (isTop) {
        x.color = d.color;
        x.soldBy = d.soldBy;
        x.coldChain = d.coldChain;
      }
      addAudit(draft, {
        module: 'Catalog', action: isTop ? 'Category updated' : 'Subcategory updated',
        detail: `${categoryPath(s, cat.id)} · ${changed.map((k) => FIELD_LABEL[k]).join(', ')}`,
        oldValue: changed.map((k) => `${FIELD_LABEL[k]}: ${show(k, original[k])}`).join('; ').slice(0, 200),
        newValue: changed.map((k) => `${FIELD_LABEL[k]}: ${show(k, k === 'name' ? name : d[k])}`).join('; ').slice(0, 200),
      });
    });
    setD((x) => ({ ...x, name, description: x.description.trim() }));
    toast.success(`${name} saved`, { description: d.show !== original.show ? (d.show ? 'Now shown in the customer app.' : 'Hidden from shoppers, with its products.') : undefined });
  }

  function remove() {
    if (productCount > 0) return;
    const label = categoryPath(s, cat.id);
    if (!window.confirm(`Delete “${label}”${subs.length ? ` and its ${subs.length} subcategories` : ''}? This cannot be undone.`)) return;
    const ids = [cat.id, ...subs.map((k) => k.id)];
    mutate((draft) => {
      draft.categories = draft.categories.filter((c) => !ids.includes(c.id));
      draft.products.forEach((p) => { if (p.subcategoryId && ids.includes(p.subcategoryId)) p.subcategoryId = undefined; });
      addAudit(draft, { module: 'Catalog', action: isTop ? 'Category deleted' : 'Subcategory deleted', detail: label });
    });
    toast.success(`Deleted ${label}`);
    onDeleted();
  }

  return (
    <CatalogCard className="p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{isTop ? 'Category' : `${parent?.name ?? ''} › Subcategory`}</p>
      <h2 className="mt-1 text-3xl leading-tight text-[#1d1716] break-words" style={OSWALD}>{d.name.trim() || 'Untitled'}</h2>

      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-[#1d1716]">Name</span>
          <input className={cn(fieldClass, 'mt-1.5')} value={d.name} disabled={!canEdit} onChange={(e) => set('name', e.target.value)} />
        </label>

        {isTop && (
          <div>
            <p className="text-sm font-semibold text-[#1d1716]">Colour</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button key={c.hex} type="button" disabled={!canEdit} aria-label={c.name} aria-pressed={d.color === c.hex} onClick={() => set('color', c.hex)}
                  className={cn('w-10 h-10 rounded-full transition-shadow disabled:opacity-60', d.color === c.hex ? 'ring-2 ring-offset-2 ring-[#1d1716]' : 'hover:ring-2 hover:ring-offset-2 hover:ring-[#e3d6cc]')}
                  style={{ background: c.hex }} />
              ))}
            </div>
          </div>
        )}

        {isTop && (
          <div>
            <p className="text-sm font-semibold text-[#1d1716]">Sold by default</p>
            <div className="mt-1.5 inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label="Sold by default">
              {SOLD_BY.map((o) => (
                <button key={o.key} type="button" disabled={!canEdit} aria-pressed={d.soldBy === o.key} onClick={() => set('soldBy', o.key)}
                  className={cn('h-9 px-3 rounded-lg text-sm whitespace-nowrap', d.soldBy === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{o.label}</button>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-semibold text-[#1d1716]">Short description</span>
          <textarea rows={3} value={d.description} disabled={!canEdit} onChange={(e) => set('description', e.target.value)} placeholder="Shown under the name in the app"
            className="mt-1.5 w-full rounded-xl border border-[#e3d6cc] bg-white px-3 py-2.5 text-[15px] text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb]" />
        </label>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-[#1d1716]">Cover photo</p>
            {d.photo && canEdit && <button type="button" onClick={() => set('photo', '')} className="text-xs text-gray-500 hover:text-[#c8151d]">Remove photo</button>}
          </div>
          <div className="mt-1.5 relative aspect-[1200/520] rounded-xl overflow-hidden border border-[#eadfd6] bg-white" style={isPhoto(d.photo) ? undefined : stripes(color)}>
            {isPhoto(d.photo) && <ProductImage image={d.photo} fill alt={`${d.name} cover`} />}
            <span className="absolute left-2.5 bottom-2.5 rounded-md bg-white/85 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">1200 × 520 photo</span>
            {canEdit && (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                  className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#2a2322] text-white text-sm font-semibold hover:bg-[#3d3432] disabled:opacity-60">
                  <Upload className="w-4 h-4" {...ICON} />{busy ? 'Resizing…' : 'Upload'}
                </button>
              </>
            )}
          </div>
        </div>

        <SwitchRow title="Show in customer app" sub="Hidden categories and their products disappear for shoppers" checked={d.show} disabled={!canEdit} onChange={(v) => set('show', v)} />
        {isTop && (
          <SwitchRow title="Cold chain required" sub="Adds the insulated-bag check at packing and the 60-min delivery limit" checked={d.coldChain} disabled={!canEdit} onChange={(v) => set('coldChain', v)} />
        )}

        <a href={`/catalog/products?cat=${encodeURIComponent(cat.id)}`} className="flex items-center gap-3 rounded-xl border border-[#eadfd6] bg-white px-4 h-12 hover:bg-[#faf6f2]">
          <Package className="w-4 h-4 text-gray-500 shrink-0" {...ICON} />
          <span className="flex-1 min-w-0 text-sm font-semibold text-[#1d1716] truncate">{productCount} product{productCount === 1 ? '' : 's'} in {cat.name}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#c8151d]">View<ArrowRight className="w-4 h-4" /></span>
        </a>
      </div>

      {canEdit && (
        <div className="mt-5 pt-4 border-t border-[#f0e8e2]">
          <div className="flex flex-wrap items-center gap-2">
            <OutlineButton disabled={productCount > 0} onClick={remove} className="px-3 text-[#c8151d] disabled:text-gray-400 disabled:opacity-100 disabled:bg-[#fbf8f5]">
              <Trash2 className="w-4 h-4" {...ICON} />Delete
            </OutlineButton>
            <div className="flex gap-2 ml-auto">
              <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
              <RedButton disabled={!dirty} onClick={save}>Save changes</RedButton>
            </div>
          </div>
          {productCount > 0 && <p className="mt-2 text-xs text-gray-500">Move its {productCount} product{productCount === 1 ? '' : 's'} to another category before deleting.</p>}
        </div>
      )}
    </CatalogCard>
  );
}

function SwitchRow({ title, sub, checked, disabled, onChange }: { title: string; sub: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#f6f0eb] px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1d1716]">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
      <GreenToggle checked={checked} disabled={disabled} label={title} onChange={onChange} />
    </div>
  );
}
