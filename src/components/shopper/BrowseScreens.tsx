'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, Bell, BellRing, ChevronDown, ChevronLeft, ChevronRight, Clock, Leaf, MapPin, Scale, Search, ShieldCheck, Snowflake, Store, TriangleAlert, X } from 'lucide-react';
import type { Product, SubstitutionPref } from '@/src/lib/types';
import { available, distanceKm, getPriceInfo, peso } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import {
  Card, HScroll, PrimaryButton, ProductTile, ScreenHeader, SectionTitle, Stepper, SUB_HELP, SUB_LABEL, cartAdd, cartPatch, cartSet, matchScore, popularity, unitEst, useShop,
} from './shared';

const RECENT_KEY = 'fm-shopper-recent-searches';
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
}
function saveRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch { /* ignore */ }
}

// ====================== HOME ======================
export function HomeScreen() {
  const { s, shopper, branch, address, effMode, mode, deliveryOk, deliveryBlockReason, pickupBranch, setMode, setBranchOverride, go, openLocation } = useShop();
  const products = s.products.filter((p) => p.status === 'active');
  const featured = products.filter((p) => p.featured);
  const buyAgain = useMemo(() => {
    const ids: string[] = [];
    s.orders.filter((o) => o.customerId === shopper.id).forEach((o) => o.items.forEach((i) => { if (!ids.includes(i.productId)) ids.push(i.productId); }));
    return ids.map((id) => products.find((p) => p.id === id)).filter(Boolean).slice(0, 10) as Product[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.orders, s.products, shopper.id]);
  const promos = products.filter((p) => { const i = getPriceInfo(s, p.id, branch.id); return !!i.compareAt && i.compareAt > i.price; });
  const tops = s.categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort);
  const unread = s.notifications.filter((n) => n.audience === 'shopper' && n.targetId === shopper.id && !n.read).length;
  const firstName = shopper.name.split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="pb-6">
      <div className="bg-[#1e40af] text-white px-4 pt-1 pb-4 rounded-b-[28px] shadow-md">
        <div className="flex items-center justify-between gap-2">
          <button onClick={openLocation} className="flex items-center gap-2 text-left min-w-0">
            <span className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">{effMode === 'delivery' ? <MapPin className="w-4 h-4" /> : <Store className="w-4 h-4" />}</span>
            <span className="min-w-0">
              <span className="block text-[11px] text-blue-200 leading-tight">{effMode === 'delivery' ? 'Delivering to' : 'Pickup at'}</span>
              <span className="flex items-center gap-1 text-sm font-semibold truncate">
                {effMode === 'delivery' ? `${address.label} · ${branch.name} branch` : `${branch.name} branch`}
                <ChevronDown className="w-4 h-4 shrink-0" />
              </span>
            </span>
          </button>
          <button onClick={() => go({ name: 'notifications' })} className="relative w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#dc2626] text-[9px] font-bold flex items-center justify-center">{unread}</span>}
          </button>
        </div>
        <p className="mt-3 text-lg font-semibold leading-tight">{greet}, {firstName}! 👋</p>
        <p className="text-xs text-blue-200">{branch.hours} · {effMode === 'delivery' ? 'Delivery in ~45 min' : 'Ready for pickup in ~20 min'}</p>
        <button onClick={() => go({ name: 'browse', focus: true })} className="mt-3 w-full h-11 rounded-2xl bg-white text-gray-400 text-sm flex items-center gap-2 px-4 shadow-sm">
          <Search className="w-4 h-4 text-gray-500" /> Search mangoes, milk, rice…
        </button>
      </div>

      {mode === 'delivery' && !deliveryOk && (
        <div className="mx-4 mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-3.5">
          <div className="flex gap-2.5">
            <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold text-sm">Delivery not available</p>
              <p className="mt-0.5">{deliveryBlockReason}</p>
              {pickupBranch && <p className="mt-1">You can still order for <b>pickup at {pickupBranch.name}</b> ({distanceKm(pickupBranch, address)} km away).</p>}
              <div className="flex gap-2 mt-2.5">
                <button onClick={() => { setMode('pickup'); if (pickupBranch && pickupBranch.id !== branch.id) setBranchOverride(pickupBranch.id); }} className="h-8 px-3 rounded-full bg-amber-600 text-white text-xs font-semibold">Switch to pickup</button>
                <button onClick={openLocation} className="h-8 px-3 rounded-full bg-white border border-amber-300 text-amber-900 text-xs font-semibold">Change address</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <BannerCarousel />

      <SectionTitle action={<button onClick={() => go({ name: 'browse' })} className="text-xs font-semibold text-[#1e40af]">See all</button>}>Shop by category</SectionTitle>
      <HScroll>
        {tops.map((c) => (
          <button key={c.id} onClick={() => go({ name: 'browse', catId: c.id })} className="snap-start shrink-0 w-[72px] flex flex-col items-center gap-1.5">
            <span className="w-16 h-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-3xl">{c.icon}</span>
            <span className="text-[11px] text-gray-700 text-center leading-tight line-clamp-2">{c.name}</span>
          </button>
        ))}
      </HScroll>

      {buyAgain.length > 0 && (
        <>
          <SectionTitle action={<button onClick={() => go({ name: 'orders' })} className="text-xs font-semibold text-[#1e40af]">Past orders</button>}>Buy again</SectionTitle>
          <HScroll>{buyAgain.map((p) => <ProductTile key={p.id} p={p} className="snap-start shrink-0 w-[132px]" />)}</HScroll>
        </>
      )}

      <SectionTitle>Featured</SectionTitle>
      <HScroll>{featured.map((p) => <ProductTile key={p.id} p={p} className="snap-start shrink-0 w-[132px]" />)}</HScroll>

      {promos.length > 0 && (
        <>
          <SectionTitle><span className="flex items-center gap-1.5">🔥 Promos at {branch.name}</span></SectionTitle>
          <div className="grid grid-cols-2 gap-3 px-4">{promos.map((p) => <ProductTile key={p.id} p={p} />)}</div>
        </>
      )}

      <div className="mx-4 mt-6 rounded-2xl bg-white border border-gray-100 p-4 flex items-center gap-3">
        <span className="text-2xl">⭐</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{shopper.points.toLocaleString()} FreshPoints</p>
          <p className="text-xs text-gray-500">Redeem at checkout · 10 pts = ₱1</p>
        </div>
        <button onClick={() => go({ name: 'vouchers' })} className="text-xs font-semibold text-[#1e40af]">Vouchers</button>
      </div>
    </div>
  );
}

