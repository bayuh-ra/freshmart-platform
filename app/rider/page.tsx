'use client';

import Link from 'next/link';
import { ArrowLeft, Bike } from 'lucide-react';
import { mutate, useStore } from '@/src/lib/store';
import { branchName } from '@/src/lib/logic';
import { PhoneFrame, selectClass } from '@/src/components/common';
import { RiderApp } from '@/src/components/rider/RiderApp';
import { RIDER_TYPE_LABEL } from '@/src/components/delivery/helpers';

export default function RiderPage() {
  const s = useStore();
  const riders = s.riders.filter((r) => r.type === 'own' || r.type === 'freelance');
  const riderId = s.session.riderId;

  return (
    <div className="min-h-screen bg-[#eef0f6] flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/login" className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#1e40af]"><ArrowLeft className="w-4 h-4" /> Portals</Link>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1e40af]/10 text-[#1e40af] flex items-center justify-center"><Bike className="w-4 h-4" strokeWidth={1.75} /></div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-tight">Rider App preview</p>
              <p className="text-[11px] text-gray-500 leading-tight">Live data · actions update the Order Desk and Shopper App instantly</p>
            </div>
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            Signed in as
            <select className={selectClass} value={riderId} onChange={(e) => mutate((d) => { d.session.riderId = e.target.value; })}>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>{r.name} · {RIDER_TYPE_LABEL[r.type]} · {r.branchIds.map((id) => branchName(s, id)).join('/')}{r.status === 'pending' ? ' (pending)' : ''}</option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center py-4">
        <PhoneFrame>
          <RiderApp key={riderId} riderId={riderId} />
        </PhoneFrame>
      </main>
    </div>
  );
}
