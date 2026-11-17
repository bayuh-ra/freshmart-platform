'use client';

// Rider website shell: module gate, demo sign-in state, the shared offer timer,
// sticky top bar, desktop navigation and the phone bottom tab bar.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, Power, Siren, Star, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Order, Rider } from '@/src/lib/types';
import { getState, mutate, useStore } from '@/src/lib/store';
import { getSetting, num, playAlert } from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import { ModuleOff } from '@/src/components/platform/Gates';
import { BrandIcon, BrandWordmark } from '@/src/components/brand/Brand';
import { ownRiders } from '@/src/components/delivery/helpers';
import { activeJobs, declineOffer, offers, sendSos, setOnline } from './flow';
import { cn } from '@/src/lib/utils';

/** Offer timers. `seen` = when the rider first saw each offer (-1 = expired and sent back to dispatch). */
export type OfferClock = { now: number; seen: Record<string, number> };

type RiderCtx = {
  rider: Rider;
  online: boolean;
  active: Order[];
  myOffers: Order[];
  clock: OfferClock;
  timeout: number;
  max: number;
  shiftStart: number | null;
  startShift: () => void;
  endShift: () => void;
  signOut: () => void;
};

const Ctx = createContext<RiderCtx | null>(null);
export function useRider() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRider must be used inside RiderShell');
  return c;
}

// Demo sign-in state: per browser tab. A real site would use a server session.
const SIGNED_OUT_KEY = 'jovannes-rider-signed-out';
const SignInCtx = createContext<{ signIn: (riderId: string) => void } | null>(null);
export function useRiderSignIn() {
  const c = useContext(SignInCtx);
  if (!c) throw new Error('useRiderSignIn must be used inside RiderShell');
  return c;
}
function readSignedOut() {
  try { return sessionStorage.getItem(SIGNED_OUT_KEY) === '1'; } catch { return false; }
}
function writeSignedOut(v: boolean) {
  try { if (v) sessionStorage.setItem(SIGNED_OUT_KEY, '1'); else sessionStorage.removeItem(SIGNED_OUT_KEY); } catch { /* ignore */ }
}

const TABS = [
  { href: '/rider', label: 'Jobs', icon: Briefcase },
  { href: '/rider/earnings', label: 'Earnings', icon: Wallet },
  { href: '/rider/profile', label: 'Profile', icon: User },
] as const;

function isTabActive(path: string, href: string) {
  return href === '/rider' ? path === '/rider' || path.startsWith('/rider/jobs') : path.startsWith(href);
}

