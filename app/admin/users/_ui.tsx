'use client';

import type { ReactNode } from 'react';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/src/lib/seed';
import type { AppState, Role, StaffUser } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export const ICON = { strokeWidth: 1.75 };
export const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;
export const cardCls = 'rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0';
export const smallCaps = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500';
export const outlineBtn = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3d6cc] bg-white px-3 h-9 text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';
export const redBtn = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#d6202a] px-4 h-10 text-sm font-semibold text-white shadow-sm hover:bg-[#c8151d] disabled:bg-[#efb3b6] disabled:shadow-none disabled:pointer-events-none whitespace-nowrap';
export const fieldCls = 'w-full h-10 rounded-lg border border-[#e3d6cc] bg-white px-3 text-sm text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d] focus:ring-2 focus:ring-[#c8151d]/15';
export const selRowCls = (on: boolean) => cn('border-l-[3px] transition-colors cursor-pointer', on ? 'bg-[#fdf1f0] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#faf6f2]');

/** The permission catalogue: 11 modules × 6 actions. */
export const MODULES = PERMISSION_MODULES;
export const ACTIONS = PERMISSION_ACTIONS;
export const CATALOGUE = MODULES.flatMap((m) => ACTIONS.map((a) => `${m}.${a}`));
export const TOTAL_PERMS = CATALOGUE.length;
export const MODULE_LABEL: Record<string, string> = {
  orders: 'Orders', catalog: 'Catalog', pricing: 'Pricing', inventory: 'Inventory', riders: 'Riders', customers: 'Customers',
  promotions: 'Promotions', support: 'Support', reports: 'Reports', settings: 'Settings', users: 'Users & roles',
};
/** Seeded Phase 1 roles. Anything else was created on this page and can be deleted once nobody uses it. */
export const BUILT_IN_ROLES = ['role-super', 'role-admin', 'role-cashier'];

export function permCount(r: Role) {
  return r.protected ? TOTAL_PERMS : r.permissions.filter((p) => CATALOGUE.includes(p)).length;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('rounded-full bg-[#fbe3e2] text-[#c8151d] font-semibold flex items-center justify-center shrink-0',
      size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm')}>
      {initials(name)}
    </span>
  );
}

/** "Digos (DGS)" or "All branches". */
export function scopeLabel(s: AppState, u: StaffUser, withCode = false) {
  if (u.scope.type === 'all') return 'All branches';
  const names = u.scope.type === 'cities'
    ? u.scope.ids.map((id) => s.cities.find((c) => c.id === id)?.name ?? id)
    : u.scope.ids.map((id) => {
      const b = s.branches.find((x) => x.id === id);
      return b ? (withCode ? `${b.name} (${b.code})` : b.name) : id;
    });
  return names.join(', ') || 'No branch';
}

/** "Ana Cruz", "Ana Cruz and Ben Torres", "A, B and C". */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function agoText(now: number, iso: string) {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Chip({ tone, children }: { tone: 'green' | 'amber' | 'blue' | 'grey' | 'red'; children: ReactNode }) {
  const cls = {
    green: 'bg-[#e6f2ea] text-[#1f6b3f]',
    amber: 'bg-[#fdf4ea] text-[#a35a12] ring-1 ring-inset ring-[#f1dcc4]',
    blue: 'bg-[#e8f0fb] text-[#2456a6]',
    grey: 'bg-[#efebe8] text-[#6b605c]',
    red: 'bg-[#fdf1f0] text-[#c8151d]',
  }[tone];
  return <span className={cn('inline-flex items-center h-6 px-2 rounded-md text-[11px] font-semibold whitespace-nowrap', cls)}>{children}</span>;
}

export function StatusChip({ status }: { status: StaffUser['status'] }) {
  if (status === 'active') return <Chip tone="green">Active</Chip>;
  if (status === 'invited') return <Chip tone="blue">Invited</Chip>;
  if (status === 'suspended') return <Chip tone="red">Suspended</Chip>;
  return <Chip tone="grey">Deactivated</Chip>;
}

/** Segmented control (rounded-lg), same look as Delivery zones. */
export function Segmented<T extends string>({ value, options, onChange, disabled, label }: {
  value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-[#ebe4dd] p-1">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} disabled={disabled} onClick={() => onChange(o.key)}
          className={cn('h-8 px-3 rounded-md text-xs sm:text-sm whitespace-nowrap transition-colors disabled:cursor-not-allowed',
            value === o.key ? 'bg-white font-semibold text-[#c8151d] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
