'use client';

// Shared pieces for the Jovanne's Meat Shop customer website.
// Every page reads one context (ShopContext, provided by the shop layout) and navigates with real URLs.

import { createContext, useContext, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Minus, Phone, Plus, Snowflake, X } from 'lucide-react';
import type { Address, AppState, Branch, CartLine, Customer, CutOption, Fulfillment, Product, SubstitutionPref } from '@/src/lib/types';
import { mutate } from '@/src/lib/store';
import { available, cutCharge, getPriceInfo, getSetting, num, peso } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { ProductImage as PhotoImg, isPhoto } from '@/src/components/ProductImage';

// ---------- Routes ----------
export type Route =
  | { name: 'home' }
  | { name: 'browse'; catId?: string; q?: string; focus?: boolean }
  | { name: 'product'; id: string; editKey?: string }
  | { name: 'profile' }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'confirm'; orderId: string }
  | { name: 'orders' }
  | { name: 'track'; orderId: string }
  | { name: 'receipt'; orderId: string }
  | { name: 'rate'; orderId: string }
  | { name: 'account' }
  | { name: 'addresses' }
  | { name: 'vouchers' }
  | { name: 'notifications' }
  | { name: 'help' }
  | { name: 'chat'; convId?: string };

/** URL for a route of the customer website. */
export function routeHref(r: Route): string {
  switch (r.name) {
    case 'home': return '/';
    case 'browse':
      if (r.catId) return `/category/${r.catId}`;
      if (r.q) return `/search?q=${encodeURIComponent(r.q)}`;
      return r.focus ? '/search' : '/category';
    case 'product': return `/products/${r.id}${r.editKey ? `?edit=${encodeURIComponent(r.editKey)}` : ''}`;
    case 'profile': return '/account/profile';
    case 'cart': return '/cart';
    case 'checkout': return '/checkout';
    case 'confirm': return `/my-orders/${r.orderId}?placed=1`;
    case 'orders': return '/my-orders';
    case 'track': return `/my-orders/${r.orderId}`;
    case 'receipt': return `/my-orders/${r.orderId}/receipt`;
    case 'rate': return `/my-orders/${r.orderId}/rate`;
    case 'account': return '/account';
    case 'addresses': return '/account/addresses';
    case 'vouchers': return '/account/vouchers';
    case 'notifications': return '/account/notifications';
    case 'help': return '/help';
    case 'chat': return `/account/chat${r.convId ? `?c=${encodeURIComponent(r.convId)}` : ''}`;
  }
}

export interface ToastAction { label: string; href: string }

export interface ShopCtx {
  s: AppState;
  /** Signed-in customer (undefined while browsing as a guest). */
  shopper?: Customer;
  addresses: Address[];
  addrIdx: number;
  address: Address;
  setAddrIdx: (i: number) => void;
  branch: Branch;
  autoBranch?: Branch;
  pickupBranch?: Branch;
  /** address is outside every branch's delivery zones */
  outside: boolean;
  /** the selected branch can deliver to the selected address */
  deliveryOk: boolean;
  deliveryBlockReason: string;
  mode: Fulfillment;
  effMode: Fulfillment;
  setMode: (m: Fulfillment) => void;
  branchOverride?: string;
  setBranchOverride: (id?: string) => void;
  /** Navigate to a route or URL (adds a browser history entry). */
  go: (r: Route | string) => void;
  /** Navigate without adding a history entry. */
  replace: (r: Route | string) => void;
  /** Browser back, or `fallback` when there is no page to go back to. */
  back: (fallback?: string) => void;
  flash: (text: string, tone?: 'ok' | 'err' | 'info', action?: ToastAction) => void;
  openLocation: () => void;
  pendingVoucher: string;
  setPendingVoucher: (c: string) => void;
  signOut: () => void;
  /** True while signing out, so protected pages do not bounce to the sign-in page. */
  signingOut: { current: boolean };
}

export const ShopContext = createContext<ShopCtx | null>(null);
export function useShop() {
  const c = useContext(ShopContext);
  if (!c) throw new Error('useShop outside the shop layout');
  return c;
}

/** The signed-in customer. Only use inside pages wrapped in <RequireAuth>. */
export function useMe(): Customer {
  const { shopper } = useShop();
  if (!shopper) throw new Error('useMe() needs a signed-in customer');
  return shopper;
}

