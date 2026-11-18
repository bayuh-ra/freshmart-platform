'use client';

import { useState, useSyncExternalStore } from 'react';
import { Box, CalendarClock, LineChart, Timer, Users, Wallet } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { useStore } from '@/src/lib/store';
import { branchName, can, userBranchIds } from '@/src/lib/logic';
import { ExportButtons, outlineButtonClass, useNow } from '@/src/components/reports/ui';
import { cn } from '@/src/lib/utils';
import { ICON, OSWALD, RANGES, RANGE_LABEL, type Ctx, type Range, Segmented, buildCtx, eyebrow } from './_ui';
import { SalesTab, salesCsv } from './_sales';
import { ProductsTab, productsCsv } from './_products';
import { CustomersTab, customersCsv } from './_customers';
import { OperationsTab, operationsCsv } from './_operations';
import { FinanceTab, financeCsv } from './_finance';
import { ScheduleDialog } from './_schedule';

type TabKey = 'sales' | 'products' | 'customers' | 'operations' | 'finance';
const TABS: { key: TabKey; label: string; icon: typeof Box; csv: (ctx: Ctx) => void }[] = [
  { key: 'sales', label: 'Sales', icon: LineChart, csv: salesCsv },
  { key: 'products', label: 'Products', icon: Box, csv: productsCsv },
  { key: 'customers', label: 'Customers', icon: Users, csv: customersCsv },
  { key: 'operations', label: 'Operations', icon: Timer, csv: operationsCsv },
  { key: 'finance', label: 'Finance', icon: Wallet, csv: financeCsv },
];
const noopSubscribe = () => () => {};
const urlParam = (name: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name));

export default function ReportsPage() {
  const s = useStore();
  const now = useNow(60_000);
  const [range, setRange] = useState<Range>(14);
  // ?tab= is read only after hydration so the server render matches the first client render (same as Riders).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<TabKey | null>(null);
  const tab: TabKey = picked ?? (hydrated ? (TABS.find((t) => t.key === urlParam('tab'))?.key ?? 'sales') : 'sales');
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const setTab = (t: TabKey) => {
    setPicked(t);
    const url = new URL(window.location.href);
    if (t === 'sales') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    window.history.replaceState(null, '', url);
  };

  if (!can(s, 'reports.view')) {
    return <DashboardLayout title="Reports" eyebrow="Analytics"><AccessDenied permission="reports.view" /></DashboardLayout>;
  }

  // One branch, from the session (falls back to the first branch the user can see).
  const allowed = userBranchIds(s);
  const branchId = allowed.includes(s.session.branchId) ? s.session.branchId : allowed[0];
  const ctx = buildCtx(s, branchId ? [branchId] : [], range, now);
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <DashboardLayout title="Reports" eyebrow="Analytics">
      <div className="min-w-0">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{eyebrow(ctx, branchId ? branchName(s, branchId) : '')}</p>
            <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Reports</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Segmented label="Date range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />
            <ExportButtons onCsv={() => active.csv(ctx)} />
            <button type="button" onClick={() => setScheduleOpen(true)} className={outlineButtonClass}>
              <CalendarClock className="w-4 h-4" {...ICON} /> Schedule
            </button>
          </div>
        </div>

        {/* Tabs */}
        <nav aria-label="Report sections" className="mb-5 border-b border-[#e8ddd4] overflow-x-auto overflow-y-hidden [scrollbar-width:none] print:hidden">
          <div role="tablist" className="flex gap-1 min-w-max">
            {TABS.map((t) => {
              const on = t.key === tab;
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                  className={cn('relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 text-sm whitespace-nowrap transition-colors',
                    on ? 'font-semibold text-[#c8151d]' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
                  <Icon className="w-4 h-4" {...ICON} />{t.label}
                  {on && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[#c8151d]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </nav>

        {tab === 'sales' && <SalesTab ctx={ctx} />}
        {tab === 'products' && <ProductsTab ctx={ctx} />}
        {tab === 'customers' && <CustomersTab ctx={ctx} />}
        {tab === 'operations' && <OperationsTab ctx={ctx} />}
        {tab === 'finance' && <FinanceTab ctx={ctx} />}
      </div>

      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} defaultReport={tab} />
    </DashboardLayout>
  );
}
