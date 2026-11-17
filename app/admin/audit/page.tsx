'use client';

import { useMemo, useState } from 'react';
import { Download, Lock, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, Toolbar, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { useStore } from '@/src/lib/store';
import { branchName, can, exportCsv, fmtDateTime, timeAgo } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';

const MODULE_CLASS: Record<string, string> = {
  Orders: 'bg-red-100 text-red-800', Catalog: 'bg-indigo-100 text-indigo-800', Pricing: 'bg-violet-100 text-violet-800',
  Inventory: 'bg-teal-100 text-teal-800', Riders: 'bg-orange-100 text-orange-800', Customers: 'bg-pink-100 text-pink-800',
  Promotions: 'bg-fuchsia-100 text-fuchsia-800', Settings: 'bg-amber-100 text-amber-800', 'Users & Roles': 'bg-red-100 text-red-800',
  Branches: 'bg-emerald-100 text-emerald-800', Support: 'bg-sky-100 text-sky-800', Payments: 'bg-lime-100 text-lime-800',
};
const PAGE = 50;

export default function AuditPage() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [user, setUser] = useState('all');
  const [mod, setMod] = useState('all');
  const [branch, setBranch] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const users = useMemo(() => Array.from(new Set(s.audit.map((a) => a.user))).sort(), [s.audit]);
  const modules = useMemo(() => Array.from(new Set(s.audit.map((a) => a.module))).sort(), [s.audit]);

  const rows = useMemo(() => {
    const fromT = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
    const toT = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
    const needle = q.toLowerCase();
    return s.audit.filter((a) => {
      const t = new Date(a.at).getTime();
      return (user === 'all' || a.user === user) && (mod === 'all' || a.module === mod) &&
        (branch === 'all' || a.branchId === branch) && t >= fromT && t <= toT &&
        (!needle || `${a.action} ${a.detail} ${a.user} ${a.oldValue ?? ''} ${a.newValue ?? ''}`.toLowerCase().includes(needle));
    });
  }, [s.audit, q, user, mod, branch, from, to]);

  if (!can(s, 'settings.view')) {
    return <DashboardLayout title="Audit Log" eyebrow="Administration" hideBranch><AccessDenied permission="settings.view" /></DashboardLayout>;
  }

  const filtered = q || user !== 'all' || mod !== 'all' || branch !== 'all' || from || to;
  const clear = () => { setQ(''); setUser('all'); setMod('all'); setBranch('all'); setFrom(''); setTo(''); };
  const doExport = () => {
    exportCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Time', 'User', 'Module', 'Action', 'Detail', 'Branch', 'Old value', 'New value'],
      ...rows.map((a) => [new Date(a.at).toLocaleString('en-PH'), a.user, a.module, a.action, a.detail, a.branchId ? branchName(s, a.branchId) : '', a.oldValue ?? '', a.newValue ?? '']),
    ]);
    toast.success(`Exported ${rows.length} entries`);
  };

  return (
    <DashboardLayout title="Audit Log" eyebrow="Administration" hideBranch>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" strokeWidth={1.75} />
          <span><b>Entries are immutable — they cannot be edited or deleted.</b> Every price, stock, refund, setting, role and branch change is recorded with who, when, and the old → new value.</span>
        </div>

        <Panel bodyClass="p-0">
          <div className="p-4 pb-0">
            <Toolbar>
              <div className="relative w-full sm:w-auto">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" strokeWidth={1.75} />
                <input className={cn(inputClass, 'pl-8 w-full sm:w-60')} placeholder="Search action, detail, value" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
              </div>
              <select className={selectClass} value={user} onChange={(e) => setUser(e.target.value)}>
                <option value="all">All users</option>
                {users.map((u) => <option key={u}>{u}</option>)}
              </select>
              <select className={selectClass} value={mod} onChange={(e) => setMod(e.target.value)}>
                <option value="all">All modules</option>
                {modules.map((m) => <option key={m}>{m}</option>)}
              </select>
              <select className={selectClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">All branches</option>
                {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} title="To" />
              {filtered && <Button variant="ghost" size="sm" onClick={clear}><X className="w-3.5 h-3.5" strokeWidth={1.75} />Clear</Button>}
              <div className="flex-1" />
              <span className="text-sm text-gray-500"><b className="text-[#c8151d]">{rows.length}</b> entries</span>
              <Button variant="outline" onClick={doExport}><Download className="w-4 h-4" strokeWidth={1.75} />Export CSV</Button>
            </Toolbar>
          </div>
          {rows.length === 0 ? <EmptyState title="No audit entries match" sub="Try clearing the filters." /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 w-40">Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="pr-5">Old → New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, limit).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-5 text-xs whitespace-nowrap">
                      <p className="text-gray-800">{fmtDateTime(a.at)}</p>
                      <p className="text-gray-400">{timeAgo(a.at)}</p>
                    </TableCell>
                    <TableCell className="text-sm text-gray-800 whitespace-nowrap">{a.user}</TableCell>
                    <TableCell><Pill className={MODULE_CLASS[a.module]}>{a.module}</Pill></TableCell>
                    <TableCell className="text-sm font-medium text-gray-900 whitespace-nowrap">{a.action}</TableCell>
                    <TableCell className="text-xs text-gray-600 max-w-[380px] whitespace-normal">{a.detail}</TableCell>
                    <TableCell className="text-xs text-gray-600 whitespace-nowrap">{a.branchId ? branchName(s, a.branchId) : '—'}</TableCell>
                    <TableCell className="pr-5 text-xs whitespace-nowrap">
                      {a.oldValue || a.newValue ? (
                        <span>
                          <span className="text-gray-400 line-through">{a.oldValue ?? '—'}</span>
                          <span className="mx-1 text-gray-400">→</span>
                          <span className="font-semibold text-gray-900">{a.newValue ?? '—'}</span>
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length > limit && (
            <div className="p-4 text-center border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</Button>
            </div>
          )}
        </Panel>
      </div>
    </DashboardLayout>
  );
}
