'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Power, UserX, LogIn } from 'lucide-react';
import { mutate, useStore } from '@/src/lib/store';
import { currentUser } from '@/src/lib/logic';
import { moduleDef, moduleForPath, moduleOn } from '@/src/lib/platform';
import type { ModuleKey } from '@/src/lib/types';

/** Shown in place of a page whose module the Platform Owner switched off. */
export function ModuleOff({ moduleKey }: { moduleKey: ModuleKey }) {
  const m = moduleDef(moduleKey);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10 flex flex-col items-center text-center max-w-xl mx-auto">
      <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mb-3"><Power className="w-6 h-6" /></div>
      <h2 className="text-lg font-semibold text-gray-900">{m.label} is switched off</h2>
      <p className="text-sm text-gray-500 mt-1">This module is not part of your plan. It was switched off by the Platform Owner (LAP IT Solutions). Contact LAP IT Solutions to turn it on.</p>
      <Link href="/dashboard" className="mt-5 text-sm font-medium text-[#c8151d] hover:underline">Back to Dashboard</Link>
    </div>
  );
}

/**
 * Wraps every client staff page: blocks suspended or force-signed-out accounts,
 * and pages whose module is switched off.
 */
export function ClientGate({ children }: { children: React.ReactNode }) {
  const s = useStore();
  const path = usePathname() ?? '';
  const user = currentUser(s);

  if (user.status === 'suspended') {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10 flex flex-col items-center text-center max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-red-50 text-[#dc2626] flex items-center justify-center mb-3"><UserX className="w-6 h-6" /></div>
        <h2 className="text-lg font-semibold text-gray-900">Account suspended</h2>
        <p className="text-sm text-gray-500 mt-1">{user.name}&apos;s account was suspended by the Platform Owner (LAP IT Solutions). Contact LAP IT Solutions to restore access.</p>
        <p className="text-xs text-gray-400 mt-4">Demo: use the top-right menu to view as another user.</p>
      </div>
    );
  }

  if (s.platform.forcedSignOut.includes(user.id)) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10 flex flex-col items-center text-center max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3"><LogIn className="w-6 h-6" /></div>
        <h2 className="text-lg font-semibold text-gray-900">You were signed out</h2>
        <p className="text-sm text-gray-500 mt-1">The Platform Owner signed {user.name} out of all devices. Sign in again to continue.</p>
        <button onClick={() => mutate((d) => { d.platform.forcedSignOut = d.platform.forcedSignOut.filter((id) => id !== user.id); })}
          className="mt-5 h-9 px-4 rounded-lg bg-[#c8151d] text-white text-sm font-medium hover:bg-[#a3111a]">Sign in again</button>
      </div>
    );
  }

  const key = moduleForPath(path);
  if (key && !moduleOn(s, key)) return <ModuleOff moduleKey={key} />;
  return <>{children}</>;
}