/** Sets the browser tab title from a client page ("Beef Brisket | Jovanne's Meat Shop"). */
export function useDocumentTitle(title?: string) {
  useLayoutEffect(() => {
    if (!title) return;
    const next = `${title} | Jovanne’s Meat Shop`;
    let prev = document.title;
    // Next.js writes the route's metadata title after this runs, so re-apply ours whenever <head> changes.
    const apply = () => {
      if (document.title === next) return;
      prev = document.title;
      document.title = next;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      obs.disconnect();
      // Only restore when the next page did not set its own title.
      if (document.title === next) document.title = prev;
    };
  }, [title]);
}

/** Demo addresses beyond the customer's saved ones (not persisted). */
export const DEMO_ADDRESSES: Address[] = [
  { label: 'Work', line: 'Digos City Hall, Rizal Ave, Digos City', landmark: 'Main entrance', lat: 6.7512, lng: 125.3556 },
  { label: 'Other', line: 'Poblacion, Sta. Cruz, Davao del Sur (far)', landmark: "Lola's house", lat: 6.8337, lng: 125.4113 },
];

/** Branch area used as the default map pin (Digos City). */
export const DIGOS_CENTER = { lat: 6.7497, lng: 125.3572 };

/** Address used while browsing as a guest (prices and stock follow the nearest branch). */
export const GUEST_ADDRESS: Address = { label: 'Other', line: 'Digos City, Davao del Sur', lat: DIGOS_CENTER.lat, lng: DIGOS_CENTER.lng };

/** Phase 1: staff call the customer about unavailable items, so every line uses "ask". */
export const DEFAULT_SUB_PREF: SubstitutionPref = 'ask';

/** Ratings are a Phase 2 feature: shown only when a `ff_ratings` setting exists and is true. */
export function ratingsOn(s: AppState, branchId: string) {
  return getSetting(s, 'ff_ratings', branchId) === true;
}

export function meatMaxMins(s: AppState, branchId: string) {
  return num(getSetting(s, 'meatMaxDeliveryMins', branchId)) || 60;
}

export const MEAT_CAT_IDS = ['cat-beef', 'cat-pork', 'cat-chicken'];

/** Hidden categories (and subcategories) are not shown to shoppers, nor are their products. */
export function categoryHidden(s: AppState, id?: string) {
  return !!id && !!s.categories.find((c) => c.id === id)?.hidden;
}
/** Active product whose category and subcategory are not hidden. */
export function shopVisible(s: AppState, p: Product) {
  return p.status === 'active' && !categoryHidden(s, p.categoryId) && !categoryHidden(s, p.subcategoryId);
}
/** Product sits in category `id` (top level via categoryId, subcategory via subcategoryId or a nested categoryId). */
export function inShopCategory(s: AppState, p: Product, id: string) {
  return p.categoryId === id || p.subcategoryId === id || s.categories.some((c) => c.parentId === id && c.id === p.categoryId);
}

/** Top-level categories with Beef, Pork and Chicken first. */
export function orderedTopCategories(s: AppState) {
  const tops = s.categories.filter((c) => !c.parentId && !c.hidden).sort((a, b) => a.sort - b.sort);
  const meat = MEAT_CAT_IDS.map((id) => tops.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);
  return [...meat, ...tops.filter((c) => !meat.includes(c))];
}

// ---------- Meat helpers (weights, cuts, storage) ----------
export const roundKg = (n: number) => Math.round(n * 4) / 4;
export const fmtKg = (n: number) => `${Number(n.toFixed(2))} kg`;
export const minKg = (p: Product) => p.minWeightKg ?? 0.25;
export function defaultKg(p: Product) {
  const ch = p.weightChoices ?? [];
  if (ch.includes(1)) return 1;
  return ch[0] ?? Math.max(minKg(p), p.estWeightKg ?? 1);
}
/** Estimated weight of a cart line (older lines may still use qty × est. weight per piece). */
export function lineWeight(c: CartLine, p: Product) {
  return c.weightKg ?? (p.estWeightKg ?? 1) * c.qty;
}
/** Cut / preparation options a product offers: switched on, and offered on the product's category (when the option names categories). */
export function cutsFor(s: AppState, p: Product): CutOption[] {
  return (p.cutOptionIds ?? []).map((id) => (s.cutOptions ?? []).find((c) => c.id === id))
    .filter((c): c is CutOption => !!c && c.active && (!c.categoryIds || c.categoryIds.includes(p.categoryId)));
}
export function cutById(s: AppState, id?: string) {
  return id ? (s.cutOptions ?? []).find((c) => c.id === id) : undefined;
}
/** Cut charge for a cart line — same rule as lineTotal() (per kg × weight, per piece × qty, or flat per line). */
export function cartCutFee(p: Product, qtyOrKg: number, cut?: CutOption) {
  return p.soldByWeight ? cutCharge(cut, true, 1, qtyOrKg) : cutCharge(cut, false, qtyOrKg);
}
/** Estimated line total — same formula as lineTotal(): weight × price/kg (or qty × price) + cut charge. */
export function lineEst(p: Product, price: number, qtyOrKg: number, cut?: CutOption) {
  return Math.round((price * qtyOrKg + cartCutFee(p, qtyOrKg, cut)) * 100) / 100;
}
export const isCold = (p?: Product) => p?.storage === 'fresh' || p?.storage === 'frozen';

