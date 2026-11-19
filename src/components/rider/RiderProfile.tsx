'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bike, LogOut, Store, Users, Wallet } from 'lucide-react';
import type { Rider } from '@/src/lib/types';
import { mutate, useStore } from '@/src/lib/store';
import { branchName, fmtDate } from '@/src/lib/logic';
import { VEHICLE_LABEL } from '@/src/components/delivery/helpers';
import { useRider } from './RiderShell';
import { Confirm, HEADING, PageTitle, Segmented, card, initials } from './ui';
import { cn } from '@/src/lib/utils';

/** Document status pill: Valid (green), Expiring within 30 days (amber), Expired (red), Pending review. */
function docPill(d: Rider['documents'][number], now: number) {
  const days = Math.ceil((Date.parse(d.expires) - now) / 86_400_000);
  if (d.status === 'expired' || days < 0) return { label: 'Expired', cls: 'bg-red-50 text-red-700' };
  if (d.status === 'pending') return { label: 'Pending', cls: 'bg-[#fbf0e3] text-[#8a4b1c]' };
  if (days <= 30) return { label: 'Expiring', cls: 'bg-[#fbf0e3] text-[#8a4b1c]' };
  return { label: 'Valid', cls: 'bg-[#e3efe6] text-[#1f6b3f]' };
}

function setPref(r: Rider, patch: Partial<Pick<Rider, 'navApp' | 'offerSound'>>) {
  mutate((d) => {
    const x = d.riders.find((y) => y.id === r.id);
    if (x) Object.assign(x, patch);
  });
}

export function RiderProfile() {
  const s = useStore();
  const { rider: r, signOut, clock } = useRider();
  const [outOpen, setOutOpen] = useState(false);
  const since = r.joinedAt ? new Date(r.joinedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : undefined;
  const st = r.stats7d;
  const stats = [
    { label: 'This week', value: st ? `${st.trips} trips` : '—' },
    { label: 'On time', value: st ? `${st.onTimePct}%` : '—' },
    { label: 'Acceptance', value: st ? `${st.acceptancePct}%` : '—' },
    { label: 'Rating', value: r.rating ? `★ ${r.rating.toFixed(1)}` : 'New' },
  ];
  const rows = [
    { icon: Bike, label: 'Vehicle', value: `${VEHICLE_LABEL[r.vehicle]} · ${r.plate}` },
    { icon: Store, label: 'Branch', value: r.branchIds.map((id) => `Jovanne’s ${branchName(s, id)}`).join(', ') },
    { icon: Wallet, label: 'Payout', value: `GCash · ending ${r.phone.replace(/\D/g, '').slice(-4)} · Mondays` },
  ];
  const sound = r.offerSound !== false;

  return (
    <div className="space-y-5">
      <PageTitle>Profile</PageTitle>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <section aria-label="Rider" className={cn(card, 'overflow-hidden')}>
            <div className="flex items-center gap-4 p-4 sm:p-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#2a2322] text-xl font-bold text-white sm:h-[74px] sm:w-[74px] sm:text-2xl">{initials(r.name)}</div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold text-[#2a2322] sm:text-2xl">{r.name}</p>
                <p className="text-sm text-stone-600 sm:text-[15px]">{r.phone}{since ? ` · Shop rider since ${since}` : ' · Shop rider'}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 border-t border-[#eadfd6] sm:grid-cols-4">
              {stats.map((x, i) => (
                <div key={x.label} className={cn('min-w-0 px-4 py-3 sm:px-[18px]', i % 2 === 1 && 'border-l border-[#eadfd6]', i >= 2 && 'border-t border-[#eadfd6] sm:border-t-0', i === 2 && 'sm:border-l')}>
                  <dt className="text-xs font-medium text-stone-600 sm:text-[13px]">{x.label}</dt>
                  <dd className="mt-0.5 truncate text-2xl font-bold text-[#2a2322] sm:text-[28px]" style={HEADING}>{x.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="Details" className={cn(card, 'divide-y divide-[#eadfd6]')}>
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
                <Icon className="h-5 w-5 shrink-0 text-stone-500" strokeWidth={1.5} />
                <span className="text-[15px] text-stone-600">{label}</span>
                <span className="ml-auto min-w-0 text-right text-[15px] font-semibold text-[#2a2322]">{value}</span>
              </div>
            ))}
          </section>
        </div>

        <div className="space-y-4">
          <section aria-labelledby="docs" className={cn(card, 'overflow-hidden')}>
            <h2 id="docs" className="border-b border-[#eadfd6] px-4 py-4 text-[17px] font-semibold text-[#2a2322] sm:px-5">Documents</h2>
            {r.documents.length === 0 && <p className="px-4 py-4 text-sm text-stone-500 sm:px-5">No documents on file.</p>}
            <ul className="divide-y divide-[#eadfd6]">
              {r.documents.map((d) => {
                const p = docPill(d, clock.now);
                const name = d.name === 'OR/CR' ? `OR/CR · ${r.plate}` : d.name === "Driver's License" ? 'Driver’s license' : d.name;
                return (
                  <li key={d.name} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2a2322]">{name}</p>
                      <p className="text-sm text-stone-600">Expires {fmtDate(d.expires)}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', p.cls)}>{p.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="prefs" className={cn(card, 'overflow-hidden')}>
            <h2 id="prefs" className="border-b border-[#eadfd6] px-4 py-4 text-[17px] font-semibold text-[#2a2322] sm:px-5">Preferences</h2>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadfd6] px-4 py-4 sm:px-5">
              <span className="text-[15px] text-[#2a2322]">Navigation app</span>
              <Segmented label="Navigation app" value={r.navApp ?? 'google'} onChange={(v) => setPref(r, { navApp: v })}
                options={[{ value: 'google', label: 'Google Maps' }, { value: 'waze', label: 'Waze' }]} />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p id="sound-label" className="text-[15px] text-[#2a2322]">Sound for new offers</p>
                <p className="text-sm text-stone-600">Plays even when the phone is on silent</p>
              </div>
              <button type="button" role="switch" aria-checked={sound} aria-labelledby="sound-label" onClick={() => setPref(r, { offerSound: !sound })}
                className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors', sound ? 'bg-[#1f6b3f]' : 'bg-stone-300')}>
                <span className={cn('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left]', sound ? 'left-7' : 'left-1')} />
              </button>
            </div>
          </section>

          <button type="button" onClick={() => setOutOpen(true)} className={cn(card, 'flex min-h-14 w-full items-center justify-center gap-2 text-[17px] font-semibold text-[#c8151d] hover:bg-[#fbf3ef]')}>
            <LogOut className="h-5 w-5" /> Sign out
          </button>
          <Link href="/rider/signin" className="flex min-h-11 items-center justify-center gap-2 text-sm text-stone-600 hover:text-[#c8151d]">
            <Users className="h-4 w-4" /> Demo: switch to another rider
          </Link>
        </div>
      </div>

      <Confirm open={outOpen} onOpenChange={setOutOpen} title="Sign out?" tone="dark"
        body="You will stay online until you end your shift. Sign in again to keep getting job offers." confirm="Sign out" onConfirm={signOut} />
    </div>
  );
}
