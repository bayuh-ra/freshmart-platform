'use client';

import { toast } from 'sonner';
import { PlatformLayout } from '@/src/components/platform/PlatformLayout';
import { Panel } from '@/src/components/common';
import { mutate, useStore } from '@/src/lib/store';
import { addPlatformLog } from '@/src/lib/platform';
import { timeAgo } from '@/src/lib/logic';
import type { StaffUser } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export default function ClientAdminsPage() {
  const s = useStore();
  const supers = s.staff.filter((u) => u.roleId === 'role-super');
  const others = s.staff.filter((u) => u.roleId !== 'role-super');

  const setStatus = (u: StaffUser, next: StaffUser['status']) => {
    mutate((d) => {
      const x = d.staff.find((y) => y.id === u.id);
      if (!x) return;
      const old = x.status;
      x.status = next;
      addPlatformLog(d, { action: next === 'suspended' ? 'Super Admin suspended' : 'Super Admin reactivated', detail: `${u.name} <${u.email}>`, oldValue: old, newValue: next });
    });
    toast.success(next === 'suspended' ? `${u.name} suspended` : `${u.name} reactivated`, {
      description: next === 'suspended' ? 'They can no longer open any client screen.' : 'Access is restored.',
    });
  };

  const forceSignOut = (u: StaffUser) => {
    mutate((d) => {
      if (!d.platform.forcedSignOut.includes(u.id)) d.platform.forcedSignOut.push(u.id);
      addPlatformLog(d, { action: 'Forced sign-out', detail: `${u.name} <${u.email}> signed out of all devices` });
    });
    toast.success(`${u.name} signed out of all devices`);
  };

  return (
    <PlatformLayout title="Client Admins">
      <p className="text-sm text-gray-500 mb-4">
        The client&apos;s Super Admin accounts. Only the Platform Owner can suspend or reactivate them; the client cannot undo it.
      </p>

      <Panel title="Super Admin accounts" bodyClass="p-0">
        <ul className="divide-y divide-gray-100">
          {supers.map((u) => {
            const suspended = u.status === 'suspended';
            const signedOut = s.platform.forcedSignOut.includes(u.id);
            return (
              <li key={u.id} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0', suspended ? 'bg-gray-400' : 'bg-[#1e40af]')}>
                    {u.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{u.name}</p>
                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400">
                      <span className={cn('font-semibold uppercase', suspended ? 'text-[#dc2626]' : 'text-emerald-600')}>{u.status}</span>
                      {' · '}last active {timeAgo(u.lastActive)}{signedOut ? ' · signed out by you' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {suspended ? (
                    <button onClick={() => setStatus(u, 'active')} className="h-9 px-4 rounded-lg bg-[#0f172a] text-white text-sm font-medium hover:bg-[#1e293b]">Reactivate</button>
                  ) : (
                    <button onClick={() => setStatus(u, 'suspended')} className="h-9 px-4 rounded-lg border border-[#dc2626] text-[#dc2626] text-sm font-medium hover:bg-red-50">Suspend</button>
                  )}
                  <button onClick={() => forceSignOut(u)} disabled={suspended || signedOut}
                    className="h-9 px-4 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">Force sign-out</button>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <p className="text-xs text-gray-400 mt-4">
        The client manages its other {others.length} staff accounts in Users &amp; Roles. They also lose access to any module you switch off.
      </p>
    </PlatformLayout>
  );
}
