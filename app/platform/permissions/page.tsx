'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PlatformLayout } from '@/src/components/platform/PlatformLayout';
import { Panel } from '@/src/components/common';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { mutate, useStore } from '@/src/lib/store';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '@/src/lib/seed';
import { PERMISSION_MODULE_LABEL, addPlatformLog } from '@/src/lib/platform';

const ALL = PERMISSION_MODULES.flatMap((m) => PERMISSION_ACTIONS.map((a) => `${m}.${a}`));

/**
 * Option B: per-action control. A checked box = the client may have this permission.
 * Unchecking it removes it from every client role, including the Super Admin,
 * and the Super Admin cannot give it back in Users & Roles.
 */
export default function SuperAdminAccessPage() {
  const s = useStore();
  const saved = useMemo(() => new Set(s.platform.blockedPermissions ?? []), [s.platform.blockedPermissions]);
  // null = no unsaved edits (show what is saved).
  const [edit, setEdit] = useState<Set<string> | null>(null);
  const blocked = edit ?? saved;

  const dirty = blocked.size !== saved.size || [...blocked].some((p) => !saved.has(p));
  const allowed = (p: string) => !blocked.has(p);
  const setMany = (perms: string[], allow: boolean) =>
    setEdit((b) => { const n = new Set(b ?? saved); perms.forEach((p) => (allow ? n.delete(p) : n.add(p))); return n; });
  const state = (perms: string[]) => {
    const n = perms.filter(allowed).length;
    return n === perms.length ? true : n ? ('indeterminate' as const) : false;
  };

  const save = () => {
    const newlyBlocked = [...blocked].filter((p) => !saved.has(p));
    const newlyAllowed = [...saved].filter((p) => !blocked.has(p));
    mutate((d) => {
      d.platform.blockedPermissions = [...blocked].sort();
      if (newlyBlocked.length) addPlatformLog(d, { action: 'Permissions blocked', detail: newlyBlocked.join(', '), oldValue: 'allowed', newValue: 'blocked' });
      if (newlyAllowed.length) addPlatformLog(d, { action: 'Permissions allowed', detail: newlyAllowed.join(', '), oldValue: 'blocked', newValue: 'allowed' });
    });
    toast.success('Super Admin access saved', {
      description: `${ALL.length - blocked.size} of ${ALL.length} permissions allowed. Every client user sees the change right away.`,
    });
    setEdit(null);
  };

  return (
    <PlatformLayout title="Super Admin Access">
      <p className="text-sm text-gray-500 mb-4">
        Choose exactly what the client&apos;s Super Admin may do. An unchecked action is removed from every client role,
        including the Super Admin, and cannot be given back in Users &amp; Roles. To hide a whole screen, use Module Control.
      </p>

      <Panel
        title={<span className="text-sm text-gray-600"><b className="text-[#0f172a]">{ALL.length - blocked.size}</b> of {ALL.length} actions allowed</span>}
        action={
          <div className="flex gap-2">
            <button disabled={!dirty} onClick={() => setEdit(null)}
              className="h-9 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">Discard</button>
            <button disabled={!dirty} onClick={save}
              className="h-9 px-4 rounded-lg bg-[#0f172a] text-white text-sm font-medium hover:bg-[#1e293b] disabled:opacity-40">Save</button>
          </div>
        }
        bodyClass="p-0 overflow-x-auto"
      >
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="text-left font-medium pl-4 sm:pl-5 py-2 w-44">Area</th>
              {PERMISSION_ACTIONS.map((a) => {
                const col = PERMISSION_MODULES.map((m) => `${m}.${a}`);
                return (
                  <th key={a} className="font-medium py-2">
                    <div className="flex flex-col items-center gap-1">
                      <span className="capitalize">{a}</span>
                      <Checkbox checked={state(col)} onCheckedChange={() => setMany(col, state(col) !== true)} aria-label={`Allow all ${a}`} />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((m) => {
              const row = PERMISSION_ACTIONS.map((a) => `${m}.${a}`);
              return (
                <tr key={m} className="border-b border-gray-50 last:border-0">
                  <td className="pl-4 sm:pl-5 py-2.5">
                    <label className="flex items-center gap-2 font-medium text-gray-800">
                      <Checkbox checked={state(row)} onCheckedChange={() => setMany(row, state(row) !== true)} aria-label={`Allow all ${m}`} />
                      {PERMISSION_MODULE_LABEL[m] ?? m}
                    </label>
                  </td>
                  {row.map((p) => (
                    <td key={p} className="text-center py-2.5">
                      <Checkbox checked={allowed(p)} onCheckedChange={(v) => setMany([p], v === true)} aria-label={p} title={p} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <p className="text-xs text-gray-400 mt-3">Example: uncheck Pricing → Edit, and the Super Admin can still see prices but cannot change them.</p>
    </PlatformLayout>
  );
}
