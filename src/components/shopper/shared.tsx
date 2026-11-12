'use client';

// Shared pieces for the Shopper App preview (phone-frame SPA).
// Navigation is an in-memory stack router; the whole app reads one context.

import { createContext, useContext } from 'react';
import { ChevronLeft, Minus, Plus, X } from 'lucide-react';
import type { Address, AppState, Branch, Customer, Fulfillment, Product, SubstitutionPref } from '@/src/lib/types';
import { mutate } from '@/src/lib/store';
import { available, getPriceInfo, peso } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';

export type Route =
  | { name: 'home' }
  | { name: 'browse'; catId?: string; q?: string; focus?: boolean }
  | { name: 'product'; id: string }
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

export interface ShopCtx {
  s: AppState;
  shopper: Customer;
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
  go: (r: Route) => void;
  back: () => void;
  reset: (stack: Route[]) => void;
  canGoBack: boolean;
  flash: (text: string, tone?: 'ok' | 'err' | 'info') => void;
  openLocation: () => void;
  pendingVoucher: string;
  setPendingVoucher: (c: string) => void;
}

export const ShopContext = createContext<ShopCtx | null>(null);
export function useShop() {
  const c = useContext(ShopContext);
  if (!c) throw new Error('useShop outside ShopperApp');
  return c;
}

/** Demo addresses beyond the shopper's saved ones (not persisted). */
export const DEMO_ADDRESSES: Address[] = [
  { label: 'Work', line: 'Lanang Business Park, J.P. Laurel Ave, Davao City', landmark: 'Tower 2 lobby', lat: 7.1012, lng: 125.6382 },
  { label: 'Other', line: 'Calinan Poblacion, Davao City (far)', landmark: "Lola's house", lat: 7.19, lng: 125.455 },
];

export const SUB_LABEL: Record<SubstitutionPref, string> = { similar: 'Similar item', ask: 'Ask me', refund: 'Refund' };
export const SUB_HELP: Record<SubstitutionPref, string> = {
  similar: 'Picker may replace it with a similar item',
  ask: 'We will ask you before replacing',
  refund: 'Remove and refund if unavailable',
};

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

/** Estimated price of one cart unit (weighted items: price/kg × est. weight). */
export function unitEst(p: Product, price: number) {
  return p.soldByWeight ? Math.round(price * (p.estWeightKg ?? 1) * 100) / 100 : price;
}

// ---------- Cart ----------
export function cartAdd(productId: string, qty = 1, extra?: { note?: string; subPref?: SubstitutionPref }) {
  mutate((d) => {
    const l = d.cart.find((c) => c.productId === productId);
    if (l) {
      l.qty += qty;
      if (extra?.note !== undefined) l.note = extra.note;
      if (extra?.subPref) l.subPref = extra.subPref;
    } else d.cart.push({ productId, qty, note: extra?.note, subPref: extra?.subPref ?? 'similar' });
  });
}
export function cartSet(productId: string, qty: number) {
  mutate((d) => {
    if (qty <= 0) d.cart = d.cart.filter((c) => c.productId !== productId);
    else {
      const l = d.cart.find((c) => c.productId === productId);
      if (l) l.qty = qty;
    }
  });
}
export function cartPatch(productId: string, patch: { note?: string; subPref?: SubstitutionPref }) {
  mutate((d) => {
    const l = d.cart.find((c) => c.productId === productId);
    if (l) Object.assign(l, patch);
  });
}

