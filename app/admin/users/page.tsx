'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  UserPlus, Lock, Copy, Trash2, Pencil, Plus, ShieldCheck, Eye, Mail, LogOut, KeyRound, Smartphone, UserX, UserCheck, History, Search, Save, Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, Pill, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/src/components/ui/shadcn/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { Field, EntityStatus, Tip } from '@/src/components/admin/ui';
import { addAudit, mutate, uid, useStore } from '@/src/lib/store';
import { guardLimit } from '@/src/lib/platform';
import { can, fmtDateTime, getSetting, peso, timeAgo } from '@/src/lib/logic';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/src/lib/seed';
import type { AppState, Role, StaffUser } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

/** Phase 1: fixed roles (Super Admin / Admin / Cashier). Flip to true in Phase 2 to allow creating, cloning and deleting roles. */
const CUSTOM_ROLES = false;

const MODULE_LABEL: Record<string, string> = {
  orders: 'Orders', catalog: 'Catalog', pricing: 'Pricing', inventory: 'Inventory', riders: 'Riders', customers: 'Customers',
  promotions: 'Promotions', support: 'Support', reports: 'Reports', settings: 'Settings', users: 'Users & Roles',
};

function scopeLabel(s: AppState, u: StaffUser) {
  if (u.scope.type === 'all') return 'All branches';
  const names = u.scope.type === 'cities'
    ? u.scope.ids.map((id) => s.cities.find((c) => c.id === id)?.name ?? id)
    : u.scope.ids.map((id) => s.branches.find((b) => b.id === id)?.name ?? id);
  return names.join(', ') || '—';
}

