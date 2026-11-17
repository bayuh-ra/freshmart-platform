'use client';

// Jovanne's Meat Shop customer website — layout shell for every page under app/(shop).
// Holds the shop context (address, branch, delivery/pickup, toasts), the responsive header,
// the phone bottom tab bar and the footer.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Clock, House, Info, LayoutGrid, Mail, MapPin, Phone, ReceiptText, Search, ShoppingCart, Store, TriangleAlert, User } from 'lucide-react';
import type { AppNotification, Fulfillment } from '@/src/lib/types';
import { mutate, useStore } from '@/src/lib/store';
import { distanceKm, findZone, getSetting, nearestBranch, OPEN_STATUSES } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { BrandIcon, BrandWordmark } from '@/src/components/brand/Brand';
import {
  Container, DEMO_ADDRESSES, GUEST_ADDRESS, ShopContext, orderedTopCategories, routeHref, type Route, type ShopCtx, type ToastAction,
} from '@/src/components/shopper/shared';
import { LocationSheet } from '@/src/components/shopper/LocationSheet';

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
        ? `Delivery is temporarily paused at ${branch.name}.`
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
          'flex-1 flex flex-col min-w-0 overflow-x-clip bg-[#faf6f2] text-[#2a2322] pb-[var(--tabbar-h)]',
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
function SiteHeader({ ctx, pathname, cartCount }: { ctx: ShopCtx; pathname: string; cartCount: number }) {
  const { s, shopper, effMode, address, branch, openLocation } = ctx;
  const cats = orderedTopCategories(s);
  const firstName = shopper ? shopper.firstName || shopper.name.split(' ')[0] : '';
  return (
    <header className="sticky top-0 z-40 bg-[#2a2322] text-white shadow-[0_2px_12px_rgba(0,0,0,0.25)] pt-[env(safe-area-inset-top)]">
      {/* Phone */}
      <div className="md:hidden h-14 pl-2 pr-1 flex items-center gap-1">
        <Link href="/" className="flex items-center gap-2 h-11 pl-1 pr-2 min-w-0 flex-1" aria-label="Jovanne’s Meat Shop home">
          <BrandIcon className="h-9 w-9 rounded-lg ring-1 ring-white/10 shrink-0" />
          <span className="font-display uppercase font-bold text-[22px] leading-none tracking-wide text-[#ec1b26] truncate">Jovanne’s</span>
        </Link>
        <Link href="/search" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10" aria-label="Search">
          <Search className="w-5 h-5" />
        </Link>
        <Link href="/cart" className="relative w-11 h-11 rounded-full flex items-center justify-center hover:bg-white/10" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}>
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ec1b26] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#2a2322]">{cartCount > 99 ? '99+' : cartCount}</span>}
        </Link>
      </div>

      {/* Tablet / desktop */}
      <div className="hidden md:block">
        <Container className="h-[72px] flex items-center gap-4 lg:gap-6">
          <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="Jovanne’s Meat Shop home">
            <BrandIcon className="h-12 w-12 rounded-xl ring-1 ring-white/10" />
            <BrandWordmark size="md" />
          </Link>
          <HeaderSearch />
          <nav className="flex items-center gap-1 shrink-0" aria-label="Account">
            <Link href="/my-orders" className={cn('h-11 px-3 rounded-full hover:bg-white/10 flex items-center gap-2 text-sm', pathname.startsWith('/my-orders') && 'bg-white/10')}>
              <ReceiptText className="w-5 h-5" /> <span className="hidden lg:inline">My orders</span>
            </Link>
            <Link href={shopper ? '/account' : '/signin'} className={cn('h-11 px-3 rounded-full hover:bg-white/10 flex items-center gap-2 text-sm max-w-[180px]', pathname.startsWith('/account') && 'bg-white/10')}>
              <User className="w-5 h-5 shrink-0" /> <span className="hidden lg:inline truncate">{shopper ? `Hi, ${firstName}` : 'Sign in'}</span>
            </Link>
            <Link href="/cart" className="h-11 pl-3 pr-4 ml-1 rounded-full bg-[#c8151d] hover:bg-[#ec1b26] flex items-center gap-2 font-semibold text-sm transition" aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}>
              <ShoppingCart className="w-5 h-5" /> Cart
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-white text-[#c8151d] text-xs font-bold flex items-center justify-center">{cartCount}</span>
            </Link>
          </nav>
        </Container>
        <div className="bg-[#372e2f] border-t border-white/5">
          <Container className="h-12 flex items-center gap-3">
            <nav className="flex items-center gap-1 min-w-0 overflow-x-auto fm-noscroll" aria-label="Categories">
              {cats.map((c, i) => {
                const active = pathname === `/category/${c.id}`;
                return (
                  <Link key={c.id} href={`/category/${c.id}`} className={cn('h-9 px-3 rounded-full text-sm whitespace-nowrap flex items-center gap-1.5 transition',
                    active ? 'bg-[#c8151d] text-white' : 'text-white/85 hover:bg-white/10 hover:text-white',
                    i < 3 && 'font-display uppercase tracking-wider font-semibold text-[15px]')}>
                    <span aria-hidden>{c.icon}</span> {c.name}
                  </Link>
                );
              })}
              <Link href="/category" className={cn('h-9 px-3 rounded-full text-sm whitespace-nowrap flex items-center text-white/70 hover:bg-white/10 hover:text-white', pathname === '/category' && 'bg-white/10 text-white')}>All categories</Link>
            </nav>
            <button onClick={openLocation} className="ml-auto shrink-0 h-9 px-3 rounded-full hover:bg-white/10 text-sm text-white/85 flex items-center gap-1.5 max-w-[40%] lg:max-w-[30%]">
              {effMode === 'delivery' ? <MapPin className="w-4 h-4 text-[#ae754d] shrink-0" /> : <Store className="w-4 h-4 text-[#ae754d] shrink-0" />}
              <span className="truncate">{effMode === 'delivery' ? `Deliver to ${shopper ? address.label : 'Digos City'} · ${branch.name}` : `Pickup at ${branch.name}`}</span>
              <ChevronDown className="w-4 h-4 shrink-0" />
            </button>
          </Container>
        </div>
      </div>
    </header>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); const t = q.trim(); router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search'); }}
      className="relative flex-1 min-w-0 max-w-xl"
    >
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search liempo, brisket, chicken…"
        aria-label="Search products"
        className="w-full h-11 rounded-full bg-white pl-11 pr-24 text-sm text-gray-900 outline-none focus:ring-4 focus:ring-[#ec1b26]/30"
      />
      <button type="submit" className="absolute right-1 top-1 h-9 px-4 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white text-sm font-semibold">Search</button>
    </form>
  );
}

