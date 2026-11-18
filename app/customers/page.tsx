'use client';

// CRM › Customers: segment chips, a searchable / sortable customer list on the left and the selected
// customer's profile on the right (stacked on phones; tapping a row scrolls to the profile).
import { useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Ban, ChevronLeft, ChevronRight, Crown, Download, MapPin, MessageSquare, Moon, MoreHorizontal, Phone, Search, ShieldCheck, Sparkles, Star, Tag, Trash2, Users, Wallet,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, inputClass, selectClass } from '@/src/components/common';
import { mutate, addAudit, useStore } from '@/src/lib/store';
import { can, distanceKm, exportCsv, peso, pesoShort, STATUS_LABEL } from '@/src/lib/logic';
import { useNow } from '@/src/components/reports/ui';
import { DAY } from '@/src/components/reports/analytics';
import type { AppState, Customer, Order, PaymentMethod } from '@/src/lib/types';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };
const OSWALD = { fontFamily: 'var(--font-oswald)' } as const;
const SOURCE_LABEL: Record<Customer['source'], string> = { app: 'App', walk_in: 'Walk-in', phone: 'Phone' };
const PAY_WORDS: Record<PaymentMethod, string> = { cod: 'COD', gcash: 'GCash', maya: 'Maya', card: 'card', pay_at_pickup: 'pay at pickup', cash: 'cash' };
const HIGH_SPENDER = 5000;
const REGULAR = 'Regulars';
const GROUPS = [REGULAR, 'High spenders', 'VIP', 'Senior citizen', 'Corporate', 'Sari-sari store owner'];
const PAGE_SIZES = [10, 25, 50, 100];
const smallCaps = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500';
const selRowCls = (on: boolean) => cn('border-l-[3px] transition-colors cursor-pointer', on ? 'bg-[#fdf1f0] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#faf6f2]');
const outlineBtn = 'inline-flex items-center justify-center gap-2 rounded-lg border border-[#e3d6cc] bg-white px-3 h-10 text-sm font-semibold text-[#1d1716] hover:bg-[#faf6f2]';

type Segment = 'all' | 'high' | 'regular' | 'new' | 'inactive' | 'blocked';
type Sort = 'recent' | 'spend' | 'orders' | 'az';
const SORTS: { key: Sort; label: string }[] = [{ key: 'recent', label: 'Recent' }, { key: 'spend', label: 'Top spend' }, { key: 'orders', label: 'Most orders' }, { key: 'az', label: 'A–Z' }];

type Stat = { orders: number; spend: number; last?: string; list: Order[] };
type Row = { c: Customer; st: Stat; regular: boolean; isNew: boolean };

/** Per customer: non-cancelled orders and their totals, last order (any status), all orders newest first. */
function customerStats(s: AppState) {
  const m = new Map<string, Stat>();
  for (const o of s.orders) {
    const e = m.get(o.customerId) ?? { orders: 0, spend: 0, last: undefined, list: [] };
    if (o.status !== 'cancelled') { e.orders += 1; e.spend += o.total; }
    if (!e.last || o.placedAt > e.last) e.last = o.placedAt;
    e.list.push(o);
    m.set(o.customerId, e);
  }
  for (const e of m.values()) e.list.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  return m;
}
const EMPTY: Stat = { orders: 0, spend: 0, list: [] };
const isRegular = (c: Customer) => c.group === REGULAR || c.group === 'Regular';

const monthDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "29 min ago", "5h ago", "Yesterday", "3 days ago", "Nov 12". */
function ago(iso: string | undefined, now: number) {
  if (!iso) return 'Never';
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ago`;
  const d = Math.floor(m / (24 * 60));
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return monthDay(iso);
}
/** "Today", "Yesterday" or "Nov 16". */
function dayLabel(iso: string, now: number) {
  const a = new Date(iso); const b = new Date(now);
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (key(a) === key(b)) return 'Today';
  b.setDate(b.getDate() - 1);
  return key(a) === key(b) ? 'Yesterday' : monthDay(iso);
}
const initials = (name: string) => name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
/** "Purok 3, Dawis, Digos City" → "Dawis, Digos City". */
const areaLine = (line: string) => { const p = line.split(',').map((x) => x.trim()).filter(Boolean); return p.length >= 2 ? p.slice(-2).join(', ') : line; };

const noopSubscribe = () => () => {};
const urlParam = (name: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name));

export default function CustomersPage() {
  const s = useStore();
  return (
    <DashboardLayout title="Customers" eyebrow="CRM" hideBranch>
      {can(s, 'customers.view') ? <CustomersInner s={s} /> : <AccessDenied permission="customers.view" />}
    </DashboardLayout>
  );
}

function CustomersInner({ s }: { s: AppState }) {
  const now = useNow();
  // ?c= (from the top-bar search) is read after hydration so the first client render matches the server.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const detailRef = useRef<HTMLDivElement>(null);

  const stats = customerStats(s);
  const all: Row[] = s.customers.map((c) => {
    const st = stats.get(c.id) ?? EMPTY;
    return { c, st, regular: isRegular(c), isNew: st.orders >= 1 && st.orders <= 2 };
  });
  const inSegment = (r: Row, g: Segment) => {
    switch (g) {
      case 'high': return r.st.spend >= HIGH_SPENDER;
      case 'regular': return r.regular;
      case 'new': return r.isNew;
      case 'inactive': return now - new Date(r.st.last ?? r.c.createdAt).getTime() > 30 * DAY;
      case 'blocked': return r.c.blocked;
      default: return true;
    }
  };
  const term = q.trim().toLowerCase();
  const termDigits = term.replace(/\s+/g, '');
  const matches = (r: Row) => !term || `${r.c.name} ${r.c.email}`.toLowerCase().includes(term) || (!!termDigits && r.c.mobile.replace(/\s+/g, '').includes(termDigits));
  const primary = (a: Row, b: Row) =>
    sort === 'spend' ? b.st.spend - a.st.spend
      : sort === 'orders' ? b.st.orders - a.st.orders
        : sort === 'recent' ? (b.st.last ?? '').localeCompare(a.st.last ?? '')
          : 0;
  const rows = all.filter((r) => matches(r) && inSegment(r, segment)).sort((a, b) => primary(a, b) || a.c.name.localeCompare(b.c.name));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const start = (cur - 1) * size;
  const shown = rows.slice(start, start + size);

  const wantedId = picked ?? (hydrated ? urlParam('c') : null);
  const sel = all.find((r) => r.c.id === wantedId) ?? rows[0];

  const lifetime = all.reduce((t, r) => t + r.st.spend, 0);
  const blockedCount = all.filter((r) => r.c.blocked).length;
  const chips: { key: Segment; label: string; icon: typeof Users; iconCls: string }[] = [
    { key: 'all', label: 'All customers', icon: Users, iconCls: 'text-[#5b4f4b]' },
    { key: 'high', label: `High spenders · ₱${HIGH_SPENDER / 1000}k+`, icon: Crown, iconCls: 'text-[#ae754d]' },
    { key: 'regular', label: 'Regulars', icon: Star, iconCls: 'text-[#ae754d]' },
    { key: 'new', label: 'New · 1–2 orders', icon: Sparkles, iconCls: 'text-[#2c4f9e]' },
    { key: 'inactive', label: 'Inactive 30 days', icon: Moon, iconCls: 'text-[#5b4f4b]' },
    { key: 'blocked', label: 'Blocked', icon: Ban, iconCls: 'text-[#c8151d]' },
  ];

  const reset = () => setPage(1);
  const pick = (id: string) => {
    setPicked(id);
    if (detailRef.current && window.matchMedia('(max-width: 1023px)').matches) detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const exportList = () => {
    exportCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Name', 'Mobile', 'Email', 'Source', 'Group', 'Orders', 'Lifetime', 'Avg order', 'Last order', 'Points', 'Store credit', 'Blocked'],
      ...rows.map(({ c, st }) => [c.name, c.mobile, c.email, SOURCE_LABEL[c.source], c.group ?? '', st.orders, st.spend.toFixed(2),
        (st.orders ? st.spend / st.orders : 0).toFixed(2), st.last ? new Date(st.last).toISOString() : '', c.points, c.storeCredit, c.blocked ? 'Yes' : 'No']),
    ]);
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'customer' : 'customers'}`);
  };

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.12em] text-[#ae754d]">
            {all.length} customers · {pesoShort(lifetime)} lifetime · {blockedCount} blocked
          </p>
          <h1 className="mt-1 text-4xl md:text-5xl font-bold uppercase leading-none text-[#1d1716]" style={OSWALD}>Customers</h1>
        </div>
        <button type="button" onClick={exportList} className={cn(outlineBtn, 'h-11 px-4 self-start sm:self-auto')}>
          <Download className="w-4 h-4" {...ICON} />Export list
        </button>
      </div>

      {/* Segment chips */}
      <div role="group" aria-label="Customer segments" className="mb-5 flex flex-wrap gap-2">
        {chips.map((ch) => {
          const on = segment === ch.key;
          const Icon = ch.icon;
          return (
            <button key={ch.key} type="button" aria-pressed={on} onClick={() => { setSegment(ch.key); reset(); }}
              className={cn('inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-sm whitespace-nowrap transition-colors',
                on ? 'bg-[#2a2322] border-[#2a2322] text-white font-semibold' : 'bg-white border-[#eadfd6] text-[#3d3230] hover:border-[#d9cabe]')}>
              <Icon className={cn('w-4 h-4 shrink-0', on ? 'text-white' : ch.iconCls)} {...ICON} />{ch.label}
              <span className={cn('tabular-nums', on ? 'text-white/80' : 'text-gray-500')}>{all.filter((r) => inSegment(r, ch.key)).length}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 lg:gap-6 items-start">
        {/* LEFT: list */}
        <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0">
          <div className="px-3 sm:px-5 pt-4 pb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative block w-full xl:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" {...ICON} />
              <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search name, mobile, email" aria-label="Search customers"
                className="h-11 w-full rounded-lg border border-[#eadfd6] bg-white pl-10 pr-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-2 focus:ring-[#c8151d]/10" />
            </label>
            <div className="overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
              <div role="group" aria-label="Sort customers" className="inline-flex gap-1 rounded-lg bg-[#ebe4dd] p-1 min-w-max">
                {SORTS.map((x) => (
                  <button key={x.key} type="button" aria-pressed={sort === x.key} onClick={() => { setSort(x.key); reset(); }}
                    className={cn('h-9 px-3 rounded-md text-sm whitespace-nowrap transition-colors', sort === x.key ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>{x.label}</button>
                ))}
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500 border-t border-[#f0e8e2]">{term ? 'No customers match your search.' : 'No customers in this segment.'}</p>
          ) : (
            <>
              {/* Table: tablet (single column) and wide desktop */}
              <div className="hidden md:block lg:hidden xl:block border-t border-[#f0e8e2]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                      <th className="pl-5 pr-3 py-2.5 font-semibold w-[46%]">Customer</th>
                      <th className="px-2 py-2.5 font-semibold text-right">Orders</th>
                      <th className="px-2 py-2.5 font-semibold text-right">Lifetime</th>
                      <th className="px-2 py-2.5 font-semibold text-right">Avg order</th>
                      <th className="pl-2 pr-5 py-2.5 font-semibold text-right">Last order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
                    {shown.map((r) => {
                      const on = sel?.c.id === r.c.id;
                      return (
                        <tr key={r.c.id} tabIndex={0} aria-selected={on} onClick={() => pick(r.c.id)} onKeyDown={(e) => { if (e.key === 'Enter') pick(r.c.id); }}
                          className={cn(selRowCls(on), 'outline-none focus-visible:bg-[#faf6f2]')}>
                          <td className="pl-[17px] pr-3 py-3"><CustomerCell r={r} /></td>
                          <td className="px-2 py-3 text-right tabular-nums text-[#1d1716]">{r.st.orders}</td>
                          <td className="px-2 py-3 text-right tabular-nums font-bold text-[#1d1716]">{pesoShort(r.st.spend)}</td>
                          <td className="px-2 py-3 text-right tabular-nums text-gray-500">{r.st.orders ? pesoShort(r.st.spend / r.st.orders) : '–'}</td>
                          <td className="pl-2 pr-5 py-3 text-right text-gray-600 whitespace-nowrap">{ago(r.st.last, now)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Stacked cards: phone, and the narrow list column on small desktops */}
              <ul className="md:hidden lg:block xl:hidden divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
                {shown.map((r) => (
                  <li key={r.c.id}>
                    <button type="button" aria-current={sel?.c.id === r.c.id ? 'true' : undefined} onClick={() => pick(r.c.id)}
                      className={cn(selRowCls(sel?.c.id === r.c.id), 'w-full text-left px-3 sm:px-4 py-3')}>
                      <CustomerCell r={r} />
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[52px] text-xs text-gray-600">
                        <span><b className="text-[#1d1716] tabular-nums">{r.st.orders}</b> {r.st.orders === 1 ? 'order' : 'orders'}</span>
                        <span className="font-bold text-[#1d1716] tabular-nums">{pesoShort(r.st.spend)}</span>
                        {r.st.orders > 0 && <span className="text-gray-500">avg {pesoShort(r.st.spend / r.st.orders)}</span>}
                        <span className="text-gray-500">{ago(r.st.last, now)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <ListFooter start={start} count={shown.length} total={rows.length} size={size} onSize={(n) => { setSize(n); reset(); }} page={cur} pages={pages} onPage={setPage} />
        </section>

        {/* RIGHT: selected customer */}
        <div ref={detailRef} className="min-w-0 scroll-mt-20">
          {sel ? <CustomerDetail s={s} r={sel} now={now} /> : (
            <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] px-5 py-12 text-center">
              <Users className="w-8 h-8 mx-auto text-gray-400" {...ICON} />
              <p className="mt-3 text-sm text-gray-500">Select a customer to see their profile.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, light, lg }: { name: string; light?: boolean; lg?: boolean }) {
  return (
    <span className={cn('rounded-full flex items-center justify-center shrink-0 font-semibold', lg ? 'w-14 h-14 text-lg' : 'w-10 h-10 text-sm',
      light ? 'bg-[#fbe3e1] text-[#c8151d]' : 'bg-[#2a2322] text-white')} style={OSWALD}>{initials(name)}</span>
  );
}

function TagChip({ r }: { r: Row }) {
  if (r.regular) return <span className="inline-flex items-center rounded-md px-1.5 h-5 text-[11px] font-semibold bg-[#fbf0dc] text-[#ae754d] whitespace-nowrap">Regulars</span>;
  if (r.isNew) return <span className="inline-flex items-center rounded-md px-1.5 h-5 text-[11px] font-semibold bg-[#e6ecf8] text-[#2c4f9e] whitespace-nowrap">New</span>;
  return null;
}
const BlockedChip = () => <span className="inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-[11px] font-semibold bg-[#fde7e6] text-[#c8151d] whitespace-nowrap"><Ban className="w-3 h-3" />Blocked</span>;

function CustomerCell({ r }: { r: Row }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={r.c.name} light={r.st.orders <= 2} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[#1d1716] truncate">{r.c.name}</span>
          <TagChip r={r} />
          {r.c.blocked && <BlockedChip />}
        </p>
        <p className="text-xs text-gray-500 truncate">{r.c.mobile} · {r.c.email}</p>
      </div>
    </div>
  );
}

function CustomerDetail({ s, r, now }: { s: AppState; r: Row; now: number }) {
  const { c, st } = r;
  const canEdit = can(s, 'customers.edit');
  const [creditOpen, setCreditOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const tel = c.mobile.replace(/\s+/g, '');
  const kept = st.list.filter((o) => o.status !== 'cancelled');

  // Top 3 products by quantity (kg for weighed items).
  const qty = new Map<string, { name: string; n: number }>();
  for (const o of kept) for (const i of o.items) {
    if (i.pickStatus === 'removed') continue;
    const e = qty.get(i.productId) ?? { name: i.name, n: 0 };
    e.n += i.soldByWeight ? (i.actualWeightKg ?? i.estWeightKg ?? 1) : i.qty;
    qty.set(i.productId, e);
  }
  const usually = [...qty.values()].sort((a, b) => b.n - a.n).slice(0, 3);

  // Most-used payment method.
  const payCount = new Map<PaymentMethod, number>();
  for (const o of st.list) payCount.set(o.paymentMethod, (payCount.get(o.paymentMethod) ?? 0) + 1);
  const topPay = [...payCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const addr = c.addresses[0];
  const branch = s.branches[0];
  const km = addr && branch ? distanceKm(branch, addr) : undefined;
  const kmText = km === undefined ? '' : `${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : Math.round(km)} km from the shop`;
  const addrSub = [kmText, topPay ? `usually ${PAY_WORDS[topPay]}` : ''].filter(Boolean).join(' · ');
  const cases = (s.conversations ?? []).filter((cv) => cv.customerId === c.id);

  const stats = [
    { label: 'Orders', value: String(st.orders) },
    { label: 'Lifetime', value: pesoShort(st.spend) },
    { label: 'Avg order', value: st.orders ? pesoShort(st.spend / st.orders) : '–' },
    { label: 'Last order', value: ago(st.last, now) },
    { label: 'Points', value: c.points.toLocaleString() },
    { label: 'Store credit', value: pesoShort(c.storeCredit), edit: canEdit },
  ];

  const toggleRegular = () => {
    const was = r.regular;
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id);
      if (!cu) return;
      addAudit(d, { module: 'Customers', action: was ? 'Regular tag removed' : 'Marked as regular', detail: cu.name, oldValue: cu.group ?? '—', newValue: was ? '—' : REGULAR });
      cu.group = was ? undefined : REGULAR;
    });
    toast.success(was ? `${c.name} removed from Regulars` : `${c.name} marked as Regular`);
  };
  const setGroup = (g: string) => {
    if ((c.group ?? '') === g) return;
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id);
      if (!cu) return;
      addAudit(d, { module: 'Customers', action: 'Group changed', detail: cu.name, oldValue: cu.group ?? '—', newValue: g || '—' });
      cu.group = g || undefined;
    });
    toast.success('Customer group updated');
  };
  const unblock = () => {
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id);
      if (!cu) return;
      addAudit(d, { module: 'Customers', action: 'Customer reinstated', detail: cu.name, oldValue: `Blocked: ${cu.blockReason ?? ''}`, newValue: 'Active' });
      cu.blocked = false;
      cu.blockReason = undefined;
    });
    toast.success(`${c.name} unblocked`);
  };
  const privacy = (kind: 'export' | 'delete') => {
    mutate((d) => addAudit(d, { module: 'Customers', action: kind === 'export' ? 'Data export requested' : 'Deletion request logged', detail: `${c.name} (${c.email}) — ${kind === 'export' ? 'export file will be emailed within 72 hours' : 'pending 30-day privacy review'}` }));
    toast.success(kind === 'export' ? 'Data export requested' : 'Deletion request logged', { description: kind === 'export' ? `A copy of ${c.name}'s data will be emailed to ${c.email}.` : 'Account flagged for deletion after the privacy review period (Data Privacy Act).' });
  };

  return (
    <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
        <Avatar name={c.name} lg />
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-lg font-semibold text-[#1d1716] break-words">{c.name}</span>
            <TagChip r={r} />
            {c.blocked && <BlockedChip />}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 break-words">
            {c.mobile} · {c.email} · {SOURCE_LABEL[c.source]} · since {new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More actions" className="w-9 h-9 rounded-lg border border-[#eadfd6] bg-white flex items-center justify-center text-[#5b4f4b] hover:bg-[#faf6f2] shrink-0">
              <MoreHorizontal className="w-4 h-4" {...ICON} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canEdit && <DropdownMenuItem onSelect={() => setCreditOpen(true)}><Wallet className="w-4 h-4" {...ICON} />Adjust store credit</DropdownMenuItem>}
            {canEdit && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Tag className="w-4 h-4 mr-2" {...ICON} />Customer group</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={c.group ?? ''} onValueChange={setGroup}>
                    <DropdownMenuRadioItem value="">No group</DropdownMenuRadioItem>
                    {GROUPS.map((g) => <DropdownMenuRadioItem key={g} value={g}>{g}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem asChild>
              <Link href="/support"><MessageSquare className="w-4 h-4" {...ICON} />Support cases ({cases.length})</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => privacy('export')}><Download className="w-4 h-4" {...ICON} />Request data export</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => privacy('delete')} variant="destructive"><Trash2 className="w-4 h-4" {...ICON} />Log deletion request</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Actions */}
      <div className="px-4 sm:px-5 pt-4 grid grid-cols-3 gap-2">
        <a href={`tel:${tel}`} className={cn(outlineBtn, 'px-2')}><Phone className="w-4 h-4 shrink-0" {...ICON} />Call</a>
        <a href={`sms:${tel}`} className={cn(outlineBtn, 'px-2')}><MessageSquare className="w-4 h-4 shrink-0" {...ICON} />Text</a>
        <button type="button" onClick={toggleRegular} disabled={!canEdit} className={cn(outlineBtn, 'px-2 disabled:opacity-50 disabled:pointer-events-none')}>
          <Tag className="w-4 h-4 shrink-0" {...ICON} /><span className="truncate">{r.regular ? 'Remove Regular' : 'Mark as Regular'}</span>
        </button>
      </div>

      {/* Stats 3×2 */}
      <div className="mx-4 sm:mx-5 mt-4 grid grid-cols-3 rounded-xl border border-[#eadfd6] bg-white overflow-hidden
        [&>*]:border-[#f0e8e2] [&>*:not(:nth-child(3n))]:border-r [&>*:nth-child(-n+3)]:border-b">
        {stats.map((x) => (
          <div key={x.label} className="px-3 py-2.5 min-w-0">
            <p className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500">
              <span className="truncate">{x.label}</span>
              {x.edit && <button type="button" onClick={() => setCreditOpen(true)} className="normal-case tracking-normal text-[11px] font-medium text-[#c8151d] hover:underline">Adjust</button>}
            </p>
            <p className="mt-0.5 text-lg sm:text-xl leading-tight tabular-nums truncate text-[#1d1716]" style={OSWALD}>{x.value}</p>
          </div>
        ))}
      </div>

      {usually.length > 0 && (
        <div className="px-4 sm:px-5 pt-5">
          <p className={smallCaps}>Usually buys</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {usually.map((p) => <span key={p.name} className="inline-flex items-center rounded-lg bg-[#f3ede8] px-2.5 h-7 text-xs font-medium text-[#3d3230]">{p.name}</span>)}
          </div>
        </div>
      )}

      {addr && (
        <div className="mx-4 sm:mx-5 mt-5 flex items-start gap-3 rounded-xl border border-[#eadfd6] bg-white px-3 py-2.5">
          <MapPin className="w-4 h-4 mt-0.5 text-[#c8151d] shrink-0" {...ICON} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1d1716] break-words">{addr.label} · {areaLine(addr.line)}</p>
            {addrSub && <p className="text-xs text-gray-500">{addrSub}</p>}
          </div>
        </div>
      )}

      <div className="px-4 sm:px-5 pt-5">
        <p className={smallCaps}>Recent orders</p>
        {st.list.length === 0 ? <p className="mt-2 text-sm text-gray-500">No orders yet.</p> : (
          <ul className="mt-1 divide-y divide-[#f0e8e2]">
            {st.list.slice(0, 4).map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-[#faf6f2] -mx-2 px-2 rounded-md">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1d1716]">{o.number}</p>
                    <p className="text-xs text-gray-500 truncate">{dayLabel(o.placedAt, now)} · {STATUS_LABEL[o.status]}</p>
                  </div>
                  <span className={cn('tabular-nums shrink-0', o.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-[#1d1716]')}>{peso(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 sm:px-5 pt-5">
        <label htmlFor={`note-${c.id}`} className={smallCaps}>Staff note</label>
        <NoteBox key={`${c.id}:${c.note ?? ''}`} c={c} disabled={!canEdit} />
      </div>

      {/* Footer: block / unblock */}
      <div className="mt-5 px-4 sm:px-5 py-4 border-t border-[#f0e8e2] flex flex-wrap items-center justify-between gap-3">
        {c.blocked ? (
          <>
            <p className="text-sm text-[#c8151d] font-medium min-w-0 break-words">Blocked · {c.blockReason || 'No reason given'}</p>
            {canEdit && <button type="button" onClick={unblock} className={cn(outlineBtn, 'ml-auto')}><ShieldCheck className="w-4 h-4" {...ICON} />Unblock</button>}
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">Blocks new orders from this account.</p>
            {canEdit && (
              <button type="button" onClick={() => setBlockOpen(true)}
                className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg border border-[#e9b9b6] bg-white px-3 h-10 text-sm font-semibold text-[#c8151d] hover:bg-[#fdf1f0]">
                <Ban className="w-4 h-4" {...ICON} />Block customer
              </button>
            )}
          </>
        )}
      </div>

      <CreditDialog open={creditOpen} onOpenChange={setCreditOpen} customer={c} />
      <BlockDialog open={blockOpen} onOpenChange={setBlockOpen} customer={c} />
    </section>
  );
}

/** Saves on blur; remounted (via key) whenever the customer or the saved note changes. */
function NoteBox({ c, disabled }: { c: Customer; disabled: boolean }) {
  const [text, setText] = useState(c.note ?? '');
  const save = () => {
    const next = text.trim();
    if (next === (c.note ?? '').trim()) return;
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id);
      if (!cu) return;
      addAudit(d, { module: 'Customers', action: 'Staff note updated', detail: cu.name, oldValue: cu.note || '—', newValue: next || '—' });
      cu.note = next || undefined;
    });
    toast.success('Note saved');
  };
  return (
    <textarea id={`note-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={save} disabled={disabled} rows={3}
      placeholder="e.g. Prefers thin-cut liempo. Call at the gate."
      className="mt-2 w-full rounded-lg border border-[#e3d6cc] bg-white px-3 py-2 text-sm text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-2 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb] resize-y" />
  );
}

/** "Showing 1–10 of 22 customers", rows per page and the pager (same pattern as Riders / Inventory). */
function ListFooter({ start, count, total, size, onSize, page, pages, onPage }: {
  start: number; count: number; total: number; size: number; onSize: (n: number) => void; page: number; pages: number; onPage: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 sm:px-5 py-3 border-t border-[#f0e8e2]">
      <span className="text-sm text-gray-500">{total ? `Showing ${start + 1}–${start + count} of ${total} ${total === 1 ? 'customer' : 'customers'}` : 'No customers'}</span>
      <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Rows per page</span>
          <div className="inline-flex rounded-lg bg-[#ece4dd] p-1" role="group" aria-label="Rows per page">
            {PAGE_SIZES.map((n) => (
              <button key={n} type="button" aria-pressed={size === n} onClick={() => onSize(n)}
                className={cn('h-8 min-w-9 px-2 rounded-md text-xs tabular-nums', size === n ? 'bg-white shadow-sm font-semibold text-[#1d1716]' : 'text-gray-600 hover:text-[#1d1716]')}>{n}</button>
            ))}
          </div>
        </div>
        <Pager page={page} pages={pages} onPage={onPage} />
      </div>
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const list: (number | '…')[] = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1)
    : page <= 4 ? [1, 2, 3, 4, 5, '…', pages]
      : page >= pages - 3 ? [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages]
        : [1, '…', page - 1, page, page + 1, '…', pages];
  const btn = 'h-10 min-w-10 px-2 inline-flex items-center justify-center rounded-lg text-sm tabular-nums';
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={cn(btn, 'border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40')}><ChevronLeft className="w-4 h-4" {...ICON} /></button>
      <span className="sm:hidden px-2 text-sm text-gray-600 tabular-nums">{page} / {pages}</span>
      {list.map((n, i) => (n === '…'
        ? <span key={`gap-${i}`} className="hidden sm:inline-flex w-8 justify-center text-gray-400">…</span>
        : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
            className={cn(btn, 'hidden sm:inline-flex', n === page ? 'bg-[#2a2322] text-white font-semibold' : 'text-[#1d1716] hover:bg-[#f3ece6]')}>{n}</button>))}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" className={cn(btn, 'border border-[#e3d6cc] bg-white text-[#1d1716] hover:bg-[#faf6f2] disabled:opacity-40')}><ChevronRight className="w-4 h-4" {...ICON} /></button>
    </nav>
  );
}

function CreditDialog({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (v: boolean) => void; customer: Customer }) {
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Goodwill / service recovery');
  const [other, setOther] = useState('');
  const amt = Number(amount);
  const submit = () => {
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return; }
    if (mode === 'deduct' && amt > customer.storeCredit) { toast.error('Cannot deduct more than the current balance'); return; }
    const why = reason === 'Other' ? other.trim() : reason;
    if (!why) { toast.error('A reason is required'); return; }
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === customer.id);
      if (!cu) return;
      const old = cu.storeCredit;
      cu.storeCredit = Math.round((old + (mode === 'add' ? amt : -amt)) * 100) / 100;
      addAudit(d, { module: 'Payments', action: mode === 'add' ? 'Store credit issued' : 'Store credit deducted', detail: `${cu.name} ${peso(amt)} (${why})`, oldValue: peso(old), newValue: peso(cu.storeCredit) });
    });
    toast.success(`${mode === 'add' ? 'Added' : 'Deducted'} ${peso(amt)} store credit`);
    setAmount('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust store credit</DialogTitle>
          <DialogDescription>{customer.name} · current balance {peso(customer.storeCredit)}. Every change is written to the audit log.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="inline-flex rounded-lg bg-[#ebe4dd] p-1">
            {(['add', 'deduct'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('px-3 h-9 text-sm rounded-md', mode === m ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b]')}>{m === 'add' ? 'Add credit' : 'Deduct credit'}</button>
            ))}
          </div>
          <label className="block"><span className="text-xs font-medium text-gray-600">Amount (₱)</span>
            <input type="number" min={0} className={cn(inputClass, 'w-full mt-1')} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Reason</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Goodwill / service recovery', 'Missing item', 'Damaged item', 'Late delivery', 'Refund to wallet', 'Correction', 'Other'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          {reason === 'Other' && <input className={cn(inputClass, 'w-full')} placeholder="Describe the reason" value={other} onChange={(e) => setOther(e.target.value)} />}
          {amt > 0 && <p className="text-sm text-gray-600">New balance: <span className="font-semibold text-[#c8151d]">{peso(customer.storeCredit + (mode === 'add' ? amt : -amt))}</span></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Save adjustment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (v: boolean) => void; customer: Customer }) {
  const [reason, setReason] = useState('Repeated COD no-shows');
  const [detail, setDetail] = useState('');
  const submit = () => {
    const why = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === customer.id);
      if (!cu) return;
      cu.blocked = true;
      cu.blockReason = why;
      addAudit(d, { module: 'Customers', action: 'Customer blocked', detail: `${cu.name}: ${why}`, oldValue: 'Active', newValue: 'Blocked' });
    });
    toast.success(`${customer.name} blocked`, { description: 'New orders from this account now need manual review.' });
    setDetail('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block customer</DialogTitle>
          <DialogDescription>{customer.name} will not be able to place cash-on-delivery orders and every order will need manual confirmation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Reason</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Repeated COD no-shows', 'Payment fraud / chargebacks', 'Abusive behaviour to staff or riders', 'Voucher abuse', 'Other'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Details</span>
            <textarea rows={3} className={cn(inputClass, 'w-full mt-1 h-auto py-2')} placeholder="e.g. 3 refused deliveries in October" value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit}><Ban className="w-4 h-4" /> Block customer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