export default function UsersPage() {
  const s = useStore();
  const [tab, setTab] = useState('users');
  if (!can(s, 'users.view')) {
    return <DashboardLayout title="Users & Roles" eyebrow="Administration" hideBranch><AccessDenied permission="users.view" /></DashboardLayout>;
  }
  const editable = can(s, 'users.edit');
  return (
    <DashboardLayout title="Users & Roles" eyebrow="Administration" hideBranch>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden justify-start">
          <TabsTrigger value="users">Users ({s.staff.length})</TabsTrigger>
          <TabsTrigger value="roles">Roles ({s.roles.length})</TabsTrigger>
          <TabsTrigger value="matrix">Permission matrix</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab editable={editable} /></TabsContent>
        <TabsContent value="roles"><RolesTab editable={editable} onOpenMatrix={() => setTab('matrix')} /></TabsContent>
        <TabsContent value="matrix"><MatrixTab editable={editable} /></TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

// ------------------------------------------------------------------ Users

function UsersTab({ editable }: { editable: boolean }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [roleF, setRoleF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [invite, setInvite] = useState(false);
  const [activity, setActivity] = useState<StaffUser | null>(null);

  const rows = s.staff.filter((u) =>
    (roleF === 'all' || u.roleId === roleF) && (statusF === 'all' || u.status === statusF) &&
    (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())),
  );

  const act = (u: StaffUser, action: string, detail: string, fn?: (x: StaffUser) => void, old?: string, nv?: string) => {
    if (!editable) return toast.error('You need users.edit for this action');
    mutate((d) => {
      const x = d.staff.find((y) => y.id === u.id)!;
      fn?.(x);
      addAudit(d, { module: 'Users & Roles', action, detail, oldValue: old, newValue: nv });
    });
  };

  return (
    <div className="space-y-4">
      <Panel bodyClass="p-0">
        <div className="p-4 pb-0">
          <Toolbar>
            <div className="relative w-full sm:w-auto">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" strokeWidth={1.75} />
              <input className={cn(inputClass, 'pl-8 w-full sm:w-64')} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className={selectClass} value={roleF} onChange={(e) => setRoleF(e.target.value)}>
              <option value="all">All roles</option>
              {s.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select className={selectClass} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
              <option value="all">Any status</option><option value="active">Active</option><option value="invited">Invited</option><option value="deactivated">Deactivated</option>
            </select>
            <div className="flex-1" />
            {editable && <Button onClick={() => setInvite(true)}><UserPlus className="w-4 h-4" strokeWidth={1.75} />Invite user</Button>}
          </Toolbar>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>2FA</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => {
              const role = s.roles.find((r) => r.id === u.roleId);
              const isMe = u.id === s.session.staffUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#c8151d]/10 text-[#c8151d] text-xs font-semibold flex items-center justify-center">{u.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</div>
                      <div>
                        <p className="font-medium text-gray-900">{u.name}{isMe && <span className="ml-1.5 text-[10px] text-[#c8151d] font-semibold">YOU</span>}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-700">{role?.name ?? '—'}</TableCell>
                  <TableCell className="text-gray-600 text-xs max-w-[200px]">
                    <span className="capitalize text-gray-400">{u.scope.type === 'all' ? '' : `${u.scope.type}: `}</span>{scopeLabel(s, u)}
                  </TableCell>
                  <TableCell><EntityStatus status={u.status} /></TableCell>
                  <TableCell>{u.twoFactor ? <Pill className="bg-green-100 text-green-800">On</Pill> : <Pill>Off</Pill>}</TableCell>
                  <TableCell className="text-xs text-gray-500">{u.status === 'invited' ? 'Invite pending' : timeAgo(u.lastActive)}</TableCell>
                  <TableCell className="text-right pr-5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="sm" variant="outline">Manage</Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => setActivity(u)}><History className="w-4 h-4" strokeWidth={1.75} />Activity log</DropdownMenuItem>
                        {editable && <>
                          <DropdownMenuSeparator />
                          {u.status === 'invited' && (
                            <DropdownMenuItem onClick={() => { act(u, 'Resend invite', `Invite re-sent to ${u.email}`); toast.success(`Invite re-sent to ${u.email}`); }}>
                              <Mail className="w-4 h-4" strokeWidth={1.75} />Resend invite
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => { act(u, 'Reset password', `Password reset link sent to ${u.email}`); toast.success('Password reset link sent', { description: u.email }); }}>
                            <KeyRound className="w-4 h-4" strokeWidth={1.75} />Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { act(u, 'Force logout', `All sessions of ${u.name} signed out`); toast.success(`${u.name} signed out of all devices`); }}>
                            <LogOut className="w-4 h-4" strokeWidth={1.75} />Force logout
                          </DropdownMenuItem>
                          {!u.twoFactor && (
                            <DropdownMenuItem onClick={() => { act(u, 'Require 2FA', `2FA required for ${u.name}`, (x) => { x.twoFactor = true; }, 'off', 'on'); toast.success(`2FA now required for ${u.name}`, { description: 'They will enrol on next sign-in.' }); }}>
                              <Smartphone className="w-4 h-4" strokeWidth={1.75} />Require 2FA
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {u.status === 'suspended' ? (
                            <DropdownMenuItem disabled>
                              <UserX className="w-4 h-4" strokeWidth={1.75} />Suspended by Platform Owner
                            </DropdownMenuItem>
                          ) : u.status !== 'deactivated' ? (
                            <DropdownMenuItem disabled={isMe} className="text-[#dc2626]" onClick={() => { act(u, 'Deactivate user', `${u.name} deactivated`, (x) => { x.status = 'deactivated'; }, u.status, 'deactivated'); toast.success(`${u.name} deactivated`); }}>
                              <UserX className="w-4 h-4" strokeWidth={1.75} />Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => { act(u, 'Reactivate user', `${u.name} reactivated`, (x) => { x.status = 'active'; }, 'deactivated', 'active'); toast.success(`${u.name} reactivated`); }}>
                              <UserCheck className="w-4 h-4" strokeWidth={1.75} />Reactivate
                            </DropdownMenuItem>
                          )}
                        </>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
      <SensitiveRules />
      {invite && <InviteDialog onClose={() => setInvite(false)} />}
      {activity && <ActivityDialog user={activity} onClose={() => setActivity(null)} />}
    </div>
  );
}

function SensitiveRules() {
  const s = useStore();
  const rules = [
    { key: 'refundApprovalAbove', label: 'Refunds above', fmt: (v: number) => peso(v), who: 'need an Admin to approve (orders.approve)' },
    { key: 'priceApprovalPct', label: 'Price changes above', fmt: (v: number) => `${v}%`, who: 'need an Admin to approve (pricing.approve)' },
    { key: 'adjustApprovalUnits', label: 'Stock adjustments above', fmt: (v: number) => `${v} units`, who: 'need an Admin to approve (inventory.approve)' },
  ];
  return (
    <Panel title="Sensitive-action rules" action={<Button size="sm" variant="outline" asChild><Link href="/admin/settings">Edit in Settings</Link></Button>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rules.map((r) => (
          <Link key={r.key} href="/admin/settings" className="rounded-lg border border-gray-100 bg-gray-50 p-4 hover:border-[#c8151d]/30 transition-colors">
            <p className="text-xs text-gray-500">{r.label}</p>
            <p className="text-2xl font-bold text-[#c8151d] mt-1">{r.fmt(Number(getSetting(s, r.key)) || 0)}</p>
            <p className="text-xs text-gray-500 mt-1">{r.who}</p>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ name: '', email: '', roleId: 'role-cashier', scopeType: 'branches' as StaffUser['scope']['type'], ids: (s.branches.length === 1 ? [s.branches[0].id] : []) as string[] });
  const options = f.scopeType === 'cities' ? s.cities.map((c) => ({ id: c.id, name: c.name })) : s.branches.map((b) => ({ id: b.id, name: b.name }));
  const save = () => {
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) return toast.error('Enter a name and a valid email');
    if (s.staff.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) return toast.error('That email already has an account');
    if (f.scopeType !== 'all' && f.ids.length === 0) return toast.error(`Pick at least one ${f.scopeType === 'cities' ? 'city' : 'branch'}`);
    if (!guardLimit('staff')) return;
    const role = s.roles.find((r) => r.id === f.roleId);
    mutate((d) => {
      d.staff.push({ id: uid('u'), name: f.name.trim(), email: f.email.trim(), roleId: f.roleId, scope: { type: f.scopeType, ids: f.scopeType === 'all' ? [] : f.ids }, status: 'invited', lastActive: new Date().toISOString(), twoFactor: false });
      addAudit(d, { module: 'Users & Roles', action: 'Invite user', detail: `${f.name} <${f.email}> invited as ${role?.name}`, newValue: 'invited' });
    });
    toast.success(`Invite sent to ${f.email}`, { description: `${role?.name} · status: invited` });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They receive an email to set a password. Access = role permissions within the chosen scope.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Full name"><input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Juan dela Cruz" /></Field>
          <Field label="Email"><input className={inputClass} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="juan@jovannesmeatshop.ph" /></Field>
          <Field label="Role">
            <select className={selectClass} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
              {s.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Scope">
            <select className={selectClass} value={f.scopeType} onChange={(e) => setF({ ...f, scopeType: e.target.value as StaffUser['scope']['type'], ids: [] })}>
              <option value="all">All cities & branches</option><option value="cities">Specific cities</option><option value="branches">Specific branches</option>
            </select>
          </Field>
          {f.scopeType !== 'all' && (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const on = f.ids.includes(o.id);
                return (
                  <label key={o.id} className={cn('flex items-center gap-2 text-sm rounded-lg border px-3 py-1.5 cursor-pointer', on ? 'border-[#c8151d] bg-[#c8151d]/5' : 'border-gray-200')}>
                    <Checkbox checked={on} onCheckedChange={() => setF({ ...f, ids: on ? f.ids.filter((x) => x !== o.id) : [...f.ids, o.id] })} />{o.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}><Mail className="w-4 h-4" strokeWidth={1.75} />Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const s = useStore();
  const first = user.name.split(' ')[0];
  const entries = s.audit.filter((a) => a.user === user.name || a.detail.includes(user.name) || a.detail.includes(user.email)).slice(0, 50);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Activity — {user.name}</DialogTitle>
          <DialogDescription>Actions by or about {first}, from the immutable audit log.</DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No activity recorded yet.</p> : (
          <ul className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {entries.map((a) => (
              <li key={a.id} className="py-2.5 flex gap-3 text-sm">
                <span className="text-xs text-gray-400 w-28 shrink-0">{fmtDateTime(a.at)}</span>
                <div className="min-w-0">
                  <p className="text-gray-900"><span className="font-medium">{a.action}</span> <Pill className="ml-1">{a.module}</Pill></p>
                  <p className="text-xs text-gray-500">{a.user !== user.name && <>by {a.user} · </>}{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Roles

function RolesTab({ editable, onOpenMatrix }: { editable: boolean; onOpenMatrix: () => void }) {
  const s = useStore();
  const [dlg, setDlg] = useState<{ mode: 'new' | 'rename' | 'clone'; role?: Role } | null>(null);
  const del = (r: Role) => {
    const users = s.staff.filter((u) => u.roleId === r.id).length;
    if (r.protected) return toast.error(`${r.name} is protected and cannot be deleted`);
    if (users) return toast.error(`${r.name} is assigned to ${users} user(s)`, { description: 'Move them to another role first.' });
    if (!confirm(`Delete role "${r.name}"?`)) return;
    mutate((d) => {
      d.roles = d.roles.filter((x) => x.id !== r.id);
      addAudit(d, { module: 'Users & Roles', action: 'Delete role', detail: `Role ${r.name} deleted`, oldValue: `${r.permissions.length} permissions` });
    });
    toast.success(`Role ${r.name} deleted`);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Phase 1 uses three fixed roles: <b>Super Admin</b>, <b>Admin</b> and <b>Cashier</b>. Riders sign in to the Rider App. Custom roles come in Phase 2.</p>
        {editable && CUSTOM_ROLES && <Button onClick={() => setDlg({ mode: 'new' })}><Plus className="w-4 h-4" strokeWidth={1.75} />Create role</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {s.roles.map((r) => {
          const users = s.staff.filter((u) => u.roleId === r.id).length;
          return (
            <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  {r.protected ? <Lock className="w-4 h-4 text-amber-600" strokeWidth={1.75} /> : <ShieldCheck className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />}
                  {r.name}
                </h3>
                <Pill className="capitalize">{r.scopeType === 'all' ? 'All branches' : r.scopeType}</Pill>
              </div>
              <p className="text-xs text-gray-500 flex-1">{r.description}</p>
              <div className="flex gap-4 text-sm">
                <span><b className="text-[#c8151d]">{r.permissions.length}</b> <span className="text-gray-500">permissions</span></span>
                <span><b className="text-[#c8151d]">{users}</b> <span className="text-gray-500">users</span></span>
              </div>
              <div className="flex flex-wrap gap-1 border-t border-gray-100 pt-3">
                <Button size="sm" variant="outline" onClick={onOpenMatrix}><Eye className="w-3.5 h-3.5" strokeWidth={1.75} />Permissions</Button>
                {editable && <>
                  <Button size="sm" variant="ghost" disabled={r.protected} onClick={() => setDlg({ mode: 'rename', role: r })}><Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />Rename</Button>
                  {CUSTOM_ROLES && <Button size="sm" variant="ghost" onClick={() => setDlg({ mode: 'clone', role: r })}><Copy className="w-3.5 h-3.5" strokeWidth={1.75} />Clone</Button>}
                  {CUSTOM_ROLES && <Button size="sm" variant="ghost" className="text-[#dc2626]" disabled={r.protected} onClick={() => del(r)}><Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /></Button>}
                </>}
              </div>
            </div>
          );
        })}
      </div>
      {dlg && <RoleDialog mode={dlg.mode} role={dlg.role} onClose={() => setDlg(null)} />}
    </div>
  );
}

function RoleDialog({ mode, role, onClose }: { mode: 'new' | 'rename' | 'clone'; role?: Role; onClose: () => void }) {
  const [name, setName] = useState(mode === 'clone' ? `${role?.name} (copy)` : role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [scopeType, setScopeType] = useState<Role['scopeType']>(role?.scopeType ?? 'branches');
  const save = () => {
    if (!name.trim()) return toast.error('Role name is required');
    mutate((d) => {
      if (mode === 'rename' && role) {
        const x = d.roles.find((r) => r.id === role.id)!;
        addAudit(d, { module: 'Users & Roles', action: 'Rename role', detail: `Role ${role.name} renamed`, oldValue: role.name, newValue: name });
        x.name = name; x.description = description; x.scopeType = scopeType;
      } else {
        const perms = mode === 'clone' && role ? [...role.permissions] : ['orders.view'];
        d.roles.push({ id: uid('role'), name, description, scopeType, permissions: perms });
        addAudit(d, { module: 'Users & Roles', action: mode === 'clone' ? 'Clone role' : 'Create role', detail: mode === 'clone' ? `Role ${name} cloned from ${role?.name}` : `Role ${name} created`, newValue: `${perms.length} permissions` });
      }
    });
    toast.success(mode === 'rename' ? 'Role updated' : `Role ${name} created`, { description: mode === 'rename' ? undefined : 'Set its permissions in the Permission matrix tab.' });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? 'Create role' : mode === 'clone' ? `Clone ${role?.name}` : `Rename ${role?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Role name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night Shift Supervisor" /></Field>
          <Field label="Description"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Scope type">
            <select className={selectClass} value={scopeType} onChange={(e) => setScopeType(e.target.value as Role['scopeType'])}>
              <option value="all">All branches</option><option value="cities">Cities</option><option value="branches">Branches</option><option value="self">Own records only</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Matrix

function MatrixTab({ editable }: { editable: boolean }) {
  const s = useStore();
  const [roleId, setRoleId] = useState(s.roles.find((r) => !r.protected)?.id ?? s.roles[0]?.id);
  const role = s.roles.find((r) => r.id === roleId) ?? s.roles[0];
  const [draft, setDraft] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [loadedFor, setLoadedFor] = useState(role?.id);
  if (role && loadedFor !== role.id) {
    setLoadedFor(role.id);
    setDraft(new Set(role.permissions));
  }
  const readOnly = !editable || !!role?.protected;
  const dirty = useMemo(() => {
    if (!role) return false;
    const a = new Set(role.permissions);
    return a.size !== draft.size || [...draft].some((p) => !a.has(p));
  }, [role, draft]);

  if (!role) return null;
  const blocked = new Set(s.platform.blockedPermissions ?? []);
  const has = (p: string) => !blocked.has(p) && (role.protected ? true : draft.has(p));
  const setMany = (perms: string[], on: boolean) => {
    if (readOnly) return;
    // Permissions blocked by the Platform Owner cannot be granted to any role.
    setDraft((d) => { const n = new Set(d); perms.filter((p) => !blocked.has(p)).forEach((p) => (on ? n.add(p) : n.delete(p))); return n; });
  };
  const save = () => {
    const before = role.permissions.length;
    const added = [...draft].filter((p) => !role.permissions.includes(p));
    const removed = role.permissions.filter((p) => !draft.has(p));
    mutate((d) => {
      d.roles.find((r) => r.id === role.id)!.permissions = [...draft];
      addAudit(d, {
        module: 'Users & Roles', action: 'Update permissions',
        detail: `${role.name}: +${added.length} / -${removed.length}${added.length ? ` (added ${added.slice(0, 4).join(', ')}${added.length > 4 ? '…' : ''})` : ''}${removed.length ? ` (removed ${removed.slice(0, 4).join(', ')}${removed.length > 4 ? '…' : ''})` : ''}`,
        oldValue: `${before} permissions`, newValue: `${draft.size} permissions`,
      });
    });
    toast.success(`Permissions saved for ${role.name}`, { description: `${before} → ${draft.size} permissions. Users with this role see the change immediately.` });
  };

  return (
    <div className="space-y-4">
      {blocked.size > 0 && (
        <Tip className="border-slate-300 bg-slate-50 text-slate-800">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
          <span><b>{blocked.size} permission{blocked.size === 1 ? ' is' : 's are'} locked by the Platform Owner</b> (LAP IT Solutions). Locked boxes cannot be ticked for any role, including Super Admin.</span>
        </Tip>
      )}
      <Tip className="border-amber-200 bg-amber-50 text-amber-900">
        <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
        <span><b>Tip:</b> Use &lsquo;View as&rsquo; in the top-right menu to see the sidebar and pages change for that role.</span>
      </Tip>
      <Panel
        title={
          <div className="flex flex-wrap items-center gap-3">
            <select className={selectClass} value={role.id} onChange={(e) => setRoleId(e.target.value)}>
              {s.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="text-sm text-gray-500"><b className="text-[#c8151d]">{(role.protected ? role.permissions : [...draft]).filter((p) => !blocked.has(p)).length}</b> of {PERMISSION_MODULES.length * PERMISSION_ACTIONS.length} permissions</span>
            {role.protected && <Pill className="bg-amber-100 text-amber-800"><Lock className="w-3 h-3" strokeWidth={1.75} />Protected — has every permission the plan allows</Pill>}
          </div>
        }
        action={!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(new Set(role.permissions))}>Discard</Button>
            <Button size="sm" disabled={!dirty} onClick={save}><Save className="w-4 h-4" strokeWidth={1.75} />Save changes</Button>
          </div>
        )}
        bodyClass="p-0 overflow-x-auto"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 w-56">Module</TableHead>
              {PERMISSION_ACTIONS.map((a) => {
                const col = PERMISSION_MODULES.map((m) => `${m}.${a}`);
                const n = col.filter(has).length;
                return (
                  <TableHead key={a} className="text-center">
                    <div className="flex flex-col items-center gap-1 py-1">
                      <span className="capitalize">{a}</span>
                      <Checkbox disabled={readOnly} checked={n === col.length ? true : n ? 'indeterminate' : false} onCheckedChange={() => setMany(col, n !== col.length)} aria-label={`Toggle all ${a}`} />
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSION_MODULES.map((m) => {
              const row = PERMISSION_ACTIONS.map((a) => `${m}.${a}`);
              const n = row.filter(has).length;
              return (
                <TableRow key={m}>
                  <TableCell className="pl-5">
                    <label className="flex items-center gap-2 font-medium text-gray-800">
                      <Checkbox disabled={readOnly} checked={n === row.length ? true : n ? 'indeterminate' : false} onCheckedChange={() => setMany(row, n !== row.length)} aria-label={`Toggle all ${m}`} />
                      {MODULE_LABEL[m] ?? m}
                    </label>
                  </TableCell>
                  {row.map((p) => (
                    <TableCell key={p} className="text-center">
                      {blocked.has(p)
                        ? <span title={`${p} — locked by Platform Owner`} className="inline-flex text-gray-300"><Lock className="w-3.5 h-3.5" strokeWidth={1.75} /></span>
                        : <Checkbox disabled={readOnly} checked={has(p)} onCheckedChange={(v) => setMany([p], v === true)} aria-label={p} title={p} />}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
