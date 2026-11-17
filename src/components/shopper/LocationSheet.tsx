'use client';

import Link from 'next/link';
import { Bell, CircleCheck, MapPin, Store } from 'lucide-react';
import { distanceKm, findZone, nearestBranch } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { Sheet, type ShopCtx } from './shared';

/** Address + branch picker (automatic nearest branch, with a manual switch). */
export function LocationSheet({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: ShopCtx }) {
  const { s, shopper, addresses, addrIdx, setAddrIdx, address, branch, autoBranch, branchOverride, setBranchOverride, mode, setMode, outside, pickupBranch } = ctx;
  const cities = s.cities.filter((c) => s.branches.some((b) => b.cityId === c.id && b.status !== 'closed'));
  const savedCount = shopper?.addresses.length ?? 0;
  return (
    <Sheet open={open} onClose={onClose} title="Delivery & branch">
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#f3ebe4] rounded-full mb-5">
        {(['delivery', 'pickup'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={cn('h-11 rounded-full text-sm font-semibold capitalize transition', mode === m ? 'bg-white shadow-sm text-[#c8151d]' : 'text-gray-600')}>{m}</button>
        ))}
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deliver to</p>
      {!shopper && (
        <p className="text-xs text-gray-600 mb-2">
          You are browsing as a guest. <Link href="/signin" onClick={onClose} className="font-semibold text-[#c8151d] hover:underline">Sign in</Link> to use your saved address.
        </p>
      )}
      <div className="space-y-2 mb-5">
        {addresses.map((a, i) => {
          const nb = nearestBranch(s, a, 'delivery');
          return (
            <button key={i} onClick={() => setAddrIdx(i)} className={cn('w-full text-left rounded-2xl border p-3 flex gap-3', addrIdx === i ? 'border-[#c8151d] bg-[#fdf1f1]' : 'border-gray-200 hover:border-gray-300')}>
              <MapPin className={cn('w-4 h-4 mt-0.5 shrink-0', addrIdx === i ? 'text-[#c8151d]' : 'text-gray-400')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{shopper ? a.label : 'Digos City area'}{shopper && i >= savedCount && <span className="ml-1.5 text-[11px] font-medium text-gray-400">demo</span>}</p>
                <p className="text-xs text-gray-500 truncate">{a.line}</p>
                <p className={cn('text-[11px] mt-0.5 font-medium', nb ? 'text-emerald-700' : 'text-[#c8151d]')}>{nb ? `Delivered by ${nb.name} branch` : 'Outside all delivery zones — pickup only'}</p>
              </div>
              {addrIdx === i && <CircleCheck className="w-5 h-5 text-[#c8151d] shrink-0" />}
            </button>
          );
        })}
      </div>

      {outside && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 mb-5 text-xs text-amber-900">
          <p className="font-semibold">We don&apos;t deliver to {address.label} yet.</p>
          <p className="mt-0.5">Nearest branch for pickup: <b>{pickupBranch?.name ?? '—'}</b>{pickupBranch && ` (${distanceKm(pickupBranch, address)} km)`}.</p>
        </div>
      )}

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Branch</p>
      <button onClick={() => setBranchOverride(undefined)} className={cn('w-full text-left rounded-2xl border p-3 mb-2 flex items-center gap-3', !branchOverride ? 'border-[#c8151d] bg-[#fdf1f1]' : 'border-gray-200 hover:border-gray-300')}>
        <Store className="w-4 h-4 text-[#c8151d]" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Automatic</p>
          <p className="text-xs text-gray-500">Nearest open branch: {(autoBranch ?? pickupBranch)?.name ?? '—'}</p>
        </div>
        {!branchOverride && <CircleCheck className="w-5 h-5 text-[#c8151d]" />}
      </button>
      {cities.map((c) => (
        <div key={c.id} className="mb-2">
          <p className="text-[11px] text-gray-500 mt-3 mb-1.5">{c.name}</p>
          <div className="space-y-2">
            {s.branches.filter((b) => b.cityId === c.id && b.status !== 'closed').map((b) => {
              const paused = b.status === 'paused';
              const delivers = b.services.delivery && !!findZone(s, b, address);
              const selected = branchOverride === b.id;
              return (
                <button key={b.id} disabled={paused} onClick={() => setBranchOverride(b.id)}
                  className={cn('w-full text-left rounded-2xl border p-3', selected ? 'border-[#c8151d] bg-[#fdf1f1]' : 'border-gray-200 hover:border-gray-300', paused && 'opacity-70 bg-gray-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{b.name}</p>
                    <span className="text-[11px] text-gray-500">{distanceKm(b, address)} km</span>
                  </div>
                  <p className="text-[11px] text-gray-500">{b.address} · {b.hours}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {paused ? (
                      <span className="text-[11px] text-amber-800 bg-amber-100 rounded-lg px-2 py-1">⏸ {b.pausedMessage ?? 'Temporarily paused'}</span>
                    ) : (
                      <>
                        {!b.services.delivery && <span className="text-[11px] font-medium bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">Pickup only</span>}
                        {b.services.delivery && <span className={cn('text-[11px] font-medium rounded-full px-2 py-0.5', delivers ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600')}>{delivers ? 'Delivers to you' : 'Outside delivery zone'}</span>}
                        {b.services.pickup && b.services.delivery && <span className="text-[11px] font-medium bg-[#f6ece4] text-[#7a4f31] rounded-full px-2 py-0.5">Pickup</span>}
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