// ====================== FOOTER ======================
function SiteFooter({ ctx }: { ctx: ShopCtx }) {
  const { s } = ctx;
  const branches = s.branches.filter((b) => b.status !== 'closed');
  const cats = orderedTopCategories(s);
  return (
    <footer className="bg-[#2a2322] text-white/80 mt-12">
      <div className="h-1 bg-gradient-to-r from-[#c8151d] via-[#ec1b26] to-[#ae754d]" />
      <Container className="py-10 grid grid-cols-1 gap-8 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <BrandIcon className="h-14 w-14 rounded-xl ring-1 ring-white/10" />
            <BrandWordmark size="md" />
          </div>
          <p className="font-display uppercase tracking-[0.25em] text-[#ae754d] text-sm mt-4">Premium Quality Meats</p>
          <p className="text-sm mt-2 text-white/70 max-w-sm">Fresh beef, pork and chicken, cut the way you like and delivered cold around Digos City — or ready for pickup at the counter.</p>
        </div>
        <div>
          <h3 className="font-display uppercase tracking-wider text-white text-base font-semibold mb-3">Visit our branch</h3>
          <ul className="space-y-4">
            {branches.map((b) => (
              <li key={b.id} className="text-sm space-y-1.5">
                <p className="font-semibold text-white">{b.name} branch</p>
                <p className="flex gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0 text-[#ae754d]" /> {b.address}</p>
                <p className="flex gap-2"><Clock className="w-4 h-4 mt-0.5 shrink-0 text-[#ae754d]" /> Open daily · {b.hours}</p>
                <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className="flex gap-2 hover:text-white min-h-6"><Phone className="w-4 h-4 mt-0.5 shrink-0 text-[#ae754d]" /> {b.phone}</a>
                <a href={`mailto:${b.email}`} className="flex gap-2 hover:text-white break-all"><Mail className="w-4 h-4 mt-0.5 shrink-0 text-[#ae754d]" /> {b.email}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-display uppercase tracking-wider text-white text-base font-semibold mb-3">Shop</h3>
          <ul className="grid grid-cols-2 md:grid-cols-1 gap-x-4 text-sm">
            {cats.map((c) => <li key={c.id}><Link href={`/category/${c.id}`} className="inline-flex items-center min-h-9 hover:text-white">{c.name}</Link></li>)}
            <li><Link href="/my-orders" className="inline-flex items-center min-h-9 hover:text-white">My orders</Link></li>
            <li><Link href="/help" className="inline-flex items-center min-h-9 hover:text-white">Help &amp; FAQ</Link></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="py-4 text-xs text-white/55 flex flex-col sm:flex-row justify-between gap-1">
          <span>© {new Date().getFullYear()} Jovanne’s Meat Shop · Digos City, Davao del Sur</span>
          <span>Demo website · your account and orders are saved in this browser only · <Link href="/credits" className="underline hover:text-white">Photo credits</Link></span>
        </Container>
      </div>
    </footer>
  );
}