export function StorageBadge({ p, className }: { p: Product; className?: string }) {
  if (p.storage !== 'fresh' && p.storage !== 'frozen') return null;
  const frozen = p.storage === 'frozen';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5', frozen ? 'bg-[#2a2322] text-white' : 'bg-[#f6ece4] text-[#7a4f31]', className)}>
      <Snowflake className="w-3 h-3" /> {frozen ? 'Frozen' : 'Fresh, kept chilled'}
    </span>
  );
}

// ---------- Search (normalized includes + Levenshtein ≤ 1 per word) ----------
export function norm(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
/** 0 = no match, 1 = fuzzy (typo) match, 2 = word match, 3 = exact phrase. */
export function matchScore(s: AppState, p: Product, q: string) {
  const nq = norm(q);
  if (!nq) return 3;
  const cat = s.categories.find((c) => c.id === p.categoryId);
  const parent = cat?.parentId ? s.categories.find((c) => c.id === cat.parentId) : undefined;
  const hay = norm(`${p.name} ${p.brand} ${cat?.name ?? ''} ${parent?.name ?? ''} ${p.tags.join(' ')}`);
  if (hay.includes(nq)) return 3;
  const hw = hay.split(' ');
  let fuzzy = false;
  for (const w of nq.split(' ')) {
    if (hay.includes(w)) continue;
    const ok = w.length >= 3 && hw.some((h) => lev(w, h) <= 1 || (w.length >= 4 && h.length > w.length && lev(w, h.slice(0, w.length)) <= 1));
    if (!ok) return 0;
    fuzzy = true;
  }
  return fuzzy ? 1 : 2;
}

export function popularity(s: AppState) {
  const m: Record<string, number> = {};
  for (const o of s.orders) for (const i of o.items) m[i.productId] = (m[i.productId] ?? 0) + i.qty;
  return m;
}

// ---------- Cart (a line is keyed by product + cut) ----------
export const lineKey = (c: { productId: string; cutId?: string }) => `${c.productId}|${c.cutId ?? ''}`;

/** Add to cart; the same product + cut merges into one line (weights or quantities add up). */
export function cartAdd(add: { productId: string; qty?: number; weightKg?: number; cutId?: string; note?: string }) {
  mutate((d) => {
    const p = d.products.find((x) => x.id === add.productId);
    const weighted = !!p?.soldByWeight;
    const key = lineKey(add);
    const l = d.cart.find((c) => lineKey(c) === key);
    if (l) {
      if (weighted) l.weightKg = roundKg((l.weightKg ?? (p?.estWeightKg ?? 1) * l.qty) + (add.weightKg ?? 0));
      else l.qty += add.qty ?? 1;
      if (weighted) l.qty = 1;
      if (add.note !== undefined) l.note = add.note;
    } else {
      d.cart.push({
        productId: add.productId, qty: weighted ? 1 : add.qty ?? 1, weightKg: weighted ? roundKg(add.weightKg ?? (p ? defaultKg(p) : 1)) : undefined,
        cutId: add.cutId, note: add.note, subPref: DEFAULT_SUB_PREF,
      });
    }
  });
}

/** Change a line. A new cut changes the key: if that line already exists, the two merge. qty ≤ 0 removes it. */
export function cartUpdate(key: string, patch: { qty?: number; weightKg?: number; cutId?: string | null; note?: string }) {
  mutate((d) => {
    const l = d.cart.find((c) => lineKey(c) === key);
    if (!l) return;
    if (patch.qty !== undefined && patch.qty <= 0) { d.cart = d.cart.filter((c) => c !== l); return; }
    if (patch.qty !== undefined) l.qty = patch.qty;
    if (patch.weightKg !== undefined) { l.weightKg = roundKg(patch.weightKg); l.qty = 1; }
    if ('note' in patch) l.note = patch.note || undefined;
    if (patch.cutId !== undefined) {
      const cutId = patch.cutId ?? undefined;
      const other = d.cart.find((c) => c !== l && lineKey(c) === lineKey({ productId: l.productId, cutId }));
      if (other) {
        if (l.weightKg !== undefined) other.weightKg = roundKg((other.weightKg ?? 0) + l.weightKg);
        else other.qty += l.qty;
        d.cart = d.cart.filter((c) => c !== l);
      } else l.cutId = cutId;
    }
  });
}
export function cartRemove(key: string) {
  mutate((d) => { d.cart = d.cart.filter((c) => lineKey(c) !== key); });
}

// ---------- Layout atoms ----------
/** Centered content column (max ~1200px). */
export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 md:px-6', className)}>{children}</div>;
}

