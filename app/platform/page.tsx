'use client';

import Link from 'next/link';
import { ToggleRight, SlidersHorizontal, UserCog, ArrowRight } from 'lucide-react';
import { PlatformLayout } from '@/src/components/platform/PlatformLayout';
import { Panel, StatCard } from '@/src/components/common';
import { useStore } from '@/src/lib/store';
import { LIMITS, MODULES, limitUsage, moduleOn } from '@/src/lib/platform';
import { timeAgo } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';

export default function PlatformOverview() {
  const s = useStore();
  const off = MODULES.filter((m) => !moduleOn(s, m.key));
  const supers = s.staff.filter((u) => u.roleId === 'role-super');
  const nearLimit = LIMITS.filter((l) => limitUsage(s, l.key).pct >= 80);

  return (
    <PlatformLayout title="Overview">
      <p className="text-sm text-gray-500 mb-6">You control what the FreshMart client can use. Changes apply to every client user, including the Super Admin, right away.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Modules ON" value={`${MODULES.length - off.length} / ${MODULES.length}`} sub={`${off.length} switched off`} href="/platform/modules" accent="border-l-[#0f172a]" valueClass="text-[#0f172a]" icon={<ToggleRight className="w-5 h-5" />} />
        <StatCard title="Limits at 80% or more" value={nearLimit.length} sub="of 6 plan limits" href="/platform/limits" accent={nearLimit.length ? 'border-l-amber-500' : 'border-l-emerald-500'} valueClass={nearLimit.length ? 'text-amber-600' : 'text-emerald-600'} icon={<SlidersHorizontal className="w-5 h-5" />} />
        <StatCard title="Super Admin accounts" value={supers.length} sub={`${supers.filter((u) => u.status === 'suspended').length} suspended`} href="/platform/admins" accent="border-l-[#1e40af]" icon={<UserCog className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Switched off" action={<Link href="/platform/modules" className="text-sm text-[#1e40af] inline-flex items-center gap-1">Manage <ArrowRight className="w-4 h-4" /></Link>} bodyClass="p-0">
          {off.length === 0 && <p className="p-5 text-sm text-gray-400">Every module is on.</p>}
          <ul className="divide-y divide-gray-100">
            {off.map((m) => (
              <li key={m.key} className="px-5 py-3">
                <p className="text-sm font-medium text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-500">{s.platform.modules[m.key].reason || 'No reason given'}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Plan usage" action={<Link href="/platform/limits" className="text-sm text-[#1e40af] inline-flex items-center gap-1">Manage <ArrowRight className="w-4 h-4" /></Link>}>
          <div className="space-y-3">
            {LIMITS.map((l) => {
              const u = limitUsage(s, l.key);
              return (
                <div key={l.key}>
                  <div className="flex justify-between text-sm"><span className="text-gray-700">{l.label}</span><span className={cn('font-medium', u.reached ? 'text-[#dc2626]' : 'text-gray-900')}>{u.used} / {u.max}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 mt-1 overflow-hidden"><div className={cn('h-full rounded-full', u.pct >= 100 ? 'bg-[#dc2626]' : u.pct >= 80 ? 'bg-amber-500' : 'bg-[#0f172a]')} style={{ width: `${u.pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Recent changes" className="lg:col-span-2" bodyClass="p-0" action={<Link href="/platform/log" className="text-sm text-[#1e40af] inline-flex items-center gap-1">All <ArrowRight className="w-4 h-4" /></Link>}>
          <ul className="divide-y divide-gray-100">
            {s.platform.log.slice(0, 5).map((e) => (
              <li key={e.id} className="px-5 py-3 flex flex-wrap justify-between gap-2">
                <div><p className="text-sm text-gray-900"><span className="font-medium">{e.action}</span> · {e.detail}</p><p className="text-xs text-gray-500">{e.user}</p></div>
                <span className="text-xs text-gray-400">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PlatformLayout>
  );
}
