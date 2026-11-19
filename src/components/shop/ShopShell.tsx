'use client';

// Jovanne's Meat Shop customer website — layout shell for every page under app/(shop).
// Holds the shop context (address, branch, delivery/pickup, toasts), the responsive header,
// the phone bottom tab bar and the footer.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, CircleUser, House, Info, LayoutGrid, MapPin, ReceiptText, Search, ShoppingCart, Store, TriangleAlert, Truck, User } from 'lucide-react';
import type { AppNotification, Fulfillment } from '@/src/lib/types';
import { mutate, useStore } from '@/src/lib/store';
import { distanceKm, findZone, getSetting, nearestBranch, OPEN_STATUSES, pesoShort } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { BrandIcon, BrandLogo } from '@/src/components/brand/Brand';
import {
  Container, DEMO_ADDRESSES, GUEST_ADDRESS, ShopContext, cartEstimate, orderedTopCategories, routeHref, type Route, type ShopCtx, type ToastAction,
} from '@/src/components/shopper/shared';
import { LocationSheet } from '@/src/components/shopper/LocationSheet';
import { AccountMenu } from './AccountMenu';

const ANIMATIONS = `
  @keyframes fm-slide-down{from{transform:translateY(-130%);opacity:0}to{transform:none;opacity:1}}
  @keyframes fm-sheet-up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
  @keyframes fm-fade{from{opacity:0}to{opacity:1}}
  @keyframes fm-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
  .fm-slide-down{animation:fm-slide-down .35s cubic-bezier(.2,.9,.3,1.2)}
  .fm-sheet-up{animation:fm-sheet-up .25s cubic-bezier(.2,.8,.2,1)}
  .fm-fade{animation:fm-fade .2s ease-out}
  .fm-pop{animation:fm-pop .45s ease-out}
  .fm-noscroll{scrollbar-width:none}.fm-noscroll::-webkit-scrollbar{display:none}
  @media (prefers-reduced-motion: reduce){.fm-slide-down,.fm-sheet-up,.fm-fade,.fm-pop{animation:none}}
`;

// ---------- Saved shopping preferences (address, branch, delivery/pickup, voucher) ----------
const PREFS_KEY = 'jms-shop-prefs';
interface Prefs { addrIdx: number; branchOverride?: string; mode: Fulfillment; pendingVoucher: string }
const DEFAULT_PREFS: Prefs = { addrIdx: 0, mode: 'delivery', pendingVoucher: '' };
function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) }; } catch { return DEFAULT_PREFS; }
}

const toUrl = (r: Route | string) => (typeof r === 'string' ? r : routeHref(r));

/** Pages where the phone bottom tab bar is hidden (they have their own sticky action bar or are forms). */
const NO_TABS = /^\/(products\/|checkout|signin|signup|account\/profile|account\/chat)/;

const TABS = [
  { href: '/', label: 'Home', icon: House, match: (p: string) => p === '/' },
  { href: '/category', label: 'Categories', icon: LayoutGrid, match: (p: string) => p.startsWith('/category') || p.startsWith('/search') || p.startsWith('/products') },
  { href: '/cart', label: 'Cart', icon: ShoppingCart, match: (p: string) => p.startsWith('/cart') || p.startsWith('/checkout') },
  { href: '/my-orders', label: 'Orders', icon: ReceiptText, match: (p: string) => p.startsWith('/my-orders') },
  { href: '/account', label: 'Account', icon: User, match: (p: string) => p.startsWith('/account') || p.startsWith('/help') || p.startsWith('/signin') || p.startsWith('/signup') },
];

