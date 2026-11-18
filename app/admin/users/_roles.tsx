'use client';

import { useState } from 'react';
import { Check, Crown, Lock, Pencil, Plus, Shield, Store, Trash2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { addAudit, mutate, uid } from '@/src/lib/store';
import type { AppState, Role } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import {
  ACTIONS, BUILT_IN_ROLES, CATALOGUE, ICON, MODULES, MODULE_LABEL, TOTAL_PERMS, cardCls, fieldCls, outlineBtn, permCount, redBtn,
} from './_ui';

const MODULE = 'Users & Roles' as const;

function roleIcon(r: Role) {
  if (r.protected || r.id === 'role-super') return Crown;
  if (r.id === 'role-admin') return Shield;
  if (r.id === 'role-cashier') return Store;
  return UserCog;
}

export function RolesTab({ s, editable }: { s: AppState; editable: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  // Unsaved matrix edits, kept per role so switching roles doesn't lose them.
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);
  const role = s.roles.find((r) => r.id === picked) ?? s.roles.find((r) => r.id === 'role-admin') ?? s.roles.find((r) => !r.protected) ?? s.roles[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-4 lg:gap-5 items-start">
      {/* LEFT: role cards */}
      <div className="space-y-3 min-w-0">
        {s.roles.map((r) => {
          const Icon = roleIcon(r);
          const users = s.staff.filter((u) => u.roleId === r.id).length;
          const on = r.id === role?.id;
          const unsaved = !!drafts[r.id];
          return (
            <button key={r.id} type="button" aria-pressed={on} onClick={() => setPicked(r.id)}
              className={cn('w-full text-left rounded-2xl border-2 bg-[#fffdfb] p-4 transition-colors', on ? 'border-[#2a2322]' : 'border-[#eadfd6] hover:border-[#d9cabe]')}>
              <div className="flex items-center gap-2">
                <Icon className={cn('w-4 h-4 shrink-0', r.protected ? 'text-[#ae754d]' : 'text-[#c8151d]')} {...ICON} />
                <span className="font-bold text-[#1d1716] truncate">{r.name}</span>
                {unsaved && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />}
                <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">{users} {users === 1 ? 'user' : 'users'}</span>
              </div>
              {r.description && <p className="mt-1.5 text-xs text-gray-500">{r.description}</p>}
              <p className="mt-2.5 text-xs font-bold text-[#1d1716]">
                {permCount(r)} of {TOTAL_PERMS} permissions · {r.scopeType === 'all' ? 'All branches' : 'Assigned branches'}
              </p>
            </button>
          );
        })}

        {editable && (creating
          ? <NewRoleCard s={s} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); setPicked(id); }} />
          : (
            <button type="button" onClick={() => setCreating(true)}
              className="w-full h-11 rounded-2xl border-2 border-dashed border-[#d9cabe] text-sm font-semibold text-[#5b4f4b] hover:border-[#c8151d] hover:text-[#c8151d] inline-flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" {...ICON} />New role
            </button>
          ))}

        <p className="text-xs text-gray-500 px-1">Riders sign in to the Rider app and aren&apos;t listed here.</p>
      </div>

      {/* RIGHT: matrix */}
      {role && (
        <Matrix s={s} role={role} editable={editable}
          draft={drafts[role.id]}
          setDraft={(perms) => setDrafts((d) => {
            const n = { ...d };
            const same = perms.length === role.permissions.length && perms.every((p) => role.permissions.includes(p));
            if (same) delete n[role.id];
            else n[role.id] = perms;
            return n;
          })}
          onSaved={() => setDrafts((d) => { const n = { ...d }; delete n[role.id]; return n; })}
          onDeleted={() => setPicked(null)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ New role

function NewRoleCard({ s, onCancel, onCreated }: { s: AppState; onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState('');
  const sources = s.roles.filter((r) => !r.protected);

  const create = () => {
    const n = name.trim();
    if (!n) return;
    if (s.roles.some((r) => r.name.toLowerCase() === n.toLowerCase())) { toast.error(`There is already a role called ${n}`); return; }
    const src = sources.find((r) => r.id === from);
    const perms = src ? src.permissions.filter((p) => CATALOGUE.includes(p)) : [];
    const id = uid('role');
    mutate((d) => {
      d.roles.push({ id, name: n, description: description.trim(), scopeType: 'branches', permissions: perms });
      addAudit(d, { module: MODULE, action: 'Create role', detail: src ? `Role ${n} created from ${src.name}` : `Role ${n} created`, newValue: `${perms.length} permissions` });
    });
    toast.success(`Role ${n} created`, { description: perms.length ? `Started with ${src?.name}'s ${perms.length} permissions.` : 'Tick its permissions on the right, then save.' });
    onCreated(id);
  };

  return (
    <div className="rounded-2xl border-2 border-[#2a2322] bg-[#fffdfb] p-4 space-y-3">
      <p className="font-bold text-[#1d1716]">New role</p>
      <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name, e.g. Butcher" aria-label="Role name" autoFocus />
      <input className={fieldCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this person does (optional)" aria-label="Description" />
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1.5">Start with permissions from</p>
        <div role="group" aria-label="Start with permissions from" className="flex flex-wrap gap-1.5">
          {[{ id: '', name: 'Nothing' }, ...sources].map((r) => {
            const on = from === r.id;
            return (
              <button key={r.id || 'none'} type="button" aria-pressed={on} onClick={() => setFrom(r.id)}
                className={cn('h-8 px-3 rounded-full border text-xs whitespace-nowrap transition-colors',
                  on ? 'bg-[#2a2322] border-[#2a2322] text-white font-semibold' : 'bg-white border-[#eadfd6] text-[#3d3230] hover:border-[#d9cabe]')}>
                {r.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={cn(outlineBtn, 'h-10 px-4')} onClick={onCancel}>Cancel</button>
        <button type="button" className={redBtn} disabled={!name.trim()} onClick={create}>Create role</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Matrix

function Matrix({ s, role, editable, draft, setDraft, onSaved, onDeleted }: {
  s: AppState; role: Role; editable: boolean; draft?: string[];
  setDraft: (perms: string[]) => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const blocked = new Set(s.platform?.blockedPermissions ?? []);
  const readOnly = !editable || !!role.protected;
  const saved = new Set(role.permissions);
  const current = new Set(draft ?? role.permissions);
  const has = (p: string) => !blocked.has(p) && (role.protected ? true : current.has(p));
  const changed = (p: string) => !role.protected && saved.has(p) !== current.has(p);
  const dirty = !!draft;
  const count = CATALOGUE.filter(has).length;
  const users = s.staff.filter((u) => u.roleId === role.id).length;
  const custom = !role.protected && !BUILT_IN_ROLES.includes(role.id);

  const setMany = (perms: string[], on: boolean) => {
    if (readOnly) return;
    // Permissions blocked by the Platform Owner cannot be granted to any role.
    const n = new Set(current);
    perms.filter((p) => !blocked.has(p)).forEach((p) => (on ? n.add(p) : n.delete(p)));
    setDraft([...n]);
  };
  const toggleGroup = (perms: string[]) => setMany(perms, !perms.filter((p) => !blocked.has(p)).every(has));

  const save = () => {
    if (!draft) return;
    const next = [...current];
    const added = next.filter((p) => !saved.has(p));
    const removed = role.permissions.filter((p) => !current.has(p));
    const list = (xs: string[]) => `${xs.slice(0, 4).join(', ')}${xs.length > 4 ? '…' : ''}`;
    mutate((d) => {
      const r = d.roles.find((x) => x.id === role.id);
      if (!r) return;
      r.permissions = next;
      addAudit(d, {
        module: MODULE, action: 'Update permissions',
        detail: `${role.name}: +${added.length} / -${removed.length}${added.length ? ` (added ${list(added)})` : ''}${removed.length ? ` (removed ${list(removed)})` : ''}`,
        oldValue: `${permCount(role)} permissions`, newValue: `${next.filter((p) => CATALOGUE.includes(p)).length} permissions`,
      });
    });
    onSaved();
    toast.success(`Permissions saved for ${role.name}`, { description: `${users} ${users === 1 ? 'user sees' : 'users see'} the change right away.` });
  };

  const del = () => {
    if (users) { toast.error(`${role.name} is assigned to ${users} user(s)`, { description: 'Move them to another role first.' }); return; }
    if (!confirm(`Delete the role "${role.name}"? This can't be undone.`)) return;
    mutate((d) => {
      d.roles = d.roles.filter((x) => x.id !== role.id);
      addAudit(d, { module: MODULE, action: 'Delete role', detail: `Role ${role.name} deleted`, oldValue: `${permCount(role)} permissions` });
    });
    onSaved();
    onDeleted();
    toast.success(`Role ${role.name} deleted`);
  };

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5 border-b border-[#f0e8e2]">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#1d1716] flex items-center gap-2">
            {role.name} permissions
            {editable && !role.protected && (
              <button type="button" onClick={() => setEditing(true)} aria-label={`Rename ${role.name}`} className="text-gray-400 hover:text-[#1d1716]">
                <Pencil className="w-3.5 h-3.5" {...ICON} />
              </button>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{count} of {TOTAL_PERMS} permissions</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && custom && users === 0 && (
            <button type="button" onClick={del} className="inline-flex items-center gap-1 text-sm font-medium text-[#c8151d] hover:underline">
              <Trash2 className="w-3.5 h-3.5" {...ICON} />Delete role
            </button>
          )}
          {!readOnly && <button type="button" className={redBtn} disabled={!dirty} onClick={save}>Save changes</button>}
        </div>
      </div>

      {role.protected && (
        <p className="mx-4 sm:mx-5 mt-4 flex items-center gap-2 rounded-lg border border-[#f1dcc4] bg-[#fdf4ea] px-3 py-2 text-xs text-[#7a4a1c]">
          <Lock className="w-3.5 h-3.5 shrink-0" {...ICON} />Super Admin always has every permission.
        </p>
      )}
      {blocked.size > 0 && (
        <p className="mx-4 sm:mx-5 mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <Lock className="w-3.5 h-3.5 shrink-0" {...ICON} />{blocked.size} permission{blocked.size === 1 ? ' is' : 's are'} locked by the Platform Owner and can&apos;t be given to any role.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-[#f0e8e2]">
              <th className="text-left pl-4 sm:pl-5 pr-2 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">Module</th>
              {ACTIONS.map((a) => {
                const col = MODULES.map((m) => `${m}.${a}`);
                return (
                  <th key={a} className="px-1 py-3 text-center">
                    <button type="button" disabled={readOnly} onClick={() => toggleGroup(col)} title={readOnly ? undefined : `Toggle ${a} for every module`}
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500 enabled:hover:text-[#c8151d] disabled:cursor-default">
                      {a}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0e8e2]">
            {MODULES.map((m) => {
              const row = ACTIONS.map((a) => `${m}.${a}`);
              const n = row.filter(has).length;
              return (
                <tr key={m}>
                  <td className="pl-4 sm:pl-5 pr-2 py-2.5">
                    <button type="button" disabled={readOnly} onClick={() => toggleGroup(row)} title={readOnly ? undefined : `Toggle every ${MODULE_LABEL[m] ?? m} permission`}
                      className="text-left whitespace-nowrap enabled:hover:text-[#c8151d] disabled:cursor-default">
                      <span className="font-bold text-[#1d1716]">{MODULE_LABEL[m] ?? m}</span> <span className="text-xs text-gray-400 tabular-nums">{n}/{row.length}</span>
                    </button>
                  </td>
                  {row.map((p) => (
                    <td key={p} className="px-1 py-2.5 text-center">
                      {blocked.has(p) ? (
                        <span title={`${p} is locked by the Platform Owner`} className="inline-flex w-6 h-6 items-center justify-center text-gray-300"><Lock className="w-3.5 h-3.5" {...ICON} /></span>
                      ) : (
                        <button type="button" role="checkbox" aria-checked={has(p)} aria-label={p} title={p} disabled={readOnly} onClick={() => setMany([p], !has(p))}
                          className={cn('inline-flex w-6 h-6 items-center justify-center rounded-md border transition-colors disabled:cursor-default',
                            has(p) ? 'bg-[#c8151d] border-[#c8151d] text-white' : 'bg-white border-[#d9cabe] enabled:hover:border-[#c8151d]',
                            changed(p) && 'ring-2 ring-amber-400 ring-offset-1')}>
                          {has(p) && <Check className="w-4 h-4" strokeWidth={3} />}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="px-4 sm:px-5 py-3 border-t border-[#f0e8e2] text-xs text-gray-500">
        {role.protected
          ? 'Super Admin always has every permission.'
          : !editable
            ? 'You can see these permissions but need users.edit to change them.'
            : "Tap a module or column name to toggle the whole row or column. Changes outlined in amber aren't saved yet."}
      </p>

      {editing && <RenameDialog role={role} onClose={() => setEditing(false)} />}
    </section>
  );
}

function RenameDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const save = () => {
    if (!name.trim()) { toast.error('Role name is required'); return; }
    mutate((d) => {
      const x = d.roles.find((r) => r.id === role.id);
      if (!x) return;
      addAudit(d, { module: MODULE, action: 'Edit role', detail: `Role ${role.name} edited`, oldValue: role.name, newValue: name.trim() });
      x.name = name.trim(); x.description = description.trim();
    });
    toast.success('Role updated');
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
        <DialogHeader><DialogTitle>Edit {role.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-gray-600">Role name
            <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-gray-600">What this person does
            <input className={fieldCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <button type="button" className={cn(outlineBtn, 'h-10 px-4')} onClick={onClose}>Cancel</button>
          <button type="button" className={redBtn} onClick={save}>Save</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
