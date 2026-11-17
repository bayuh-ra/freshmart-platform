'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Search, Ban, ShieldCheck, Download, Trash2, MapPin, Phone, Mail, Wallet, Star, MessagesSquare, StickyNote, Users, Crown, Moon, Building2, Ticket, X,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, Pill, StatusBadge, EmptyState, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { mutate, addAudit, useStore, currentUserName } from '@/src/lib/store';
import { can, cityName, peso, pesoShort, fmtDate, fmtDateTime, timeAgo, exportCsv } from '@/src/lib/logic';
import { useNow } from '@/src/components/reports/ui';
import type { AppState, Customer } from '@/src/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Button } from '@/src/components/ui/shadcn/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/src/components/ui/shadcn/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/shadcn/tabs';
import { DAY, isSale, netSales } from '@/src/components/reports/analytics';
import { cn } from '@/src/lib/utils';

type CustomerNote = { at: string; by: string; text: string };
type CustomerX = Customer & { notes?: CustomerNote[] };
const SOURCE_LABEL: Record<Customer['source'], string> = { app: 'App', walk_in: 'Walk-in', phone: 'Phone' };
const HIGH_SPENDER = 5000;

type Segment = 'all' | 'high' | 'inactive' | `city:${string}`;

function customerStats(s: AppState) {
  const m = new Map<string, { orders: number; spend: number; last?: string }>();
  for (const o of s.orders) {
    const e = m.get(o.customerId) ?? { orders: 0, spend: 0, last: undefined };
    e.orders += 1;
    if (isSale(o)) e.spend += netSales(o);
    if (!e.last || o.placedAt > e.last) e.last = o.placedAt;
    m.set(o.customerId, e);
  }
  return m;
}

