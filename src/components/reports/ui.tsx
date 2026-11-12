'use client';

import { ArrowDownRight, ArrowUpRight, Download, Printer } from 'lucide-react';
import { Button } from '@/src/components/ui/shadcn/button';
import { cn } from '@/src/lib/utils';
import { pctChange } from './analytics';

export function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="text-xs text-gray-400">no prior data</span>;
  const p = pctChange(cur, prev);
  const good = invert ? p <= 0 : p >= 0;
  const Icon = p >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-green-600' : 'text-[#dc2626]')}>
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      {Math.abs(p).toFixed(1)}% vs previous period
    </span>
  );
}

export function KpiCard({ title, value, sub, accent = 'border-l-[#1e40af]' }: { title: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-100 p-5 border-l-4', accent)}>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1.5 text-[#1e40af]">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

export function ExportButtons({ onCsv }: { onCsv: () => void }) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={onCsv}>
        <Download className="w-4 h-4" strokeWidth={1.75} /> Export CSV
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="w-4 h-4" strokeWidth={1.75} /> Export PDF
      </Button>
    </div>
  );
}

/** Horizontal share bar used inside breakdown tables. */
export function ShareBar({ value, max, color = '#1e40af' }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-gray-100 w-full min-w-16">
      <div className="h-1.5 rounded-full" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}
