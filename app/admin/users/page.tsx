'use client';

import { useState, useSyncExternalStore } from 'react';
import { BadgeCheck, ShieldCheck, Users } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { useStore } from '@/src/lib/store';
import { can } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { ICON, OSWALD } from './_ui';
import { UsersTab } from './_users';
import { RolesTab } from './_roles';
import { RulesTab } from './_rules';

type TabKey = 'users' | 'roles' | 'rules';
const TAB_KEYS: TabKey[] = ['users', 'roles', 'rules'];
const noopSubscribe = () => () => {};
const urlTab = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('tab'));

export default function UsersPage() {
  const s = useStore();
  // ?tab= is read only after hydration so the server render matches the first client render (same as Riders).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<TabKey | null>(null);
  const tab: TabKey = picked ?? (hydrated ? (TAB_KEYS.find((k) => k === urlTab()) ?? 'users') : 'users');

  const setTab = (t: TabKey) => {
    setPicked(t);
    const url = new URL(window.location.href);
    if (t === 'users') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };

  if (!can(s, 'users.view')) {
    return <DashboardLayout title="Users & roles" eyebrow="Administration" hideBranch><AccessDenied permission="users.view" /></DashboardLayout>;
  }

  const active = s.staff.filter((u) => u.status === 'active').length;
  const where = s.branches.length === 1 ? s.branches[0].name : `${s.branches.length} branches`;
  const tabs: { key: TabKey; label: string; icon: typeof Users }[] = [
    { key: 'users', label: `Users · ${s.staff.length}`, icon: Users },
    { key: 'roles', label: 'Roles & permissions', icon: ShieldCheck },
    { key: 'rules', label: 'Approval rules', icon: BadgeCheck },
  ];

  return (
    <DashboardLayout title="Users & roles" eyebrow="Administration" hideBranch>
      <div className="min-w-0">
        <div className="mb-5 min-w-0">
          <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">
            {active} active staff · {s.roles.length} {s.roles.length === 1 ? 'role' : 'roles'} · {where}
          </p>
          <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Users &amp; roles</h1>
        </div>

        <nav aria-label="Users and roles sections" className="mb-5 border-b border-[#e8ddd4] overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <div role="tablist" className="flex gap-1 min-w-max">
            {tabs.map((t) => {
              const on = t.key === tab;
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                  className={cn('relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 text-sm whitespace-nowrap transition-colors',
                    on ? 'font-semibold text-[#c8151d]' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
                  <Icon className="w-4 h-4" {...ICON} />{t.label}
                  {on && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[#c8151d]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </nav>

        {tab === 'users' && <UsersTab s={s} editable={can(s, 'users.edit')} />}
        {tab === 'roles' && <RolesTab s={s} editable={can(s, 'users.edit')} />}
        {tab === 'rules' && <RulesTab s={s} editable={can(s, 'settings.edit')} />}
      </div>
    </DashboardLayout>
  );
}
