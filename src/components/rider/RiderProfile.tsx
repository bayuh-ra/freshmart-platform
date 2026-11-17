'use client';

import Link from 'next/link';
import { Bike, FileText, LogOut, Star, Store, Users } from 'lucide-react';
import { useStore } from '@/src/lib/store';
import { branchName, fmtDate } from '@/src/lib/logic';
import { VEHICLE_LABEL, docState } from '@/src/components/delivery/helpers';
import { useRider } from './RiderShell';
import { HEADING, btn, card, initials } from './ui';
import { cn } from '@/src/lib/utils';

export function RiderProfile() {
  const s = useStore();
  const { rider: r, signOut } = useRider();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold uppercase tracking-wide text-[#2a2322]" style={HEADING}>Profile</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <div className={cn(card, 'flex items-center gap-4 p-4')}>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#2a2322] text-xl font-bold text-white ring-2 ring-[#ae754d]">{initials(r.name)}</div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-stone-900">{r.name}</p>
              <p className="text-sm text-stone-600">{r.phone} · Shop rider</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-stone-600"><Star className="h-3.5 w-3.5 fill-[#ae754d] text-[#ae754d]" /> {r.rating ? r.rating.toFixed(1) : 'New rider'}</p>
            </div>
          </div>
          <div className={cn(card, 'space-y-2 p-4 text-sm')}>
            <p className="flex items-center gap-2 font-semibold text-stone-900"><Bike className="h-4 w-4 text-[#ae754d]" /> Vehicle</p>
            <div className="flex justify-between"><span className="text-stone-600">Type</span><span>{VEHICLE_LABEL[r.vehicle]}</span></div>
            <div className="flex justify-between"><span className="text-stone-600">Plate</span><span className="font-mono">{r.plate}</span></div>
          </div>
          <div className={cn(card, 'p-4')}>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-900"><Store className="h-4 w-4 text-[#ae754d]" /> Branches</p>
            <div className="flex flex-wrap gap-1.5">
              {r.branchIds.map((id) => <span key={id} className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-[#a3111a]">Jovanne’s {branchName(s, id)}</span>)}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={cn(card, 'space-y-3 p-4')}>
            <p className="flex items-center gap-2 text-sm font-semibold text-stone-900"><FileText className="h-4 w-4 text-[#ae754d]" /> Documents</p>
            {r.documents.length === 0 && <p className="text-sm text-stone-500">No documents on file.</p>}
            {r.documents.map((d) => {
              const st = docState(d);
              return (
                <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0"><p>{d.name}</p><p className="text-xs text-stone-500">Expires {fmtDate(d.expires)}</p></div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', st.cls)}>{st.label}</span>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={signOut} className={cn(btn.secondary, 'w-full text-red-700')}><LogOut className="h-5 w-5" /> Sign out</button>
          <Link href="/rider/signin" className="flex min-h-12 items-center justify-center gap-2 text-sm text-stone-600 hover:text-[#c8151d]">
            <Users className="h-4 w-4" /> Demo: switch to another rider
          </Link>
        </div>
      </div>
    </div>
  );
}
