'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Beef, Bell, BellRing, ChevronLeft, ChevronRight, Clock, Drumstick, Ham, Scale, RotateCcw, Search, ShieldCheck, ShoppingCart, Slice, Snowflake, Timer, TriangleAlert, X } from 'lucide-react';
import type { Order, Product } from '@/src/lib/types';
import { available, cutFeeText, distanceKm, getPriceInfo, lineTotal, peso, pesoShort, STATUS_LABEL } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import {
  Card, Container, MEAT_CAT_IDS, MobileActionBar, PrimaryButton, ProductGrid, ProductImage, ProductRow, ProductTile, ScreenHeader, SectionTitle, Stepper, StorageBadge,
  cartAdd, cartCutFee, cartUpdate, cutById, cutsFor, defaultKg, fmtKg, lineEst, lineKey, lineWeight, matchScore, meatMaxMins, minKg, orderedTopCategories, popularity, roundKg,
  reorderToCart, useDocumentTitle, useShop, shopVisible, inShopCategory, categoryHidden,
} from './shared';
import { ProductImage as PhotoImg } from '@/src/components/ProductImage';
import { useStockAlert } from './accountHelpers';

const RECENT_KEY = 'fm-shopper-recent-searches';
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
}
function saveRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch { /* ignore */ }
}

const MEAT_TILE_COLORS = ['from-[#7d0d12] to-[#c8151d]', 'from-[#2a2322] to-[#54433f]', 'from-[#6b4329] to-[#ae754d]'];

// ====================== HOME ======================
/** Home page column — as wide as the shop header and footer. */
const WIDE = 'max-w-[1280px]';
const HERO_ICON: Record<string, typeof Beef> = { 'cat-beef': Beef, 'cat-pork': Ham, 'cat-chicken': Drumstick };
type PopularTab = 'best' | 'featured' | 'frozen';
const POPULAR_TABS: { id: PopularTab; label: string }[] = [
  { id: 'best', label: 'Best sellers' },
  { id: 'featured', label: 'Featured' },
  { id: 'frozen', label: 'Frozen & house-made' },
];
const POPULAR_LIMIT = 14;

