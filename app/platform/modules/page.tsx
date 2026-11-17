'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PlatformLayout } from '@/src/components/platform/PlatformLayout';
import { Panel, inputClass } from '@/src/components/common';
import { Toggle } from '@/src/components/admin/ui';
import { mutate, useStore } from '@/src/lib/store';
import { CORE_SCREENS, MODULES, addPlatformLog, moduleOn } from '@/src/lib/platform';
import { timeAgo } from '@/src/lib/logic';
import type { ModuleKey } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

export default function ModuleControlPage() {
  const s = useStore();
  const [pending, setPending] = useState<{ key: ModuleKey; next: boolean } | null>(null);
  const [reason, setReason] = useState('');

  const apply = () => {
    if (!pending) return;
    const m = MODULES.find((x) => x.key === pending.key)!;
    const why = reason.trim();
    mutate((d) => {
      d.platform.modules[pending.key] = { on: pending.next, reason: why || undefined, changedAt: new Date().toISOString() };
      addPlatformLog(d, {
        action: `Module switched ${pending.next ? 'ON' : 'OFF'}`,
        detail: `${m.label}${why ? ` — ${why}` : ''}`,
        oldValue: pending.next ? 'OFF' : 'ON',
        newValue: pending.next ? 'ON' : 'OFF',
      });
    });
    toast.success(`${m.label} switched ${pending.next ? 'on' : 'off'}`, { description: 'Applied to every client user right away.' });
    setPending(null);
    setReason('');
  };

  return (
    <PlatformLayout title="Module Control">
      <p className="text-sm text-gray-500 mb-4">
        A module that is off disappears from every client user&apos;s menu and buttons, including the Super Admin&apos;s.
        Its data is kept, and switching it back on restores it.
      </p>

      <Panel bodyClass="p-0">
        <ul className="divide-y divide-gray-100">
          {MODULES.map((m) => {
            const st = s.platform.modules[m.key];
            const on = moduleOn(s, m.key);
            const isPending = pending?.key === m.key;
            return (
              <li key={m.key} className="px-4 sm:px-5 py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-gray-900">{m.label}</p>
                      <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', on ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        {on ? 'On' : 'Off'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{m.description}</p>
                    {(st.reason || st.changedAt) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {st.reason ? `Reason: ${st.reason}` : ''}
                        {st.reason && st.changedAt ? ' · ' : ''}
                        {st.changedAt ? `changed ${timeAgo(st.changedAt)}` : ''}
                      </p>
                    )}
                  </div>
                  <Toggle
                    checked={isPending ? pending.next : on}
                    label={`${m.label} on/off`}
                    onChange={(v) => {
                      if (v === on) { setPending(null); return; }
                      setPending({ key: m.key, next: v });
                      setReason('');
                    }}
                  />
                </div>
                {isPending && (
                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') apply(); }}
                      placeholder="Reason (optional, shown in the change log)" className={cn(inputClass, 'flex-1')} />
                    <div className="flex gap-2">
                      <button onClick={apply} className="h-9 px-4 rounded-lg bg-[#0f172a] text-white text-sm font-medium hover:bg-[#1e293b]">
                        Switch {pending.next ? 'on' : 'off'}
                      </button>
                      <button onClick={() => setPending(null)} className="h-9 px-3 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-white">Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <p className="text-xs text-gray-400 mt-4">Always on (core): {CORE_SCREENS.join(', ')}.</p>
    </PlatformLayout>
  );
}