function BannerCarousel() {
  const { s, shopper, go } = useShop();
  const banners = s.banners.filter((b) => b.active && (!b.cityId || b.cityId === shopper.cityId));
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  const cur = Math.min(idx, banners.length - 1);
  return (
    <div className="px-4 mt-4">
      <div className="overflow-hidden rounded-2xl shadow-sm">
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${cur * 100}%)` }}>
          {banners.map((b) => (
            <button key={b.id} onClick={() => go({ name: 'browse', q: b.title.toLowerCase().includes('mango') ? 'mango' : '' })}
              className={cn('relative shrink-0 w-full h-32 bg-gradient-to-r text-white text-left p-4 overflow-hidden', b.color)}>
              <p className="text-lg font-bold leading-tight max-w-[65%]">{b.title}</p>
              <p className="text-xs text-white/85 mt-1 max-w-[65%]">{b.subtitle}</p>
              <span className="inline-block mt-2.5 text-[11px] font-semibold bg-white/25 rounded-full px-2.5 py-1">Shop now</span>
              <span className="absolute right-3 bottom-1 text-[64px] leading-none drop-shadow-lg">{b.emoji}</span>
              <span className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-center gap-1.5 mt-2">
        {banners.map((b, i) => (
          <button key={b.id} onClick={() => setIdx(i)} className={cn('h-1.5 rounded-full transition-all', i === cur ? 'w-5 bg-[#1e40af]' : 'w-1.5 bg-gray-300')} aria-label={`Banner ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

// ====================== CATEGORIES + SEARCH ======================
type SortKey = 'relevance' | 'popular' | 'price_asc' | 'price_desc' | 'name';
const SORT_LABEL: Record<SortKey, string> = { relevance: 'Relevance', popular: 'Popularity', price_asc: 'Price: low to high', price_desc: 'Price: high to low', name: 'Name A–Z' };

export function BrowseScreen({ catId: initialCat, q: initialQ, focus }: { catId?: string; q?: string; focus?: boolean }) {
  const { s, branch, go, canGoBack, back } = useShop();
  const [query, setQuery] = useState(initialQ ?? '');
  const [submitted, setSubmitted] = useState(initialQ ?? '');
  const [catId, setCatId] = useState<string | undefined>(initialCat);
  const [focused, setFocused] = useState(!!focus);
  const [promoOnly, setPromoOnly] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus) inputRef.current?.focus();
  }, [focus]);

  const active = s.products.filter((p) => p.status === 'active');
  const pop = useMemo(() => popularity(s), [s]);
  const cat = s.categories.find((c) => c.id === catId);
  const childIds = (id: string) => [id, ...s.categories.filter((c) => c.parentId === id).map((c) => c.id)];
  const countIn = (id: string) => active.filter((p) => childIds(id).includes(p.categoryId)).length;
  const tops = s.categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort);

  const scored = active
    .filter((p) => !catId || childIds(catId).includes(p.categoryId))
    .map((p) => ({ p, score: matchScore(s, p, submitted), price: getPriceInfo(s, p.id, branch.id), avail: available(s, p.id, branch.id) }))
    .filter((x) => x.score > 0)
    .filter((x) => !promoOnly || (!!x.price.compareAt && x.price.compareAt > x.price.price))
    .filter((x) => !inStock || x.avail > 0);
  const onlyFuzzy = submitted && scored.length > 0 && scored.every((x) => x.score === 1);
  scored.sort((a, b) => {
    switch (sort) {
      case 'price_asc': return a.price.price - b.price.price;
      case 'price_desc': return b.price.price - a.price.price;
      case 'name': return a.p.name.localeCompare(b.p.name);
      case 'popular': return (pop[b.p.id] ?? 0) - (pop[a.p.id] ?? 0);
      default: return b.score - a.score || (pop[b.p.id] ?? 0) - (pop[a.p.id] ?? 0);
    }
  });

  const suggestions = query.trim()
    ? active.map((p) => ({ p, sc: matchScore(s, p, query) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 6)
    : [];
  const catSuggestions = query.trim() ? s.categories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 2) : [];

  const submit = (text: string) => {
    const t = text.trim();
    setQuery(t);
    setSubmitted(t);
    setFocused(false);
    inputRef.current?.blur();
    if (t) {
      const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      setRecent(next);
      saveRecent(next);
    }
  };

  const showTree = !catId && !submitted;

  return (
    <div className="pb-6 min-h-full">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-3 pt-2 pb-2.5">
        <div className="flex items-center gap-2">
          {(canGoBack || catId || submitted) && (
            <button onClick={() => { if (catId && catId !== initialCat) setCatId(undefined); else if (canGoBack) back(); else { setCatId(undefined); setSubmitted(''); setQuery(''); } }} className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-gray-100" aria-label="Back">
              <ChevronLeft className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
          <form onSubmit={(e) => { e.preventDefault(); submit(query); }} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={cat ? `Search in ${cat.name}` : 'Search products or brands'}
              className="w-full h-10 rounded-xl bg-gray-100 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-[#1e40af]/30 focus:bg-white"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setSubmitted(''); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-300 text-white flex items-center justify-center" aria-label="Clear">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
          {focused && <button onClick={() => { setFocused(false); setQuery(submitted); inputRef.current?.blur(); }} className="text-sm text-[#1e40af] font-medium">Cancel</button>}
        </div>
        {!focused && !showTree && (
          <div className="flex gap-2 mt-2.5 overflow-x-auto fm-noscroll">
            <Chip on={promoOnly} onClick={() => setPromoOnly(!promoOnly)}>🔥 Promo only</Chip>
            <Chip on={inStock} onClick={() => setInStock(!inStock)}>In stock</Chip>
            <Chip on={sort !== 'relevance'} onClick={() => setSortOpen(!sortOpen)}><ArrowUpDown className="w-3 h-3" /> {SORT_LABEL[sort]}</Chip>
          </div>
        )}
        {sortOpen && !focused && (
          <div className="mt-2 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <button key={k} onClick={() => { setSort(k); setSortOpen(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50', sort === k && 'text-[#1e40af] font-semibold')}>{SORT_LABEL[k]}</button>
            ))}
          </div>
        )}
      </div>

      {focused ? (
        <div className="bg-white min-h-[60%]">
          {query.trim() ? (
            <>
              {catSuggestions.map((c) => (
                <button key={c.id} onClick={() => { setCatId(c.id); setQuery(''); setSubmitted(''); setFocused(false); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 text-left">
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-sm">in <b>{c.name}</b></span>
                </button>
              ))}
              {suggestions.map(({ p }) => (
                <button key={p.id} onClick={() => go({ name: 'product', id: p.id })} className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 text-left">
                  <span className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-xl">{p.image}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-400">{p.brand} · {p.size}</span>
                  </span>
                  <Search className="w-3.5 h-3.5 text-gray-300" />
                </button>
              ))}
              <button onClick={() => submit(query)} className="w-full px-4 py-3 text-left text-sm text-[#1e40af] font-medium">Search for “{query.trim()}”</button>
              {suggestions.length === 0 && <p className="px-4 pb-4 text-xs text-gray-400">No close matches — try another spelling.</p>}
            </>
          ) : (
            <div className="px-4 py-3">
              {recent.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent searches</p>
                    <button onClick={() => { setRecent([]); saveRecent([]); }} className="text-xs text-gray-400">Clear</button>
                  </div>
                  {recent.map((r) => (
                    <button key={r} onClick={() => submit(r)} className="w-full flex items-center gap-3 py-2 text-sm text-gray-700"><Clock className="w-4 h-4 text-gray-300" /> {r}</button>
                  ))}
                </>
              )}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">Popular</p>
              <div className="flex flex-wrap gap-2">
                {['mango', 'chicken', 'rice', 'eggs', 'milk', 'coffee'].map((t) => (
                  <button key={t} onClick={() => submit(t)} className="px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-700">{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : showTree ? (
        <div className="px-4 pt-3 space-y-2">
          <p className="text-xs text-gray-500 mb-1">{active.length} products at {branch.name} branch</p>
          {tops.map((c) => {
            const kids = s.categories.filter((k) => k.parentId === c.id).sort((a, b) => a.sort - b.sort);
            return (
              <Card key={c.id} className="overflow-hidden">
                <button onClick={() => setCatId(c.id)} className="w-full flex items-center gap-3 p-3 text-left">
                  <span className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">{c.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{c.name}</span>
                    <span className="block text-[11px] text-gray-500">{countIn(c.id)} items</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
                {kids.length > 0 && (
                  <div className="border-t border-gray-100 pl-[68px]">
                    {kids.map((k) => (
                      <button key={k.id} onClick={() => setCatId(k.id)} className="w-full flex items-center justify-between pr-4 py-2.5 text-left border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-700">{k.icon} {k.name}</span>
                        <span className="text-[11px] text-gray-400">{countIn(k.id)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="pt-3">
          {cat && (
            <div className="px-4 mb-3">
              <p className="text-[11px] text-gray-400">
                <button onClick={() => { setCatId(undefined); }} className="hover:underline">Categories</button>
                {cat.parentId && <> › <button onClick={() => setCatId(cat.parentId)} className="hover:underline">{s.categories.find((c) => c.id === cat.parentId)?.name}</button></>}
              </p>
              <p className="text-lg font-semibold">{cat.icon} {cat.name}</p>
              {s.categories.some((c) => c.parentId === cat.id) && (
                <div className="flex gap-2 mt-2 overflow-x-auto fm-noscroll">
                  {s.categories.filter((c) => c.parentId === cat.id).map((c) => (
                    <Chip key={c.id} onClick={() => setCatId(c.id)}>{c.icon} {c.name} · {countIn(c.id)}</Chip>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="px-4 text-xs text-gray-500 mb-2">
            {scored.length} result{scored.length === 1 ? '' : 's'}{submitted && <> for “<b className="text-gray-800">{submitted}</b>”</>}
            {onlyFuzzy && <span className="block text-amber-700 mt-0.5">Showing close matches (we corrected a possible typo)</span>}
          </p>
          {scored.length === 0 ? (
            <div className="text-center py-14 px-8">
              <p className="text-4xl">🔍</p>
              <p className="text-sm font-semibold mt-2">No products found</p>
              <p className="text-xs text-gray-500 mt-1">Try a different spelling, remove filters or browse categories.</p>
              <button onClick={() => { setPromoOnly(false); setInStock(false); setSubmitted(''); setQuery(''); }} className="mt-3 text-xs font-semibold text-[#1e40af]">Clear search & filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 px-4">{scored.map(({ p }) => <ProductTile key={p.id} p={p} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children, on, onClick }: { children: React.ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('shrink-0 h-8 px-3 rounded-full text-xs font-medium border inline-flex items-center gap-1 whitespace-nowrap', on ? 'bg-[#1e40af] border-[#1e40af] text-white' : 'bg-white border-gray-200 text-gray-700')}>
      {children}
    </button>
  );
}

// ====================== PRODUCT DETAIL ======================
export function ProductScreen({ id }: { id: string }) {
  const { s, branch, back, go, flash } = useShop();
  const p = s.products.find((x) => x.id === id);
  const line = s.cart.find((c) => c.productId === id);
  const [qty, setQty] = useState(line?.qty ?? 1);
  const [note, setNote] = useState(line?.note ?? '');
  const [sub, setSub] = useState<SubstitutionPref>(line?.subPref ?? 'similar');
  const [notified, setNotified] = useState(false);
  if (!p) return <div className="p-6"><ScreenHeader title="Product" /><p className="text-sm text-gray-500 mt-6 text-center">This product is no longer available.</p></div>;
  const info = getPriceInfo(s, p.id, branch.id);
  const avail = available(s, p.id, branch.id);
  const promo = !!info.compareAt && info.compareAt > info.price;
  const cat = s.categories.find((c) => c.id === p.categoryId);
  const related = s.products.filter((x) => x.status === 'active' && x.categoryId === p.categoryId && x.id !== p.id).slice(0, 8);
  const est = unitEst(p, info.price);
  const tagMeta: Record<string, { label: string; cls: string; icon?: React.ReactNode }> = {
    organic: { label: 'Organic', cls: 'bg-emerald-50 text-emerald-700', icon: <Leaf className="w-3 h-3" /> },
    chilled: { label: 'Chilled', cls: 'bg-sky-50 text-sky-700', icon: <Snowflake className="w-3 h-3" /> },
    frozen: { label: 'Frozen', cls: 'bg-indigo-50 text-indigo-700', icon: <Snowflake className="w-3 h-3" /> },
    halal: { label: 'Halal', cls: 'bg-teal-50 text-teal-700', icon: <ShieldCheck className="w-3 h-3" /> },
    local: { label: 'Local', cls: 'bg-amber-50 text-amber-800' },
    imported: { label: 'Imported', cls: 'bg-purple-50 text-purple-700' },
  };

  const addToCart = () => {
    const q = Math.min(qty, avail);
    if (line) {
      cartSet(p.id, q);
      cartPatch(p.id, { note: note || undefined, subPref: sub });
      flash('Cart updated');
    } else {
      cartAdd(p.id, q, { note: note || undefined, subPref: sub });
      flash(`${q} × ${p.name} added to cart`);
    }
    back();
  };

  return (
    <div className="bg-white min-h-full">
      <div className="relative h-64 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <button onClick={back} className="absolute top-3 left-3 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center" aria-label="Back"><ChevronLeft className="w-5 h-5" /></button>
        <button onClick={() => go({ name: 'cart' })} className="absolute top-3 right-3 h-9 px-3 rounded-full bg-white/90 shadow flex items-center gap-1 text-xs font-semibold" aria-label="Cart">
          🛒 {s.cart.reduce((n, c) => n + c.qty, 0)}
        </button>
        <span className="text-[120px] leading-none drop-shadow-xl fm-pop">{p.image}</span>
        {promo && <span className="absolute bottom-4 left-4 bg-[#dc2626] text-white text-xs font-bold px-2 py-1 rounded-lg">SAVE {Math.round((1 - info.price / info.compareAt!) * 100)}%</span>}
      </div>
      <div className="px-5 pt-4">
        <p className="text-xs text-gray-500">{p.brand} · {cat?.name}</p>
        <h1 className="text-xl font-bold leading-tight mt-0.5">{p.name}</h1>
        <p className="text-sm text-gray-500">{p.size}</p>
        <div className="flex items-end gap-2 mt-3">
          <p className="text-2xl font-bold text-[#1e40af]">{peso(info.price)}{p.soldByWeight && <span className="text-sm font-medium text-gray-500"> / kg</span>}</p>
          {promo && <p className="text-sm text-gray-400 line-through mb-1">{peso(info.compareAt!)}</p>}
        </div>
        <p className="text-[11px] text-gray-400">{branch.name} branch price · VAT inclusive</p>

        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {p.tags.map((t) => (
              <span key={t} className={cn('inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5', tagMeta[t]?.cls ?? 'bg-gray-100 text-gray-700')}>{tagMeta[t]?.icon}{tagMeta[t]?.label ?? t}</span>
            ))}
          </div>
        )}

        <div className={cn('mt-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1', avail === 0 ? 'bg-red-50 text-[#dc2626]' : avail <= 10 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', avail === 0 ? 'bg-[#dc2626]' : avail <= 10 ? 'bg-amber-500' : 'bg-emerald-500')} />
          {avail === 0 ? `Out of stock at ${branch.name}` : avail <= 10 ? `Only ${avail} left at ${branch.name}` : `In stock at ${branch.name}`}
        </div>

        {p.soldByWeight && (
          <div className="mt-4 rounded-2xl bg-blue-50/70 border border-blue-100 p-3.5 flex gap-3">
            <Scale className="w-5 h-5 text-[#1e40af] shrink-0 mt-0.5" />
            <div className="text-xs text-gray-700">
              <p className="font-semibold text-gray-900">Sold by weight</p>
              <p className="mt-0.5">Est. {p.estWeightKg ?? 1} kg per piece · {peso(info.price)}/kg · ≈ {peso(est)} each</p>
              <p className="mt-0.5 text-gray-500">The final price is set at weighing. You only pay for the actual weight.</p>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-600 mt-4 leading-relaxed">{p.description}</p>

        {avail > 0 && (
          <>
            <div className="mt-5">
              <p className="text-sm font-semibold mb-1.5">Note for the picker <span className="font-normal text-gray-400">(optional)</span></p>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={p.soldByWeight ? 'e.g. ripe ones, please' : 'e.g. longest expiry date'} className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#1e40af]" />
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold mb-1.5">If out of stock</p>
              <div className="grid grid-cols-3 gap-2">
                {(['similar', 'ask', 'refund'] as const).map((k) => (
                  <button key={k} onClick={() => setSub(k)} className={cn('rounded-xl border px-2 py-2 text-xs font-medium', sub === k ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]' : 'border-gray-200 text-gray-600')}>{SUB_LABEL[k]}</button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">{SUB_HELP[sub]}</p>
            </div>
          </>
        )}

        {related.length > 0 && (
          <>
            <p className="text-[15px] font-semibold mt-6 mb-2">You might also like</p>
            <div className="-mx-4"><HScroll>{related.map((r) => <ProductTile key={r.id} p={r} className="snap-start shrink-0 w-[128px]" />)}</HScroll></div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 mt-6 bg-white border-t border-gray-100 px-4 pt-3 pb-5 flex items-center gap-3 z-10">
        {avail === 0 ? (
          <PrimaryButton onClick={() => { setNotified(true); flash(`We'll notify you when ${p.name} is back`, 'info'); }} disabled={notified} className={notified ? '' : 'bg-gray-900'}>
            <span className="inline-flex items-center gap-2">{notified ? <><BellRing className="w-4 h-4" /> You&apos;ll be notified</> : <><Bell className="w-4 h-4" /> Notify me when available</>}</span>
          </PrimaryButton>
        ) : (
          <>
            <Stepper qty={qty} max={avail} onChange={(n) => setQty(Math.max(1, n))} />
            <PrimaryButton onClick={addToCart} className="flex-1">
              {line ? 'Update cart' : 'Add to cart'} · {peso(Math.round(est * qty * 100) / 100)}{p.soldByWeight ? ' est.' : ''}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
