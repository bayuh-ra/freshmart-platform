'use client';

import { useState, type ReactNode } from 'react';
import { KeyRound, LogOut, Mail, Search, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { useNow } from '@/src/components/delivery/helpers';
import { addAudit, mutate, uid } from '@/src/lib/store';
import { guardLimit } from '@/src/lib/platform';
import { getSetting } from '@/src/lib/logic';
import type { AppState, StaffUser } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import {
  Avatar, Chip, ICON, StatusChip, agoText, cardCls, fieldCls, joinNames, outlineBtn, permCount, redBtn, scopeLabel, selRowCls, smallCaps,
} from './_ui';

const MODULE = 'Users & Roles' as const;

export function UsersTab({ s, editable }: { s: AppState; editable: boolean }) {
  const now = useNow(60_000);
  const meId = s.session.staffUserId;
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const rows = s.staff.filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const fallback = s.staff.find((u) => u.id !== meId) ?? s.staff[0];
  const sel = s.staff.find((u) => u.id === picked) ?? fallback;

  return (
    <div className="space-y-4">
      <TwoFactorBanner s={s} editable={editable} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] gap-4 lg:gap-5 items-start">
        {/* LEFT: list */}
        <section className={cardCls}>
          <div className="p-3 sm:p-4 flex flex-col sm:flex-row gap-2 border-b border-[#f0e8e2]">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" {...ICON} />
              <input className={cn(fieldCls, 'pl-9')} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search name or email" />
            </div>
            {editable && (
              <button type="button" className={redBtn} onClick={() => setInviting(true)}>
                <UserPlus className="w-4 h-4" {...ICON} />Invite user
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">No staff match &ldquo;{q}&rdquo;.</p>
          ) : (
            <ul className="divide-y divide-[#f0e8e2]">
              {rows.map((u) => {
                const role = s.roles.find((r) => r.id === u.roleId);
                const on = sel?.id === u.id;
                return (
                  <li key={u.id}>
                    <button type="button" onClick={() => setPicked(u.id)} aria-current={on ? 'true' : undefined}
                      className={cn(selRowCls(on), 'w-full text-left flex items-center gap-3 px-3 sm:px-4 py-3')}>
                      <Avatar name={u.name} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-[#1d1716] min-w-0">
                          <span className="truncate">{u.name}</span>
                          {u.id === meId && <span className="shrink-0 rounded px-1 py-px bg-[#fdf1f0] text-[9px] font-bold tracking-wide text-[#c8151d]">YOU</span>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {role?.name ?? 'No role'} · {scopeLabel(s, u)} · {u.status === 'invited' ? 'invite pending' : agoText(now, u.lastActive)}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 shrink-0">
                        {u.twoFactor ? <Chip tone="green">2FA</Chip> : <Chip tone="amber">No 2FA</Chip>}
                        <StatusChip status={u.status} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* RIGHT: detail */}
        {sel && <UserDetail key={sel.id} s={s} u={sel} now={now} editable={editable} />}
      </div>

      {inviting && <InviteDialog s={s} onClose={() => setInviting(false)} onInvited={(id) => { setInviting(false); setPicked(id); setQ(''); }} />}
    </div>
  );
}

// ------------------------------------------------------------------ 2FA banner

function TwoFactorBanner({ s, editable }: { s: AppState; editable: boolean }) {
  const required = getSetting(s, 'require2fa') === true;
  const without = s.staff.filter((u) => !u.twoFactor && u.status !== 'deactivated');
  const names = joinNames(without.map((u) => u.name));
  if (required) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[#cfe5d6] bg-[#eef7f1] px-4 py-3 text-sm text-[#1f6b3f]">
        <ShieldCheck className="w-5 h-5 mt-px shrink-0" {...ICON} />
        <p>
          <b>2FA is required for everyone.</b>
          {without.length > 0 && <> {names} will be asked to set it up at next sign-in.</>}
        </p>
      </div>
    );
  }
  if (without.length === 0) return null;
  const cashierIds = s.roles.filter((r) => r.name.toLowerCase() === 'cashier').map((r) => r.id);
  const why = without.some((u) => cashierIds.includes(u.roleId))
    ? 'Cashiers handle cash and refunds, so 2FA is worth requiring.'
    : 'Staff accounts can change orders and stock, so 2FA is worth requiring.';
  const requireAll = () => {
    mutate((d) => {
      const st = d.settings.find((x) => x.key === 'require2fa');
      if (st) st.global = true;
      else d.settings.push({ key: 'require2fa', label: 'Require 2FA for everyone', group: 'Security', type: 'boolean', global: true, city: {}, branch: {} });
      addAudit(d, { module: MODULE, action: 'Require 2FA for everyone', detail: `2FA required for all staff. Not set up yet: ${names}`, oldValue: 'off', newValue: 'on' });
    });
    toast.success('2FA is now required for everyone', { description: `${names} will set it up at next sign-in.` });
  };
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[#f1dcc4] bg-[#fdf4ea] px-4 py-3 text-sm text-[#7a4a1c]">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <ShieldAlert className="w-5 h-5 mt-px shrink-0 text-[#ae754d]" {...ICON} />
        <p><b>{names} {without.length === 1 ? "doesn't" : "don't"} use 2FA.</b> {why}</p>
      </div>
      {editable && (
        <button type="button" onClick={requireAll} className={cn(outlineBtn, 'self-start sm:self-auto border-[#e7cfb3]')}>Require 2FA for everyone</button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Detail

function UserDetail({ s, u, now, editable }: { s: AppState; u: StaffUser; now: number; editable: boolean }) {
  const [confirmOff, setConfirmOff] = useState(false);
  const isMe = u.id === s.session.staffUserId;
  const role = s.roles.find((r) => r.id === u.roleId);
  const superIds = s.roles.filter((r) => r.protected).map((r) => r.id);
  const activeSupers = s.staff.filter((x) => superIds.includes(x.roleId) && x.status === 'active');
  const lastSuper = superIds.includes(u.roleId) && u.status === 'active' && activeSupers.length <= 1;
  const suspended = u.status === 'suspended';
  const required = getSetting(s, 'require2fa') === true;
  const sessions = u.sessions ?? [];
  const first = u.name.split(' ')[0];

  const roleLocked = !editable || isMe || suspended;
  const roleHint = !editable ? 'You need users.edit to change roles.'
    : isMe ? "You can't change your own role. Ask another Super Admin."
      : suspended ? 'Suspended by the Platform Owner.'
        : lastSuper ? `${first} is the only Super Admin. Make someone else Super Admin first.` : null;

  const changeRole = (roleId: string) => {
    if (roleLocked || roleId === u.roleId) return;
    const next = s.roles.find((r) => r.id === roleId);
    if (!next || !role) return;
    if (lastSuper && !next.protected) return;
    const before = { roleId: u.roleId, scope: u.scope };
    const scope: StaffUser['scope'] = next.scopeType === 'all'
      ? { type: 'all', ids: [] }
      : u.scope.type === 'all' ? { type: 'branches', ids: s.branches.map((b) => b.id) } : u.scope;
    mutate((d) => {
      const x = d.staff.find((y) => y.id === u.id)!;
      x.roleId = roleId; x.scope = scope;
      addAudit(d, { module: MODULE, action: 'Change role', detail: `${u.name}: ${role.name} → ${next.name}`, oldValue: role.name, newValue: next.name });
    });
    toast.success(`${u.name} is now ${next.name}`, {
      description: 'Their access changes right away.',
      action: {
        label: 'Undo',
        onClick: () => {
          mutate((d) => {
            const x = d.staff.find((y) => y.id === u.id);
            if (!x) return;
            x.roleId = before.roleId; x.scope = before.scope;
            addAudit(d, { module: MODULE, action: 'Undo role change', detail: `${u.name}: ${next.name} → ${role.name}`, oldValue: next.name, newValue: role.name });
          });
          toast.success(`${u.name} is back to ${role.name}`);
        },
      },
    });
  };

  const act = (action: string, detail: string, fn?: (x: StaffUser) => void, oldValue?: string, newValue?: string) => {
    if (!editable) { toast.error('You need users.edit for this action'); return false; }
    mutate((d) => {
      const x = d.staff.find((y) => y.id === u.id)!;
      fn?.(x);
      addAudit(d, { module: MODULE, action, detail, oldValue, newValue });
    });
    return true;
  };

  const resetLink = () => { if (act('Reset password', `Password reset link sent to ${u.email}`)) toast.success('Password reset link sent', { description: u.email }); };
  const resendInvite = () => { if (act('Resend invite', `Invite re-sent to ${u.email}`)) toast.success(`Invite re-sent to ${u.email}`); };
  const signOutAll = () => {
    if (act('Sign out everywhere', `${u.name} signed out of ${sessions.length} device(s)`, (x) => { x.sessions = []; }, `${sessions.length} device(s)`, '0 devices')) {
      toast.success(`${u.name} is signed out everywhere`, { description: 'They need to sign in again on every device.' });
    }
  };
  const deactivate = () => {
    if (lastSuper) { toast.error(`${first} is the only active Super Admin`); return; }
    if (act('Deactivate user', `${u.name} deactivated`, (x) => { x.status = 'deactivated'; x.sessions = []; }, u.status, 'deactivated')) {
      toast.success(`${u.name} deactivated`, { description: 'Their order history is kept.' });
    }
    setConfirmOff(false);
  };
  const reactivate = () => { if (act('Reactivate user', `${u.name} reactivated`, (x) => { x.status = 'active'; }, 'deactivated', 'active')) toast.success(`${u.name} reactivated`); };

  const pwDate = u.passwordChangedAt ? new Date(u.passwordChangedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

  return (
    <section className={cardCls}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4 sm:p-5 border-b border-[#f0e8e2]">
        <Avatar name={u.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-[#1d1716] break-words">{u.name}{isMe && <span className="ml-2 align-middle rounded px-1 py-px bg-[#fdf1f0] text-[10px] font-bold tracking-wide text-[#c8151d]">YOU</span>}</p>
          <p className="mt-0.5 text-xs text-gray-500 break-words">
            {u.email} · {u.status === 'invited' ? 'invite pending' : `last active ${agoText(now, u.lastActive)}`}
          </p>
        </div>
        <StatusChip status={u.status} />
      </div>

      {/* Role */}
      <div className="p-4 sm:p-5 border-b border-[#f0e8e2]">
        <p className={smallCaps}>Role</p>
        <div role="radiogroup" aria-label={`Role for ${u.name}`} className="mt-2.5 space-y-2">
          {s.roles.map((r) => {
            const on = r.id === u.roleId;
            const disabled = roleLocked || (lastSuper && !r.protected);
            return (
              <button key={r.id} type="button" role="radio" aria-checked={on} disabled={disabled && !on} onClick={() => changeRole(r.id)}
                className={cn('w-full text-left flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                  on ? 'border-[#2a2322] bg-white ring-1 ring-[#2a2322]' : 'border-[#eadfd6] bg-white hover:border-[#d9cabe]',
                  disabled && !on && 'opacity-50 cursor-not-allowed hover:border-[#eadfd6]',
                  disabled && on && 'cursor-default')}>
                <span className={cn('mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', on ? 'border-[#c8151d]' : 'border-[#cbbdb2]')}>
                  {on && <span className="w-2 h-2 rounded-full bg-[#c8151d]" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm"><b className="text-[#1d1716]">{r.name}</b> <span className="text-gray-500">· {permCount(r)} permissions</span></span>
                  <span className="block mt-0.5 text-xs text-gray-500">{r.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        {roleHint && <p className="mt-2 text-xs text-gray-500">{roleHint}</p>}
      </div>

      {/* Info rows */}
      <dl className="divide-y divide-[#f0e8e2] border-b border-[#f0e8e2]">
        <InfoRow label="Branch access" value={scopeLabel(s, u, true)} />
        <InfoRow label="Two-factor sign-in"
          value={u.twoFactor
            ? <span className="font-semibold text-[#1f6b3f]">On · authenticator app</span>
            : <span className="font-semibold text-[#a35a12]">Off{required && ' · set up at next sign-in'}</span>} />
        {u.status === 'invited' ? (
          <InfoRow label="Password" value="Not set yet · invite pending"
            action={editable && <button type="button" className={outlineBtn} onClick={resendInvite}><Mail className="w-4 h-4" {...ICON} />Resend invite</button>} />
        ) : (
          <InfoRow label="Password" value={pwDate ? `Last changed ${pwDate}` : 'Not changed since invite'}
            action={editable && !suspended && u.status !== 'deactivated' && <button type="button" className={outlineBtn} onClick={resetLink}><KeyRound className="w-4 h-4" {...ICON} />Send reset link</button>} />
        )}
        <InfoRow label="Sessions"
          value={sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'device' : 'devices'} · ${sessions.join(', ')}` : 'Not signed in anywhere'}
          action={editable && <button type="button" className={outlineBtn} disabled={sessions.length === 0} onClick={signOutAll}><LogOut className="w-4 h-4" {...ICON} />Sign out everywhere</button>} />
      </dl>

      {/* Footer */}
      {!isMe && editable && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5">
          {suspended ? (
            <p className="text-xs text-gray-500">Suspended by the Platform Owner. Only they can lift it.</p>
          ) : u.status === 'deactivated' ? (
            <>
              <p className="text-xs text-gray-500">Can&apos;t sign in. Their order history is kept.</p>
              <button type="button" className={cn(outlineBtn, 'self-start sm:self-auto')} onClick={reactivate}>Reactivate</button>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500">Stops sign-in immediately. Their order history is kept.</p>
              <button type="button" disabled={lastSuper} onClick={() => setConfirmOff(true)}
                className={cn(outlineBtn, 'self-start sm:self-auto border-[#e9b9b6] text-[#c8151d] hover:bg-[#fdf1f0]')}>Deactivate</button>
            </>
          )}
        </div>
      )}

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Deactivate {u.name}?</DialogTitle>
            <DialogDescription>{first} is signed out of every device and can&apos;t sign in. Their order history is kept, and you can reactivate them later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className={cn(outlineBtn, 'h-10 px-4')} onClick={() => setConfirmOff(false)}>Cancel</button>
            <button type="button" className={redBtn} onClick={deactivate}>Deactivate</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function InfoRow({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-[#1d1716] break-words">{value}</dd>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Invite

function InviteDialog({ s, onClose, onInvited }: { s: AppState; onClose: () => void; onInvited: (id: string) => void }) {
  const defaultRole = s.roles.find((r) => r.id === 'role-cashier') ?? s.roles.find((r) => !r.protected) ?? s.roles[0];
  const [f, setF] = useState({
    name: '', email: '', roleId: defaultRole?.id ?? '',
    all: defaultRole?.scopeType === 'all',
    ids: (s.branches.length === 1 ? [s.branches[0].id] : []) as string[],
  });
  const role = s.roles.find((r) => r.id === f.roleId);
  const forcedAll = role?.scopeType === 'all';
  const all = forcedAll || f.all;

  const save = () => {
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('Enter a name and a valid email');
    if (s.staff.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())) return toast.error('That email already has an account');
    if (!all && f.ids.length === 0) return toast.error('Pick at least one branch');
    if (!guardLimit('staff')) return;
    const id = uid('u');
    mutate((d) => {
      d.staff.push({
        id, name: f.name.trim(), email: f.email.trim(), roleId: f.roleId, scope: all ? { type: 'all', ids: [] } : { type: 'branches', ids: f.ids },
        status: 'invited', lastActive: new Date().toISOString(), twoFactor: false, sessions: [],
      });
      addAudit(d, { module: MODULE, action: 'Invite user', detail: `${f.name.trim()} <${f.email.trim()}> invited as ${role?.name}`, newValue: 'invited' });
    });
    toast.success(`Invite sent to ${f.email.trim()}`, { description: `${role?.name} · status: invited` });
    onInvited(id);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They get an email to set a password. They can do what their role allows, in the branches you pick.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-gray-600">Full name
            <input className={fieldCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Juan dela Cruz" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">Email
            <input className={fieldCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="juan@jovannesmeatshop.ph" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">Role
            <select className={fieldCls} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
              {s.roles.map((r) => <option key={r.id} value={r.id}>{r.name} · {permCount(r)} permissions</option>)}
            </select>
          </label>
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-gray-600">Branch access</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={all} disabled={forcedAll} onClick={() => setF({ ...f, all: true })}
                className={cn('h-9 px-3.5 rounded-lg border text-sm transition-colors', all ? 'bg-[#2a2322] border-[#2a2322] text-white font-semibold' : 'bg-white border-[#eadfd6] text-[#3d3230] hover:border-[#d9cabe]')}>
                All branches
              </button>
              {!forcedAll && s.branches.map((b) => {
                const on = !all && f.ids.includes(b.id);
                return (
                  <button key={b.id} type="button" aria-pressed={on}
                    onClick={() => setF({ ...f, all: false, ids: all ? [b.id] : on ? f.ids.filter((x) => x !== b.id) : [...f.ids, b.id] })}
                    className={cn('h-9 px-3.5 rounded-lg border text-sm transition-colors', on ? 'bg-[#2a2322] border-[#2a2322] text-white font-semibold' : 'bg-white border-[#eadfd6] text-[#3d3230] hover:border-[#d9cabe]')}>
                    {b.name} ({b.code})
                  </button>
                );
              })}
            </div>
            {forcedAll && <p className="text-xs text-gray-500">{role?.name} always has every branch.</p>}
          </div>
        </div>
        <DialogFooter>
          <button type="button" className={cn(outlineBtn, 'h-10 px-4')} onClick={onClose}>Cancel</button>
          <button type="button" className={redBtn} onClick={save}><Mail className="w-4 h-4" {...ICON} />Send invite</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
