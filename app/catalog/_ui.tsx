'use client';

// Shared look for the Catalog pages (Products, Categories, Cuts & prep options, Import / export):
// copper eyebrow + big Oswald title, route tabs with a red underline, cards and controls.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDownUp, Network, Package, Slice } from 'lucide-react';
import { toast } from 'sonner';
import { exportCsv } from '@/src/lib/logic';
import type { AppState, StorageType } from '@/src/lib/types';
import { categoryPath, visibleTags } from '@/src/components/catalog/shared';
import { cn } from '@/src/lib/utils';

export const ICON = { strokeWidth: 1.75 };
export const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;

/** Read a query-string value on the client (the page renders client-side behind ClientGate). */
export const urlParam = (name: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name));

export type CatalogTab = 'products' | 'categories' | 'cuts' | 'import';
const TABS: { key: CatalogTab; label: string; href: string; icon: typeof Package }[] = [
  { key: 'products', label: 'Products', href: '/catalog/products', icon: Package },
  { key: 'categories', label: 'Categories', href: '/catalog/categories', icon: Network },
  { key: 'cuts', label: 'Cuts & prep options', href: '/catalog/cuts', icon: Slice },
  { key: 'import', label: 'Import / export', href: '/catalog/import', icon: ArrowDownUp },
];

/** "CATALOG · …" eyebrow, PRODUCTS title, header buttons and the four route tabs. */
export function CatalogHeader({ tab, eyebrow, actions }: { tab: CatalogTab; eyebrow: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 md:mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{eyebrow}</p>
          <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Products</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <nav aria-label="Catalog sections" className="mt-5 border-b border-[#e8ddd4] overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        <ul className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const active = t.key === tab;
            const Icon = t.icon;
            return (
              <li key={t.key}>
                <Link href={t.href} aria-current={active ? 'page' : undefined}
                  className={cn('relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 text-sm whitespace-nowrap transition-colors',
                    active ? 'font-semibold text-[#c8151d]' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
                  <Icon className="w-4 h-4" {...ICON} />{t.label}
                  {active && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[#c8151d]" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function CatalogCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0', className)}>{children}</section>;
}

export function CardHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-2xl leading-tight text-[#1d1716]', className)} style={OSWALD}>{children}</h2>;
}

/** Solid brand-red button. */
export function RedButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl bg-[#d6202a] px-4 h-11 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#c8151d] disabled:bg-[#efa4a8] disabled:shadow-none disabled:pointer-events-none', className)} />
  );
}

/** White outline button. */
export function OutlineButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl border border-[#e3d6cc] bg-white px-4 h-11 text-sm font-semibold text-[#1d1716] transition-colors hover:bg-[#faf6f2] disabled:opacity-50 disabled:pointer-events-none', className)} />
  );
}

export const outlineLinkClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#e3d6cc] bg-white px-4 h-11 text-sm font-semibold text-[#1d1716] transition-colors hover:bg-[#faf6f2]';

/** Green on/off switch (IN APP, Show in customer app, …). */
export function GreenToggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className="inline-flex items-center justify-center min-w-11 min-h-11 -m-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
      <span className={cn('relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-[#2e6b3a]' : 'bg-[#d9d0c9]')}>
        <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
      </span>
    </button>
  );
}

export const fieldClass = 'w-full h-11 rounded-xl border border-[#e3d6cc] bg-white px-3 text-[15px] text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb] disabled:text-gray-500';

/** Striped placeholder in a category colour (no photo yet). */
export const stripes = (hex: string) => ({
  backgroundImage: `repeating-linear-gradient(135deg, ${hex}33 0 6px, transparent 6px 12px)`,
});

const STORAGE_LABEL: Record<StorageType, string> = { fresh: 'Fresh / chilled', frozen: 'Frozen', shelf: 'Shelf-stable' };

/** Download the whole catalog as CSV. */
export function exportProducts(s: AppState) {
  exportCsv('freshmart-products.csv', [
    ['SKU', 'Barcode', 'Name', 'Brand', 'Category', 'Subcategory', 'Unit', 'Size', 'Base price', 'Cost price', 'Status', 'Tax', 'Storage', 'Sold by weight', 'Cut options', 'Tags', 'Reorder point'],
    ...s.products.map((p) => [
      p.sku, p.barcode, p.name, p.brand, categoryPath(s, p.categoryId), s.categories.find((c) => c.id === p.subcategoryId)?.name ?? '', p.unit, p.size, p.basePrice, p.costPrice, p.status, p.tax,
      p.storage ? STORAGE_LABEL[p.storage] : '', p.soldByWeight ? 'yes' : 'no',
      (p.cutOptionIds ?? []).map((id) => s.cutOptions.find((c) => c.id === id)?.name ?? id).join('; '), visibleTags(p).join('; '), p.reorderPoint,
    ]),
  ]);
  toast.success(`Exported ${s.products.length} products`);
}