// ---------- UI atoms ----------
export function ScreenHeader({ title, sub, right, onBack }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onBack?: () => void }) {
  const { back, canGoBack } = useShop();
  const showBack = onBack || canGoBack;
  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100 px-3 h-14 flex items-center gap-2">
      {showBack && (
        <button onClick={onBack ?? back} className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-gray-100 active:bg-gray-200" aria-label="Back">
          <ChevronLeft className="w-5 h-5 text-gray-800" strokeWidth={2} />
        </button>
      )}
      <div className={cn('flex-1 min-w-0', !showBack && 'pl-1')}>
        <p className="text-[15px] font-semibold text-gray-900 truncate leading-tight">{title}</p>
        {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stepper({ qty, onChange, max, size = 'md' }: { qty: number; onChange: (n: number) => void; max?: number; size?: 'sm' | 'md' }) {
  const b = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  return (
    <div className="inline-flex items-center bg-[#1e40af] text-white rounded-full shadow-sm">
      <button onClick={(e) => { e.stopPropagation(); onChange(qty - 1); }} className={cn(b, 'flex items-center justify-center rounded-full active:bg-white/20')} aria-label="Decrease">
        <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
      <span className={cn('font-semibold text-center tabular-nums', size === 'sm' ? 'text-xs min-w-4' : 'text-sm min-w-6')}>{qty}</span>
      <button
        onClick={(e) => { e.stopPropagation(); if (max === undefined || qty < max) onChange(qty + 1); }}
        disabled={max !== undefined && qty >= max}
        className={cn(b, 'flex items-center justify-center rounded-full active:bg-white/20 disabled:opacity-40')}
        aria-label="Increase"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** Bottom sheet rendered inside the phone (not a page-level portal). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 fm-fade" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[85%] flex flex-col fm-sheet-up shadow-2xl">
        <div className="flex justify-center pt-2"><span className="w-10 h-1 rounded-full bg-gray-300" /></div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 mt-5 mb-2">
      <h3 className="text-[15px] font-semibold text-gray-900">{children}</h3>
      {action}
    </div>
  );
}

export function ProductTile({ p, className }: { p: Product; className?: string }) {
  const { s, branch, go, flash } = useShop();
  const info = getPriceInfo(s, p.id, branch.id);
  const avail = available(s, p.id, branch.id);
  const line = s.cart.find((c) => c.productId === p.id);
  const promo = !!info.compareAt && info.compareAt > info.price;
  const off = promo ? Math.round((1 - info.price / info.compareAt!) * 100) : 0;
  return (
    <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col', className)}>
      <button onClick={() => go({ name: 'product', id: p.id })} className="relative h-24 bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center text-5xl">
        <span className="drop-shadow-sm">{p.image}</span>
        {promo && <span className="absolute top-2 left-2 bg-[#dc2626] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">-{off}%</span>}
        {p.tags.includes('organic') && <span className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md">Organic</span>}
        {avail === 0 && <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-[11px] font-semibold text-gray-600">Out of stock</span>}
      </button>
      <div className="p-2.5 flex-1 flex flex-col">
        <p className="text-[10px] text-gray-400 truncate">{p.brand} · {p.size}</p>
        <button onClick={() => go({ name: 'product', id: p.id })} className="text-left text-[13px] font-medium text-gray-900 leading-tight line-clamp-2 min-h-[2.3em]">{p.name}</button>
        <div className="mt-auto pt-1.5 flex items-end justify-between gap-1">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#1e40af] leading-none">{peso(info.price)}{p.soldByWeight && <span className="text-[10px] font-medium text-gray-500">/kg</span>}</p>
            {promo && <p className="text-[10px] text-gray-400 line-through mt-0.5">{peso(info.compareAt!)}</p>}
          </div>
          {avail === 0 ? null : line ? (
            <Stepper size="sm" qty={line.qty} max={avail} onChange={(n) => cartSet(p.id, n)} />
          ) : (
            <button
              onClick={() => { cartAdd(p.id); flash(`${p.name} added to cart`); }}
              className="w-7 h-7 shrink-0 rounded-full bg-[#1e40af] text-white flex items-center justify-center shadow-sm active:scale-95"
              aria-label={`Add ${p.name}`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HScroll({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x fm-noscroll">{children}</div>;
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm', className)}>{children}</div>;
}

export function PrimaryButton({ children, onClick, disabled, className }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn('w-full h-12 rounded-2xl bg-[#1e40af] text-white font-semibold text-sm shadow-md shadow-blue-900/20 active:scale-[0.99] disabled:bg-gray-300 disabled:shadow-none transition', className)}>
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
