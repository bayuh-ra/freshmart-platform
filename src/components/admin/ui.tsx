'use client';

// Small building blocks shared by the Administration pages.

import { cn } from '@/src/lib/utils';

/** Toggle switch (shadcn has no Switch in this project). */
export function Toggle({ checked, onChange, disabled, size = 'md', label }: {
  checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; size?: 'sm' | 'md'; label?: string;
}) {
  const w = size === 'sm' ? 'w-8 h-[18px]' : 'w-10 h-[22px]';
  const k = size === 'sm' ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]';
  const shift = size === 'sm' ? 'translate-x-[14px]' : 'translate-x-[18px]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#c8151d]/30 disabled:opacity-50 disabled:cursor-not-allowed',
        w,
        checked ? 'bg-[#c8151d]' : 'bg-gray-300',
      )}
    >
      <span className={cn('inline-block rounded-full bg-white shadow transition-transform translate-x-[2px]', k, checked && shift)} />
    </button>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-sm', className)}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-amber-100 text-amber-800',
  closed: 'bg-gray-200 text-gray-700',
  invited: 'bg-red-100 text-red-800',
  deactivated: 'bg-red-100 text-red-700',
};
export function EntityStatus({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize whitespace-nowrap', STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-700')}>
      {status}
    </span>
  );
}

export function Tip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex gap-2 items-start', className)}>
      {children}
    </div>
  );
}
