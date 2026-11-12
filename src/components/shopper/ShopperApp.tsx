'use client';

// Shopper App (spec §1) — a single-page phone app with an in-memory stack router.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BatteryFull, Bell, Check, CircleCheck, House, Info, LayoutGrid, MapPin, ReceiptText, ShoppingCart, Signal, Store, TriangleAlert, User, Wifi } from 'lucide-react';
import type { AppNotification, Fulfillment } from '@/src/lib/types';
import { useStore, useTick } from '@/src/lib/store';
import { distanceKm, findZone, getSetting, nearestBranch, OPEN_STATUSES } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { DEMO_ADDRESSES, Route, Sheet, ShopContext, ShopCtx } from './shared';
import { BrowseScreen, HomeScreen, ProductScreen } from './BrowseScreens';
import { CartScreen, CheckoutScreen, ConfirmScreen } from './CartCheckout';
import { OrdersScreen, RateScreen, ReceiptScreen, TrackScreen } from './OrderScreens';
import { AccountScreen, AddressesScreen, ChatScreen, HelpScreen, NotificationsScreen, VouchersScreen } from './AccountScreens';

const TABS: { key: Route['name']; label: string; icon: typeof House }[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'browse', label: 'Categories', icon: LayoutGrid },
  { key: 'cart', label: 'Cart', icon: ShoppingCart },
  { key: 'orders', label: 'Orders', icon: ReceiptText },
  { key: 'account', label: 'Account', icon: User },
];