export function ShopShell({ children }: { children: React.ReactNode }) {
  const s = useStore();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const shopper = s.session.shopperSignedIn ? s.customers.find((c) => c.id === s.session.shopperId) : undefined;

  // ---- address / branch / mode ----
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);
  const addresses = shopper ? [...shopper.addresses, ...DEMO_ADDRESSES] : [GUEST_ADDRESS];
  const addrIdx = Math.min(prefs.addrIdx, addresses.length - 1);
  const address = addresses[addrIdx];
  const autoBranch = nearestBranch(s, address, 'delivery');
  const pickupBranch = nearestBranch(s, address, 'pickup');
  const override = s.branches.find((b) => b.id === prefs.branchOverride && b.status === 'active');
  const branch = override ?? autoBranch ?? pickupBranch ?? s.branches[0];
  const deliveryPaused = getSetting(s, 'deliveryPaused', branch.id) === true;
  const inZone = !!findZone(s, branch, address);
  const deliveryOk = branch.services.delivery && !deliveryPaused && inZone;
  const outside = !autoBranch;
  const deliveryBlockReason = outside && !override
    ? 'This address is outside all of our delivery zones.'
    : !branch.services.delivery
      ? `${branch.name} branch is pickup-only — delivery is not offered here.`
      : deliveryPaused
        ? (branch.pausedMessage || `Delivery is temporarily paused at ${branch.name}.`)
        : outside
          ? 'This address is outside all of our delivery zones.'
          : !inZone
            ? `${branch.name} does not deliver to this address (${distanceKm(branch, address)} km away).`
            : '';
  const effMode: Fulfillment = prefs.mode === 'delivery' && deliveryOk ? 'delivery' : 'pickup';

  // ---- navigation ----
  const go = useCallback((r: Route | string) => router.push(toUrl(r)), [router]);
  const replace = useCallback((r: Route | string) => router.replace(toUrl(r)), [router]);
  const back = useCallback((fallback = '/') => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  }, [router]);

  // ---- toast ----
  const [toast, setToast] = useState<{ id: number; text: string; tone: 'ok' | 'err' | 'info'; action?: ToastAction } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((text: string, tone: 'ok' | 'err' | 'info' = 'ok', action?: ToastAction) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, tone, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 3500 : 2400);
  }, []);

  // ---- sign out / incomplete profile ----
  const signingOut = useRef(false);
  useEffect(() => { signingOut.current = false; }, [pathname]);
  const signOut = () => {
    signingOut.current = true;
    mutate((d) => { d.session.shopperSignedIn = false; d.cart = []; });
    router.replace('/');
    flash('You are signed out', 'info');
  };
  useEffect(() => {
    // (the sign-in / sign-up pages send these customers to Complete Profile themselves, keeping ?next=)
    if (shopper && !shopper.profileComplete && !pathname.startsWith('/signup') && !pathname.startsWith('/signin')) {
      router.replace(`/signup/profile?next=${encodeURIComponent(pathname)}`);
    }
  }, [shopper, pathname, router]);

  // ---- notifications for the signed-in customer (banner) ----
  const seen = useRef<{ owner: string; ids: Set<string> } | null>(null);
  const [push, setPush] = useState<AppNotification | null>(null);
  const mine = shopper ? s.notifications.filter((n) => n.audience === 'shopper' && n.targetId === shopper.id) : [];
  const mineKey = mine.map((n) => n.id).join(',');
  useEffect(() => {
    const owner = shopper?.id ?? '';
    if (!seen.current || seen.current.owner !== owner) {
      seen.current = { owner, ids: new Set(mine.map((n) => n.id)) };
      return;
    }
    const fresh = mine.filter((n) => !seen.current!.ids.has(n.id));
    fresh.forEach((n) => seen.current!.ids.add(n.id));
    if (fresh.length) setPush(fresh[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineKey, shopper?.id]);
  useEffect(() => {
    if (!push) return;
    const t = setTimeout(() => setPush(null), 5000);
    return () => clearTimeout(t);
  }, [push]);

  const [locOpen, setLocOpen] = useState(false);

  const ctx: ShopCtx = {
    s, shopper, addresses, addrIdx, address, branch, autoBranch, pickupBranch, outside, deliveryOk, deliveryBlockReason, effMode,
    setAddrIdx: (i) => setPrefs((p) => ({ ...p, addrIdx: i, branchOverride: undefined })),
    mode: prefs.mode,
    setMode: (m) => setPrefs((p) => ({ ...p, mode: m })),
    branchOverride: prefs.branchOverride,
    setBranchOverride: (id) => setPrefs((p) => ({ ...p, branchOverride: id })),
    pendingVoucher: prefs.pendingVoucher,
    setPendingVoucher: (c) => setPrefs((p) => ({ ...p, pendingVoucher: c })),
    go, replace, back, flash, openLocation: () => setLocOpen(true), signOut, signingOut,
  };

  const hideTabs = NO_TABS.test(pathname);
  const cartCount = s.cart.length;
  const activeOrders = shopper ? s.orders.filter((o) => o.customerId === shopper.id && OPEN_STATUSES.includes(o.status)).length : 0;

  return (
    <ShopContext.Provider value={ctx}>
      <style>{ANIMATIONS}</style>
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0 overflow-x-clip bg-[#f5f1ec] text-[#2a2322] pb-[var(--tabbar-h)]',
          hideTabs
            ? '[--tabbar-h:0px] [--actionbar-safe:env(safe-area-inset-bottom)]'
            : '[--tabbar-h:calc(3.5rem_+_env(safe-area-inset-bottom))] [--actionbar-safe:0px] md:[--tabbar-h:0px]',
        )}
      >
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:px-3 focus:py-2 focus:rounded-lg">Skip to content</a>
        <SiteHeader ctx={ctx} pathname={pathname} cartCount={cartCount} />
        <main id="main" className="flex-1 flex flex-col">{children}</main>
        <SiteFooter ctx={ctx} />

        {!hideTabs && (
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#eadfd6] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(42,35,34,0.06)]" aria-label="Main">
            <div className="grid grid-cols-5 h-14">
              {TABS.map((t) => {
                const active = t.match(pathname);
                const Icon = t.icon;
                return (
                  <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className="flex flex-col items-center justify-center gap-0.5 relative min-w-0">
                    <span className={cn('relative w-12 h-7 rounded-full flex items-center justify-center transition', active && 'bg-[#fdecec]')}>
                      <Icon className={cn('w-5 h-5', active ? 'text-[#c8151d]' : 'text-gray-500')} strokeWidth={active ? 2.25 : 1.75} />
                      {t.href === '/cart' && cartCount > 0 && (
                        <span className="absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#c8151d] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">{cartCount > 99 ? '99+' : cartCount}</span>
                      )}
                      {t.href === '/my-orders' && activeOrders > 0 && <span className="absolute top-0 right-2 w-2 h-2 rounded-full bg-emerald-500 border border-white" />}
                    </span>
                    <span className={cn('text-[11px] truncate', active ? 'text-[#c8151d] font-semibold' : 'text-gray-600')}>{t.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {/* Toast */}
        {toast && (
          <div key={toast.id} className="fixed z-[55] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md top-[calc(4rem+env(safe-area-inset-top))] md:top-auto md:bottom-6 fm-fade" role="status">
            <div className={cn('mx-auto w-fit max-w-full rounded-full pl-4 pr-2 py-2 text-sm font-medium text-white shadow-xl flex items-center gap-2', toast.tone === 'err' ? 'bg-[#c8151d]' : 'bg-[#2a2322]')}>
              {toast.tone === 'err' ? <TriangleAlert className="w-4 h-4 shrink-0" /> : toast.tone === 'info' ? <Info className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={3} />}
              <span className="truncate">{toast.text}</span>
              {toast.action ? (
                <Link href={toast.action.href} onClick={() => setToast(null)} className="shrink-0 h-8 px-3 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold flex items-center">{toast.action.label}</Link>
              ) : <span className="w-2" />}
            </div>
          </div>
        )}

        {/* Notification banner */}
        {push && (
          <button
            key={push.id}
            onClick={() => {
              setPush(null);
              if (push.orderId && s.orders.some((o) => o.id === push.orderId)) go({ name: 'track', orderId: push.orderId });
              else go({ name: 'notifications' });
            }}
            className="fixed z-[56] top-[calc(0.5rem+env(safe-area-inset-top))] inset-x-2 md:inset-x-auto md:right-6 md:top-24 md:w-96 fm-slide-down text-left"
          >
            <div className="rounded-2xl bg-white/95 backdrop-blur-xl shadow-xl border border-[#eadfd6] p-3 flex gap-3">
              <BrandIcon className="w-10 h-10 rounded-xl shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Jovanne’s Meat Shop</p>
                  <p className="text-[11px] text-gray-400">now</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 truncate">{push.title}</p>
                <p className="text-xs text-gray-600 line-clamp-2">{push.body}</p>
              </div>
            </div>
          </button>
        )}

        <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} ctx={ctx} />
      </div>
    </ShopContext.Provider>
  );
}

// ====================== HEADER ======================
/** Header, footer and home page use a wider column than the inner pages (matches the website mockup). */
const WIDE = 'max-w-[1280px]';

function SiteHeader({ ctx, pathname, cartCount }: { ctx: ShopCtx; pathname: string; cartCount: number }) {
  const { s, shopper, branch } = ctx;
  const cats = orderedTopCategories(s);
  const city = s.cities.find((c) => c.id === branch.cityId)?.name ?? 'Digos City';
  const cartLabel = `Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`;
  // Signed-in customers see the estimated cart subtotal on the cart button; guests see "Cart".
  const cartTotal = shopper && cartCount > 0 ? pesoShort(cartEstimate(s, branch.id)) : '';
  const navItems = [{ id: '', name: 'All products', href: '/category' }, ...cats.map((c) => ({ id: c.id, name: c.name, href: `/category/${c.id}` }))];
  return (
    <>
      {/* Top strip (tablet / desktop; scrolls away) */}
      <div className="hidden md:block bg-[#1d1716] text-white/75 text-xs">
        <Container className={cn(WIDE, 'h-9 flex items-center justify-between gap-4')}>
          <p className="flex items-center gap-2 min-w-0">
            <Truck className="w-4 h-4 shrink-0" /> <span className="truncate">Delivering across {city} · Open daily, {branch.hours}</span>
          </p>
          <nav className="flex items-center gap-5 shrink-0" aria-label="Help">
            <Link href="/my-orders" className="hover:text-white">Track an order</Link>
            <Link href="/help" className="hover:text-white">Help &amp; FAQs</Link>
            <a href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`} className="font-bold text-white">{branch.phone}</a>
          </nav>
        </Container>
      </div>

      <header className="sticky top-0 z-40 bg-[#2a2322] pt-[env(safe-area-inset-top)] md:pt-0 shadow-[0_2px_12px_rgba(42,35,34,0.12)]">
        <div className="text-white">
          {/* Phone: logo, delivery area, cart — search on its own row */}
          <div className="md:hidden h-14 px-3 flex items-center gap-2">
            <Link href="/" className="shrink-0" aria-label="Jovanne’s Meat Shop home">
              <BrandLogo className="h-9 rounded" />
            </Link>
            <LocationPill ctx={ctx} compact />
            <Link href="/cart" className="relative shrink-0 w-11 h-11 rounded-lg bg-[#d6202a] flex items-center justify-center" aria-label={cartLabel}>
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#c8151d] text-[10px] font-bold flex items-center justify-center">{cartCount > 99 ? '99+' : cartCount}</span>}
            </Link>
          </div>
          {!pathname.startsWith('/search') && <div className="md:hidden px-3 pb-2.5"><HeaderSearch /></div>}

          {/* Tablet / desktop */}
          <Container className={cn(WIDE, 'hidden md:flex h-[68px] items-center gap-3 lg:gap-4')}>
            <Link href="/" className="shrink-0" aria-label="Jovanne’s Meat Shop home">
              <BrandLogo className="h-10 rounded" priority />
            </Link>
            <LocationPill ctx={ctx} />
            <HeaderSearch />
            {shopper ? (
              <AccountMenu shopper={shopper} pathname={pathname} onSignOut={ctx.signOut} />
            ) : (
              <div className="shrink-0 flex items-center gap-2 px-1">
                <CircleUser className="w-6 h-6 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="leading-tight">
                  <span className="hidden lg:block text-[11px] text-white/60">Welcome</span>
                  <span className="block text-sm font-semibold whitespace-nowrap">
                    <Link href="/signin" className="hover:underline">Sign in</Link>
                    <span className="hidden lg:inline"> / <Link href="/signup" className="hover:underline">Register</Link></span>
                  </span>
                </span>
              </div>
            )}
            {cartTotal ? (
              <Link href="/cart" className="relative shrink-0 h-11 px-4 rounded-lg bg-[#d6202a] hover:bg-[#c8151d] flex items-center gap-2 font-semibold text-sm transition" aria-label={`${cartLabel}, about ${cartTotal}`}>
                <ShoppingCart className="w-5 h-5" /> {cartTotal}
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-[#d6202a] border-2 border-white text-white text-[10px] font-bold flex items-center justify-center">{cartCount > 99 ? '99+' : cartCount}</span>
              </Link>
            ) : (
              <Link href="/cart" className="shrink-0 h-11 px-4 rounded-lg bg-[#d6202a] hover:bg-[#c8151d] flex items-center gap-2 font-semibold text-sm transition" aria-label={cartLabel}>
                <ShoppingCart className="w-5 h-5" /> Cart
                {cartCount > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-white text-[#c8151d] text-[11px] font-bold flex items-center justify-center">{cartCount > 99 ? '99+' : cartCount}</span>}
              </Link>
            )}
          </Container>
        </div>

        {/* Category bar (scrolls sideways on phones) */}
        <div className="bg-white border-b border-[#eadfd6] text-[#2a2322]">
          <Container className={cn(WIDE, 'px-0 md:px-6')}>
            <nav className="flex items-stretch gap-1 h-11 overflow-x-auto fm-noscroll px-2 md:px-0" aria-label="Categories">
              {navItems.map((c) => {
                const active = c.id ? pathname === c.href : pathname === '/' || pathname === '/category';
                return (
                  <Link key={c.href} href={c.href} aria-current={active ? 'page' : undefined}
                    className={cn('px-3 shrink-0 whitespace-nowrap text-[13px] flex items-center border-b-2 transition',
                      active ? 'border-[#c8151d] font-semibold text-[#2a2322]' : 'border-transparent text-[#2a2322]/75 hover:text-[#c8151d]')}>
                    {c.name}
                  </Link>
                );
              })}
            </nav>
          </Container>
        </div>
      </header>
    </>
  );
}

/** "Delivery area" button — opens the address / branch sheet. */
function LocationPill({ ctx, compact }: { ctx: ShopCtx; compact?: boolean }) {
  const { s, shopper, effMode, address, branch, openLocation } = ctx;
  const delivery = effMode === 'delivery';
  // "Purok 3, Dawis, Digos City" → "Dawis, Digos City · about 45 min" (ETA from the delivery zone).
  const area = address.line.split(',').map((x) => x.trim()).filter((x) => x && !/^purok\b/i.test(x)).join(', ');
  const eta = findZone(s, branch, address)?.etaMins;
  const label = !delivery ? 'Pickup' : shopper ? `Deliver to ${address.label}` : 'Delivery area';
  const value = !delivery ? `Pickup at ${branch.name} branch` : shopper ? `${area}${eta ? ` · about ${eta} min` : ''}` : 'Set your barangay to see fees';
  return (
    <button onClick={openLocation}
      className={cn('min-w-0 h-11 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-2.5 flex items-center gap-2 text-left transition',
        compact ? 'flex-1' : 'shrink-0 w-[190px] lg:w-[220px]')}>
      {delivery ? <MapPin className="w-4 h-4 shrink-0 text-white/80" /> : <Store className="w-4 h-4 shrink-0 text-white/80" />}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[11px] text-white/60 truncate">{label}</span>
        <span className="block text-xs font-semibold truncate">{value}</span>
      </span>
      <ChevronDown className="w-4 h-4 shrink-0 text-white/70" />
    </button>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); const t = q.trim(); router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search'); }}
      className="relative flex-1 min-w-0"
    >
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      <input
        type="search"
        enterKeyHint="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for a cut or product"
        aria-label="Search products"
        className="w-full h-10 md:h-11 rounded-lg bg-white pl-10 pr-3 text-base md:text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:ring-4 focus:ring-[#d6202a]/30 [&::-webkit-search-cancel-button]:hidden"
      />
    </form>
  );
}

// ====================== FOOTER ======================
function SiteFooter({ ctx }: { ctx: ShopCtx }) {
  const { s, branch } = ctx;
  const shopCats = orderedTopCategories(s).filter((c) => c.id !== 'cat-grocery').slice(0, 5);
  const head = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-white mb-3';
  const link = 'inline-flex items-center min-h-8 hover:text-white';
  return (
    <footer className="bg-[#2a2322] text-white/70 text-[13px] mt-12">
      <Container className={cn(WIDE, 'py-10 md:py-12 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[1.6fr_1fr_1fr_1fr]')}>
        <div className="col-span-2 md:col-span-1">
          <Link href="/" aria-label="Jovanne’s Meat Shop home" className="inline-block"><BrandLogo className="h-10 rounded" /></Link>
          <p className="mt-4 max-w-xs leading-relaxed">Fresh beef, pork and chicken, cut to order and delivered cold across Digos City, or ready for pickup.</p>
        </div>
        <div>
          <h3 className={head}>Shop</h3>
          <ul>{shopCats.map((c) => <li key={c.id}><Link href={`/category/${c.id}`} className={link}>{c.name}</Link></li>)}</ul>
        </div>
        <div>
          <h3 className={head}>Customer service</h3>
          <ul>
            <li><Link href="/my-orders" className={link}>Track an order</Link></li>
            <li><Link href="/help" className={link}>Delivery areas &amp; fees</Link></li>
            <li><Link href="/help" className={link}>How sold-by-weight works</Link></li>
            <li><Link href="/help" className={link}>Returns &amp; refunds</Link></li>
          </ul>
        </div>
        <div className="col-span-2 md:col-span-1">
          <h3 className={head}>Visit us</h3>
          <ul className="space-y-2">
            <li>{branch.address}</li>
            <li>Open daily, {branch.hours}</li>
            <li><a href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`} className="hover:text-white">{branch.phone}</a></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className={cn(WIDE, 'py-4 text-xs text-white/55 flex flex-col sm:flex-row justify-between gap-1')}>
          <span>© {new Date().getFullYear()} Jovanne’s Meat Shop · Digos City · <Link href="/credits" className="underline hover:text-white">Photo credits</Link></span>
          <span>We accept GCash, Maya, Visa, Mastercard and cash on delivery</span>
        </Container>
      </div>
    </footer>
  );
}