export default function CustomersPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('all');
  const [group, setGroup] = useState('all');
  const [source, setSource] = useState('all');
  const [blocked, setBlocked] = useState('all');
  const [segment, setSegment] = useState<Segment>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = useMemo(() => customerStats(s), [s]);
  const now = useNow();
  const isHigh = (c: Customer) => c.group === 'High spenders' || (stats.get(c.id)?.spend ?? 0) >= HIGH_SPENDER;
  const isInactive = (c: Customer) => { const l = stats.get(c.id)?.last; return !l || now - new Date(l).getTime() > 30 * DAY; };
  const groups = [...new Set(s.customers.map((c) => c.group).filter(Boolean))] as string[];

  if (!can(s, 'customers.view')) {
    return <DashboardLayout title="Customers" eyebrow="CRM"><AccessDenied permission="customers.view" /></DashboardLayout>;
  }

  const term = q.trim().toLowerCase();
  const list = s.customers.filter((c) => {
    if (term && !`${c.name} ${c.mobile} ${c.email}`.toLowerCase().includes(term)) return false;
    if (city !== 'all' && c.cityId !== city) return false;
    if (group !== 'all' && (group === 'none' ? !!c.group : c.group !== group)) return false;
    if (source !== 'all' && c.source !== source) return false;
    if (blocked === 'blocked' && !c.blocked) return false;
    if (blocked === 'active' && c.blocked) return false;
    if (segment === 'high' && !isHigh(c)) return false;
    if (segment === 'inactive' && !isInactive(c)) return false;
    if (segment.startsWith('city:') && c.cityId !== segment.slice(5)) return false;
    return true;
  });

  const segments = [
    { key: 'high' as Segment, label: 'High spenders', sub: `${pesoShort(HIGH_SPENDER)}+ lifetime or tagged`, count: s.customers.filter(isHigh).length, icon: Crown, color: 'text-amber-500' },
    { key: 'inactive' as Segment, label: 'Inactive 30 days', sub: 'no order in the last 30 days', count: s.customers.filter(isInactive).length, icon: Moon, color: 'text-gray-500' },
    ...s.cities.map((ct) => ({ key: `city:${ct.id}` as Segment, label: ct.name, sub: ct.region, count: s.customers.filter((c) => c.cityId === ct.id).length, icon: Building2, color: 'text-[#c8151d]' })),
  ];

  const exportList = () => {
    exportCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Name', 'Mobile', 'Email', 'City', 'Source', 'Group', 'Orders', 'Lifetime spend', 'Points', 'Store credit', 'Blocked'],
      ...list.map((c) => [c.name, c.mobile, c.email, cityName(s, c.cityId), SOURCE_LABEL[c.source], c.group ?? '', stats.get(c.id)?.orders ?? 0, (stats.get(c.id)?.spend ?? 0).toFixed(2), c.points, c.storeCredit, c.blocked ? 'Yes' : 'No']),
    ]);
    toast.success(`Exported ${list.length} customers`);
  };

  return (
    <DashboardLayout title="Customers" eyebrow="CRM" hideBranch>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Every Jovanne’s Meat Shop customer in one database · {s.customers.length} total · {s.customers.filter((c) => c.blocked).length} blocked</p>
        </div>
        <Button variant="outline" onClick={exportList}><Download className="w-4 h-4" strokeWidth={1.75} /> Export list</Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 sm:gap-6">
        <div className="xl:col-span-3 min-w-0">
          <Panel bodyClass="p-0">
            <div className="p-4 pb-0">
              <Toolbar>
                <div className="relative w-full sm:w-auto">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
                  <input className={cn(inputClass, 'pl-8 w-full sm:w-64')} placeholder="Search name, mobile, email" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select className={selectClass} value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="all">All cities</option>
                  {s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className={selectClass} value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="all">All groups</option>
                  {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                  <option value="none">No group</option>
                </select>
                <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="all">All sources</option>
                  <option value="app">App</option>
                  <option value="walk_in">Walk-in</option>
                  <option value="phone">Phone</option>
                </select>
                <select className={selectClass} value={blocked} onChange={(e) => setBlocked(e.target.value)}>
                  <option value="all">Active & blocked</option>
                  <option value="active">Active only</option>
                  <option value="blocked">Blocked only</option>
                </select>
                {segment !== 'all' && (
                  <Pill className="bg-red-50 text-[#c8151d]">
                    Segment: {segments.find((x) => x.key === segment)?.label}
                    <button onClick={() => setSegment('all')} aria-label="Clear segment"><X className="w-3 h-3" /></button>
                  </Pill>
                )}
                <span className="ml-auto text-xs text-gray-400">{list.length} shown</span>
              </Toolbar>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Customer</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Lifetime spend</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="pr-5">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => {
                  const st = stats.get(c.id);
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.name} />
                          <div>
                            <div className="font-medium text-gray-900 flex items-center gap-2">
                              {c.name}
                              {c.blocked && <Pill className="bg-red-100 text-red-700"><Ban className="w-3 h-3" /> Blocked</Pill>}
                            </div>
                            <div className="text-xs text-gray-400 whitespace-nowrap">{c.mobile} · {c.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">{cityName(s, c.cityId)}</TableCell>
                      <TableCell><Pill>{SOURCE_LABEL[c.source]}</Pill></TableCell>
                      <TableCell>{c.group ? <Pill className="bg-amber-50 text-amber-800">{c.group}</Pill> : <span className="text-gray-300">—</span>}</TableCell>
                      <TableCell className="text-right">{st?.orders ?? 0}</TableCell>
                      <TableCell className="text-right font-semibold text-[#c8151d]">{pesoShort(st?.spend ?? 0)}</TableCell>
                      <TableCell className="text-right">{c.points.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{c.storeCredit ? peso(c.storeCredit) : <span className="text-gray-300">—</span>}</TableCell>
                      <TableCell className="pr-5 text-gray-500 text-sm">{st?.last ? timeAgo(st.last) : 'Never'}</TableCell>
                    </TableRow>
                  );
                })}
                {list.length === 0 && <TableRow><TableCell colSpan={9}><EmptyState title="No customers match your filters" icon={<Users className="w-8 h-8" />} /></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Panel>
        </div>

        <Panel title="Segments" action={<span className="text-xs text-gray-400">for targeting</span>} bodyClass="p-3">
          <ul className="space-y-1">
            {segments.map((sg) => {
              const Icon = sg.icon;
              return (
                <li key={sg.key}>
                  <button
                    onClick={() => setSegment(segment === sg.key ? 'all' : sg.key)}
                    className={cn('w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors', segment === sg.key ? 'bg-red-50 ring-1 ring-[#c8151d]/30' : 'hover:bg-gray-50')}
                  >
                    <Icon className={cn('w-4 h-4', sg.color)} strokeWidth={1.75} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{sg.label}</p>
                      <p className="text-xs text-gray-400 truncate">{sg.sub}</p>
                    </div>
                    <span className="text-lg font-bold text-[#c8151d]">{sg.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-gray-400 px-3 pt-3">Use segments in Promotions → Campaign composer to send push, SMS or email.</p>
        </Panel>
      </div>

      <CustomerSheet s={s} id={openId} onClose={() => setOpenId(null)} stats={stats} />
    </DashboardLayout>
  );
}

function Avatar({ name, size = 'w-9 h-9 text-sm' }: { name: string; size?: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return <div className={cn('rounded-full bg-[#c8151d]/10 text-[#c8151d] font-semibold flex items-center justify-center shrink-0', size)}>{initials}</div>;
}

function CustomerSheet({ s, id, onClose, stats }: { s: AppState; id: string | null; onClose: () => void; stats: Map<string, { orders: number; spend: number; last?: string }> }) {
  const c = s.customers.find((x) => x.id === id) as CustomerX | undefined;
  const [creditOpen, setCreditOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [note, setNote] = useState('');
  const canEdit = can(s, 'customers.edit');

  if (!c) return <Sheet open={false} onOpenChange={onClose}><SheetContent><SheetTitle className="sr-only">Customer</SheetTitle></SheetContent></Sheet>;

  const orders = s.orders.filter((o) => o.customerId === c.id).sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const cases = s.conversations.filter((cv) => cv.customerId === c.id);
  const usedCodes = [...new Set(orders.map((o) => o.voucherCode).filter(Boolean))] as string[];
  const eligible = s.vouchers.filter((v) => v.active && new Date(v.end) > new Date() && v.used < v.maxUses && !(v.firstOrderOnly && orders.length > 0));
  const st = stats.get(c.id);
  const credit = s.audit.filter((a) => a.module === 'Payments' && a.action.toLowerCase().includes('credit') && a.detail.includes(c.name));

  const addNote = () => {
    if (!note.trim()) return;
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id) as CustomerX | undefined;
      if (!cu) return;
      cu.notes = [{ at: new Date().toISOString(), by: currentUserName(d), text: note.trim() }, ...(cu.notes ?? [])];
      addAudit(d, { module: 'Customers', action: 'Note added', detail: `${cu.name}: ${note.trim()}` });
    });
    setNote('');
    toast.success('Note added');
  };
  const reinstate = () => {
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id);
      if (!cu) return;
      addAudit(d, { module: 'Customers', action: 'Customer reinstated', detail: cu.name, oldValue: `Blocked: ${cu.blockReason ?? ''}`, newValue: 'Active' });
      cu.blocked = false;
      cu.blockReason = undefined;
    });
    toast.success(`${c.name} reinstated`);
  };
  const privacy = (kind: 'export' | 'delete') => {
    mutate((d) => addAudit(d, { module: 'Customers', action: kind === 'export' ? 'Data export requested' : 'Deletion request logged', detail: `${c.name} (${c.email}) — ${kind === 'export' ? 'export file will be emailed within 72 hours' : 'pending 30-day privacy review'}` }));
    toast.success(kind === 'export' ? 'Data export requested' : 'Deletion request logged', { description: kind === 'export' ? `A copy of ${c.name}'s data will be emailed to ${c.email}.` : 'Account flagged for deletion after the privacy review period (Data Privacy Act).' });
  };
  const setGroup = (g: string) => {
    mutate((d) => {
      const cu = d.customers.find((x) => x.id === c.id);
      if (!cu) return;
      addAudit(d, { module: 'Customers', action: 'Group changed', detail: cu.name, oldValue: cu.group ?? '—', newValue: g || '—' });
      cu.group = g || undefined;
    });
    toast.success('Customer group updated');
  };

  return (
    <Sheet open={!!c} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl max-w-2xl">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <Avatar name={c.name} size="w-12 h-12 text-base" />
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">{c.name}{c.blocked && <Pill className="bg-red-100 text-red-700"><Ban className="w-3 h-3" /> Blocked</Pill>}</SheetTitle>
              <SheetDescription>Customer since {fmtDate(c.createdAt)} · {SOURCE_LABEL[c.source]} · {cityName(s, c.cityId)}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          {c.blocked && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-3">
              <Ban className="w-4 h-4 text-[#dc2626] mt-0.5" />
              <div className="flex-1 text-sm"><p className="font-medium text-red-800">Blocked from ordering</p><p className="text-red-700">{c.blockReason}</p></div>
              {canEdit && <Button size="sm" variant="outline" onClick={reinstate}><ShieldCheck className="w-4 h-4" /> Reinstate</Button>}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Mini label="Orders" value={st?.orders ?? 0} />
            <Mini label="Lifetime spend" value={pesoShort(st?.spend ?? 0)} />
            <Mini label="Loyalty points" value={c.points.toLocaleString()} icon={<Star className="w-3.5 h-3.5 text-amber-500" />} />
            <Mini label="Store credit" value={peso(c.storeCredit)} icon={<Wallet className="w-3.5 h-3.5 text-green-600" />} />
          </div>

          <Tabs defaultValue="profile">
            <TabsList className="max-w-full overflow-x-auto overflow-y-hidden justify-start">
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
              <TabsTrigger value="wallet">Vouchers & credit</TabsTrigger>
              <TabsTrigger value="support">Support ({cases.length})</TabsTrigger>
              <TabsTrigger value="notes">Notes ({c.notes?.length ?? 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <p className="flex items-center gap-2 text-gray-700"><Phone className="w-4 h-4 text-gray-400 shrink-0" />{c.mobile}</p>
                <p className="flex items-center gap-2 text-gray-700 min-w-0"><Mail className="w-4 h-4 text-gray-400 shrink-0" /><span className="break-all">{c.email}</span></p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Addresses</p>
                <ul className="space-y-2">
                  {c.addresses.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 p-3 text-sm">
                      <MapPin className="w-4 h-4 text-[#c8151d] mt-0.5" />
                      <div><p className="font-medium text-gray-900">{a.label}</p><p className="text-gray-600">{a.line}</p>{a.landmark && <p className="text-xs text-gray-400">Landmark: {a.landmark}</p>}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Group</span>
                <select className={selectClass} disabled={!canEdit} value={c.group ?? ''} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">No group</option>
                  {['High spenders', 'VIP', 'Senior citizen', 'Corporate', 'Sari-sari store owner'].map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Account actions</p>
                <div className="flex flex-wrap gap-2">
                  {canEdit && !c.blocked && <Button variant="destructive" size="sm" onClick={() => setBlockOpen(true)}><Ban className="w-4 h-4" /> Block / restrict</Button>}
                  {canEdit && c.blocked && <Button variant="outline" size="sm" onClick={reinstate}><ShieldCheck className="w-4 h-4" /> Reinstate</Button>}
                  <Button variant="outline" size="sm" onClick={() => privacy('export')}><Download className="w-4 h-4" /> Data export</Button>
                  <Button variant="outline" size="sm" className="text-[#dc2626]" onClick={() => privacy('delete')}><Trash2 className="w-4 h-4" /> Deletion request</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="orders" className="pt-2">
              {orders.length === 0 ? <EmptyState title="No orders yet" /> : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {orders.slice(0, 30).map((o) => (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-gray-50 text-sm">
                        <span className="font-medium text-[#c8151d] sm:w-24">{o.number}</span>
                        <span className="text-gray-500 flex-1 min-w-[8rem]">{fmtDateTime(o.placedAt)}</span>
                        <StatusBadge status={o.status} />
                        <span className="sm:w-24 text-right font-medium">{peso(o.total)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="wallet" className="space-y-4 pt-2">
              <div className="rounded-lg border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs text-gray-500">Store credit balance</p><p className="text-2xl font-bold text-[#c8151d]">{peso(c.storeCredit)}</p></div>
                {canEdit && <Button size="sm" onClick={() => setCreditOpen(true)}><Wallet className="w-4 h-4" /> Adjust credit</Button>}
              </div>
              {credit.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Credit history</p>
                  <ul className="space-y-1 text-sm">{credit.map((a) => <li key={a.id} className="flex justify-between gap-3 text-gray-600"><span className="min-w-0">{a.action} — {a.detail}</span><span className="text-xs text-gray-400">{fmtDate(a.at)}</span></li>)}</ul>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Loyalty</p>
                <p className="text-sm text-gray-700"><Star className="w-4 h-4 inline text-amber-500 mr-1" />{c.points.toLocaleString()} points ≈ {peso(c.points / 10)} redemption value</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Vouchers</p>
                <div className="flex flex-wrap gap-2">
                  {usedCodes.map((code) => <Pill key={code} className="bg-gray-100 text-gray-500"><Ticket className="w-3 h-3" />{code} · used</Pill>)}
                  {eligible.map((v) => <Pill key={v.id} className="bg-green-50 text-green-800"><Ticket className="w-3 h-3" />{v.code} · eligible</Pill>)}
                  {usedCodes.length + eligible.length === 0 && <span className="text-sm text-gray-400">No vouchers</span>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="support" className="pt-2">
              {cases.length === 0 ? <EmptyState title="No support cases" icon={<MessagesSquare className="w-8 h-8" />} /> : (
                <ul className="space-y-2">
                  {cases.map((cv) => (
                    <li key={cv.id}>
                      <Link href={`/support?c=${cv.id}`} className="block rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-900">{cv.category}</span>
                          <Pill className={cv.status === 'resolved' ? 'bg-green-100 text-green-800' : cv.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>{cv.status}</Pill>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 truncate">{cv.messages[cv.messages.length - 1]?.text}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(cv.updatedAt)} · {cv.assignedTo ?? 'Unassigned'}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="notes" className="space-y-3 pt-2">
              <div className="flex gap-2">
                <input className={cn(inputClass, 'flex-1')} placeholder="Add an internal note (staff only)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
                <Button onClick={addNote} disabled={!note.trim()}><StickyNote className="w-4 h-4" /> Add</Button>
              </div>
              {(c.notes ?? []).length === 0 ? <EmptyState title="No notes yet" /> : (
                <ul className="space-y-2">
                  {c.notes!.map((n, i) => (
                    <li key={i} className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm">
                      <p className="text-gray-800">{n.text}</p>
                      <p className="text-xs text-gray-500 mt-1">{n.by} · {fmtDateTime(n.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <CreditDialog open={creditOpen} onOpenChange={setCreditOpen} customer={c} />
        <BlockDialog open={blockOpen} onOpenChange={setBlockOpen} customer={c} />
      </SheetContent>
    </Sheet>
  );
}

function Mini({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <p className="text-xs text-gray-500 flex items-center gap-1">{icon}{label}</p>
      <p className="text-lg font-bold text-[#c8151d] mt-0.5">{value}</p>
    </div>
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
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            {(['add', 'deduct'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn('px-3 py-1.5 text-sm rounded-md font-medium', mode === m ? 'bg-[#c8151d] text-white' : 'text-gray-600')}>{m === 'add' ? 'Add credit' : 'Deduct credit'}</button>
            ))}
          </div>
          <label className="block"><span className="text-xs font-medium text-gray-600">Amount (₱)</span>
            <input type="number" min={0} className={cn(inputClass, 'w-full mt-1')} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Reason</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Goodwill / service recovery', 'Missing item', 'Damaged item', 'Late delivery', 'Refund to wallet', 'Correction', 'Other'].map((r) => <option key={r}>{r}</option>)}
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
    toast.success(`${customer.name} blocked`, { description: 'Orders from this customer now require manual review.' });
    setDetail('');
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block / restrict customer</DialogTitle>
          <DialogDescription>{customer.name} will not be able to place COD orders and every order will need manual confirmation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Reason</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {['Repeated COD no-shows', 'Payment fraud / chargebacks', 'Abusive behaviour to staff or riders', 'Voucher abuse', 'Other'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Details</span>
            <input className={cn(inputClass, 'w-full mt-1')} placeholder="e.g. 3 refused deliveries in October" value={detail} onChange={(e) => setDetail(e.target.value)} />
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
