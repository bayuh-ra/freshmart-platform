'use client';

import { useState } from 'react';
import { Layers, Tag, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { addAudit, mutate } from '@/src/lib/store';
import { getSetting } from '@/src/lib/logic';
import type { AppState, Setting } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { ICON, Segmented, cardCls, redBtn } from './_ui';

const MODULE = 'Settings' as const;
const ADMIN = 'Admin or higher';
const SUPER = 'Super Admin only';
type Approver = typeof ADMIN | typeof SUPER;
const APPROVERS: { key: Approver; label: string }[] = [{ key: ADMIN, label: ADMIN }, { key: SUPER, label: SUPER }];

/** Each rule = an existing number setting + a "who approves" setting. Same keys as the Settings page, so both stay in sync. */
const RULES = [
  {
    key: 'refundApprovalAbove', approverKey: 'refundApprover', group: 'Payments' as Setting['group'], icon: Undo2, title: 'Refunds above',
    prefix: '₱', suffix: '', fallback: 1000, label: 'Refund manager approval above', unit: '₱', approverLabel: 'Who approves refunds above the limit',
    sentence: (v: number) => `Refunds over ₱${v.toLocaleString('en-PH')} wait for approval.`,
  },
  {
    key: 'priceApprovalPct', approverKey: 'priceApprover', group: 'Pricing & tax' as Setting['group'], icon: Tag, title: 'Price changes above',
    prefix: '', suffix: '%', fallback: 10, label: 'Price changes needing approval (up or down) above', unit: '%', approverLabel: 'Who approves large price changes',
    sentence: (v: number) => `A change bigger than ${v}% up or down needs approval.`,
  },
  {
    key: 'adjustApprovalUnits', approverKey: 'adjustApprover', group: 'Inventory' as Setting['group'], icon: Layers, title: 'Stock adjustments above',
    prefix: '', suffix: 'units / kg', fallback: 5, label: 'Manager approval for adjustments / count variances above', unit: 'units', approverLabel: 'Who approves large stock adjustments',
    sentence: (v: number) => `Wastage or corrections over ${v} units need approval.`,
  },
];

type Draft = Record<string, string>;

function readSaved(s: AppState): Draft {
  const d: Draft = {};
  for (const r of RULES) {
    const v = getSetting(s, r.key);
    d[r.key] = v === '' ? String(r.fallback) : String(v);
    d[r.approverKey] = getSetting(s, r.approverKey) === SUPER ? SUPER : ADMIN;
  }
  return d;
}

export function RulesTab({ s, editable }: { s: AppState; editable: boolean }) {
  const saved = readSaved(s);
  const [edits, setEdits] = useState<Draft>({});
  const draft: Draft = { ...saved, ...edits };
  const changedKeys = Object.keys(edits).filter((k) => edits[k] !== saved[k]);
  const invalid = RULES.some((r) => draft[r.key].trim() === '' || !(Number(draft[r.key]) >= 0));
  const set = (k: string, v: string) => setEdits((e) => ({ ...e, [k]: v }));

  const save = () => {
    if (invalid) { toast.error('Enter a number of 0 or more for each limit'); return; }
    mutate((d) => {
      for (const r of RULES) {
        const upsert = (key: string, value: string | number, make: () => Setting) => {
          const st = d.settings.find((x) => x.key === key);
          if (st) st.global = value;
          else d.settings.push({ ...make(), global: value });
        };
        if (changedKeys.includes(r.key)) {
          upsert(r.key, Number(draft[r.key]), () => ({ key: r.key, label: r.label, group: r.group, type: 'number', unit: r.unit, global: 0, city: {}, branch: {} }));
        }
        if (changedKeys.includes(r.approverKey)) {
          upsert(r.approverKey, draft[r.approverKey], () => ({ key: r.approverKey, label: r.approverLabel, group: r.group, type: 'select', options: [ADMIN, SUPER], global: ADMIN, city: {}, branch: {} }));
        }
      }
      addAudit(d, {
        module: MODULE, action: 'Approval rules changed',
        detail: `Sensitive-action approval rules: ${changedKeys.join(', ')}`,
        oldValue: changedKeys.map((k) => `${k}=${saved[k]}`).join('; '),
        newValue: changedKeys.map((k) => `${k}=${draft[k]}`).join('; '),
      });
    });
    setEdits({});
    toast.success('Approval rules saved', { description: 'They apply right away, and the Settings page shows the same values.' });
  };

  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5 border-b border-[#f0e8e2]">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#1d1716]">Sensitive actions that need approval</h2>
          <p className="text-xs text-gray-500 mt-0.5">Anything above the limit waits for an approver before it takes effect.</p>
        </div>
        {editable && <button type="button" className={redBtn} disabled={changedKeys.length === 0 || invalid} onClick={save}>Save rules</button>}
      </div>

      <ul className="divide-y divide-[#f0e8e2]">
        {RULES.map((r) => {
          const Icon = r.icon;
          const v = Number(draft[r.key]) || 0;
          return (
            <li key={r.key} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 md:gap-4 px-4 sm:px-5 py-4">
              <div className="flex items-start gap-3 min-w-0 md:col-span-2 xl:col-span-1">
                <span className="w-9 h-9 rounded-lg bg-[#fdf1f0] text-[#c8151d] flex items-center justify-center shrink-0"><Icon className="w-4 h-4" {...ICON} /></span>
                <div className="min-w-0">
                  <p className="font-bold text-[#1d1716]">{r.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.sentence(v)}</p>
                </div>
              </div>
              <div className={cn('flex items-center h-10 w-full md:w-48 rounded-lg border bg-white overflow-hidden focus-within:border-[#c8151d] focus-within:ring-2 focus-within:ring-[#c8151d]/15',
                changedKeys.includes(r.key) ? 'border-amber-400' : 'border-[#e3d6cc]')}>
                {r.prefix && <span className="pl-3 text-sm text-gray-500">{r.prefix}</span>}
                <input type="number" min={0} inputMode="decimal" disabled={!editable} aria-label={r.title} value={draft[r.key]} onChange={(e) => set(r.key, e.target.value)}
                  className="flex-1 min-w-0 h-full px-2 text-sm tabular-nums text-[#1d1716] outline-none bg-transparent disabled:text-gray-500" />
                {r.suffix && <span className="pr-3 text-sm text-gray-500 whitespace-nowrap">{r.suffix}</span>}
              </div>
              <Segmented label={`Who approves ${r.title.toLowerCase()}`} value={draft[r.approverKey] as Approver} options={APPROVERS}
                disabled={!editable} onChange={(x) => set(r.approverKey, x)} />
            </li>
          );
        })}
      </ul>

      {!editable && <p className="px-4 sm:px-5 py-3 border-t border-[#f0e8e2] text-xs text-gray-500">You need settings.edit to change these rules.</p>}
    </section>
  );
}
