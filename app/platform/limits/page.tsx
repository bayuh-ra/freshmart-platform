'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PlatformLayout } from '@/src/components/platform/PlatformLayout';
import { Panel, inputClass } from '@/src/components/common';
import { mutate, useStore } from '@/src/lib/store';
import { LIMITS, addPlatformLog, limitUsage } from '@/src/lib/platform';
import type { LimitKey } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export default function PlanLimitsPage() {
  const s = useStore();
  const [draft, setDraft] = useState<Partial<Record<LimitKey, string>>>({});

  const save = (key: LimitKey) => {
    const def = LIMITS.find((l) => l.key === key)!;
    const n = Number(draft[key]);
    if (!Number.isInteger(n) || n < 1) return toast.error('Enter a whole number of 1 or more');
    const old = s.platform.limits[key];
    if (n === old) return;
    const used = limitUsage(s, key).used;
    mutate((d) => {
      d.platform.limits[key] = n;
      addPlatformLog(d, { action: 'Plan limit changed', detail: def.label, oldValue: String(old), newValue: String(n) });
    });
    setDraft((x) => ({ ...x, [key]: undefined }));
    toast.success(`${def.label} limit set to ${n}`, {
      description: n < used
        ? `The client already has ${used}. Existing items keep working; adding more is blocked.`
        : 'The client can add up to this number.',
    });
  };

  return (
    <PlatformLayout title="Plan Limits">
      <p className="text-sm text-gray-500 mb-4">
        Set how much the client can create. When a limit is reached, the client&apos;s Add action shows
        &quot;Plan limit reached. Contact LAP IT Solutions.&quot;
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {LIMITS.map((l) => {
          const u = limitUsage(s, l.key);
          const value = draft[l.key] ?? String(u.max);
          const dirty = draft[l.key] !== undefined && Number(draft[l.key]) !== u.max;
          return (
            <Panel key={l.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{l.label}</p>
                  <p className={cn('text-sm', u.reached ? 'text-[#dc2626] font-medium' : 'text-gray-500')}>
                    {u.used} of {u.max} used{u.reached ? ' · limit reached' : ''}
                  </p>
                </div>
                <span className="text-2xl font-bold text-[#2a2322]">{u.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 mt-3 overflow-hidden">
                <div className={cn('h-full rounded-full', u.pct >= 100 ? 'bg-[#dc2626]' : u.pct >= 80 ? 'bg-amber-500' : 'bg-[#2a2322]')} style={{ width: `${u.pct}%` }} />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <label className="text-sm text-gray-600 shrink-0" htmlFor={`lim-${l.key}`}>Maximum</label>
                <input id={`lim-${l.key}`} type="number" min={1} inputMode="numeric" value={value}
                  onChange={(e) => setDraft((x) => ({ ...x, [l.key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(l.key); }}
                  className={cn(inputClass, 'w-28')} />
                <button disabled={!dirty} onClick={() => save(l.key)}
                  className="h-9 px-4 rounded-lg bg-[#2a2322] text-white text-sm font-medium hover:bg-[#3d3432] disabled:opacity-40">Save</button>
              </div>
            </Panel>
          );
        })}
      </div>
    </PlatformLayout>
  );
}
