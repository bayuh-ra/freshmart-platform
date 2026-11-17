'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, Info } from 'lucide-react';
import { useStore } from '@/src/lib/store';
import { branchName } from '@/src/lib/logic';
import { BrandIcon, BrandWordmark } from '@/src/components/brand/Brand';
import { ownRiders } from '@/src/components/delivery/helpers';
import { useRiderSignIn } from './RiderShell';
import { HEADING, card, initials } from './ui';
import { cn } from '@/src/lib/utils';

const STATUS: Record<string, { label: string; cls: string }> = {
  online: { label: 'Online', cls: 'bg-green-50 text-green-800' },
  offline: { label: 'Offline', cls: 'bg-stone-100 text-stone-700' },
  pending: { label: 'Pending approval', cls: 'bg-amber-50 text-amber-900' },
  suspended: { label: 'Suspended', cls: 'bg-red-50 text-red-800' },
};

/** Demo sign-in: pick one of the shop's own riders. */
export function RiderSignIn() {
  const s = useStore();
  const router = useRouter();
  const { signIn } = useRiderSignIn();
  const riders = ownRiders(s);

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-[#2a2322] px-4 pb-10 pt-[calc(2rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <BrandIcon className="h-16 w-16 rounded-2xl" />
          <BrandWordmark size="lg" className="mt-3 items-center" />
          <p className="mt-3 text-sm uppercase tracking-[0.2em] text-[#ae754d]" style={HEADING}>Rider sign-in</p>
        </div>
      </div>

      <div className="mx-auto -mt-6 w-full max-w-md flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className={cn(card, 'p-4')}>
          <h1 className="text-xl font-bold uppercase tracking-wide text-[#2a2322]" style={HEADING}>Who’s riding today?</h1>
          <p className="mt-1 text-sm text-stone-600">Choose your name to start.</p>
          <ul className="mt-4 space-y-2">
            {riders.map((r) => {
              const st = STATUS[r.status] ?? STATUS.offline;
              const current = r.id === s.session.riderId;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => { signIn(r.id); router.replace('/rider'); }}
                    className={cn('flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:border-[#c8151d] hover:bg-red-50/40',
                      current ? 'border-[#c8151d]/50 bg-red-50/30' : 'border-stone-200 bg-white')}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2a2322] text-sm font-bold text-white">{initials(r.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-stone-900">{r.name}</span>
                      <span className="block truncate text-xs text-stone-600">{r.phone} · {r.branchIds.map((id) => branchName(s, id)).join(' & ')}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-stone-400" />
                  </button>
                </li>
              );
            })}
          </ul>
          {riders.length === 0 && <p className="mt-4 text-sm text-stone-500">No shop riders are set up yet. Ask the branch manager to add you.</p>}
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2.5 text-xs text-stone-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#ae754d]" />
          <span>Demo sign-in. On the live site, riders sign in with their phone number or username and a password given by the branch.</span>
        </p>
      </div>
    </div>
  );
}
