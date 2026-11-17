'use client';

import { PlatformLayout } from '@/src/components/platform/PlatformLayout';
import { EmptyState, Panel } from '@/src/components/common';
import { useStore } from '@/src/lib/store';
import { fmtDateTime } from '@/src/lib/logic';

export default function PlatformLogPage() {
  const s = useStore();
  return (
    <PlatformLayout title="Change Log">
      <p className="text-sm text-gray-500 mb-4">Every Platform Owner change, with who made it and when. Entries cannot be edited or deleted.</p>
      <Panel bodyClass="p-0">
        {s.platform.log.length === 0 && <EmptyState title="No changes yet" />}
        <ul className="divide-y divide-gray-100">
          {s.platform.log.map((e) => (
            <li key={e.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-xs text-gray-400 sm:w-40 shrink-0">{fmtDateTime(e.at)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900"><span className="font-medium">{e.action}</span> · {e.detail}</p>
                <p className="text-xs text-gray-500">
                  {e.user}
                  {e.oldValue !== undefined && e.newValue !== undefined ? ` · ${e.oldValue} → ${e.newValue}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </PlatformLayout>
  );
}