export function RiderShell({ children }: { children: React.ReactNode }) {
  const s = useStore();
  const path = usePathname() ?? '/rider';
  const router = useRouter();
  const [signedOut, setSignedOut] = useState(readSignedOut);
  const [default7am] = useState(() => { const d = new Date(); d.setHours(7, 0, 0, 0); return d.getTime(); });
  const [shifts, setShifts] = useState<Record<string, number | null>>({});
  const [clock, setClock] = useState<OfferClock>(() => ({ now: Date.now(), seen: {} }));
  const seenRef = useRef<Record<string, number>>({});

  // Phase 1: the shop's own riders only.
  const riders = ownRiders(s);
  const riderId = riders.some((r) => r.id === s.session.riderId) ? s.session.riderId : riders[0]?.id;
  const r = s.riders.find((x) => x.id === riderId);
  const isSignIn = path.startsWith('/rider/signin');
  const deliveryOn = moduleOn(s, 'delivery');
  const live = !!r && !signedOut && deliveryOn;

  const myOffers = r ? offers(s, r) : [];
  const offerKey = myOffers.map((o) => o.id).join(',');

  // One timer drives the clock, new-offer alerts and offer expiry on every rider page
  // (it reads the store inside the timer, not during render).
  useEffect(() => {
    if (!live || !riderId) return;
    const tick = () => {
      const st = getState();
      const rider = st.riders.find((x) => x.id === riderId);
      const now = Date.now();
      if (rider) {
        const timeoutSecs = num(getSetting(st, 'offerTimeoutSecs', rider.branchIds[0])) || 45;
        const online = rider.status === 'online';
        let fresh = false;
        for (const o of offers(st, rider)) {
          const seenAt = seenRef.current[o.id];
          if (!seenAt) { seenRef.current[o.id] = now; fresh = true; continue; }
          // Auto-decline expired offers (cascade to the next rider via the dispatch queue).
          if (online && seenAt > 0 && now - seenAt >= timeoutSecs * 1000) {
            seenRef.current[o.id] = -1;
            declineOffer(o, rider, 'timed out');
            toast.warning(`Offer ${o.number} expired`, { description: 'Sent back to dispatch for the next rider.' });
          }
        }
        if (fresh && online) { playAlert(); toast.info('New job offer', { description: 'Accept before the timer runs out.' }); }
      }
      setClock({ now, seen: { ...seenRef.current } });
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [live, riderId, offerKey]);

  // Signed out: send every rider page to the sign-in page.
  useEffect(() => {
    if (deliveryOn && (signedOut || !r) && !isSignIn) router.replace('/rider/signin');
  }, [deliveryOn, signedOut, r, isSignIn, router]);

  const signIn = (id: string) => {
    mutate((d) => { d.session.riderId = id; });
    seenRef.current = {};
    writeSignedOut(false);
    setSignedOut(false);
  };

  if (!deliveryOn) {
    return (
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-[#faf6f2] p-4">
        <BrandIcon className="h-14 w-14" />
        <ModuleOff moduleKey="delivery" />
      </div>
    );
  }

  if (isSignIn) {
    return <SignInCtx.Provider value={{ signIn }}><div className="flex min-h-dvh flex-1 flex-col bg-[#faf6f2]">{children}</div></SignInCtx.Provider>;
  }
  if (!r || signedOut) return <div className="min-h-dvh flex-1 bg-[#faf6f2]" />;

  const online = r.status === 'online';
  const active = activeJobs(s, r);
  const max = num(getSetting(s, 'maxActiveOrders', r.branchIds[0])) || 2;
  const timeout = num(getSetting(s, 'offerTimeoutSecs', r.branchIds[0])) || 45;
  const shiftStart = r.id in shifts ? shifts[r.id] : default7am;
  const onJobPage = path.startsWith('/rider/jobs/');
  const jobsBadge = myOffers.length > 0 || active.length > 0;

  const value: RiderCtx = {
    rider: r, online, active, myOffers, clock, timeout, max, shiftStart,
    startShift: () => {
      setShifts((m) => ({ ...m, [r.id]: Date.now() }));
      if (!online) setOnline(r, true);
      toast.success('Shift started');
    },
    endShift: () => {
      if (active.length) { toast.error('Finish your current job before ending your shift'); return; }
      setShifts((m) => ({ ...m, [r.id]: null }));
      if (online) setOnline(r, false);
      toast.success('Shift ended', { description: 'Remember to remit your COD cash at the branch.' });
    },
    signOut: () => {
      writeSignedOut(true);
      setSignedOut(true);
      router.replace('/rider/signin');
    },
  };

  const toggleOnline = () => {
    if (online && active.length) { toast.error('Finish your current job before going offline'); return; }
    setOnline(r, !online);
    if (!online && !shiftStart) setShifts((m) => ({ ...m, [r.id]: Date.now() }));
    toast.success(online ? 'You are offline' : 'You are online — waiting for jobs');
  };
  const blocked = r.status === 'pending' || r.status === 'suspended';

  return (
    <Ctx.Provider value={value}>
      <div className="flex min-h-dvh flex-1 flex-col bg-[#faf6f2] text-stone-900">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-[1100] bg-[#2a2322] pt-[env(safe-area-inset-top)] text-white shadow-md">
          <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:px-6 lg:gap-4">
            <Link href="/rider" aria-label="Jobs" className="flex shrink-0 items-center gap-2.5">
              <BrandIcon className="h-10 w-10 rounded-lg" />
              <BrandWordmark size="sm" className="hidden lg:inline-flex" />
            </Link>
            <div className="min-w-0 flex-1 md:max-w-44 md:flex-initial">
              <p className="truncate text-sm font-semibold leading-tight">{r.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-stone-300">
                <Star className="h-3 w-3 shrink-0 fill-[#ae754d] text-[#ae754d]" /> {r.rating ? r.rating.toFixed(1) : 'New'} · {r.plate}
              </p>
            </div>

            {/* Tablet/desktop navigation */}
            <nav aria-label="Rider" className="hidden flex-1 items-center justify-center gap-1 md:flex">
              {TABS.map(({ href, label, icon: Icon }) => {
                const on = isTabActive(path, href);
                return (
                  <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                    className={cn('relative flex h-11 items-center gap-2 rounded-lg px-3 lg:px-4 text-sm font-medium transition-colors', on ? 'bg-white/10 text-white' : 'text-stone-300 hover:bg-white/5 hover:text-white')}>
                    <Icon className="h-4 w-4" strokeWidth={1.75} /> {label}
                    {href === '/rider' && jobsBadge && <span className="h-2 w-2 rounded-full bg-[#ec1b26]" aria-label="New activity" />}
                    {on && <span className="absolute inset-x-3 -bottom-[10px] h-0.5 rounded-full bg-[#ec1b26]" />}
                  </Link>
                );
              })}
            </nav>

            <button type="button" onClick={toggleOnline} disabled={blocked} aria-pressed={online}
              title={online ? 'Tap to go offline' : 'Tap to go online'}
              className={cn('flex h-12 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-70',
                online ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-white/10 text-stone-100 hover:bg-white/15')}>
              <Power className="h-4 w-4" />
              <span>{online ? 'Online' : r.status === 'pending' ? 'Pending' : r.status === 'suspended' ? 'Suspended' : 'Offline'}</span>
            </button>
            <button type="button" title="Send SOS to the dispatcher"
              onClick={() => { sendSos(r, active[0]); toast.error('SOS sent to dispatcher', { description: 'Your location was shared. Stay safe — the branch will call you now.' }); }}
              className="flex h-12 shrink-0 items-center gap-1 rounded-full bg-[#ec1b26] px-3 text-sm font-bold text-white shadow hover:bg-[#c8151d]">
              <Siren className="h-4 w-4" /> SOS
            </button>
          </div>
        </header>

        <main className={cn('mx-auto w-full max-w-[1100px] flex-1 px-4 py-4 md:px-6 md:py-6', !onJobPage && 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8')}>
          {children}
        </main>

        {/* Phone bottom tab bar (the job flow uses a pinned action bar instead) */}
        {!onJobPage && (
          <nav aria-label="Rider" className="fixed inset-x-0 bottom-0 z-[1100] grid grid-cols-3 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
            {TABS.map(({ href, label, icon: Icon }) => {
              const on = isTabActive(path, href);
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                  className={cn('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium', on ? 'text-[#c8151d]' : 'text-stone-500')}>
                  {on && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[#c8151d]" />}
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                    {href === '/rider' && jobsBadge && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#ec1b26]" />}
                  </span>
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </Ctx.Provider>
  );
}
