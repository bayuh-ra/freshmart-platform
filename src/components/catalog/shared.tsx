'use client';

// Small helpers shared by the Catalog, Pricing, Inventory and Purchasing pages.

import type { AppState, Category, MovementType, Product, PurchaseOrder, Transfer } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-gray-700 disabled:opacity-50"
      aria-pressed={checked}
    >
      <span className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-[#c8151d]' : 'bg-gray-300')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      {label}
    </button>
  );
}

/** "Fresh Produce › Fruits" */
export function categoryPath(s: AppState, id?: string): string {
  const parts: string[] = [];
  let cur = s.categories.find((c) => c.id === id);
  let guard = 0;
  while (cur && guard++ < 10) {
    parts.unshift(cur.name);
    cur = cur.parentId ? s.categories.find((c) => c.id === cur!.parentId) : undefined;
  }
  return parts.join(' › ') || '—';
}

/** Category id plus all descendants (unlimited depth). */
export function descendantIds(s: AppState, id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of s.categories) if (c.parentId === out[i]) out.push(c.id);
  return out;
}

/** Flattened category tree in display order with depth. */
export function categoryTree(s: AppState) {
  const out: { id: string; name: string; icon: string; depth: number }[] = [];
  const walk = (parentId: string | undefined, depth: number) => {
    s.categories
      .filter((c) => (c.parentId ?? undefined) === parentId)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .forEach((c) => {
        out.push({ id: c.id, name: c.name, icon: c.icon, depth });
        if (depth < 8) walk(c.id, depth + 1);
      });
  };
  walk(undefined, 0);
  return out;
}

/** True when the product sits in `catId` (or one of its subcategories), via categoryId or subcategoryId. */
export function inCategory(s: AppState, p: Product, catId: string): boolean {
  const ids = descendantIds(s, catId);
  return ids.includes(p.categoryId) || (!!p.subcategoryId && ids.includes(p.subcategoryId));
}

/** Top-level categories in customer-app order. */
export function topCategories(s: AppState): Category[] {
  return s.categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Subcategories of a category in sort order. */
export function subcategoriesOf(s: AppState, parentId: string): Category[] {
  return s.categories.filter((c) => c.parentId === parentId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Colour swatches offered for top-level categories. */
export const CATEGORY_COLORS: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#c8151d' }, { name: 'Copper', hex: '#a8612e' }, { name: 'Gold', hex: '#e0a33a' }, { name: 'Plum', hex: '#8b2f6e' },
  { name: 'Teal', hex: '#1f6f6a' }, { name: 'Blue', hex: '#2c4f9e' }, { name: 'Grey', hex: '#6f6764' },
];
/** Category colour (a subcategory uses its parent's). */
export function categoryColor(s: AppState, id?: string): string {
  const c = s.categories.find((x) => x.id === id);
  const top = c?.parentId ? s.categories.find((x) => x.id === c.parentId) : c;
  return top?.color ?? '#6f6764';
}

export const offlineTag = (branchId: string) => `offline:${branchId}`;
export const isOnlineAt = (p: Product, branchId: string) => !p.tags.includes(offlineTag(branchId));
export const visibleTags = (p: Product) => p.tags.filter((t) => !t.startsWith('offline:'));

export function roundPrice(v: number, mode: string) {
  const step = mode.includes('0.25') ? 0.25 : mode.includes('0.50') ? 0.5 : mode.includes('1.00') ? 1 : 0;
  if (!step) return Math.round(v * 100) / 100;
  return Math.round(Math.round(v / step) * step * 100) / 100;
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  receiving: 'Receiving', online_sale: 'Online sale', walkin_sale: 'Walk-in/phone sale', return: 'Return', wastage: 'Wastage/damage',
  expiry: 'Expiry write-off', adjustment: 'Adjustment', count_correction: 'Count correction', transfer_in: 'Transfer in', transfer_out: 'Transfer out',
};
const MOVEMENT_CLASS: Record<MovementType, string> = {
  receiving: 'bg-green-100 text-green-800', online_sale: 'bg-red-100 text-red-800', walkin_sale: 'bg-indigo-100 text-indigo-800',
  return: 'bg-teal-100 text-teal-800', wastage: 'bg-red-100 text-red-700', expiry: 'bg-orange-100 text-orange-800',
  adjustment: 'bg-amber-100 text-amber-800', count_correction: 'bg-purple-100 text-purple-800', transfer_in: 'bg-cyan-100 text-cyan-800', transfer_out: 'bg-gray-200 text-gray-700',
};
export function MovementBadge({ type }: { type: MovementType }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', MOVEMENT_CLASS[type])}>{MOVEMENT_LABEL[type]}</span>;
}

const GENERIC_CLASS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', active: 'bg-green-100 text-green-800', hidden: 'bg-amber-100 text-amber-800', discontinued: 'bg-gray-200 text-gray-500',
  sent: 'bg-red-100 text-red-800', partial: 'bg-amber-100 text-amber-800', received: 'bg-green-100 text-green-800', cancelled: 'bg-gray-200 text-gray-500',
  requested: 'bg-gray-100 text-gray-700', approved: 'bg-red-100 text-red-800', dispatched: 'bg-indigo-100 text-indigo-800',
  ok: 'bg-green-100 text-green-800', low: 'bg-amber-100 text-amber-800', out: 'bg-red-100 text-red-700', scheduled: 'bg-purple-100 text-purple-800', inactive: 'bg-gray-200 text-gray-500',
};
export function StateBadge({ value, label }: { value: Product['status'] | PurchaseOrder['status'] | Transfer['status'] | 'ok' | 'low' | 'out' | 'scheduled' | 'inactive'; label?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap capitalize', GENERIC_CLASS[value] ?? 'bg-gray-100 text-gray-700')}>
      {label ?? (value === 'partial' ? 'Partially received' : value)}
    </span>
  );
}

export function stockState(available: number, onHandQty: number, reorderPoint: number): 'ok' | 'low' | 'out' {
  if (onHandQty <= 0 || available <= 0) return 'out';
  if (available <= reorderPoint) return 'low';
  return 'ok';
}

/** Minimal CSV parser (handles quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

export const today = () => new Date().toISOString().slice(0, 10);