export function ShopperApp() {
  const s = useStore();
  useTick(20_000); // status-bar clock
  const shopper = s.customers.find((c) => c.id === s.session.shopperId) ?? s.customers[0];
  const addresses = useMemo(() => [...shopper.addresses, ...DEMO_ADDRESSES], [shopper.addresses]);
  const [addrIdx, setAddrIdxRaw] = useState(0);
  const address = addresses[Math.min(addrIdx, addresses.length - 1)];
  const [branchOverride, setBranchOverride] = useState<string | undefined>();
  const [mode, setMode] = useState<Fulfillment>('delivery');
  const [pendingVoucher, setPendingVoucher] = useState('');

  const autoBranch = nearestBranch(s, address, 'delivery');
  const pickupBranch = nearestBranch(s, address, 'pickup');
  const override = s.branches.find((b) => b.id === branchOverride && b.status === 'active');
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
  const effMode: Fulfillment = mode === 'delivery' && deliveryOk ? 'delivery' : 'pickup';

  // ---- router ----
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const route = stack[stack.length - 1];
  const go = useCallback((r: Route) => setStack((st) => [...st, r]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const reset = useCallback((st: Route[]) => setStack(st), []);

  // ---- in-app toast ----
  const [toast, setToast] = useState<{ id: number; text: string; tone: 'ok' | 'err' | 'info' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback((text: string, tone: 'ok' | 'err' | 'info' = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // ---- push notifications for this shopper ----
  const seen = useRef<Set<string> | null>(null);
  const [push, setPush] = useState<AppNotification | null>(null);
  const mine = s.notifications.filter((n) => n.audience === 'shopper' && n.targetId === shopper.id);
  const mineKey = mine.map((n) => n.id).join(',');
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(mine.map((n) => n.id));
      return;
    }
    const fresh = mine.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (fresh.length) setPush(fresh[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineKey]);
  useEffect(() => {
    if (!push) return;
    const t = setTimeout(() => setPush(null), 5000);
    return () => clearTimeout(t);
  }, [push]);

  const [locOpen, setLocOpen] = useState(false);
  const setAddrIdx = (i: number) => {
    setAddrIdxRaw(i);
    setBranchOverride(undefined);
  };

  const ctx: ShopCtx = {
    s, shopper, addresses, addrIdx, address, setAddrIdx, branch, autoBranch, pickupBranch, outside, deliveryOk, deliveryBlockReason,
    mode, effMode, setMode, branchOverride, setBranchOverride, go, back, reset, canGoBack: stack.length > 1, flash,
    openLocation: () => setLocOpen(true), pendingVoucher, setPendingVoucher,
  };

  const cartCount = s.cart.reduce((n, c) => n + c.qty, 0);
  const activeOrders = s.orders.filter((o) => o.customerId === shopper.id && OPEN_STATUSES.includes(o.status)).length;
  const now = new Date();
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/, '');
  const rootName = stack[0].name;
  const hideTabs = route.name === 'checkout' || route.name === 'product' || route.name === 'chat';

  return (
    <ShopContext.Provider value={ctx}>
      <style>{`
        @keyframes fm-slide-down{from{transform:translateY(-130%);opacity:0}to{transform:none;opacity:1}}
        @keyframes fm-sheet-up{from{transform:translateY(100%)}to{transform:none}}
        @keyframes fm-fade{from{opacity:0}to{opacity:1}}
        @keyframes fm-pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
        .fm-slide-down{animation:fm-slide-down .35s cubic-bezier(.2,.9,.3,1.2)}
        .fm-sheet-up{animation:fm-sheet-up .28s cubic-bezier(.2,.8,.2,1)}
        .fm-fade{animation:fm-fade .2s ease-out}
        .fm-pop{animation:fm-pop .45s ease-out}
        .fm-noscroll{scrollbar-width:none}.fm-noscroll::-webkit-scrollbar{display:none}
      `}</style>
      <div className="relative flex flex-col h-full bg-[#f5f6f8] text-gray-900 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
        {/* Status bar */}
        <div className={cn('h-10 shrink-0 flex items-end justify-between px-7 pb-1.5 text-[13px] font-semibold z-30', route.name === 'home' ? 'bg-[#1e40af] text-white' : 'bg-white text-gray-900')}>
          <span className="tabular-nums">{clock}</span>
          <span className="flex items-center gap-1.5">
            <Signal className="w-3.5 h-3.5" strokeWidth={2.5} />
            <Wifi className="w-3.5 h-3.5" strokeWidth={2.5} />
            <BatteryFull className="w-5 h-5" strokeWidth={1.75} />
          </span>
        </div>

        {/* Screen */}
        <div className="relative flex-1 min-h-0">
          <div key={stack.length + route.name + JSON.stringify(route)} className="absolute inset-0 overflow-y-auto overflow-x-hidden fm-noscroll">
            <ScreenSwitch route={route} />
          </div>

          {/* In-app toast */}
          {toast && (
            <div key={toast.id} className="absolute bottom-3 left-3 right-3 z-50 fm-fade pointer-events-none">
              <div className={cn('mx-auto w-fit max-w-full rounded-full px-4 py-2 text-xs font-medium text-white shadow-lg flex items-center gap-1.5',
                toast.tone === 'err' ? 'bg-[#dc2626]' : toast.tone === 'info' ? 'bg-gray-800' : 'bg-gray-900')}>
                {toast.tone === 'err' ? <TriangleAlert className="w-3.5 h-3.5" /> : toast.tone === 'info' ? <Info className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={3} />}
                <span className="truncate">{toast.text}</span>
              </div>
            </div>
          )}

          {/* Push notification banner */}
          {push && (
            <button
              key={push.id}
              onClick={() => {
                setPush(null);
                if (push.orderId && s.orders.some((o) => o.id === push.orderId)) reset([{ name: 'orders' }, { name: 'track', orderId: push.orderId }]);
                else reset([{ name: 'account' }, { name: 'notifications' }]);
              }}
              className="absolute top-2 left-2 right-2 z-50 fm-slide-down text-left"
            >
              <div className="rounded-2xl bg-white/90 backdrop-blur-xl shadow-xl border border-gray-200/70 p-3 flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#1e40af] flex items-center justify-center shrink-0 text-lg">🛒</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">FreshMart</p>
                    <p className="text-[10px] text-gray-400">now</p>
                  </div>
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{push.title}</p>
                  <p className="text-xs text-gray-600 line-clamp-2">{push.body}</p>
                </div>
              </div>
            </button>
          )}

          <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} ctx={ctx} />
        </div>

        {/* Tab bar */}
        {!hideTabs && (
          <nav className="shrink-0 bg-white border-t border-gray-200 grid grid-cols-5 pt-1.5 pb-4 z-30">
            {TABS.map((t) => {
              const active = rootName === t.key;
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => reset([{ name: t.key } as Route])} className="flex flex-col items-center gap-0.5 relative">
                  <span className={cn('relative w-12 h-7 rounded-full flex items-center justify-center transition', active && 'bg-blue-50')}>
                    <Icon className={cn('w-5 h-5', active ? 'text-[#1e40af]' : 'text-gray-400')} strokeWidth={active ? 2.25 : 1.75} />
                    {t.key === 'cart' && cartCount > 0 && (
                      <span className="absolute -top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#dc2626] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">{cartCount > 99 ? '99+' : cartCount}</span>
                    )}
                    {t.key === 'orders' && activeOrders > 0 && <span className="absolute top-0 right-2.5 w-2 h-2 rounded-full bg-emerald-500 border border-white" />}
                  </span>
                  <span className={cn('text-[10px]', active ? 'text-[#1e40af] font-semibold' : 'text-gray-500')}>{t.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </ShopContext.Provider>
  );
}

function ScreenSwitch({ route }: { route: Route }) {
  switch (route.name) {
    case 'home': return <HomeScreen />;
    case 'browse': return <BrowseScreen catId={route.catId} q={route.q} focus={route.focus} />;
    case 'product': return <ProductScreen id={route.id} />;
    case 'cart': return <CartScreen />;
    case 'checkout': return <CheckoutScreen />;
    case 'confirm': return <ConfirmScreen orderId={route.orderId} />;
    case 'orders': return <OrdersScreen />;
    case 'track': return <TrackScreen orderId={route.orderId} />;
    case 'receipt': return <ReceiptScreen orderId={route.orderId} />;
    case 'rate': return <RateScreen orderId={route.orderId} />;
    case 'account': return <AccountScreen />;
    case 'addresses': return <AddressesScreen />;
    case 'vouchers': return <VouchersScreen />;
    case 'notifications': return <NotificationsScreen />;
    case 'help': return <HelpScreen />;
    case 'chat': return <ChatScreen convId={route.convId} />;
    default: return null;
  }
}

/** Address + branch picker (auto branch with manual switch). */
function LocationSheet({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: ShopCtx }) {
  const { s, addresses, addrIdx, setAddrIdx, address, branch, autoBranch, branchOverride, setBranchOverride, mode, setMode, outside, pickupBranch } = ctx;
  const cities = s.cities.filter((c) => s.branches.some((b) => b.cityId === c.id && b.status !== 'closed'));
  return (
    <Sheet open={open} onClose={onClose} title="Delivery & branch">
      <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-2xl mb-4">
        {(['delivery', 'pickup'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cn('h-9 rounded-xl text-sm font-medium capitalize', mode === m ? 'bg-white shadow-sm text-[#1e40af]' : 'text-gray-500')}>{m}</button>
        ))}
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deliver to</p>
      <div className="space-y-2 mb-4">
        {addresses.map((a, i) => {
          const nb = nearestBranch(s, a, 'delivery');
          return (
            <button key={i} onClick={() => setAddrIdx(i)} className={cn('w-full text-left rounded-2xl border p-3 flex gap-3', addrIdx === i ? 'border-[#1e40af] bg-blue-50/50' : 'border-gray-200')}>
              <MapPin className={cn('w-4 h-4 mt-0.5 shrink-0', addrIdx === i ? 'text-[#1e40af]' : 'text-gray-400')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.label}{i >= ctx.shopper.addresses.length && <span className="ml-1.5 text-[10px] font-medium text-gray-400">demo</span>}</p>
                <p className="text-xs text-gray-500 truncate">{a.line}</p>
                <p className={cn('text-[11px] mt-0.5 font-medium', nb ? 'text-emerald-600' : 'text-[#dc2626]')}>{nb ? `Delivered by ${nb.name} branch` : 'Outside all delivery zones — pickup only'}</p>
              </div>
              {addrIdx === i && <CircleCheck className="w-5 h-5 text-[#1e40af] shrink-0" />}
            </button>
          );
        })}
      </div>

      {outside && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-900">
          <p className="font-semibold">We don&apos;t deliver to {address.label} yet.</p>
          <p className="mt-0.5">Nearest branch for pickup: <b>{pickupBranch?.name ?? '—'}</b>{pickupBranch && ` (${distanceKm(pickupBranch, address)} km)`}.</p>
        </div>
      )}

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Branch</p>
      <button onClick={() => setBranchOverride(undefined)} className={cn('w-full text-left rounded-2xl border p-3 mb-2 flex items-center gap-3', !branchOverride ? 'border-[#1e40af] bg-blue-50/50' : 'border-gray-200')}>
        <Store className="w-4 h-4 text-[#1e40af]" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Automatic</p>
          <p className="text-xs text-gray-500">Nearest open branch: {(autoBranch ?? pickupBranch)?.name ?? '—'}</p>
        </div>
        {!branchOverride && <CircleCheck className="w-5 h-5 text-[#1e40af]" />}
      </button>
      {cities.map((c) => (
        <div key={c.id} className="mb-2">
          <p className="text-[11px] text-gray-400 mt-3 mb-1.5">{c.name}</p>
          <div className="space-y-2">
            {s.branches.filter((b) => b.cityId === c.id && b.status !== 'closed').map((b) => {
              const paused = b.status === 'paused';
              const delivers = b.services.delivery && !!findZone(s, b, address);
              const selected = branchOverride === b.id;
              return (
                <button key={b.id} disabled={paused} onClick={() => setBranchOverride(b.id)}
                  className={cn('w-full text-left rounded-2xl border p-3', selected ? 'border-[#1e40af] bg-blue-50/50' : 'border-gray-200', paused && 'opacity-70 bg-gray-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{b.name}</p>
                    <span className="text-[11px] text-gray-400">{distanceKm(b, address)} km</span>
                  </div>
                  <p className="text-[11px] text-gray-500">{b.hours}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {paused ? (
                      <span className="text-[11px] text-amber-800 bg-amber-100 rounded-lg px-2 py-1">⏸ {b.pausedMessage ?? 'Temporarily paused'}</span>
                    ) : (
                      <>
                        {!b.services.delivery && <span className="text-[10px] font-medium bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">Pickup only</span>}
                        {b.services.delivery && <span className={cn('text-[10px] font-medium rounded-full px-2 py-0.5', delivers ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>{delivers ? 'Delivers to you' : 'Outside delivery zone'}</span>}
                        {b.services.pickup && b.services.delivery && <span className="text-[10px] font-medium bg-blue-50 text-blue-800 rounded-full px-2 py-0.5">Pickup</span>}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-4 text-xs text-gray-500 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Prices and stock follow the selected branch ({branch.name}).</div>
    </Sheet>
  );
}

