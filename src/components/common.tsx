'use client';

// Shared presentational pieces, styled exactly like the CRM's dashboard
// (white rounded-xl cards, shadow-sm, gray-100 borders, royal-blue numbers).

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import type { OrderStatus, PaymentStatus } from '@/src/lib/types';
import { STATUS_CLASS, STATUS_LABEL } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';

export function StatCard({ title, value, sub, href, accent = 'border-l-[#c8151d]', valueClass, icon }: {
  title: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; accent?: string; valueClass?: string; icon?: React.ReactNode;
}) {
  const inner = (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 hover:shadow-md transition-shadow border-l-4 h-full min-w-0', accent)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs sm:text-sm font-medium text-gray-500">{title}</p>
        {icon && <span className="text-gray-300 hidden sm:inline">{icon}</span>}
      </div>
      <p className={cn('text-xl sm:text-3xl font-bold mt-2 break-words', valueClass ?? 'text-[#c8151d]')}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function Panel({ title, action, children, className, bodyClass }: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={cn('bg-white rounded-xl shadow-sm border border-gray-100', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100">
          {typeof title === 'string' ? <h2 className="text-base font-semibold text-gray-900">{title}</h2> : title}
          {action}
        </div>
      )}
      <div className={cn('p-5 min-w-0', bodyClass)}>{children}</div>
    </section>
  );
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', STATUS_CLASS[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PAY_CLASS: Record<PaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800', paid: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-600', refunded: 'bg-gray-200 text-gray-700', partially_refunded: 'bg-orange-100 text-orange-800',
};
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize whitespace-nowrap', PAY_CLASS[status])}>{status.replace('_', ' ')}</span>;
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 whitespace-nowrap', className)}>{children}</span>;
}

export function EmptyState({ title, sub, icon }: { title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 text-gray-400">
      {icon && <div className="mb-3 text-gray-300">{icon}</div>}
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function AccessDenied({ permission }: { permission: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 flex flex-col items-center text-center">
      <ShieldAlert className="w-10 h-10 text-[#dc2626] mb-3" />
      <h2 className="text-lg font-semibold text-gray-900">You don&apos;t have access to this page</h2>
      <p className="text-sm text-gray-500 mt-1">Your role is missing the <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{permission}</code> permission. Ask a Super Admin to update your role in Users &amp; Roles.</p>
    </div>
  );
}

/** Toolbar row used above tables (search + filters + actions). */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-4">{children}</div>;
}

export const inputClass = 'h-9 max-w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus-glow outline-none';
export const selectClass = 'h-9 max-w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 text-sm focus-glow outline-none';

/** Phone-shaped frame for the Customer App / Rider App previews. */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative mx-auto w-[390px] h-[800px] max-h-[calc(100vh-2rem)] rounded-[44px] bg-[#0f0f1a] p-3 shadow-2xl', className)}>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#0f0f1a] rounded-b-2xl z-20" />
      <div className="relative w-full h-full rounded-[34px] overflow-hidden bg-white flex flex-col">{children}</div>
    </div>
  );
}
