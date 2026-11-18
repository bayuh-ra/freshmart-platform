'use client';

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Banknote, Bike, Download, Plus, ReceiptText } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { useStore } from '@/src/lib/store';
import { can, getSetting, num, pesoShort } from '@/src/lib/logic';
import { ownRiders, useNow } from '@/src/components/delivery/helpers';
import { cn } from '@/src/lib/utils';
import { AddRiderDialog, ICON, OSWALD, OwnRidersTab, RiderDrawer, deliveryMins, exportRiders, riderView } from './_own';
import { CodTab } from './_cod';
import { PayTab } from './_pay';

type TabKey = 'riders' | 'cod' | 'payouts';
const TAB_KEYS: TabKey[] = ['riders', 'cod', 'payouts'];
const noopSubscribe = () => () => {};
const urlParam = (name: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name));

export default function RidersPage() {
  const s = useStore();
  const now = useNow(60_000);
  // ?tab= and ?rider= are read only after hydration so the server render matches the first client render (same as Inventory).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<TabKey | null>(null);
  const tab: TabKey = picked ?? (hydrated ? (TAB_KEYS.find((k) => k === urlParam('tab')) ?? 'riders') : 'riders');
  const [codPicked, setCodPicked] = useState<string | null | undefined>(undefined);
  const codSel = codPicked !== undefined ? codPicked : hydrated ? urlParam('rider') : null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /** Switch tab (optionally selecting a rider on the COD tab) and keep ?tab= / ?rider= in the address bar. */
  const setTab = (t: TabKey, rider?: string | null) => {
    setPicked(t);
    if (rider !== undefined) setCodPicked(rider);
    const url = new URL(window.location.href);
    if (t === 'riders') url.searchParams.delete('tab');
    else url.searchParams.set('tab', t);
    const r = t === 'cod' ? (rider !== undefined ? rider : codSel) : null;
    if (r) url.searchParams.set('rider', r);
    else url.searchParams.delete('rider');
    window.history.replaceState(null, '', url);
  };

  const delivered = useMemo(() => s.orders.filter((o) => o.fulfillment === 'delivery' && o.status === 'delivered'), [s.orders]);
  const timing = useMemo(() => {
    const times = delivered.map(deliveryMins).filter(Boolean);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const onTime = times.length ? Math.round((times.filter((t) => t <= 40).length / times.length) * 100) : 100;
    return { avg, onTime };
  }, [delivered]);

  if (!can(s, 'riders.view')) {
    return <DashboardLayout title="Riders" eyebrow="Delivery"><AccessDenied permission="riders.view" /></DashboardLayout>;
  }
  const canEdit = can(s, 'riders.edit') || can(s, 'riders.approve');
  const canAdd = canEdit || can(s, 'riders.create');

  const branch = s.branches.find((b) => b.id === s.session.branchId) ?? s.branches[0];
  const max = num(getSetting(s, 'maxActiveOrders', branch.id)) || 2;
  const own = ownRiders(s);
  const views = own.map((r) => riderView(s, r));
  const active = own.filter((r) => r.status !== 'pending');
  const rated = active.filter((r) => r.rating > 0);
  const avgRating = rated.length ? (rated.reduce((t, r) => t + r.rating, 0) / rated.length).toFixed(2) : '—';
  const withStats = active.filter((r) => r.stats7d);
  const acceptance = withStats.length ? Math.round(withStats.reduce((t, r) => t + r.stats7d!.acceptancePct, 0) / withStats.length) : 100;
  const holders = active.filter((r) => r.codHeld > 0);
  const codTotal = holders.reduce((t, r) => t + r.codHeld, 0);
  const today = new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const openView = openId ? views.find((v) => v.r.id === openId) : undefined;

  const tabs: { key: TabKey; label: string; icon: typeof Bike; badge?: ReactNode }[] = [
    { key: 'riders', label: 'Own riders', icon: Bike, badge: <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#ece4dd] text-[#5b4f4b] text-[11px] font-semibold inline-flex items-center justify-center">{own.length}</span> },
    { key: 'cod', label: 'COD remittance', icon: Banknote, badge: holders.length > 0 ? <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#e08a2e] text-white text-[11px] font-semibold inline-flex items-center justify-center" aria-label={`${holders.length} riders holding COD`}>{holders.length}</span> : undefined },
    { key: 'payouts', label: 'Payout statements', icon: ReceiptText },
  ];

  return (
    <DashboardLayout title="Riders" eyebrow="Delivery">
      <div className="min-w-0">
        {/* Header */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">{branch.name} · Own riders · Today, {today}</p>
            <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Riders</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => exportRiders(views, max)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3d6cc] bg-white px-4 h-11 text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]">
              <Download className="w-4 h-4" {...ICON} />Export
            </button>
            {canAdd && (
              <button type="button" onClick={() => setAdding(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#d6202a] px-4 h-11 text-sm font-semibold text-white shadow-sm hover:bg-[#c8151d]">
                <Plus className="w-4 h-4" />Add rider
              </button>
            )}
          </div>
        </div>

        {/* KPI strip: one card, five cells */}
        <div className="mb-5 grid grid-cols-2 lg:grid-cols-5 rounded-xl border border-[#eadfd6] bg-white overflow-hidden
          [&>*]:border-[#f0e8e2] [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+4)]:border-b lg:[&>*]:border-b-0 lg:[&>*]:border-r lg:[&>*:last-child]:border-r-0">
          <KpiCell label="On-time rate" value={`${timing.onTime}%`} />
          <KpiCell label="Avg delivery time" value={`${timing.avg} min`} />
          <KpiCell label="Acceptance rate" value={`${acceptance}%`} />
          <KpiCell label="Avg rider rating" value={avgRating} />
          <KpiCell className="col-span-2 lg:col-span-1 !border-r-0" label={`COD held · ${holders.length} ${holders.length === 1 ? 'rider' : 'riders'}`} value={pesoShort(codTotal)} color="#ae754d"
            action={tab !== 'cod' && holders.length > 0 ? (
              <button type="button" onClick={() => setTab('cod')}
                className="h-8 px-3 rounded-lg border border-[#e3d6cc] bg-white text-xs font-semibold text-[#1d1716] hover:bg-[#faf6f2]">Collect</button>
            ) : undefined} />
        </div>

        {/* Tabs */}
        <nav aria-label="Rider sections" className="mb-5 border-b border-[#e8ddd4] overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <div role="tablist" className="flex gap-1 min-w-max">
            {tabs.map((t) => {
              const on = t.key === tab;
              const Icon = t.icon;
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                  className={cn('relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 text-sm whitespace-nowrap transition-colors',
                    on ? 'font-semibold text-[#c8151d]' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>
                  <Icon className="w-4 h-4" {...ICON} />{t.label}{t.badge}
                  {on && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[#c8151d]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </nav>

        {tab === 'riders' && <OwnRidersTab s={s} views={views} max={max} now={now} onOpen={setOpenId} />}
        {tab === 'cod' && <CodTab s={s} views={views} now={now} canEdit={canEdit} selectedId={codSel} onSelect={(id) => setTab('cod', id)} />}
        {tab === 'payouts' && <PayTab s={s} now={now} onCod={(id) => setTab('cod', id)} />}
      </div>

      {openView && (
        <RiderDrawer key={openView.r.id} s={s} v={openView} max={max} now={now} canEdit={canEdit}
          onClose={() => setOpenId(null)} onRemit={() => { setOpenId(null); setTab('cod', openView.r.id); }} />
      )}
      {adding && <AddRiderDialog branch={branch} onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); setOpenId(id); }} />}
    </DashboardLayout>
  );
}

function KpiCell({ label, value, color, action, className }: { label: string; value: ReactNode; color?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-2 px-4 py-3 min-w-0', className)}>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="mt-0.5 text-2xl leading-tight font-semibold tabular-nums" style={{ ...OSWALD, color: color ?? '#1d1716' }}>{value}</p>
      </div>
      {action}
    </div>
  );
}
