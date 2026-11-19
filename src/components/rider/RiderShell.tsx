'use client';

// Rider website shell: module gate, demo sign-in state, the shared offer timer,
// sticky charcoal top bar (centre tabs on tablet/desktop) and the phone bottom tab bar.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, Star, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Order, Rider } from '@/src/lib/types';
import { getState, mutate, useStore } from '@/src/lib/store';
import { getSetting, num, playAlert } from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import { ModuleOff } from '@/src/components/platform/Gates';
import { BrandIcon, BrandLogo } from '@/src/components/brand/Brand';
import { ownRiders } from '@/src/components/delivery/helpers';
import { activeJobs, availableJobs, declineOffer, offers, sendSos, setOnline } from './flow';
import { Confirm, initials } from './ui';
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
  const [sosOpen, setSosOpen] = useState(false);
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
          // Auto-decline expired offers (back to the dispatch queue for the next rider).
          if (online && seenAt > 0 && now - seenAt >= timeoutSecs * 1000) {
            seenRef.current[o.id] = -1;
            declineOffer(o, rider, 'timed out');
            toast.warning(`Offer ${o.number} expired`, { description: 'Sent back to dispatch for the next rider.' });
          }
        }
        if (fresh && online) {
          if (rider.offerSound !== false) playAlert();
          toast.info('New job offer', { description: 'Accept before the timer runs out.' });
        }
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
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 bg-[#f5f1ec] p-4">
        <BrandIcon className="h-14 w-14" />
        <ModuleOff moduleKey="delivery" />
      </div>
    );
  }

  if (isSignIn) {
    return <SignInCtx.Provider value={{ signIn }}><div className="flex min-h-dvh flex-1 flex-col bg-[#f5f1ec]">{children}</div></SignInCtx.Provider>;
  }
  if (!r || signedOut) return <div className="min-h-dvh flex-1 bg-[#f5f1ec]" />;

  const online = r.status === 'online';
  const active = activeJobs(s, r);
  const max = num(getSetting(s, 'maxActiveOrders', r.branchIds[0])) || 2;
  const timeout = num(getSetting(s, 'offerTimeoutSecs', r.branchIds[0])) || 45;
  const shiftStart = r.id in shifts ? shifts[r.id] : default7am;
  const onJobPage = path.startsWith('/rider/jobs/');
  // Jobs badge: pending offers from dispatch, else the open jobs anyone can take (only while online).
  const badge = online ? (myOffers.length || availableJobs(s, r).length) : myOffers.length;

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
      toast.success('Shift ended', { description: r.codHeld > 0 ? 'Remember to hand your COD cash to the branch cashier.' : 'See you next shift!' });
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
  const statusText = online ? 'Online' : r.status === 'pending' ? 'Pending' : r.status === 'suspended' ? 'Suspended' : 'Offline';

  return (
    <Ctx.Provider value={value}>
      <div className="flex min-h-dvh flex-1 flex-col bg-[#f5f1ec] text-[#2a2322]">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-40 bg-[#2a2322] pt-[env(safe-area-inset-top)] text-white">
          <div className="mx-auto flex h-16 max-w-[1340px] items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:gap-3 sm:px-6 md:h-20">
            {/* Left: logo, avatar, name */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5 md:basis-0 lg:gap-3">
              <Link href="/rider" aria-label="Jobs" className="hidden shrink-0 sm:block">
                <BrandLogo className="h-11 w-auto rounded-md" />
              </Link>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c8151d] text-sm font-bold">
                {initials(r.name)}
                <span className={cn('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#2a2322]', online ? 'bg-green-500' : 'bg-stone-400')}
                  aria-label={online ? 'Online' : 'Offline'} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight">{r.name}</p>
                <p className="flex items-center gap-1 truncate text-xs text-stone-300">
                  <Star className="h-3 w-3 shrink-0 fill-stone-300 text-stone-300" /> {r.rating ? r.rating.toFixed(1) : 'New'} · {r.plate}
                </p>
              </div>
            </div>

            {/* Centre: tablet/desktop navigation */}
            <nav aria-label="Rider" className="hidden shrink-0 items-center gap-1 md:flex">
              {TABS.map(({ href, label, icon: Icon }) => {
                const on = isTabActive(path, href);
                return (
                  <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                    className={cn('flex h-12 items-center gap-2 rounded-lg px-3 text-base font-medium transition-colors lg:px-5',
                      on ? 'bg-white/10 font-semibold text-white' : 'text-stone-300 hover:bg-white/5 hover:text-white')}>
                    <Icon className="h-5 w-5" strokeWidth={1.75} /> {label}
                    {href === '/rider' && badge > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c8151d] px-1 text-[11px] font-bold text-white" aria-label={`${badge} new`}>{badge}</span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right: online toggle and SOS */}
            <div className="flex shrink-0 items-center justify-end gap-2 md:flex-1 md:basis-0">
              <button type="button" onClick={toggleOnline} disabled={blocked} aria-pressed={online}
                title={online ? 'Tap to go offline' : 'Tap to go online'}
                className={cn('flex h-11 shrink-0 items-center gap-2 rounded-full p-1 text-sm font-semibold transition-colors disabled:opacity-70',
                  online ? 'bg-[#1f6b3f] pr-3.5 text-white hover:bg-[#195a35]' : 'flex-row-reverse bg-white/15 pl-3.5 text-stone-100 hover:bg-white/20')}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                  <span className={cn('h-3 w-3 rounded-full', online ? 'bg-[#1f6b3f]' : 'bg-stone-400')} />
                </span>
                <span>{statusText}</span>
              </button>
              <button type="button" title="Send SOS to the dispatcher" onClick={() => setSosOpen(true)}
                className="flex h-11 shrink-0 items-center rounded-full border-2 border-[#c8151d] px-3 text-sm font-bold tracking-wide text-[#ff5a5f] hover:bg-[#c8151d]/15 sm:px-4">
                SOS
              </button>
            </div>
          </div>
        </header>

        <main className={cn('mx-auto w-full max-w-[1340px] flex-1 px-4 py-5 sm:px-6 md:py-7', !onJobPage && 'pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10')}>
          {children}
        </main>

        {/* Phone bottom tab bar (the job flow uses a pinned action bar instead) */}
        {!onJobPage && (
          <nav aria-label="Rider" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-[#eadfd6] bg-[#fffdfb] pb-[env(safe-area-inset-bottom)] md:hidden">
            {TABS.map(({ href, label, icon: Icon }) => {
              const on = isTabActive(path, href);
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                  className={cn('relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium', on ? 'text-[#c8151d]' : 'text-stone-500')}>
                  {on && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-[#c8151d]" />}
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                    {href === '/rider' && badge > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[#fffdfb] bg-[#c8151d] px-0.5 text-[10px] font-bold text-white">{badge}</span>
                    )}
                  </span>
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        <Confirm open={sosOpen} onOpenChange={setSosOpen} title="Send SOS?"
          body={<>Dispatch at Jovanne’s will get an emergency alert with your location{active[0] ? ` and job ${active[0].number}` : ''}, and the branch will call you right away.</>}
          confirm="Send SOS" onConfirm={() => {
            sendSos(r, active[0]);
            toast.error('SOS sent to dispatch', { description: 'Your location was shared. Stay safe — the branch will call you now.' });
          }} />
      </div>
    </Ctx.Provider>
  );
}