/**
 * Page title row. On phones it shows a back button (browser back, or `back` when there is no history);
 * pass `back={false}` on top-level pages (tabs).
 */
export function ScreenHeader({ title, sub, right, back = '/' }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; back?: string | false }) {
  const { back: goBack } = useShop();
  return (
    <div className="flex items-center gap-2 pt-3 pb-3 md:pt-8 md:pb-5">
      {back !== false && (
        <button onClick={() => goBack(back)} className="md:hidden w-11 h-11 -ml-2.5 rounded-full flex items-center justify-center active:bg-black/5" aria-label="Back">
          <ChevronLeft className="w-6 h-6 text-[#2a2322]" strokeWidth={2} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display uppercase tracking-wide text-[22px] md:text-3xl font-semibold text-[#2a2322] leading-tight truncate">{title}</h1>
        {sub && <p className="text-xs md:text-sm text-gray-500 truncate">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Section heading inside a page ("Featured cuts"). */
export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-3 mt-8 mb-3', className)}>
      <h2 className="font-display uppercase tracking-wide text-lg md:text-2xl font-semibold text-[#2a2322] leading-tight flex items-center gap-2">
        <span className="w-1.5 h-5 md:h-6 rounded-full bg-[#c8151d]" aria-hidden />
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Large emoji on a warm tinted tile — the demo's "product photo". */
export function ProductImage({ emoji, className, size = 'md' }: { emoji: string; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const text = size === 'sm' ? 'text-3xl' : size === 'lg' ? 'text-7xl' : size === 'xl' ? 'text-[110px] md:text-[150px]' : 'text-5xl md:text-6xl';
  if (isPhoto(emoji)) {
    return (
      <div className={cn('relative overflow-hidden bg-[#f8e7da]', className)}>
        <PhotoImg image={emoji} fill />
      </div>
    );
  }
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#fdf4ed] via-[#f8e7da] to-[#efd2bd]', className)}>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.75),transparent_60%)]" aria-hidden />
      <span className={cn('relative leading-none drop-shadow-[0_8px_10px_rgba(42,35,34,0.22)]', text)} aria-hidden>{emoji}</span>
    </div>
  );
}

export function Stepper({ qty, onChange, max, size = 'md', className }: { qty: number; onChange: (n: number) => void; max?: number; size?: 'sm' | 'md'; className?: string }) {
  const b = size === 'sm' ? 'w-11 h-11 md:w-9 md:h-9' : 'w-11 h-11';
  return (
    <div className={cn('inline-flex items-center justify-between bg-[#c8151d] text-white rounded-full shadow-sm', className)}>
      <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(qty - 1); }} className={cn(b, 'flex items-center justify-center rounded-full hover:bg-white/15 active:bg-white/25')} aria-label="Decrease">
        <Minus className="w-4 h-4" strokeWidth={2.5} />
      </button>
      <span className="font-semibold text-center tabular-nums text-sm min-w-6">{qty}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (max === undefined || qty < max) onChange(qty + 1); }}
        disabled={max !== undefined && qty >= max}
        className={cn(b, 'flex items-center justify-center rounded-full hover:bg-white/15 active:bg-white/25 disabled:opacity-40')}
        aria-label="Increase"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** − 1.5 kg + control (0.25 kg steps, never below the product minimum). */
export function WeightStepper({ kg, min, onChange, size = 'md' }: { kg: number; min: number; onChange: (kg: number) => void; size?: 'sm' | 'md' }) {
  const b = size === 'sm' ? 'w-11 h-11 md:w-9 md:h-9' : 'w-11 h-11';
  return (
    <div className="inline-flex items-center bg-[#c8151d] text-white rounded-full shadow-sm">
      <button type="button" onClick={(e) => { e.stopPropagation(); onChange(Math.max(min, roundKg(kg - 0.25))); }} disabled={kg <= min} className={cn(b, 'flex items-center justify-center rounded-full hover:bg-white/15 active:bg-white/25 disabled:opacity-40')} aria-label="Less weight">
        <Minus className="w-4 h-4" strokeWidth={2.5} />
      </button>
      <span className="font-semibold text-center tabular-nums whitespace-nowrap text-sm min-w-14">{fmtKg(kg)}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onChange(roundKg(kg + 0.25)); }} className={cn(b, 'flex items-center justify-center rounded-full hover:bg-white/15 active:bg-white/25')} aria-label="More weight">
        <Plus className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on tablet/desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center md:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45 fm-fade" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-lg max-h-[88dvh] flex flex-col fm-sheet-up shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2 md:hidden"><span className="w-10 h-1 rounded-full bg-gray-300" /></div>
        <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-3 md:pt-5">
          <h3 className="font-display uppercase tracking-wide text-lg font-semibold text-[#2a2322]">{title}</h3>
          <button onClick={onClose} className="w-11 h-11 -mr-2 rounded-full hover:bg-gray-100 flex items-center justify-center" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Sticky action bar for phones ("Add to cart", "Checkout"). It sits above the bottom tab bar
 * (via the --tabbar-h variable set by the shop layout) and leaves a spacer so content is not hidden.
 */
export function MobileActionBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-24 md:hidden" aria-hidden />
      <div className="md:hidden fixed inset-x-0 z-30 bottom-[var(--tabbar-h,0px)] bg-white/95 backdrop-blur border-t border-[#eadfd6] px-4 pt-3 pb-[calc(0.75rem+var(--actionbar-safe,0px))] shadow-[0_-6px_20px_rgba(42,35,34,0.08)]">
        {children}
      </div>
    </>
  );
}

export function ProductTile({ p, className }: { p: Product; className?: string }) {
  const { s, branch, flash } = useShop();
  const info = getPriceInfo(s, p.id, branch.id);
  const avail = available(s, p.id, branch.id);
  const lines = s.cart.filter((c) => c.productId === p.id);
  // Weighted meat and items with cut options need choices, so the button opens the product page.
  const needsChoice = p.soldByWeight || cutsFor(s, p).length > 0;
  const plainLine = !needsChoice ? lines.find((c) => !c.cutId) : undefined;
  const inCart = p.soldByWeight ? lines.reduce((n, c) => n + lineWeight(c, p), 0) : lines.reduce((n, c) => n + c.qty, 0);
  const promo = !!info.compareAt && info.compareAt > info.price;
  const off = promo ? Math.round((1 - info.price / info.compareAt!) * 100) : 0;
  const href = `/products/${p.id}`;
  return (
    <div className={cn('group bg-white rounded-2xl border border-[#eadfd6] shadow-sm hover:shadow-md transition overflow-hidden flex flex-col min-w-0', className)}>
      <Link href={href} className="relative block" aria-label={p.name}>
        <ProductImage emoji={p.image} className="aspect-[4/3] group-hover:scale-[1.02] transition-transform" />
        <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {promo && <span className="bg-[#c8151d] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md">−{off}%</span>}
          {p.storage === 'fresh' && <span className="bg-[#ae754d] text-white text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md">Fresh cut</span>}
          {p.storage === 'frozen' && <span className="bg-[#2a2322] text-white text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md">Frozen</span>}
        </span>
        {needsChoice && inCart > 0 && <span className="absolute bottom-2 right-2 bg-[#2a2322] text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-md">{p.soldByWeight ? fmtKg(inCart) : `${inCart}`} in cart</span>}
        {avail === 0 && <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs font-semibold text-gray-700">Out of stock</span>}
      </Link>
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-[11px] text-gray-500 truncate">{p.soldByWeight ? 'Sold by weight' : `${p.brand} · ${p.size}`}</p>
        <Link href={href} className="text-sm font-semibold text-[#2a2322] leading-snug line-clamp-2 min-h-[2.5em] hover:text-[#c8151d]">{p.name}</Link>
        <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
          <p className="text-[15px] font-bold text-[#c8151d] leading-none">{peso(info.price)}{p.soldByWeight && <span className="text-[11px] font-medium text-gray-500">/kg</span>}</p>
          {promo && <p className="text-[11px] text-gray-400 line-through">{peso(info.compareAt!)}</p>}
        </div>
        <div className="mt-auto pt-3">
          {avail === 0 ? (
            <Link href={href} className="w-full h-11 md:h-9 rounded-full border border-gray-200 text-xs font-semibold text-gray-600 flex items-center justify-center">View details</Link>
          ) : plainLine ? (
            <Stepper size="sm" className="w-full" qty={plainLine.qty} max={avail} onChange={(n) => cartUpdate(lineKey(plainLine), { qty: n })} />
          ) : needsChoice ? (
            <Link href={href} className="w-full h-11 md:h-9 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white text-xs font-semibold flex items-center justify-center gap-1">
              {p.soldByWeight ? 'Choose weight' : 'Choose cut'}
            </Link>
          ) : (
            <button
              onClick={() => { cartAdd({ productId: p.id, qty: 1 }); flash(`${p.name} added to cart`, 'ok', { label: 'View cart', href: '/cart' }); }}
              className="w-full h-11 md:h-9 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white text-xs font-semibold flex items-center justify-center gap-1"
              aria-label={`Add ${p.name} to cart`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} /> Add to cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Product grid: 2 columns on phones, 3–5 on tablet/desktop. */
export function ProductGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4', className)}>{children}</div>;
}

/** A row of products: swipeable on phones, a grid on tablet/desktop. */
export function ProductRow({ products, limit = 10 }: { products: Product[]; limit?: number }) {
  return (
    <div className="flex gap-3 overflow-x-auto snap-x -mx-4 px-4 pb-1 fm-noscroll md:mx-0 md:px-0 md:grid md:grid-cols-4 lg:grid-cols-5 md:gap-4 md:overflow-visible">
      {products.slice(0, limit).map((p) => <ProductTile key={p.id} p={p} className="snap-start shrink-0 w-[46%] max-w-[190px] md:w-auto md:max-w-none" />)}
    </div>
  );
}

/** "Call the branch" link (Phase 1 replacement for in-app chat). */
export function CallBranchButton({ branch, className, label = 'Call the branch' }: { branch: Branch; className?: string; label?: string }) {
  return (
    <a href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`} className={cn('min-h-11 px-3 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#c8151d] flex items-center justify-center gap-1.5 text-center', className)}>
      <Phone className="w-4 h-4 text-[#c8151d] shrink-0" /> {label} · {branch.phone}
    </a>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white rounded-2xl border border-[#eadfd6] shadow-sm', className)}>{children}</div>;
}

export function PrimaryButton({ children, onClick, disabled, className, type }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: 'button' | 'submit' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn('w-full h-12 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm shadow-md shadow-red-900/20 active:scale-[0.99] disabled:bg-gray-300 disabled:text-gray-600 disabled:shadow-none transition', className)}>
      {children}
    </button>
  );
}

/** Time slots respecting branch hours, starting after `leadMins`. */
export function makeSlots(branch: Branch, leadMins: number, count = 6) {
  const m = branch.hours.match(/(\d+):(\d+)\s*(AM|PM)\s*[–-]\s*(\d+):(\d+)\s*(AM|PM)/i);
  const to24 = (h: number, ap: string) => (h % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0);
  const open = m ? to24(+m[1], m[3]) : 0;
  const close = m ? to24(+m[4], m[6]) : 24;
  const out: string[] = [];
  const t = new Date(Date.now() + leadMins * 60_000);
  t.setMinutes(0, 0, 0);
  t.setHours(t.getHours() + 1);
  const fmt = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00`;
  let guard = 0;
  while (out.length < count && guard++ < 72) {
    const h = t.getHours();
    if (h >= open && h + 1 <= close) {
      const today = new Date();
      const day = t.toDateString() === today.toDateString() ? 'Today' : 'Tomorrow';
      out.push(`${day} ${fmt(h)}–${fmt(h + 1)} ${h + 1 >= 12 && h + 1 < 24 ? 'PM' : 'AM'}`);
    }
    t.setHours(t.getHours() + 1);
  }
  return out;
}
