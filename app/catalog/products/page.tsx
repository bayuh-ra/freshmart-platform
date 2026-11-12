'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Download, FileUp, FolderPlus, Package, Pencil, Plus, Search, Star, Upload, CheckCircle2, AlertTriangle, XCircle, Trash2,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, StatCard, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { Textarea } from '@/src/components/ui/shadcn/textarea';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { branchName, can, exportCsv, getPriceInfo, peso, stockSummary } from '@/src/lib/logic';
import type { AppState, Product, TaxType, UnitOfMeasure } from '@/src/lib/types';
import {
  Field, StateBadge, Toggle, categoryPath, categoryTree, descendantIds, isOnlineAt, offlineTag, parseCsv, visibleTags,
} from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };
const STATUSES: Product['status'][] = ['draft', 'active', 'hidden', 'discontinued'];
const UNITS: UnitOfMeasure[] = ['pc', 'pack', 'kg', 'g', 'L'];
const TAX_LABEL: Record<TaxType, string> = { vat: 'VAT-able (12%)', exempt: 'VAT-exempt', zero: 'Zero-rated' };

export default function ProductsPage() {
  const s = useStore();
  if (!can(s, 'catalog.view')) {
    return (
      <DashboardLayout title="Products" eyebrow="Catalog">
        <AccessDenied permission="catalog.view" />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout title="Products" eyebrow="Catalog">
      <ProductsInner s={s} />
    </DashboardLayout>
  );
}

function ProductsInner({ s }: { s: AppState }) {
  const branchId = s.session.branchId;
  const canEdit = can(s, 'catalog.edit');
  const [tab, setTab] = useState('products');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [tag, setTag] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);

  const tree = useMemo(() => categoryTree(s), [s]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of s.categories) {
      const ids = descendantIds(s, c.id);
      m[c.id] = s.products.filter((p) => ids.includes(p.categoryId)).length;
    }
    return m;
  }, [s]);
  const allTags = useMemo(() => Array.from(new Set(s.products.flatMap(visibleTags))).sort(), [s.products]);

  const rows = useMemo(() => {
    const catIds = cat === 'all' ? null : descendantIds(s, cat);
    const term = q.trim().toLowerCase();
    return s.products.filter((p) => {
      if (catIds && !catIds.includes(p.categoryId)) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (tag !== 'all' && !p.tags.includes(tag)) return false;
      if (term && !`${p.name} ${p.brand} ${p.sku} ${p.barcode}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [s, q, cat, status, tag]);

  const offlineHere = s.products.filter((p) => !isOnlineAt(p, branchId)).length;

  function openNew() {
    setIsNew(true);
    setEditing({
      id: uid('p'), sku: `SKU-${1001 + s.products.length}`, barcode: '', name: '', brand: '', categoryId: cat !== 'all' ? cat : s.categories[0]?.id ?? '',
      unit: 'pc', size: '1 pc', description: '', image: '🛒', basePrice: 0, costPrice: 0, soldByWeight: false, tags: [], status: 'draft', tax: 'vat',
      aisle: 1, reorderPoint: 12, featured: false,
    });
  }

  function toggleOnline(p: Product, on: boolean) {
    mutate((d) => {
      const x = d.products.find((y) => y.id === p.id);
      if (!x) return;
      x.tags = x.tags.filter((t) => t !== offlineTag(branchId));
      if (!on) x.tags.push(offlineTag(branchId));
      addAudit(d, { module: 'Catalog', action: on ? 'Product online at branch' : 'Product offline at branch', detail: `${p.name} (${p.sku}) · ${branchName(d, branchId)}`, branchId, oldValue: on ? 'Offline' : 'Online', newValue: on ? 'Online' : 'Offline' });
    });
    toast.success(`${p.name} is now ${on ? 'online' : 'hidden online'} at ${branchName(s, branchId)}`);
  }

  function doExport() {
    exportCsv('freshmart-products.csv', [
      ['SKU', 'Barcode', 'Name', 'Brand', 'Category', 'Unit', 'Size', 'Base price', 'Cost price', 'Status', 'Tax', 'Tags', 'Reorder point'],
      ...rows.map((p) => [p.sku, p.barcode, p.name, p.brand, categoryPath(s, p.categoryId), p.unit, p.size, p.basePrice, p.costPrice, p.status, p.tax, visibleTags(p).join('; '), p.reorderPoint]),
    ]);
    toast.success(`Exported ${rows.length} products`);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Products in catalog" value={s.products.length} sub={`${s.categories.length} categories`} icon={<Package className="w-5 h-5" {...ICON} />} />
        <StatCard title="Active" value={s.products.filter((p) => p.status === 'active').length} sub="Visible in the Shopper App" accent="border-l-green-500" />
        <StatCard title="Draft / hidden" value={s.products.filter((p) => p.status === 'draft' || p.status === 'hidden').length} sub={`${s.products.filter((p) => p.status === 'discontinued').length} discontinued`} accent="border-l-amber-500" />
        <StatCard title={`Offline at ${branchName(s, branchId)}`} value={offlineHere} sub="Toggled off by this branch" accent="border-l-[#dc2626]" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="products">Product master list</TabsTrigger>
          <TabsTrigger value="categories">Category tree</TabsTrigger>
          <TabsTrigger value="import">Bulk import / export</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 h-fit">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Categories</p>
              <button onClick={() => setCat('all')} className={cn('w-full flex justify-between rounded-lg px-2 py-1.5 text-sm', cat === 'all' ? 'bg-blue-50 text-[#1e40af] font-medium' : 'text-gray-700 hover:bg-gray-50')}>
                <span>All products</span><span className="text-xs text-gray-400">{s.products.length}</span>
              </button>
              {tree.map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)} style={{ paddingLeft: 8 + c.depth * 14 }}
                  className={cn('w-full flex justify-between rounded-lg pr-2 py-1.5 text-sm text-left', cat === c.id ? 'bg-blue-50 text-[#1e40af] font-medium' : 'text-gray-700 hover:bg-gray-50')}>
                  <span className="truncate">{c.icon} {c.name}</span><span className="text-xs text-gray-400">{counts[c.id] ?? 0}</span>
                </button>
              ))}
            </div>

            <Panel bodyClass="p-4">
              <Toolbar>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" {...ICON} />
                  <input className={cn(inputClass, 'pl-8 w-64')} placeholder="Search name, brand, SKU, barcode" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  {STATUSES.map((x) => <option key={x} value={x} className="capitalize">{x[0].toUpperCase() + x.slice(1)}</option>)}
                </select>
                <select className={selectClass} value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="all">All tags</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={doExport}><Download {...ICON} /> Export CSV</Button>
                  {canEdit && <Button onClick={openNew}><Plus {...ICON} /> Add product</Button>}
                </div>
              </Toolbar>
              <p className="text-xs text-gray-400 mb-2">
                {rows.length} of {s.products.length} products · Branch price and stock shown for <b className="text-gray-600">{branchName(s, branchId)}</b>
              </p>
              {rows.length === 0 ? (
                <EmptyState title="No products match these filters" sub="Clear the search or pick another category" icon={<Package className="w-10 h-10" {...ICON} />} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU / Barcode</TableHead>
                      <TableHead>Category / Unit</TableHead>
                      <TableHead className="text-right">Base price</TableHead>
                      <TableHead className="text-right">Branch price</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Online</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => {
                      const pi = getPriceInfo(s, p.id, branchId);
                      const st = stockSummary(s, p.id, branchId);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">{p.image}</span>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 flex items-center gap-1">{p.name}{p.featured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" {...ICON} />}</p>
                                <p className="text-xs text-gray-500">{p.brand}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {p.soldByWeight && <Pill className="bg-purple-50 text-purple-700">by weight</Pill>}
                                  {visibleTags(p).map((t) => <Pill key={t} className="text-[10px] px-1.5">{t}</Pill>)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><p className="font-mono text-xs">{p.sku}</p><p className="font-mono text-[11px] text-gray-400">{p.barcode || '—'}</p></TableCell>
                          <TableCell className="text-xs text-gray-600">{categoryPath(s, p.categoryId)}<p className="text-[11px] text-gray-400">{p.unit} · {p.size}</p></TableCell>
                          <TableCell className="text-right">{peso(p.basePrice)}</TableCell>
                          <TableCell className="text-right">
                            <p className={cn('font-semibold', pi.source !== 'Base price' ? 'text-[#1e40af]' : 'text-gray-900')}>{peso(pi.price)}</p>
                            <p className="text-[11px] text-gray-400">{pi.source}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn('font-semibold', st.available === 0 ? 'text-[#dc2626]' : st.available <= p.reorderPoint ? 'text-amber-600' : 'text-gray-900')}>{st.available}</span>
                            <p className="text-[11px] text-gray-400">{st.onHand} on hand</p>
                          </TableCell>
                          <TableCell><StateBadge value={p.status} /></TableCell>
                          <TableCell><Toggle checked={isOnlineAt(p, branchId)} disabled={!canEdit} onChange={(v) => toggleOnline(p, v)} /></TableCell>
                          <TableCell>
                            {canEdit && <Button variant="ghost" size="icon" onClick={() => { setIsNew(false); setEditing(p); }} title="Edit"><Pencil {...ICON} /></Button>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryManager s={s} counts={counts} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <BulkImport s={s} canEdit={canEdit} onExport={doExport} />
        </TabsContent>
      </Tabs>

      {editing && <ProductDialog s={s} product={editing} isNew={isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------- Add / Edit product ----------------
function ProductDialog({ s, product, isNew, onClose }: { s: AppState; product: Product; isNew: boolean; onClose: () => void }) {
  const [f, setF] = useState<Product>({ ...product, tags: [...product.tags] });
  const [tagText, setTagText] = useState(visibleTags(product).join(', '));
  const tree = categoryTree(s);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setF((x) => ({ ...x, [k]: v }));
  const margin = f.basePrice > 0 ? ((f.basePrice - f.costPrice) / f.basePrice) * 100 : 0;

  function save() {
    if (!f.name.trim()) return toast.error('Product name is required');
    if (!f.sku.trim()) return toast.error('SKU is required');
    if (s.products.some((p) => p.sku.toLowerCase() === f.sku.trim().toLowerCase() && p.id !== f.id)) return toast.error(`SKU ${f.sku} already exists`);
    if (!(f.basePrice > 0)) return toast.error('Base price must be greater than zero');
    const offline = f.tags.filter((t) => t.startsWith('offline:'));
    const tags = [...tagText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), ...offline];
    const next: Product = { ...f, sku: f.sku.trim(), name: f.name.trim(), tags, estWeightKg: f.soldByWeight ? f.estWeightKg || 1 : undefined };
    mutate((d) => {
      if (isNew) {
        d.products.push(next);
        addAudit(d, { module: 'Catalog', action: 'Product created', detail: `${next.name} (${next.sku}) · ${categoryPath(d, next.categoryId)}`, newValue: `${peso(next.basePrice)} · ${next.status}` });
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add product' : `Edit ${product.name}`}</DialogTitle>
          <DialogDescription>Master catalog record — shared by every branch. Prices per branch come from price lists.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="Image (emoji)"><input className={cn(inputClass, 'text-xl text-center')} value={f.image} onChange={(e) => set('image', e.target.value)} /></Field>
          <Field label="Product name" className="sm:col-span-2"><input className={inputClass} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Fresh Milk" /></Field>
          <Field label="Brand"><input className={inputClass} value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
          <Field label="SKU"><input className={cn(inputClass, 'font-mono')} value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
          <Field label="Barcode"><input className={cn(inputClass, 'font-mono')} value={f.barcode} onChange={(e) => set('barcode', e.target.value)} /></Field>
          <Field label="Category" className="sm:col-span-2">
            <select className={selectClass} value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {tree.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.icon} {c.name}</option>)}
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
          <div className="sm:col-span-4 flex flex-wrap items-center gap-6 rounded-lg bg-gray-50 p-3">
            <Toggle checked={f.soldByWeight} onChange={(v) => set('soldByWeight', v)} label="Sold by weight (final price at weighing)" />
            {f.soldByWeight && (
              <label className="flex items-center gap-2 text-sm text-gray-600">Est. weight per piece
                <input type="number" step="0.05" className={cn(inputClass, 'w-24')} value={f.estWeightKg ?? 1} onChange={(e) => set('estWeightKg', Number(e.target.value))} /> kg
              </label>
            )}
            <Toggle checked={!!f.featured} onChange={(v) => set('featured', v)} label="Featured product" />
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

// ---------------- Category tree ----------------
function CategoryManager({ s, counts, canEdit }: { s: AppState; counts: Record<string, number>; canEdit: boolean }) {
  const tree = categoryTree(s);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [parent, setParent] = useState('');

  function add() {
    if (!name.trim()) return toast.error('Category name is required');
    mutate((d) => {
      const siblings = d.categories.filter((c) => (c.parentId ?? '') === parent);
      d.categories.push({ id: uid('cat'), name: name.trim(), icon: icon || '🛒', parentId: parent || undefined, sort: siblings.length + 1 });
      addAudit(d, { module: 'Catalog', action: parent ? 'Subcategory created' : 'Category created', detail: parent ? `${categoryPath(d, parent)} › ${name.trim()}` : name.trim() });
    });
    toast.success(`Category “${name.trim()}” created`);
    setName('');
  }

  function remove(id: string) {
    const ids = descendantIds(s, id);
    if (s.products.some((p) => ids.includes(p.categoryId))) return toast.error('Move the products out of this category first');
    const nm = categoryPath(s, id);
    mutate((d) => {
      d.categories = d.categories.filter((c) => !ids.includes(c.id));
      addAudit(d, { module: 'Catalog', action: 'Category deleted', detail: nm });
    });
    toast.success(`Deleted ${nm}`);
  }

  function move(id: string, dir: -1 | 1) {
    mutate((d) => {
      const c = d.categories.find((x) => x.id === id);
      if (!c) return;
      const sib = d.categories.filter((x) => x.parentId === c.parentId).sort((a, b) => a.sort - b.sort);
      const i = sib.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= sib.length) return;
      [sib[i], sib[j]] = [sib[j], sib[i]];
      sib.forEach((x, k) => (x.sort = k + 1));
      addAudit(d, { module: 'Catalog', action: 'Category reordered', detail: c.name });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Panel title="Category tree" action={<span className="text-xs text-gray-400">Unlimited depth · drag order with ↑ ↓</span>} bodyClass="p-2">
        {tree.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50" style={{ paddingLeft: 12 + c.depth * 24 }}>
            <span className="text-lg">{c.icon}</span>
            <span className={cn('text-sm', c.depth === 0 ? 'font-semibold text-gray-900' : 'text-gray-700')}>{c.name}</span>
            <Pill className="ml-1">{counts[c.id] ?? 0} products</Pill>
            {canEdit && (
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => move(c.id, -1)}>↑</Button>
                <Button variant="ghost" size="sm" onClick={() => move(c.id, 1)}>↓</Button>
                <Button variant="ghost" size="sm" onClick={() => setParent(c.id)}><FolderPlus {...ICON} /> Sub</Button>
                <Button variant="ghost" size="icon" onClick={() => remove(c.id)} title="Delete"><Trash2 className="text-[#dc2626]" {...ICON} /></Button>
              </div>
            )}
          </div>
        ))}
      </Panel>
      <Panel title={parent ? 'Add subcategory' : 'Add category'} className="h-fit">
        <div className="space-y-3">
          <Field label="Parent">
            <select className={selectClass} value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">(Top level)</option>
              {tree.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-[70px_1fr] gap-2">
            <Field label="Icon"><input className={cn(inputClass, 'text-center')} value={icon} onChange={(e) => setIcon(e.target.value)} /></Field>
            <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Leafy Greens" /></Field>
          </div>
          <Button className="w-full" disabled={!canEdit} onClick={add}><Plus {...ICON} /> {parent ? 'Add subcategory' : 'Add category'}</Button>
        </div>
      </Panel>
    </div>
  );
}

// ---------------- Bulk import ----------------
type ImportRow = { line: number; sku: string; name: string; price: number; category?: string; action: 'create' | 'update' | 'error'; errors: string[]; oldPrice?: number };

const SAMPLE = `sku,name,price,category
SKU-1016,Fresh Milk,108.00,Dairy & Eggs
SKU-1024,Jasmine Rice,379.75,Pantry
SKU-2001,Calamansi Juice,79.50,Beverages
SKU-2002,Ube Halaya,,Pantry
SKU-2003,Dragon Fruit,abc,Fruits
SKU-1016,Fresh Milk (dup),110,Dairy & Eggs`;

function BulkImport({ s, canEdit, onExport }: { s: AppState; canEdit: boolean; onExport: () => void }) {
  const [text, setText] = useState(SAMPLE);
  const [rows, setRows] = useState<ImportRow[] | null>(null);

  function validate() {
    const data = parseCsv(text);
    if (data.length === 0) return toast.error('Paste CSV data or choose a file first');
    const header = data[0].map((h) => h.toLowerCase());
    const hasHeader = header.includes('sku');
    const iSku = hasHeader ? header.indexOf('sku') : 0;
    const iName = hasHeader ? header.indexOf('name') : 1;
    const iPrice = hasHeader ? header.indexOf('price') : 2;
    const iCat = hasHeader ? header.indexOf('category') : 3;
    const seen = new Set<string>();
    const out: ImportRow[] = data.slice(hasHeader ? 1 : 0).map((r, k) => {
      const sku = r[iSku] ?? '';
      const name = r[iName] ?? '';
      const priceRaw = r[iPrice] ?? '';
      const category = iCat >= 0 ? r[iCat] : undefined;
      const errors: string[] = [];
      if (!sku) errors.push('SKU is missing');
      if (!name) errors.push('Name is missing');
      const price = Number(priceRaw);
      if (!priceRaw) errors.push('Price is missing');
      else if (!Number.isFinite(price) || price <= 0) errors.push(`Price “${priceRaw}” is not a valid amount`);
      if (sku && seen.has(sku.toLowerCase())) errors.push('Duplicate SKU in this file');
      if (sku) seen.add(sku.toLowerCase());
      const existing = s.products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
      if (!existing && category && !s.categories.some((c) => c.name.toLowerCase() === category.toLowerCase())) errors.push(`Unknown category “${category}”`);
      return { line: k + (hasHeader ? 2 : 1), sku, name, price, category, errors, action: errors.length ? 'error' : existing ? 'update' : 'create', oldPrice: existing?.basePrice };
    });
    setRows(out);
  }

  function apply() {
    if (!rows) return;
    const ok = rows.filter((r) => r.action !== 'error');
    if (!ok.length) return toast.error('No valid rows to apply');
    mutate((d) => {
      for (const r of ok) {
        const p = d.products.find((x) => x.sku.toLowerCase() === r.sku.toLowerCase());
        if (p) {
          if (p.basePrice !== r.price) addAudit(d, { module: 'Pricing', action: 'Base price changed (CSV import)', detail: `${p.name} (${p.sku})`, oldValue: peso(p.basePrice), newValue: peso(r.price) });
          p.basePrice = r.price;
          p.name = r.name;
        } else {
          const cat = d.categories.find((c) => c.name.toLowerCase() === (r.category ?? '').toLowerCase()) ?? d.categories[0];
          d.products.push({
            id: uid('p'), sku: r.sku, barcode: '', name: r.name, brand: '', categoryId: cat.id, unit: 'pc', size: '1 pc', description: '', image: cat.icon || '🛒',
            basePrice: r.price, costPrice: Math.round(r.price * 0.72 * 100) / 100, soldByWeight: false, tags: [], status: 'draft', tax: 'vat', aisle: 1, reorderPoint: 12,
          });
        }
      }
      addAudit(d, { module: 'Catalog', action: 'CSV import applied', detail: `${ok.filter((r) => r.action === 'create').length} created (as draft), ${ok.filter((r) => r.action === 'update').length} updated, ${rows.length - ok.length} rejected` });
    });
    toast.success(`Imported ${ok.length} rows · ${rows.length - ok.length} rejected`);
    setRows(null);
  }

  function errorReport() {
    if (!rows) return;
    exportCsv('import-error-report.csv', [['Line', 'SKU', 'Name', 'Errors'], ...rows.filter((r) => r.action === 'error').map((r) => [r.line, r.sku, r.name, r.errors.join('; ')])]);
  }

  const counts = rows ? { create: rows.filter((r) => r.action === 'create').length, update: rows.filter((r) => r.action === 'update').length, error: rows.filter((r) => r.action === 'error').length } : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Panel title="1. Paste or upload CSV" className="h-fit">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Columns: <code className="bg-gray-100 px-1 rounded">sku,name,price[,category]</code>. Existing SKUs are updated; new SKUs are created as <b>draft</b>.</p>
          <Textarea rows={10} className="font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setText(await file.text()); setRows(null); toast.success(`Loaded ${file.name}`); } }} />
              <span className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"><FileUp className="w-4 h-4" {...ICON} /> Choose file</span>
            </label>
            <Button onClick={validate}><CheckCircle2 {...ICON} /> Validate</Button>
            <Button variant="outline" onClick={() => exportCsv('product-import-template.csv', [['sku', 'name', 'price', 'category'], ['SKU-9001', 'Sample Product', '99.00', 'Pantry']])}><Download {...ICON} /> Template</Button>
            <Button variant="outline" onClick={onExport}><Download {...ICON} /> Export catalog</Button>
          </div>
        </div>
      </Panel>
      <Panel title="2. Validation preview" action={counts && (
        <div className="flex gap-2">
          <Pill className="bg-green-100 text-green-800">{counts.create} new</Pill>
          <Pill className="bg-blue-100 text-blue-800">{counts.update} updates</Pill>
          <Pill className="bg-red-100 text-red-700">{counts.error} errors</Pill>
        </div>
      )}>
        {!rows ? (
          <EmptyState title="Validate the file to preview changes" sub="Nothing is written until you click Apply" icon={<Upload className="w-10 h-10" {...ICON} />} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Line</TableHead><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Price</TableHead><TableHead>Result</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.line} className={r.action === 'error' ? 'bg-red-50/50' : ''}>
                    <TableCell className="text-xs text-gray-400">{r.line}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sku || '—'}</TableCell>
                    <TableCell>{r.name || '—'}</TableCell>
                    <TableCell className="text-right">
                      {r.action === 'update' && r.oldPrice !== undefined ? <span><span className="text-gray-400 line-through mr-1">{peso(r.oldPrice)}</span>{peso(r.price)}</span> : Number.isFinite(r.price) && r.price > 0 ? peso(r.price) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.action === 'error' ? (
                        <span className="flex items-start gap-1 text-xs text-[#dc2626]"><XCircle className="w-4 h-4 shrink-0" {...ICON} />{r.errors.join('; ')}</span>
                      ) : r.action === 'update' ? (
                        <span className="flex items-center gap-1 text-xs text-[#1e40af]"><AlertTriangle className="w-4 h-4" {...ICON} />Update existing</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-green-700"><CheckCircle2 className="w-4 h-4" {...ICON} />Create (draft)</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end gap-2 mt-4">
              {counts!.error > 0 && <Button variant="outline" onClick={errorReport}><Download {...ICON} /> Error report</Button>}
              <Button disabled={!canEdit || counts!.create + counts!.update === 0} onClick={apply}>Apply {counts!.create + counts!.update} valid rows</Button>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