export function HomeScreen() {
  const { s, shopper, branch, address, mode, deliveryOk, deliveryBlockReason, pickupBranch, setMode, setBranchOverride, openLocation } = useShop();
  const lastOrder = shopper ? s.orders.filter((o) => o.customerId === shopper.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0] : undefined;
  const [tab, setTab] = useState<PopularTab>('best');
  const products = s.products.filter((p) => shopVisible(s, p));
  const tops = orderedTopCategories(s);
  const meatCats = tops.filter((c) => MEAT_CAT_IDS.includes(c.id));
  const heroCats = meatCats.length ? meatCats : tops.slice(0, 3);
  const pop = useMemo(() => popularity(s), [s]);
  const coldMins = meatMaxMins(s, branch.id);

  // Popular this week: best sellers by units ordered (topped up with featured items), featured, or processed / frozen.
  const featured = products.filter((p) => p.featured);
  const sold = products.filter((p) => (pop[p.id] ?? 0) > 0).sort((a, b) => (pop[b.id] ?? 0) - (pop[a.id] ?? 0));
  const best = [...sold, ...featured.filter((p) => !sold.includes(p))];
  const frozen = products.filter((p) => inShopCategory(s, p, 'cat-processed') || p.storage === 'frozen');
  const shown = (tab === 'best' ? best : tab === 'featured' ? featured : frozen).slice(0, POPULAR_LIMIT);

  const trust = [
    { icon: Slice, title: 'Cut to order', sub: 'Prepared to your specification' },
    { icon: Snowflake, title: 'Cold-chain packed', sub: 'Insulated bags with ice packs' },
    { icon: Timer, title: coldMins === 60 ? 'Delivered within the hour' : `Delivered within ${coldMins} minutes`, sub: 'From packing to your door' },
    { icon: ShieldCheck, title: 'Secure payment', sub: 'GCash, Maya, card or cash' },
  ];
  const steps = [
    { title: 'Choose cut and weight', sub: 'Pick an approximate weight and how you’d like it prepared.' },
    { title: 'We cut, weigh and pack', sub: 'Your order is prepared fresh and packed cold for travel.' },
    { title: 'Pay the actual weight', sub: 'Usually within 5%. Any difference is charged or refunded automatically.' },
  ];

  return (
    <div className="pb-4">
      {/* Hero */}
      <section className="relative bg-[#2a2322] text-white overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/photos/hero-butcher.jpg" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-40 md:opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#2a2322] via-[#2a2322]/90 to-[#2a2322]/45 md:from-[#2a2322] md:from-25% md:via-[#2a2322]/80 md:via-50% md:to-[#2a2322]/30" aria-hidden />
        <Container className={cn(WIDE, 'relative py-10 md:py-16 lg:py-20')}>
          <p className="text-[#ae754d] font-display uppercase font-semibold tracking-[0.35em] text-xs md:text-sm">Digos City · Davao del Sur</p>
          <h1 className="mt-3 leading-none">
            <span className="block font-display uppercase font-bold text-[#e3202a] text-[60px] md:text-[84px] lg:text-[96px] leading-[0.95] tracking-wide">Jovanne’s</span>
            <span className="block [font-family:var(--font-lobster)] text-[44px] md:text-[56px] lg:text-[62px] leading-none -mt-1">Meat Shop</span>
          </h1>
          <p className="mt-5 flex items-center gap-3 md:gap-4 font-display uppercase font-semibold tracking-[0.3em] text-sm md:text-lg">
            <span className="h-0.5 w-8 bg-[#ae754d] shrink-0" aria-hidden /> Premium Quality Meats
          </p>
          <p className="mt-4 text-sm md:text-base text-white/80 leading-relaxed max-w-[440px]">Fresh beef, pork and chicken, cut the way you like, packed cold and delivered around Digos City, or ready for pickup.</p>
          <div className="mt-6 grid grid-cols-3 gap-2 max-w-md sm:flex sm:flex-wrap sm:max-w-none sm:gap-3">
            {heroCats.map((c) => {
              const Icon = HERO_ICON[c.id] ?? Beef;
              return (
                <Link key={c.id} href={`/category/${c.id}`} className="h-11 md:h-12 px-2 sm:px-5 md:px-6 rounded-full bg-[#d6202a] hover:bg-[#c8151d] transition font-display uppercase tracking-wider font-semibold text-[13px] md:text-base flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-black/30">
                  <Icon className="hidden sm:block w-4 h-4" aria-hidden /> Shop {c.name}
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <Container className={WIDE}>
        {shopper && lastOrder && <WelcomeBack o={lastOrder} firstName={shopper.firstName || shopper.name.split(' ')[0]} />}

        {mode === 'delivery' && !deliveryOk && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3.5">
            <div className="flex gap-2.5">
              <TriangleAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-semibold text-sm">Delivery not available</p>
                <p className="mt-0.5">{deliveryBlockReason}</p>
                {pickupBranch && <p className="mt-1">You can still order for <b>pickup at {pickupBranch.name}</b> ({distanceKm(pickupBranch, address)} km away).</p>}
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <button onClick={() => { setMode('pickup'); if (pickupBranch && pickupBranch.id !== branch.id) setBranchOverride(pickupBranch.id); }} className="h-11 md:h-9 px-4 rounded-lg bg-amber-700 text-white text-xs font-semibold">Switch to pickup</button>
                  <button onClick={openLocation} className="h-11 md:h-9 px-4 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-semibold">Change address</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trust strip */}
        <div className="mt-4 md:mt-5 rounded-lg border border-[#eadfd6] bg-[#eadfd6] overflow-hidden grid grid-cols-2 lg:grid-cols-4 gap-px">
          {trust.map(({ icon: Icon, title, sub }) => (
            <div key={title} className="bg-[#fffdfb] p-3 md:px-4 md:py-3.5 flex items-start md:items-center gap-2.5 md:gap-3">
              <Icon className="w-5 h-5 text-[#c8151d] shrink-0 mt-0.5 md:mt-0" strokeWidth={1.75} aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#2a2322] leading-snug">{title}</p>
                <p className="text-[11px] text-gray-500 leading-snug">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Shop by category */}
        <h2 className="mt-8 md:mt-10 pb-2 mb-3 border-b border-[#e6dbd2] text-xl md:text-[22px] font-semibold text-[#2a2322]">Shop by category</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
          {tops.map((c) => {
            const n = products.filter((p) => inShopCategory(s, p, c.id)).length;
            const unit = MEAT_CAT_IDS.includes(c.id) ? (n === 1 ? 'cut' : 'cuts') : (n === 1 ? 'product' : 'products');
            return (
              <Link key={c.id} href={`/category/${c.id}`} className="group bg-[#fffdfb] rounded-lg border border-[#eadfd6] overflow-hidden hover:shadow-md transition flex flex-col">
                <span className="relative block aspect-[4/3] bg-[#f6ece4] overflow-hidden">
                  {c.photo
                    ? <PhotoImg image={c.photo} fill className="transition-transform duration-300 group-hover:scale-105" />
                    : <span className="absolute inset-0 flex items-center justify-center text-5xl" aria-hidden>{c.icon}</span>}
                </span>
                <span className="px-3 py-2.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#2a2322] truncate">{c.name}</span>
                    <span className="block text-[11px] text-gray-500">{n} {unit}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-500 shrink-0 group-hover:text-[#c8151d]" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>

        {/* How ordering by weight works (guests and customers without orders) */}
        {!lastOrder && <section className="mt-8 rounded-lg border border-[#eadfd6] bg-[#eadfd6] overflow-hidden grid grid-cols-1 md:grid-cols-3 lg:grid-cols-[minmax(0,310px)_1fr_1fr_1fr] gap-px" aria-labelledby="by-weight">
          <div className="bg-[#2a2322] text-white px-4 py-4 md:col-span-3 lg:col-span-1 flex flex-col justify-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9a07a]">First order?</p>
            <h2 id="by-weight" className="text-lg font-semibold leading-snug mt-0.5">How ordering by weight works</h2>
          </div>
          {steps.map((st, i) => (
            <div key={st.title} className="bg-[#fffdfb] p-4 flex items-start gap-3">
              <span className="w-7 h-7 rounded-full border-[1.5px] border-[#c8151d] text-[#c8151d] text-xs font-semibold flex items-center justify-center shrink-0" aria-hidden>{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#2a2322]">{st.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{st.sub}</p>
              </div>
            </div>
          ))}
        </section>}

        {/* Popular this week */}
        <div className="mt-8 md:mt-10 mb-3 border-b border-[#e6dbd2] flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-4">
          <div className="pb-0 md:pb-2">
            <h2 className="text-xl md:text-[22px] font-semibold text-[#2a2322]">Popular this week</h2>
            <p className="text-xs text-gray-500 mt-0.5">Priced per kilogram unless stated. Each order is weighed after preparation.</p>
          </div>
          <div className="flex overflow-x-auto fm-noscroll -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Popular products">
            {POPULAR_TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={cn('shrink-0 h-10 px-3 text-[13px] whitespace-nowrap border-b-2 -mb-px transition',
                  tab === t.id ? 'border-[#c8151d] font-semibold text-[#2a2322]' : 'border-transparent text-gray-500 hover:text-[#2a2322]')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">Nothing here yet. <Link href="/category" className="font-semibold text-[#c8151d] hover:underline">Browse all products</Link></p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2.5 md:gap-3" role="tabpanel">
            {shown.map((p) => <PopularCard key={p.id} p={p} />)}
          </div>
        )}
      </Container>
    </div>
  );
}

/** Signed-in strip: latest order (up to 3 items) with Order history and one-tap Reorder. */
function WelcomeBack({ o, firstName }: { o: Order; firstName: string }) {
  const { s, branch, flash, go } = useShop();
  const date = new Date(o.placedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  // Approximate reorder total at today's prices (items still sold and in stock).
  const approx = o.items.reduce((n, i) => {
    const p = s.products.find((x) => x.id === i.productId);
    if (!p || p.status !== 'active' || available(s, p.id, branch.id) <= 0) return n;
    const cut = i.cut && cutsFor(s, p).find((c) => c.id === i.cut!.id);
    const amount = p.soldByWeight ? i.estWeightKg ?? (p.estWeightKg ?? 1) * i.qty : i.qty;
    return n + lineEst(p, getPriceInfo(s, p.id, branch.id).price, amount, cut || undefined);
  }, 0);
  const money = (n: number) => (Number.isInteger(n) ? pesoShort(n) : peso(n));
  const reorder = () => {
    const { added, flagged } = reorderToCart(o, branch.id);
    if (!added.length) { flash('These items are not available right now', 'err'); return; }
    flash(flagged.length ? `${added.length} added · ${flagged.length} not available` : `${added.length} item${added.length === 1 ? '' : 's'} added to cart`, flagged.length ? 'info' : 'ok');
    go({ name: 'cart' });
  };
  return (
    <section className="mt-4 md:mt-5 rounded-lg border border-[#eadfd6] bg-[#fffdfb] p-3 md:px-4 md:py-3 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-5" aria-label="Your last order">
      <div className="shrink-0">
        <p className="text-[15px] font-semibold text-[#2a2322]">Welcome back, {firstName}</p>
        <p className="text-[11px] text-gray-500">Last order · {date} · {STATUS_LABEL[o.status].toLowerCase()}</p>
      </div>
      <ul className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
        {o.items.slice(0, 3).map((i) => (
          <li key={`${i.productId}|${i.cut?.id ?? ''}`} className="flex items-center gap-2.5 min-w-0">
            <ProductImage emoji={i.image} size="sm" className="w-9 h-9 rounded shrink-0" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-[#2a2322] truncate">{i.name}</span>
              <span className="block text-[11px] text-gray-500 truncate">
                {i.soldByWeight ? fmtKg(i.actualWeightKg ?? i.estWeightKg ?? 1) : `× ${i.qty}`}{i.cut ? ` · ${i.cut.name.toLowerCase()}` : ''} · {money(lineTotal(i))}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-4">
        <Link href="/my-orders" className="text-[13px] font-semibold text-[#c8151d] hover:underline min-h-11 sm:min-h-0 inline-flex items-center justify-center">Order history</Link>
        <button onClick={reorder} className="h-11 sm:h-10 px-4 rounded-lg bg-[#d6202a] hover:bg-[#c8151d] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 w-full sm:w-auto whitespace-nowrap transition">
          <RotateCcw className="w-4 h-4" aria-hidden /> Reorder{approx > 0 ? ` · approx. ${money(Math.round(approx))}` : ''}
        </button>
      </div>
    </section>
  );
}

/** Product card for "Popular this week": category, name, one-line description, price and one action. */
function PopularCard({ p }: { p: Product }) {
  const { s, branch, flash } = useShop();
  const { following: notified, follow } = useStockAlert(p.id, p.name);
  const info = getPriceInfo(s, p.id, branch.id);
  const avail = available(s, p.id, branch.id);
  const own = s.categories.find((c) => c.id === p.categoryId);
  const cat = own?.parentId ? s.categories.find((c) => c.id === own.parentId) : own;
  const needsChoice = p.soldByWeight || cutsFor(s, p).length > 0;
  const promo = !!info.compareAt && info.compareAt > info.price;
  const money = (n: number) => (Number.isInteger(n) ? pesoShort(n) : peso(n));
  const per = p.soldByWeight ? 'per kg' : p.unit === 'pc' ? 'per piece' : p.unit === 'pack' ? 'per pack' : `per ${p.size}`;
  const href = `/products/${p.id}`;
  const btn = 'w-full h-10 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition';
  return (
    <div className="group bg-[#fffdfb] rounded-lg border border-[#eadfd6] overflow-hidden flex flex-col min-w-0 hover:shadow-md transition">
      <Link href={href} className="relative block" aria-label={p.name}>
        <ProductImage emoji={p.image} className="aspect-[4/3]" />
        {avail === 0 && <span className="absolute inset-x-2 bottom-2 rounded bg-[#2a2322]/90 text-white text-[11px] font-semibold text-center py-1">Out of stock today</span>}
        {avail > 0 && promo && <span className="absolute top-2 left-2 bg-[#c8151d] text-white text-[11px] font-bold px-1.5 py-0.5 rounded">−{Math.round((1 - info.price / info.compareAt!) * 100)}%</span>}
      </Link>
      <div className="p-3 flex-1 flex flex-col">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500 truncate">{cat?.name}</p>
        <Link href={href} className="mt-0.5 text-sm font-semibold text-[#2a2322] truncate hover:text-[#c8151d]">{p.name}</Link>
        <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>
        <p className="mt-2 flex items-baseline gap-1.5 flex-wrap">
          <b className="text-[15px] font-bold text-[#2a2322] leading-none">{money(info.price)}</b>
          <span className="text-[11px] text-gray-500">{per}</span>
          {promo && <span className="text-[11px] text-gray-400 line-through">{money(info.compareAt!)}</span>}
        </p>
        <div className="mt-auto pt-3">
          {avail === 0 ? (
            <button onClick={follow} disabled={notified}
              className={cn(btn, 'bg-white border border-[#d9cdc3] text-[#2a2322] hover:border-[#2a2322] disabled:text-gray-500 disabled:hover:border-[#d9cdc3]')}>
              {notified ? <><BellRing className="w-3.5 h-3.5" /> We&apos;ll let you know</> : 'Notify me when available'}
            </button>
          ) : needsChoice ? (
            <Link href={href} className={cn(btn, 'bg-[#1d1716] hover:bg-[#372e2f] text-white')}>{p.soldByWeight ? 'Select weight' : 'Select cut'}</Link>
          ) : (
            <button onClick={() => { cartAdd({ productId: p.id, qty: 1 }); flash(`${p.name} added to cart`, 'ok', { label: 'View cart', href: '/cart' }); }}
              className={cn(btn, 'bg-[#1d1716] hover:bg-[#372e2f] text-white')} aria-label={`Add ${p.name} to cart`}>
              Add to cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ====================== ALL CATEGORIES ======================
export function CategoriesScreen() {
  const { s, branch } = useShop();
  const active = s.products.filter((p) => shopVisible(s, p));
  const countIn = (id: string) => active.filter((p) => inShopCategory(s, p, id)).length;
  const tops = orderedTopCategories(s);
  return (
    <Container className="pb-6">
      <ScreenHeader title="Categories" sub={`${active.length} products at ${branch.name} branch`} back={false}
        right={<Link href="/search" className="md:hidden w-11 h-11 rounded-full bg-white border border-[#eadfd6] flex items-center justify-center" aria-label="Search"><Search className="w-5 h-5" /></Link>} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {tops.map((c, i) => {
          const kids = s.categories.filter((k) => k.parentId === c.id && !k.hidden).sort((a, b) => a.sort - b.sort);
          return (
            <Card key={c.id} className="overflow-hidden">
              <Link href={`/category/${c.id}`} className="w-full flex items-center gap-3 p-3 md:p-4 text-left hover:bg-[#fdf8f4]">
                <span className={cn('w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0', i < 3 ? 'bg-gradient-to-br text-white ' + MEAT_TILE_COLORS[i] : 'bg-[#f6ece4]')} aria-hidden>{c.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-display uppercase tracking-wide text-lg font-semibold">{c.name}</span>
                  <span className="block text-xs text-gray-500">{countIn(c.id)} items</span>
                </span>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
              {kids.length > 0 && (
                <div className="border-t border-[#f1e8e1] pl-[84px]">
                  {kids.map((k) => (
                    <Link key={k.id} href={`/category/${k.id}`} className="w-full flex items-center justify-between pr-4 min-h-11 text-left border-b border-[#f6efe9] last:border-0 hover:text-[#c8151d]">
                      <span className="text-sm text-gray-700">{k.icon} {k.name}</span>
                      <span className="text-xs text-gray-500">{countIn(k.id)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Container>
  );
}

// ====================== FILTERED PRODUCT LIST (category + search) ======================
type SortKey = 'relevance' | 'popular' | 'price_asc' | 'price_desc' | 'name';
const SORT_LABEL: Record<SortKey, string> = { relevance: 'Relevance', popular: 'Popularity', price_asc: 'Price: low to high', price_desc: 'Price: high to low', name: 'Name A–Z' };

function FilteredProducts({ products, q, onClearSearch }: { products: Product[]; q: string; onClearSearch?: () => void }) {
  const { s, branch } = useShop();
  const [promoOnly, setPromoOnly] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<SortKey>('relevance');
  const pop = useMemo(() => popularity(s), [s]);

  const scored = products
    .map((p) => ({ p, score: matchScore(s, p, q), price: getPriceInfo(s, p.id, branch.id), avail: available(s, p.id, branch.id) }))
    .filter((x) => x.score > 0)
    .filter((x) => !promoOnly || (!!x.price.compareAt && x.price.compareAt > x.price.price))
    .filter((x) => !inStock || x.avail > 0);
  const onlyFuzzy = q && scored.length > 0 && scored.every((x) => x.score === 1);
  scored.sort((a, b) => {
    switch (sort) {
      case 'price_asc': return a.price.price - b.price.price;
      case 'price_desc': return b.price.price - a.price.price;
      case 'name': return a.p.name.localeCompare(b.p.name);
      case 'popular': return (pop[b.p.id] ?? 0) - (pop[a.p.id] ?? 0);
      default: return b.score - a.score || (pop[b.p.id] ?? 0) - (pop[a.p.id] ?? 0);
    }
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip on={promoOnly} onClick={() => setPromoOnly(!promoOnly)}>On sale</Chip>
        <Chip on={inStock} onClick={() => setInStock(!inStock)}>In stock</Chip>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-600">
          <span className="hidden sm:inline">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort products"
            className="h-11 md:h-9 rounded-full border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#c8151d] max-w-[170px]">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs md:text-sm text-gray-600 mb-3">
        {scored.length} product{scored.length === 1 ? '' : 's'}{q && <> for “<b className="text-gray-900">{q}</b>”</>}
        {onlyFuzzy && <span className="block text-amber-800 mt-0.5">Showing close matches (we corrected a possible typo)</span>}
      </p>
      {scored.length === 0 ? (
        <div className="text-center py-14 px-8">
          <p className="text-4xl" aria-hidden>🔍</p>
          <p className="text-base font-semibold mt-2">No products found</p>
          <p className="text-sm text-gray-600 mt-1">Try a different spelling, remove filters or browse categories.</p>
          <button onClick={() => { setPromoOnly(false); setInStock(false); onClearSearch?.(); }} className="mt-3 min-h-11 px-4 text-sm font-semibold text-[#c8151d] hover:underline">Clear search &amp; filters</button>
        </div>
      ) : (
        <ProductGrid>{scored.map(({ p }) => <ProductTile key={p.id} p={p} />)}</ProductGrid>
      )}
    </div>
  );
}

function Chip({ children, on, onClick }: { children: React.ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cn('shrink-0 h-11 md:h-9 px-4 rounded-full text-xs font-semibold border inline-flex items-center gap-1 whitespace-nowrap transition', on ? 'bg-[#c8151d] border-[#c8151d] text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300')}>
      {children}
    </button>
  );
}

// ====================== CATEGORY ======================
export function CategoryScreen({ id }: { id: string }) {
  const { s } = useShop();
  const found = s.categories.find((c) => c.id === id);
  const cat = found && !found.hidden && !categoryHidden(s, found.parentId) ? found : undefined;
  useDocumentTitle(cat?.name);
  if (!cat) {
    return (
      <Container className="py-16 text-center">
        <p className="text-4xl" aria-hidden>🔍</p>
        <p className="text-base font-semibold mt-2">Category not found</p>
        <Link href="/category" className="inline-flex items-center min-h-11 mt-2 text-sm font-semibold text-[#c8151d] hover:underline">See all categories</Link>
      </Container>
    );
  }
  const parent = cat.parentId ? s.categories.find((c) => c.id === cat.parentId) : undefined;
  const kids = s.categories.filter((c) => c.parentId === cat.id && !c.hidden).sort((a, b) => a.sort - b.sort);
  const products = s.products.filter((p) => shopVisible(s, p) && inShopCategory(s, p, cat.id));
  const countIn = (cid: string) => s.products.filter((p) => shopVisible(s, p) && inShopCategory(s, p, cid)).length;
  return (
    <Container className="pb-6">
      <nav className="hidden md:flex items-center gap-1 text-sm text-gray-500 pt-6 -mb-4" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[#c8151d]">Home</Link><ChevronRight className="w-3.5 h-3.5" />
        <Link href="/category" className="hover:text-[#c8151d]">Categories</Link>
        {parent && <><ChevronRight className="w-3.5 h-3.5" /><Link href={`/category/${parent.id}`} className="hover:text-[#c8151d]">{parent.name}</Link></>}
      </nav>
      <ScreenHeader title={<><span aria-hidden>{cat.icon}</span> {cat.name}</>} sub={`${products.length} products`} back={parent ? `/category/${parent.id}` : '/category'} />
      {kids.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto fm-noscroll -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
          {kids.map((k) => (
            <Link key={k.id} href={`/category/${k.id}`} className="shrink-0 h-11 md:h-9 px-4 rounded-full text-xs font-semibold border bg-white border-gray-200 text-gray-700 hover:border-[#c8151d] inline-flex items-center gap-1 whitespace-nowrap">
              {k.icon} {k.name} · {countIn(k.id)}
            </Link>
          ))}
        </div>
      )}
      <FilteredProducts key={cat.id} products={products} q="" />
    </Container>
  );
}

// ====================== SEARCH ======================
const POPULAR = ['liempo', 'ground beef', 'whole chicken', 'bulalo', 'longganisa', 'pork chop'];

export function SearchScreen() {
  const { s } = useShop();
  const router = useRouter();
  const params = useSearchParams();
  const submitted = (params.get('q') ?? '').trim();
  const [query, setQuery] = useState(submitted);
  const [typing, setTyping] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);
  useDocumentTitle(submitted ? `Search: ${submitted}` : undefined);

  // Keep the box in sync when the URL changes (browser back/forward, header search).
  const [lastSubmitted, setLastSubmitted] = useState(submitted);
  if (lastSubmitted !== submitted) {
    setLastSubmitted(submitted);
    setQuery(submitted);
    setTyping(false);
  }

  useEffect(() => {
    if (!submitted) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = s.products.filter((p) => shopVisible(s, p));
  const showSuggest = typing && query.trim() && query.trim() !== submitted;
  const suggestions = showSuggest
    ? active.map((p) => ({ p, sc: matchScore(s, p, query) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 6)
    : [];
  const catSuggestions = showSuggest ? s.categories.filter((c) => !c.hidden && !categoryHidden(s, c.parentId) && c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 2) : [];

  const submit = (text: string) => {
    const t = text.trim();
    setQuery(t);
    setTyping(false);
    inputRef.current?.blur();
    if (t) {
      const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      setRecent(next);
      saveRecent(next);
    }
    router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
  };

  return (
    <Container className="pb-6">
      <div className="flex items-center gap-1 pt-3 pb-3 md:pt-8 md:pb-5">
        <button onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} className="md:hidden w-11 h-11 -ml-2.5 rounded-full flex items-center justify-center active:bg-black/5 shrink-0" aria-label="Back">
          <ChevronLeft className="w-6 h-6" strokeWidth={2} />
        </button>
        <h1 className="sr-only">Search</h1>
        <form role="search" onSubmit={(e) => { e.preventDefault(); submit(query); }} className="flex-1 relative min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setTyping(true); }}
            placeholder="Search beef, pork, chicken, cuts…"
            aria-label="Search products"
            className="w-full h-12 rounded-full bg-white border border-[#eadfd6] pl-11 pr-12 text-base md:text-sm outline-none focus:border-[#c8151d] focus:ring-4 focus:ring-[#c8151d]/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setTyping(true); inputRef.current?.focus(); }} className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100" aria-label="Clear search">
              <X className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>

      {showSuggest ? (
        <Card className="overflow-hidden">
          {catSuggestions.map((c) => (
            <Link key={c.id} href={`/category/${c.id}`} className="w-full flex items-center gap-3 px-4 min-h-12 border-b border-[#f6efe9] text-left hover:bg-[#fdf8f4]">
              <span className="text-xl" aria-hidden>{c.icon}</span>
              <span className="text-sm">in <b>{c.name}</b></span>
            </Link>
          ))}
          {suggestions.map(({ p }) => (
            <Link key={p.id} href={`/products/${p.id}`} className="w-full flex items-center gap-3 px-4 py-2 border-b border-[#f6efe9] text-left hover:bg-[#fdf8f4]">
              <ProductImage emoji={p.image} size="sm" className="w-11 h-11 rounded-xl shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{p.name}</span>
                <span className="block text-xs text-gray-500">{p.soldByWeight ? 'Sold by weight' : `${p.brand} · ${p.size}`}</span>
              </span>
            </Link>
          ))}
          <button onClick={() => submit(query)} className="w-full px-4 min-h-12 text-left text-sm text-[#c8151d] font-semibold hover:bg-[#fdf8f4]">Search for “{query.trim()}”</button>
          {suggestions.length === 0 && <p className="px-4 pb-4 text-xs text-gray-500">No close matches — try another spelling.</p>}
        </Card>
      ) : submitted ? (
        <FilteredProducts key={submitted} products={active} q={submitted} onClearSearch={() => submit('')} />
      ) : (
        <div className="md:max-w-2xl">
          {recent.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent searches</p>
                <button onClick={() => { setRecent([]); saveRecent([]); }} className="min-h-11 px-2 text-xs text-gray-600 hover:text-[#c8151d]">Clear</button>
              </div>
              {recent.map((r) => (
                <button key={r} onClick={() => submit(r)} className="w-full flex items-center gap-3 min-h-11 text-sm text-gray-700 hover:text-[#c8151d]"><Clock className="w-4 h-4 text-gray-400" /> {r}</button>
              ))}
            </>
          )}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">Popular</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((t) => (
              <button key={t} onClick={() => submit(t)} className="h-11 md:h-9 px-4 rounded-full bg-white border border-[#eadfd6] text-sm text-gray-700 hover:border-[#c8151d]">{t}</button>
            ))}
          </div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-6 mb-2">Browse</p>
          <div className="flex flex-wrap gap-2">
            {orderedTopCategories(s).map((c) => (
              <Link key={c.id} href={`/category/${c.id}`} className="h-11 md:h-9 px-4 rounded-full bg-white border border-[#eadfd6] text-sm text-gray-700 hover:border-[#c8151d] inline-flex items-center gap-1.5">{c.icon} {c.name}</Link>
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}

// ====================== PRODUCT DETAIL ======================
export function ProductScreen({ id, editKey }: { id: string; editKey?: string }) {
  const { s, branch, back, flash, replace } = useShop();
  const p = s.products.find((x) => x.id === id && shopVisible(s, x));
  const editLine = editKey ? s.cart.find((c) => lineKey(c) === editKey) : undefined;
  const cuts = p ? cutsFor(s, p) : [];
  const [qty, setQty] = useState(editLine?.qty ?? 1);
  const [kg, setKg] = useState(() => (p ? (editLine ? lineWeight(editLine, p) : defaultKg(p)) : 1));
  const [kgText, setKgText] = useState(String(kg));
  const [cutId, setCutId] = useState<string | undefined>(editLine ? editLine.cutId : cuts[0]?.id);
  const [note, setNote] = useState(editLine?.note ?? '');
  const { following: notified, follow } = useStockAlert(p?.id ?? id, p?.name ?? '');
  useDocumentTitle(p?.name);
  if (!p) {
    return (
      <Container className="py-16 text-center">
        <p className="text-4xl" aria-hidden>🥩</p>
        <p className="text-base font-semibold mt-2">This product is no longer available.</p>
        <Link href="/category" className="inline-flex items-center min-h-11 mt-2 text-sm font-semibold text-[#c8151d] hover:underline">Browse categories</Link>
      </Container>
    );
  }
  const info = getPriceInfo(s, p.id, branch.id);
  const avail = available(s, p.id, branch.id);
  const promo = !!info.compareAt && info.compareAt > info.price;
  const cat = s.categories.find((c) => c.id === p.categoryId);
  const related = s.products.filter((x) => shopVisible(s, x) && x.categoryId === p.categoryId && x.id !== p.id).slice(0, 10);
  const min = minKg(p);
  const choices = (p.weightChoices ?? [0.5, 1, 1.5, 2]).filter((w) => w >= min);
  const cut = cuts.find((c) => c.id === cutId);
  const amount = p.soldByWeight ? kg : qty;
  const cutFee = cartCutFee(p, amount, cut);
  const est = lineEst(p, info.price, amount, cut);
  const kgError = p.soldByWeight && (!(Number(kgText) > 0) || Number(kgText) < min) ? `Minimum is ${fmtKg(min)}` : '';
  const inCart = s.cart.filter((c) => c.productId === p.id && (!editLine || c !== editLine));
  const tagMeta: Record<string, { label: string; cls: string; icon?: React.ReactNode }> = {
    halal: { label: 'Halal', cls: 'bg-emerald-50 text-emerald-800', icon: <ShieldCheck className="w-3 h-3" /> },
    local: { label: 'Local', cls: 'bg-[#f6ece4] text-[#7a4f31]' },
    imported: { label: 'Imported', cls: 'bg-gray-100 text-gray-700' },
  };
  const tags = p.tags.filter((t) => t !== 'chilled' && t !== 'frozen' && t !== 'fresh');

  const pickKg = (w: number) => { setKg(w); setKgText(String(w)); };
  const commitKgText = () => {
    const n = Number(kgText);
    if (!(n > 0)) { setKgText(String(kg)); return; }
    pickKg(Math.max(min, roundKg(n)));
  };

  const addToCart = () => {
    if (kgError) { flash(kgError, 'err'); return; }
    const q = Math.min(qty, avail);
    const what = p.soldByWeight ? `${fmtKg(kg)} ${p.name}` : `${q} × ${p.name}`;
    if (editLine) {
      cartUpdate(editKey!, { ...(p.soldByWeight ? { weightKg: kg } : { qty: q }), note, cutId: cutId ?? null });
      flash('Cart updated');
      replace('/cart');
    } else {
      cartAdd({ productId: p.id, qty: q, weightKg: p.soldByWeight ? kg : undefined, cutId, note: note || undefined });
      flash(`${what} added to cart`, 'ok', { label: 'View cart', href: '/cart' });
    }
  };

  const actions = avail === 0 ? (
    <PrimaryButton onClick={follow} disabled={notified} className={notified ? '' : 'bg-[#2a2322] hover:bg-[#372e2f]'}>
      <span className="inline-flex items-center gap-2">{notified ? <><BellRing className="w-4 h-4" /> We&apos;ll let you know</> : <><Bell className="w-4 h-4" /> Notify me when available</>}</span>
    </PrimaryButton>
  ) : (
    <div className="flex items-center gap-3">
      {!p.soldByWeight && <Stepper qty={qty} max={avail} onChange={(n) => setQty(Math.max(1, n))} className="shrink-0" />}
      <PrimaryButton onClick={addToCart} disabled={!!kgError} className="flex-1 min-w-0 px-3">
        <span className="inline-flex items-center gap-2 truncate">
          <ShoppingCart className="w-4 h-4 shrink-0" />
          {editLine ? 'Update cart' : p.soldByWeight ? `Add ${fmtKg(kg)}` : 'Add to cart'} · {peso(est)}{p.soldByWeight ? ' est.' : ''}
        </span>
      </PrimaryButton>
    </div>
  );

  return (
    <div className="pb-4">
      <Container>
        <nav className="hidden md:flex items-center gap-1 text-sm text-gray-500 pt-6 pb-4 min-w-0" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-[#c8151d]">Home</Link><ChevronRight className="w-3.5 h-3.5 shrink-0" />
          {cat && <><Link href={`/category/${cat.id}`} className="hover:text-[#c8151d]">{cat.name}</Link><ChevronRight className="w-3.5 h-3.5 shrink-0" /></>}
          <span className="text-gray-800 truncate">{p.name}</span>
        </nav>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-10 items-start">
          {/* Image */}
          <div className="relative -mx-4 md:mx-0 md:sticky md:top-[140px]">
            <ProductImage emoji={p.image} size="xl" className="aspect-[4/3] md:aspect-square md:rounded-3xl md:border md:border-[#eadfd6] fm-pop" />
            <button onClick={() => back(cat ? `/category/${cat.id}` : '/')} className="md:hidden absolute top-3 left-3 w-11 h-11 rounded-full bg-white/90 shadow flex items-center justify-center" aria-label="Back"><ChevronLeft className="w-6 h-6" /></button>
            <span className="absolute bottom-4 left-4 md:top-4 md:bottom-auto flex gap-1.5">
              {promo && <span className="bg-[#c8151d] text-white text-xs font-bold px-2 py-1 rounded-lg">SAVE {Math.round((1 - info.price / info.compareAt!) * 100)}%</span>}
              {p.storage === 'fresh' && <span className="bg-[#ae754d] text-white text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-lg">Fresh cut</span>}
            </span>
          </div>

          {/* Details */}
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-gray-500">{p.brand} · {cat?.name}</p>
            <h1 className="font-display uppercase tracking-wide text-2xl md:text-4xl font-semibold leading-tight mt-0.5 text-[#2a2322]">{p.name}</h1>
            {!p.soldByWeight && <p className="text-sm text-gray-600">{p.size}</p>}
            <div className="flex items-end gap-2 mt-3">
              <p className="text-2xl md:text-3xl font-bold text-[#c8151d]">{peso(info.price)}{p.soldByWeight && <span className="text-sm font-medium text-gray-500"> / kg</span>}</p>
              {promo && <p className="text-sm text-gray-500 line-through mb-1">{peso(info.compareAt!)}</p>}
            </div>
            <p className="text-xs text-gray-500">{branch.name} branch price · VAT inclusive</p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              <StorageBadge p={p} />
              {tags.map((t) => (
                <span key={t} className={cn('inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5', tagMeta[t]?.cls ?? 'bg-gray-100 text-gray-700')}>{tagMeta[t]?.icon}{tagMeta[t]?.label ?? t}</span>
              ))}
            </div>

            <div className={cn('mt-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1', avail === 0 ? 'bg-[#fdecec] text-[#a3111a]' : avail <= 5 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', avail === 0 ? 'bg-[#c8151d]' : avail <= 5 ? 'bg-amber-500' : 'bg-emerald-500')} />
              {avail === 0 ? `Out of stock at ${branch.name}` : avail <= 5 ? `Limited stock at ${branch.name}` : `Available at ${branch.name}`}
            </div>

            {p.description && <p className="text-sm text-gray-700 mt-4 leading-relaxed">{p.description}</p>}

            {avail > 0 && (
              <>
                {p.soldByWeight && (
                  <div className="mt-5">
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Scale className="w-4 h-4 text-[#c8151d]" /> How much?</p>
                    <div className="flex flex-wrap gap-2">
                      {choices.map((w) => (
                        <button key={w} onClick={() => pickKg(w)} aria-pressed={kg === w} className={cn('h-11 px-4 rounded-xl border text-sm font-semibold', kg === w ? 'border-[#c8151d] bg-[#fdecec] text-[#a3111a]' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>{fmtKg(w)}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <label htmlFor="kg-input" className="text-xs text-gray-600">Other weight</label>
                      <input id="kg-input" type="number" inputMode="decimal" min={min} step={0.25} value={kgText}
                        onChange={(e) => { setKgText(e.target.value); const n = Number(e.target.value); if (n >= min) setKg(roundKg(n)); }}
                        onBlur={commitKgText}
                        className={cn('w-24 h-11 rounded-xl border px-3 text-base md:text-sm outline-none focus:border-[#c8151d] tabular-nums bg-white', kgError ? 'border-[#c8151d]' : 'border-gray-200')} />
                      <span className="text-xs text-gray-600">kg</span>
                      <span className="text-[11px] text-gray-500 sm:ml-auto">min {fmtKg(min)} · 0.25 kg steps</span>
                    </div>
                    {kgError && <p className="text-xs text-[#a3111a] mt-1">{kgError}</p>}
                  </div>
                )}

                {cuts.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm font-semibold mb-2">Cut &amp; preparation</p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {cuts.map((c) => (
                        <button key={c.id} onClick={() => setCutId(c.id)} aria-pressed={cutId === c.id} className={cn('min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold flex items-center justify-between gap-1', cutId === c.id ? 'border-[#c8151d] bg-[#fdecec] text-[#a3111a]' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                          <span className="truncate">{c.name}</span>
                          {cutFeeText(c) && <span className="shrink-0 text-[11px] font-semibold text-gray-500">{cutFeeText(c)}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 rounded-2xl bg-white border border-[#eadfd6] p-4 text-sm text-gray-700">
                  {p.soldByWeight ? (
                    <>
                      <div className="flex justify-between gap-2"><span>{fmtKg(kg)} × {peso(info.price)}/kg</span><span className="tabular-nums">{peso(Math.round(info.price * kg * 100) / 100)}</span></div>
                      {cutFee > 0 && <div className="flex justify-between gap-2 mt-0.5"><span>{cut?.name}</span><span className="tabular-nums">+{peso(cutFee)}</span></div>}
                      <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-[#f1e8e1] font-semibold text-gray-900"><span>Estimated total</span><span className="tabular-nums">{peso(est)}</span></div>
                      <p className="mt-2 text-xs text-gray-600">⚖️ Final price is set when your meat is weighed.</p>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between gap-2"><span>{qty} × {peso(info.price)}</span><span className="tabular-nums">{peso(info.price * qty)}</span></div>
                      {cutFee > 0 && <div className="flex justify-between gap-2 mt-0.5"><span>{cut?.name}</span><span className="tabular-nums">+{peso(cutFee)}</span></div>}
                      <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-[#f1e8e1] font-semibold text-gray-900"><span>Total</span><span className="tabular-nums">{peso(est)}</span></div>
                    </>
                  )}
                </div>

                <div className="mt-4">
                  <label htmlFor="butcher-note" className="block text-sm font-semibold mb-1.5">Note for the butcher <span className="font-normal text-gray-500">(optional)</span></label>
                  <input id="butcher-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={p.soldByWeight ? 'e.g. less fat, please' : 'e.g. longest expiry date'} className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-base md:text-sm outline-none focus:border-[#c8151d]" />
                </div>

                {inCart.length > 0 && (
                  <p className="mt-3 text-xs text-gray-600">
                    Already in your cart: {inCart.map((c) => `${p.soldByWeight ? fmtKg(lineWeight(c, p)) : `${c.qty} ×`}${cutById(s, c.cutId) ? ` · ${cutById(s, c.cutId)!.name}` : ''}`).join(', ')}
                  </p>
                )}
              </>
            )}

            {/* Desktop / tablet: inline action. Phones use the sticky bar below. */}
            <div className="hidden md:block mt-6 max-w-md">{actions}</div>
            {(p.storage === 'fresh' || p.storage === 'frozen') && (
              <p className="mt-4 text-xs text-gray-600 flex items-center gap-1.5"><Snowflake className="w-3.5 h-3.5 text-[#ae754d]" /> Packed with ice packs and delivered within {meatMaxMins(s, branch.id)} minutes of pickup.</p>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <>
            <SectionTitle>You might also like</SectionTitle>
            <ProductRow products={related} />
          </>
        )}
      </Container>
      <MobileActionBar>{actions}</MobileActionBar>
    </div>
  );
}
