'use client';

import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Check, Download, EyeOff, FileDown, ScanBarcode, Store, Upload, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { addAudit, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import { guardLimit } from '@/src/lib/platform';
import { branchName, can, getPrice, onHand, peso } from '@/src/lib/logic';
import type { AppState, CatalogFile, Product } from '@/src/lib/types';
import { categoryPath, isOnlineAt, offlineTag, parseCsv, subcategoriesOf, topCategories } from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';
import { CardHeading, CatalogCard, CatalogHeader, GreenToggle, ICON, OSWALD, OutlineButton, RedButton } from '../_ui';

const CRUMBS = [{ label: 'Catalog' }, { label: 'Products', href: '/catalog/products' }, { label: 'Import / export' }];
const HISTORY_DAYS = 30;
const HISTORY_MAX = 40;
const REVIEW_ROWS = 8;

type Cell = string | number;

// ---------------- File helpers ----------------
const toCsv = (rows: Cell[][]) =>
  rows.map((r) => r.map((c) => { const v = String(c ?? ''); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n');

const esc = (v: Cell) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Excel-compatible .xls: an HTML table Excel opens as a sheet (no spreadsheet library is installed). */
const toXls = (rows: Cell[][]) =>
  '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>'
  + rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')
  + '</table></body></html>';

function download(fileName: string, content: string) {
  const type = fileName.endsWith('.xls') ? 'application/vnd.ms-excel;charset=utf-8' : 'text/csv;charset=utf-8';
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Add a History entry inside a mutate() recipe. */
function addFile(d: AppState, f: Omit<CatalogFile, 'id' | 'at' | 'user'>) {
  d.catalogFiles = [{ id: uid('cf'), at: new Date().toISOString(), user: currentUserName(d), ...f }, ...(d.catalogFiles ?? [])].slice(0, HISTORY_MAX);
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Local date as YYYY-MM-DD (for file names and refs). */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------- Page ----------------
export default function ImportExportPage() {
  const s = useStore();
  return (
    <DashboardLayout title="Import / export" crumbs={CRUMBS}>
      {can(s, 'catalog.view') ? <Inner s={s} /> : <AccessDenied permission="catalog.view" />}
    </DashboardLayout>
  );
}

const TEMPLATE_HEADER = (branch: string) => ['SKU', 'Name', 'Category', 'Base price', `${branch} price`, 'Stock', 'In app'];

function Inner({ s }: { s: AppState }) {
  const branch = branchName(s, s.session.branchId);
  function template() {
    const tops = topCategories(s);
    download('product-import-template.csv', toCsv([
      TEMPLATE_HEADER(branch),
      ['SKU-1001', 'Beef Brisket', tops[0]?.name ?? 'Beef', 420, 435, 25, 'yes'],
      ['SKU-9001', 'New product (added as a hidden draft)', tops[1]?.name ?? tops[0]?.name ?? 'Pork', 199, 199, 10, 'no'],
    ]));
    toast.success('Template downloaded');
  }
  return (
    <>
      <CatalogHeader tab="import" eyebrow="Catalog · Import & export"
        actions={<OutlineButton onClick={template}><FileDown className="w-4 h-4" {...ICON} />Download template</OutlineButton>} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 items-start">
        <ExportCard s={s} branch={branch} />
        <ImportCard s={s} branch={branch} canEdit={can(s, 'catalog.edit')} />
      </div>
      <HistoryCard s={s} />
    </>
  );
}

// ---------------- Export ----------------
type Dataset = 'products' | 'stock' | 'categories' | 'cuts';

function buildExport(s: AppState, kind: Dataset, allBranches: boolean, includeHidden: boolean): Cell[][] {
  const here = s.session.branchId;
  const bs = allBranches ? s.branches : s.branches.filter((b) => b.id === here);
  const one = !allBranches;
  if (kind === 'products') {
    const list = includeHidden ? s.products : s.products.filter((p) => isOnlineAt(p, here));
    return [
      ['SKU', 'Name', 'Category', 'Base price', ...bs.map((b) => `${b.name} price`), ...bs.map((b) => (one ? 'In app' : `${b.name} in app`))],
      ...list.map((p) => [p.sku, p.name, categoryPath(s, p.subcategoryId ?? p.categoryId), p.basePrice,
        ...bs.map((b) => getPrice(s, p.id, b.id)), ...bs.map((b) => (isOnlineAt(p, b.id) ? 'yes' : 'no'))]),
    ];
  }
  if (kind === 'stock') {
    return [
      ['SKU', 'Name', ...bs.map((b) => (one ? 'On hand' : `${b.name} on hand`)), 'Unit', 'Reorder point'],
      ...s.products.map((p) => [p.sku, p.name, ...bs.map((b) => onHand(s, p.id, b.id)), p.soldByWeight ? 'kg' : p.unit, p.reorderPoint]),
    ];
  }
  if (kind === 'categories') {
    const rows: Cell[][] = [['Name', 'Parent', 'Display order', 'Colour', 'Sold by', 'Hidden']];
    for (const t of topCategories(s)) {
      rows.push([t.name, '', t.sort, t.color ?? '', t.soldBy ?? '', t.hidden ? 'yes' : 'no']);
      for (const c of subcategoriesOf(s, t.id)) rows.push([c.name, t.name, c.sort, c.color ?? t.color ?? '', c.soldBy ?? t.soldBy ?? '', c.hidden ? 'yes' : 'no']);
    }
    return rows;
  }
  const catNames = (ids?: string[]) => (ids ?? []).map((id) => s.categories.find((c) => c.id === id)?.name ?? id).join('; ');
  return [
    ['Name', 'Add-on price', 'Charged', 'Prep time (min)', 'Categories', 'Offered'],
    ...s.cutOptions.map((c) => [c.name, c.fee, c.feeType ?? 'piece', c.prepMins ?? 0, catNames(c.categoryIds), c.active ? 'yes' : 'no']),
  ];
}

function ExportCard({ s, branch }: { s: AppState; branch: string }) {
  const [kind, setKind] = useState<Dataset>('products');
  const [allBranches, setAllBranches] = useState(false);
  const [format, setFormat] = useState<'csv' | 'xls'>('csv');
  const [includeHidden, setIncludeHidden] = useState(false);
  const here = s.session.branchId;
  const hiddenCount = s.products.filter((p) => !isOnlineAt(p, here)).length;
  const branchAware = kind === 'products' || kind === 'stock';

  const options: { key: Dataset; title: string; count: number; cols: string }[] = [
    { key: 'products', title: 'Products & prices', count: s.products.length, cols: `SKU, name, category, base and ${branch} price, visibility` },
    { key: 'stock', title: 'Stock levels', count: s.products.length, cols: 'SKU, on hand, unit, reorder point' },
    { key: 'categories', title: 'Categories', count: s.categories.length, cols: 'Tree with display order and colours' },
    { key: 'cuts', title: 'Cut & prep options', count: s.cutOptions.length, cols: 'Add-on prices, prep time, categories' },
  ];
  const rows = buildExport(s, kind, allBranches, includeHidden);
  const n = rows.length - 1;
  const label = format === 'csv' ? 'CSV' : 'Excel';

  function exportNow() {
    const ext = format === 'csv' ? 'csv' : 'xls';
    const scope = allBranches ? 'all-branches' : slug(branch);
    const base = kind === 'products' ? `products-${scope}` : kind === 'stock' ? `stock-${scope}` : kind === 'categories' ? 'categories' : 'cut-options';
    const fileName = `${base}-${today()}.${ext}`;
    const content = format === 'csv' ? toCsv(rows) : toXls(rows);
    download(fileName, content);
    mutate((d) => {
      addFile(d, { kind: 'export', fileName, rows: n, content });
      addAudit(d, { module: 'Catalog', action: 'Catalog exported', detail: `${fileName} · ${plural(n, 'row')}` });
    });
    toast.success(`Exported ${plural(n, 'row')}`, { description: fileName });
  }

  return (
    <CatalogCard className="p-4 sm:p-6">
      <CardHeading className="text-3xl">Export</CardHeading>
      <p className="text-sm text-gray-500 mt-0.5">Download a spreadsheet you can edit and import back.</p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="What to export">
        {options.map((o) => {
          const on = kind === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => setKind(o.key)}
              className={cn('flex items-start gap-3 rounded-xl border p-3.5 sm:p-4 text-left transition-colors min-w-0',
                on ? 'border-[#d6202a] ring-1 ring-[#d6202a] bg-[#fdf6f1]' : 'border-[#eadfd6] bg-white hover:bg-[#fbf7f3]')}>
              <span className={cn('mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center', on ? 'border-[#d6202a]' : 'border-[#cfc3ba]')} aria-hidden>
                {on && <span className="w-2.5 h-2.5 rounded-full bg-[#d6202a]" />}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[#1d1716]">{o.title}</span>
                <span className="block text-[13px] text-gray-500 mt-0.5">{plural(o.count, 'row')} · {o.cols}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <div className={cn(!branchAware && 'opacity-50')}>
          <p className="text-sm font-semibold text-[#1d1716]">Branch</p>
          <Segmented ariaLabel="Branch" disabled={!branchAware} value={allBranches ? 'all' : 'one'} onChange={(v) => setAllBranches(v === 'all')}
            items={[{ key: 'one', label: branch }, { key: 'all', label: 'All branches' }]} />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1d1716]">Format</p>
          <Segmented ariaLabel="Format" value={format} onChange={(v) => setFormat(v as 'csv' | 'xls')}
            items={[{ key: 'csv', label: 'CSV' }, { key: 'xls', label: 'Excel' }]} />
        </div>
      </div>
      {allBranches && branchAware && <p className="mt-2 text-xs text-gray-500">Adds a {kind === 'products' ? 'price and in-app' : 'stock'} column for each branch.</p>}

      {kind === 'products' && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#f6f0eb] px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1d1716]">Include hidden products</p>
            <p className="text-xs text-gray-500 mt-0.5">Adds the {plural(hiddenCount, 'product')} switched off for {branch}</p>
          </div>
          <GreenToggle checked={includeHidden} label="Include hidden products" onChange={setIncludeHidden} />
        </div>
      )}

      <RedButton className="mt-5 w-full h-14 text-base" onClick={exportNow} disabled={n === 0}>
        <Download className="w-5 h-5" {...ICON} />Export {plural(n, 'row')} as {label}
      </RedButton>
    </CatalogCard>
  );
}

function Segmented({ items, value, onChange, ariaLabel, disabled }: { items: { key: string; label: string }[]; value: string; onChange: (v: string) => void; ariaLabel: string; disabled?: boolean }) {
  return (
    <div className="mt-1.5 inline-flex rounded-xl bg-[#ece4dd] p-1" role="group" aria-label={ariaLabel}>
      {items.map((o) => (
        <button key={o.key} type="button" disabled={disabled} aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className={cn('h-10 px-3.5 rounded-lg text-sm whitespace-nowrap disabled:cursor-not-allowed', value === o.key ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{o.label}</button>
      ))}
    </div>
  );
}

// ---------------- Import: parsing & matching ----------------
type Change = { field: string; from: string; to: string };
type UpdateRow = { line: number; productId: string; sku: string; name: string; price?: number; stock?: number; inApp?: boolean; changes: Change[] };
type NewRow = { line: number; sku: string; name: string; basePrice: number; price?: number; categoryId: string; stock?: number };
type SkipRow = { line: number; sku: string; reason: string };
type Plan = { fileName: string; content: string; updates: UpdateRow[]; creates: NewRow[]; skipped: SkipRow[] };
type Result = { fileName: string; updated: number; created: number; skipped: number };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const parseNum = (raw: string) => Number(raw.replace(/[₱,\s]/g, ''));
function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'on', 'shown', 'show', 'visible', 'online'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off', 'hidden', 'hide', 'offline'].includes(v)) return false;
  return null;
}

/** Match rows to products by SKU. Returns null when the columns are not recognised. */
function planImport(s: AppState, fileName: string, content: string, table: string[][]): Plan | null {
  if (table.length === 0) return null;
  const here = s.session.branchId;
  const bn = norm(branchName(s, here));
  const header = table[0].map(norm);
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iSku = col('sku', 'skucode', 'productsku');
  const iName = col('name', 'product', 'productname');
  const iCat = col('category');
  const iBase = col('baseprice');
  const iPrice = col('price', `${bn}price`, 'branchprice', 'sellingprice');
  const iStock = col('stock', 'onhand', `${bn}onhand`, `${bn}stock`, 'qty', 'quantity');
  const iApp = col('inapp', `${bn}inapp`, 'visible', 'visibility', 'showinapp');
  if (iSku < 0 || (iPrice < 0 && iStock < 0 && iApp < 0)) return null;

  const tops = topCategories(s);
  const seen = new Set<string>();
  const plan: Plan = { fileName, content, updates: [], creates: [], skipped: [] };
  table.slice(1).forEach((r, k) => {
    const line = k + 2;
    const cell = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const sku = cell(iSku);
    const skip = (reason: string) => plan.skipped.push({ line, sku: sku || '—', reason });
    if (!sku) return skip('SKU is missing');
    if (seen.has(sku.toLowerCase())) return skip('Duplicate SKU in this file');
    seen.add(sku.toLowerCase());

    const priceRaw = cell(iPrice);
    const price = priceRaw ? parseNum(priceRaw) : undefined;
    if (price !== undefined && (!Number.isFinite(price) || price <= 0)) return skip(`Price “${priceRaw}” is not a valid amount`);
    const stockRaw = cell(iStock);
    const stock = stockRaw ? parseNum(stockRaw) : undefined;
    if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) return skip(`Stock “${stockRaw}” is not a valid number`);
    const appRaw = cell(iApp);
    const inApp = appRaw ? parseBool(appRaw) : undefined;
    if (inApp === null) return skip(`In app “${appRaw}” should be yes or no`);

    const p = s.products.find((x) => x.sku.toLowerCase() === sku.toLowerCase());
    if (p) {
      const changes: Change[] = [];
      const u: UpdateRow = { line, productId: p.id, sku: p.sku, name: p.name, changes };
      const oldPrice = getPrice(s, p.id, here);
      if (price !== undefined && Math.abs(price - oldPrice) > 0.004) { u.price = price; changes.push({ field: 'Price', from: peso(oldPrice), to: peso(price) }); }
      const oldStock = onHand(s, p.id, here);
      if (stock !== undefined && Math.abs(stock - oldStock) > 0.0001) { u.stock = stock; changes.push({ field: 'Stock', from: String(oldStock), to: String(stock) }); }
      const oldApp = isOnlineAt(p, here);
      if (inApp !== undefined && inApp !== oldApp) { u.inApp = inApp; changes.push({ field: 'In app', from: oldApp ? 'Yes' : 'No', to: inApp ? 'Yes' : 'No' }); }
      if (!changes.length) return skip('No changes');
      plan.updates.push(u);
      return;
    }
    const name = cell(iName);
    if (!name) return skip('New SKU needs a name');
    const baseRaw = cell(iBase);
    const base = baseRaw ? parseNum(baseRaw) : price;
    if (base === undefined || !Number.isFinite(base) || base <= 0) return skip('New SKU needs a price');
    const catRaw = cell(iCat);
    const catTop = catRaw.split(/\s*[›>/]\s*/)[0];
    const cat = catRaw ? tops.find((c) => c.name.toLowerCase() === catTop.toLowerCase()) : tops[0];
    if (!cat) return skip(`Unknown category “${catRaw}”`);
    plan.creates.push({ line, sku, name, basePrice: base, price: price !== undefined && price !== base ? price : undefined, categoryId: cat.id, stock });
  });
  return plan;
}

/** Read an uploaded file into rows: CSV, or the Excel (.xls) HTML table this page exports. */
async function readTable(file: File): Promise<{ rows: string[][]; content: string } | { error: string }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return { error: 'Excel .xlsx files can’t be read here yet. In Excel choose File › Save As › CSV, then upload that file.' };
  }
  const text = (await file.text()).replace(/^﻿/, '');
  if (name.endsWith('.xls')) {
    if (!/<table/i.test(text)) return { error: 'This .xls file can’t be read here. In Excel choose File › Save As › CSV, then upload that file.' };
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const rows = [...doc.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => (c.textContent ?? '').trim())).filter((r) => r.some(Boolean));
    return { rows, content: text };
  }
  if (!name.endsWith('.csv') && !name.endsWith('.txt') && file.type !== 'text/csv') return { error: 'Choose a .csv file (or an Excel file saved as CSV).' };
  return { rows: parseCsv(text), content: text };
}

/** Built-in sample: a few real SKUs with new prices / stock / visibility, one new SKU and one bad row. */
function sampleCsv(s: AppState) {
  const here = s.session.branchId;
  const branch = branchName(s, here);
  const ps = s.products.filter((p) => p.status !== 'discontinued').slice(0, 6);
  const price = (p: Product) => getPrice(s, p.id, here);
  const app = (p: Product) => (isOnlineAt(p, here) ? 'yes' : 'no');
  const stock = (p: Product) => onHand(s, p.id, here);
  const cat = (p: Product) => s.categories.find((c) => c.id === p.categoryId)?.name ?? '';
  const rows: Cell[][] = [TEMPLATE_HEADER(branch)];
  ps.forEach((p, i) => {
    const newPrice = i < 3 ? Math.round(price(p) + 15) : price(p);
    const newStock = i === 3 || i === 4 ? stock(p) + 12 : stock(p);
    const inApp = i === 5 ? (app(p) === 'yes' ? 'no' : 'yes') : app(p);
    rows.push([p.sku, p.name, cat(p), p.basePrice, newPrice, newStock, inApp]);
  });
  const top = topCategories(s)[0]?.name ?? '';
  let n = 9001;
  while (s.products.some((p) => p.sku === `SKU-${n}`)) n++;
  rows.push([`SKU-${n}`, 'Beef Tapa (sample)', top, 289, 289, 15, 'no']);
  rows.push(['SKU-0999', 'Old promo pack', top, '', 'abc', '', 'yes']);
  return toCsv(rows);
}

// ---------------- Import card ----------------
function ImportCard({ s, branch, canEdit }: { s: AppState; branch: string; canEdit: boolean }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const step = result ? 3 : plan ? 2 : 1;

  function load(fileName: string, content: string, rows: string[][]) {
    const p = planImport(s, fileName, content, rows);
    if (!p) {
      mutate((d) => {
        addFile(d, { kind: 'import', fileName, failed: 'columns not recognised', content });
        addAudit(d, { module: 'Catalog', action: 'CSV import failed', detail: `${fileName} · columns not recognised` });
      });
      toast.error('Columns not recognised', { description: `${fileName} needs a SKU column plus ${branch} price, Stock or In app. Download the template to see the layout.` });
      return;
    }
    setPlan(p);
    setResult(null);
  }

  async function onFile(file?: File) {
    if (!file) return;
    const r = await readTable(file);
    if ('error' in r) return toast.error('Can’t read that file', { description: r.error });
    if (r.rows.length < 2) return toast.error('That file has no rows to import');
    load(file.name, r.content, r.rows);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void onFile(e.dataTransfer.files?.[0]);
  }

  function trySample() {
    const content = sampleCsv(s);
    load(`sample-${slug(branch)}-update.csv`, content, parseCsv(content));
  }

  function apply() {
    if (!plan || !canEdit) return;
    const total = plan.updates.length + plan.creates.length;
    if (!total) return;
    if (plan.creates.length && !guardLimit('products', plan.creates.length)) return;
    const here = s.session.branchId;
    const ref = `IMP-${today()}`;
    mutate((d) => {
      const user = currentUserName(d);
      const at = new Date().toISOString();
      let list = d.priceLists.find((l) => l.scope === 'branch' && l.scopeId === here && l.active && !l.startDate && !l.endDate);
      const priceList = () => {
        if (!list) { list = { id: uid('pl'), name: `${branchName(d, here)} branch prices`, scope: 'branch', scopeId: here, active: true, items: {} }; d.priceLists.push(list); }
        return list;
      };
      for (const u of plan.updates) {
        const p = d.products.find((x) => x.id === u.productId);
        if (!p) continue;
        if (u.price !== undefined) {
          const old = getPrice(d, p.id, here);
          priceList().items[p.id] = u.price;
          addAudit(d, { module: 'Pricing', action: 'Branch price changed (CSV import)', branchId: here, detail: `${p.name} (${p.sku}) · ${plan.fileName}`, oldValue: peso(old), newValue: peso(u.price) });
        }
        if (u.stock !== undefined) {
          const delta = Math.round((u.stock - onHand(d, p.id, here)) * 1000) / 1000;
          if (delta) d.movements.push({ id: uid('m'), productId: p.id, branchId: here, qty: delta, type: 'count_correction', reason: `CSV import · ${plan.fileName} · set to ${u.stock}`, user, at, ref });
        }
        if (u.inApp !== undefined) {
          p.tags = p.tags.filter((t) => t !== offlineTag(here));
          if (!u.inApp) p.tags.push(offlineTag(here));
        }
      }
      const tops = d.categories.filter((c) => !c.parentId);
      for (const c of plan.creates) {
        const cat = tops.find((x) => x.id === c.categoryId) ?? tops[0];
        const kg = cat?.soldBy === 'kg';
        const id = uid('p');
        d.products.push({
          id, sku: c.sku, barcode: '', name: c.name, brand: '', categoryId: cat?.id ?? '', unit: kg ? 'kg' : cat?.soldBy === 'pack' ? 'pack' : 'pc', size: kg ? 'per kg' : '1 pc',
          description: '', image: cat?.icon || '🛒', basePrice: c.basePrice, costPrice: Math.round(c.basePrice * 0.72 * 100) / 100, soldByWeight: kg, tags: [offlineTag(here)],
          status: 'draft', tax: 'vat', aisle: cat?.sort ?? 1, reorderPoint: kg ? 8 : 12, storage: cat?.coldChain === false ? 'shelf' : 'fresh',
        });
        if (c.price !== undefined) priceList().items[id] = c.price;
        if (c.stock) d.movements.push({ id: uid('m'), productId: id, branchId: here, qty: c.stock, type: 'receiving', reason: `Opening stock (CSV import · ${plan.fileName})`, user, at, ref });
      }
      addFile(d, { kind: 'import', fileName: plan.fileName, applied: total, skipped: plan.skipped.length, content: plan.content });
      addAudit(d, { module: 'Catalog', action: 'CSV import applied', branchId: here, detail: `${plan.fileName} · ${plan.updates.length} updated, ${plan.creates.length} added as hidden drafts, ${plan.skipped.length} skipped` });
    });
    setResult({ fileName: plan.fileName, updated: plan.updates.length, created: plan.creates.length, skipped: plan.skipped.length });
    setPlan(null);
    toast.success(`Applied ${plural(total, 'change')}`, { description: plan.fileName });
  }

  function reset() {
    setPlan(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <CatalogCard className="p-4 sm:p-6">
      <CardHeading className="text-3xl">Import</CardHeading>
      <p className="text-sm text-gray-500 mt-0.5">Update {branch} prices, stock and visibility in one go.</p>
      <Stepper step={step} />

      {step === 1 && (
        <>
          <input ref={inputRef} type="file" accept=".csv,text/csv,.xls,.xlsx" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragEnter={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
            className={cn('mt-4 w-full rounded-xl border-2 border-dashed px-4 py-8 sm:py-10 flex flex-col items-center text-center transition-colors',
              drag ? 'border-[#d6202a] bg-[#fdf0ef]' : 'border-[#e0d2c7] bg-[#fdfaf7] hover:bg-[#fbf5f0]')}>
            <span className="w-14 h-14 rounded-full bg-[#fdecec] text-[#c8151d] flex items-center justify-center"><Upload className="w-6 h-6" {...ICON} /></span>
            <span className="mt-3 text-xl text-[#1d1716]" style={OSWALD}>Drop a CSV or Excel file</span>
            <span className="mt-1 text-sm text-gray-500">or tap to choose from your device</span>
          </button>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600">No file handy?</span>
            <OutlineButton onClick={trySample}>Try the sample file</OutlineButton>
          </div>
          <ul className="mt-4 space-y-2.5 rounded-xl bg-[#f6f0eb] px-4 py-3.5 text-sm text-[#1d1716]">
            <InfoLine icon={<ScanBarcode className="w-4 h-4" {...ICON} />}>Rows are matched to products by SKU.</InfoLine>
            <InfoLine icon={<Store className="w-4 h-4" {...ICON} />}>Updates {branch} price, stock and “in app” only. Base prices stay as they are.</InfoLine>
            <InfoLine icon={<EyeOff className="w-4 h-4" {...ICON} />}>New SKUs are added as hidden drafts for you to check first.</InfoLine>
          </ul>
        </>
      )}

      {step === 2 && plan && <Review plan={plan} canEdit={canEdit} onCancel={reset} onApply={apply} />}

      {step === 3 && result && (
        <div className="mt-4">
          <div className="rounded-xl bg-[#eef6f0] px-4 py-5 text-center">
            <span className="mx-auto w-12 h-12 rounded-full bg-[#2e6b3a] text-white flex items-center justify-center"><Check className="w-6 h-6" strokeWidth={2.5} /></span>
            <p className="mt-3 text-xl text-[#1d1716]" style={OSWALD}>Import applied</p>
            <p className="text-sm text-gray-600 break-words">{result.fileName}</p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat n={result.updated} label="updated" tone="green" />
            <Stat n={result.created} label="new drafts" tone="copper" />
            <Stat n={result.skipped} label="skipped" tone="gray" />
          </div>
          {result.created > 0 && <p className="mt-3 text-xs text-gray-500">New SKUs are drafts hidden from the app. Check them on the Products tab before switching them on.</p>}
          <OutlineButton className="mt-4 w-full" onClick={reset}><Upload className="w-4 h-4" {...ICON} />Import another</OutlineButton>
        </div>
      )}
    </CatalogCard>
  );
}

function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <li className="flex items-start gap-2.5"><span className="mt-0.5 text-[#ae754d] shrink-0">{icon}</span><span className="min-w-0">{children}</span></li>;
}

function Stepper({ step }: { step: number }) {
  const steps = ['Upload', 'Review', 'Done'];
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Import steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className="w-4 sm:w-6 h-px bg-[#d9cdc4]" aria-hidden />}
            <span className={cn('w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center',
              state === 'current' ? 'bg-[#1d1716] text-white' : state === 'done' ? 'bg-[#2e6b3a] text-white' : 'bg-[#ece4dd] text-gray-500')}>
              {state === 'done' ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : n}
            </span>
            <span className={cn('text-sm', state === 'todo' ? 'text-gray-500' : 'font-semibold text-[#1d1716]')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: 'green' | 'copper' | 'gray' }) {
  const c = tone === 'green' ? 'bg-[#e7f3ea] text-[#2e6b3a]' : tone === 'copper' ? 'bg-[#f8ece3] text-[#9a6440]' : 'bg-[#f1ece8] text-[#5b4f4b]';
  return (
    <div className={cn('rounded-xl px-2 py-2.5', c)}>
      <p className="text-2xl leading-none tabular-nums" style={OSWALD}>{n}</p>
      <p className="mt-1 text-xs font-semibold">{label}</p>
    </div>
  );
}

function Review({ plan, canEdit, onCancel, onApply }: { plan: Plan; canEdit: boolean; onCancel: () => void; onApply: () => void }) {
  const total = plan.updates.length + plan.creates.length;
  const reasons = Object.entries(plan.skipped.reduce<Record<string, number>>((m, r) => ({ ...m, [r.reason]: (m[r.reason] ?? 0) + 1 }), {}));
  const lines: { key: string; sku: string; name: string; detail: ReactNode }[] = [
    ...plan.updates.map((u) => ({
      key: `u${u.line}`, sku: u.sku, name: u.name,
      detail: u.changes.map((c) => (
        <span key={c.field} className="inline-flex flex-wrap items-center gap-1 mr-3">
          <span className="text-gray-500">{c.field}</span>
          <span className="text-gray-400 line-through">{c.from}</span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400" {...ICON} />
          <span className="font-semibold text-[#1d1716]">{c.to}</span>
        </span>
      )),
    })),
    ...plan.creates.map((c) => ({ key: `c${c.line}`, sku: c.sku, name: c.name, detail: <span className="text-[#9a6440] font-semibold">New hidden draft · {peso(c.price ?? c.basePrice)}</span> })),
  ];
  const shown = lines.slice(0, REVIEW_ROWS);

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-600 break-words"><span className="font-semibold text-[#1d1716]">{plan.fileName}</span></p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat n={plan.updates.length} label="to update" tone="green" />
        <Stat n={plan.creates.length} label="new drafts" tone="copper" />
        <Stat n={plan.skipped.length} label="skipped" tone="gray" />
      </div>

      {plan.skipped.length > 0 && (
        <details className="mt-3 rounded-xl border border-[#eadfd6] bg-white px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-semibold text-[#1d1716]">
            Skipped: {reasons.map(([r, n]) => `${n} ${r.toLowerCase()}`).join(' · ')}
          </summary>
          <ul className="mt-2 space-y-1 text-[13px] text-gray-600">
            {plan.skipped.map((r) => (
              <li key={r.line} className="flex items-start gap-1.5"><XCircle className="w-4 h-4 shrink-0 text-[#c8151d]" {...ICON} /><span className="min-w-0">Line {r.line} · <span className="font-mono">{r.sku}</span> · {r.reason}</span></li>
            ))}
          </ul>
        </details>
      )}

      {lines.length > 0 ? (
        <ul className="mt-3 divide-y divide-[#f0e8e2] rounded-xl border border-[#eadfd6] bg-white">
          {shown.map((l) => (
            <li key={l.key} className="px-3.5 py-2.5 min-w-0">
              <p className="flex items-baseline gap-2 min-w-0"><span className="font-semibold text-[#1d1716] truncate">{l.name}</span><span className="font-mono text-xs text-gray-400 shrink-0">{l.sku}</span></p>
              <p className="mt-0.5 text-[13px] tabular-nums">{l.detail}</p>
            </li>
          ))}
          {lines.length > shown.length && <li className="px-3.5 py-2 text-xs text-gray-500">+ {lines.length - shown.length} more</li>}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-[#f6f0eb] px-4 py-3 text-sm text-gray-600">Nothing to change: every row was skipped.</p>
      )}

      {!canEdit && <p className="mt-3 text-xs text-amber-700">Read only: your role is missing catalog.edit.</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <RedButton disabled={!canEdit || total === 0} onClick={onApply}>Apply {plural(total, 'change')}</RedButton>
      </div>
    </div>
  );
}

// ---------------- History ----------------
const fmtWhen = (at: string) => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function HistoryCard({ s }: { s: AppState }) {
  const [since] = useState(() => Date.now() - HISTORY_DAYS * 86_400_000);
  const files = (s.catalogFiles ?? []).filter((f) => new Date(f.at).getTime() >= since).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <CatalogCard className="mt-4 md:mt-5 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
        <CardHeading className="text-3xl">History</CardHeading>
        <p className="text-sm text-gray-500">Last {HISTORY_DAYS} days · files kept for 90 days</p>
      </div>
      {files.length === 0 && <p className="px-5 py-8 text-center text-sm text-gray-500 border-t border-[#f0e8e2]">No imports or exports yet.</p>}
      <ul>
        {files.map((f) => {
          const imp = f.kind === 'import';
          const chip = f.failed
            ? { text: `Failed · ${f.failed}`, cls: 'bg-[#fdecec] text-[#c8151d]' }
            : imp
              ? { text: `${f.applied ?? 0} applied${f.skipped ? ` · ${f.skipped} skipped` : ''}`, cls: 'bg-[#e7f3ea] text-[#2e6b3a]' }
              : { text: plural(f.rows ?? 0, 'row'), cls: 'bg-[#e7f3ea] text-[#2e6b3a]' };
          return (
            <li key={f.id} className="border-t border-[#f0e8e2] flex items-center gap-3 px-4 sm:px-6 py-3">
              <span className={cn('w-10 h-10 rounded-full shrink-0 flex items-center justify-center', imp ? 'bg-[#fdecec] text-[#c8151d]' : 'bg-[#e8eef8] text-[#3b5f99]')}>
                {imp ? <Upload className="w-[18px] h-[18px]" {...ICON} /> : <Download className="w-[18px] h-[18px]" {...ICON} />}
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1d1716] break-words">{f.fileName}</p>
                  <p className="text-[13px] text-gray-500">{imp ? 'Import' : 'Export'} · {f.user} · {fmtWhen(f.at)}</p>
                </div>
                <span className={cn('self-start sm:self-auto rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', chip.cls)}>{chip.text}</span>
              </div>
              <button type="button" aria-label={`Download ${f.fileName}`} onClick={() => download(f.fileName, f.content)}
                className="w-11 h-11 shrink-0 rounded-xl border border-[#e3d6cc] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2]">
                <Download className="w-4 h-4" {...ICON} />
              </button>
            </li>
          );
        })}
      </ul>
    </CatalogCard>
  );
}
