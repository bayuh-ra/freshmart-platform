'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Banknote, Bike, CheckCircle2, Clock, Download, Lock, LockOpen, ReceiptText, RotateCcw, ShieldCheck, Timer, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, Pill, StatCard, StatusBadge, inputClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Textarea } from '@/src/components/ui/shadcn/textarea';
import { addAudit, currentUserName, mutate, useStore } from '@/src/lib/store';
import { CHANNEL_LABEL, PAYMENT_LABEL, STATUS_LABEL, can, exportCsv, fmtDateTime, isToday, peso } from '@/src/lib/logic';
import type { Order, OrderChannel, OrderStatus } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };

interface EodState {
  signedBy?: string;
  signedAt?: string;
  locked: boolean;
  lockedAt?: string;
  lockedBy?: string;
  remittances: { riderId: string; amount: number; at: string; by: string }[];
  counterCounted?: number;
  log: { at: string; by: string; text: string }[];
}
const EMPTY: EodState = { locked: false, remittances: [], log: [] };

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function loadEod(key: string): EodState {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as EodState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function eventAt(o: Order, st: OrderStatus) {
  return o.timeline.find((e) => e.status === st)?.at;
}
function minsBetween(a?: string, b?: string) {
  if (!a || !b) return undefined;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);
}
function avg(xs: (number | undefined)[]) {
  const v = xs.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((t, x) => t + x, 0) / v.length : undefined;
}

export default function EndOfDayPage() {
  const s = useStore();
  const branchId = s.session.branchId;
  const branch = s.branches.find((b) => b.id === branchId);
  const storageKey = `freshmart-eod-${branchId}-${dayKey()}`;
  const [eod, setEod] = useState<EodState>(EMPTY);
  const [remitInput, setRemitInput] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Load the saved day state when the branch/day changes (reset-on-key-change pattern, no effect needed).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (loadedKey !== storageKey) {
    const e = loadEod(storageKey);
    setLoadedKey(storageKey);
    setEod(e);
    setCounted(e.counterCounted !== undefined ? String(e.counterCounted) : '');
  }

  const save = (next: EodState) => {
    setEod(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  if (!can(s, 'orders.view')) {
    return <DashboardLayout title="End of Day" eyebrow="Order desk"><AccessDenied permission="orders.view" /></DashboardLayout>;
  }

  const by = currentUserName(s);
  const canApprove = can(s, 'orders.approve');
  const locked = eod.locked;
  const today = s.orders.filter((o) => o.branchId === branchId && isToday(o.placedAt));
  const completed = today.filter((o) => o.status === 'delivered' || o.status === 'collected');
  const cancelled = today.filter((o) => o.status === 'cancelled');
  const open = today.filter((o) => !['delivered', 'collected', 'cancelled'].includes(o.status));
  const sales = completed.reduce((t, o) => t + o.total - o.refundedAmount, 0);
  const refunds = today.reduce((t, o) => t + o.refundedAmount, 0);
  const refundCount = today.filter((o) => o.refundedAmount > 0).length;
  const cashOrders = completed.filter((o) => ['cod', 'pay_at_pickup', 'cash'].includes(o.paymentMethod));
  const cashBy = (m: string) => cashOrders.filter((o) => o.paymentMethod === m).reduce((t, o) => t + o.total, 0);
  const cashCollected = cashBy('cod') + cashBy('pay_at_pickup') + cashBy('cash');
  const counterExpected = cashBy('pay_at_pickup') + cashBy('cash');

  // Avg confirmation (manual only — auto-confirmed orders are instant) and prep time (confirmed → ready).
  const manual = today.filter((o) => !o.autoConfirmed);
  const avgConfirm = avg(manual.map((o) => minsBetween(eventAt(o, 'placed') ?? o.placedAt, eventAt(o, 'confirmed'))));
  const avgPrep = avg(today.map((o) => minsBetween(eventAt(o, 'confirmed'), eventAt(o, 'ready'))));

  const statuses = (Object.keys(STATUS_LABEL) as OrderStatus[]).map((st) => ({ st, n: today.filter((o) => o.status === st).length, amt: today.filter((o) => o.status === st).reduce((t, o) => t + o.total, 0) })).filter((x) => x.n > 0);
  const channels = (Object.keys(CHANNEL_LABEL) as OrderChannel[]).map((ch) => {
    const list = today.filter((o) => o.channel === ch);
    const done = list.filter((o) => o.status === 'delivered' || o.status === 'collected');
    return { ch, n: list.length, done: done.length, sales: done.reduce((t, o) => t + o.total - o.refundedAmount, 0) };
  });

  const riders = s.riders.filter((r) => r.branchIds.includes(branchId)).map((r) => {
    const cod = completed.filter((o) => o.riderId === r.id && o.paymentMethod === 'cod');
    const codToday = cod.reduce((t, o) => t + o.total, 0);
    const remitted = eod.remittances.filter((x) => x.riderId === r.id).reduce((t, x) => t + x.amount, 0);
    return { r, codCount: cod.length, codToday, remitted, held: r.codHeld, expected: r.codHeld + remitted };
  });
  const totalHeld = riders.reduce((t, x) => t + x.held, 0);
  const totalRemitted = riders.reduce((t, x) => t + x.remitted, 0);

  const remit = (riderId: string, name: string, held: number) => {
    const amt = Math.round((Number(remitInput[riderId]) || 0) * 100) / 100;
    if (amt <= 0) { toast.error('Enter the amount received'); return; }
    if (amt > held + 0.001) { toast.error(`${name} only holds ${peso(held)}`); return; }
    mutate((d) => {
      const r = d.riders.find((x) => x.id === riderId);
      if (!r) return;
      const old = r.codHeld;
      r.codHeld = Math.max(0, Math.round((r.codHeld - amt) * 100) / 100);
      addAudit(d, { module: 'Riders', action: 'COD remitted', detail: `${name} remitted ${peso(amt)} at ${branch?.name}`, branchId, oldValue: peso(old), newValue: peso(r.codHeld) });
    });
    const now = new Date().toISOString();
    save({ ...eod, remittances: [...eod.remittances, { riderId, amount: amt, at: now, by }], log: [...eod.log, { at: now, by, text: `${name} remitted ${peso(amt)}` }] });
    setRemitInput((x) => ({ ...x, [riderId]: '' }));
    toast.success(`${peso(amt)} remitted by ${name}`, { description: amt < held ? `Still holding ${peso(held - amt)}` : 'Fully remitted' });
  };

  const saveCounted = () => {
    const n = Number(counted);
    if (!(n >= 0) || counted === '') return;
    const now = new Date().toISOString();
    save({ ...eod, counterCounted: n, log: [...eod.log, { at: now, by, text: `Counter cash counted ${peso(n)} (expected ${peso(counterExpected)})` }] });
    toast.success('Counter cash recorded');
  };

  const signOff = () => {
    const now = new Date().toISOString();
    save({ ...eod, signedBy: by, signedAt: now, log: [...eod.log, { at: now, by, text: 'Manager sign-off' }] });
    mutate((d) => addAudit(d, { module: 'Orders', action: 'End-of-day sign-off', detail: `${branch?.name} ${dayKey()} · sales ${peso(sales)} · cash ${peso(cashCollected)} · riders holding ${peso(totalHeld)}`, branchId }));
    toast.success('Day signed off', { description: `${branch?.name} · ${dayKey()}` });
  };
  const lockDay = () => {
    const now = new Date().toISOString();
    save({ ...eod, locked: true, lockedAt: now, lockedBy: by, log: [...eod.log, { at: now, by, text: 'Day locked' }] });
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Day locked', detail: `${branch?.name} ${dayKey()}`, branchId }));
    toast.success('Day locked', { description: 'Cash figures are now read-only' });
  };
  const reopen = () => {
    if (reopenReason.trim().length < 4) return;
    const now = new Date().toISOString();
    save({ ...eod, locked: false, signedBy: undefined, signedAt: undefined, log: [...eod.log, { at: now, by, text: `Day reopened — ${reopenReason.trim()}` }] });
    mutate((d) => addAudit(d, { module: 'Orders', action: 'Day reopened', detail: `${branch?.name} ${dayKey()} — ${reopenReason.trim()}`, branchId }));
    setReopenReason('');
    setReopenOpen(false);
    toast.success('Day reopened', { description: 'Reason logged in the audit trail' });
  };

  const download = () => {
    exportCsv(`eod-${branch?.code ?? branchId}-${dayKey()}.csv`, [
      ['Order', 'Customer', 'Channel', 'Fulfillment', 'Status', 'Payment method', 'Payment status', 'Total', 'Refunded', 'Rider', 'Placed'],
      ...today.map((o) => [o.number, o.customerName, CHANNEL_LABEL[o.channel], o.fulfillment, STATUS_LABEL[o.status], PAYMENT_LABEL[o.paymentMethod], o.paymentStatus, o.total, o.refundedAmount, s.riders.find((r) => r.id === o.riderId)?.name ?? '', fmtDateTime(o.placedAt)]),
    ]);
  };

  const countedNum = eod.counterCounted;
  const counterVariance = countedNum !== undefined ? countedNum - counterExpected : undefined;

  return (
    <DashboardLayout title="End of Day" eyebrow="Order desk">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{branch?.name} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today.length} orders today · {open.length} still open{eod.signedBy ? ` · signed off by ${eod.signedBy} ${fmtDateTime(eod.signedAt!)}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={download}><Download className="w-4 h-4" {...ICON} />Export CSV</Button>
          {!locked && !eod.signedBy && (
            <Button variant="outline" onClick={signOff} disabled={!canApprove} title={canApprove ? '' : 'Requires orders.approve (Branch Manager)'}><ShieldCheck className="w-4 h-4" {...ICON} />Manager sign-off</Button>
          )}
          {!locked ? (
            <Button onClick={lockDay} disabled={!eod.signedBy || !canApprove}><Lock className="w-4 h-4" {...ICON} />Lock day</Button>
          ) : (
            <Button variant="outline" onClick={() => setReopenOpen(true)} disabled={!canApprove}><LockOpen className="w-4 h-4" {...ICON} />Reopen day</Button>
          )}
        </div>
      </div>

      {locked && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm text-gray-700">
          <Lock className="w-4 h-4" {...ICON} />Day locked by {eod.lockedBy} at {eod.lockedAt ? fmtDateTime(eod.lockedAt) : ''}. Cash figures are read-only; reopening requires a reason.
        </div>
      )}
      {!canApprove && (
        <p className="mb-5 text-xs text-gray-500">Viewing as {by}. Sign-off, lock and reopen need a manager (orders.approve). Switch “view as” to Mark Lim to demo.</p>
      )}
      {open.length > 0 && !locked && (
        <p className="mb-5 text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-2.5">{open.length} order{open.length > 1 ? 's are' : ' is'} still open ({open.map((o) => o.number).slice(0, 5).join(', ')}{open.length > 5 ? '…' : ''}). Complete or cancel them before locking.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard valueClass="text-lg sm:text-2xl xl:text-3xl text-[#c8151d] break-words" title="Sales (completed)" value={peso(sales)} sub={`${completed.length} orders · net of refunds`} icon={<ReceiptText className="w-5 h-5" {...ICON} />} />
        <StatCard valueClass="text-lg sm:text-2xl xl:text-3xl text-[#c8151d] break-words" title="Cash collected" value={peso(cashCollected)} sub="COD + pay at pickup + cash" accent="border-l-green-500" icon={<Banknote className="w-5 h-5" {...ICON} />} />
        <StatCard valueClass="text-lg sm:text-2xl xl:text-3xl text-[#c8151d] break-words" title="Refunds" value={peso(refunds)} sub={`${refundCount} order${refundCount !== 1 ? 's' : ''}`} accent="border-l-orange-400" icon={<RotateCcw className="w-5 h-5" {...ICON} />} />
        <StatCard title="Cancellations" value={cancelled.length} sub={today.length ? `${Math.round((cancelled.length / today.length) * 100)}% of orders` : '—'} accent="border-l-[#dc2626]" icon={<XCircle className="w-5 h-5" {...ICON} />} />
        <StatCard title="Avg. confirmation" value={avgConfirm !== undefined ? `${avgConfirm.toFixed(1)} min` : '—'} sub={`${manual.length} manual · ${today.length - manual.length} auto-confirmed`} accent="border-l-purple-500" icon={<Timer className="w-5 h-5" {...ICON} />} />
        <StatCard title="Avg. prep time" value={avgPrep !== undefined ? `${avgPrep.toFixed(0)} min` : '—'} sub="Confirmed → Ready" accent="border-l-cyan-500" icon={<Clock className="w-5 h-5" {...ICON} />} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mb-5">
        <Panel title="Orders by status" bodyClass="p-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-5">Status</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right pr-5">Value</TableHead></TableRow></TableHeader>
            <TableBody>
              {statuses.map((x) => (
                <TableRow key={x.st}><TableCell className="pl-5"><StatusBadge status={x.st} /></TableCell><TableCell className="text-right font-semibold">{x.n}</TableCell><TableCell className="text-right pr-5">{peso(x.amt)}</TableCell></TableRow>
              ))}
            </TableBody>
            <TableFooter><TableRow><TableCell className="pl-5 font-semibold">Total</TableCell><TableCell className="text-right font-semibold">{today.length}</TableCell><TableCell className="text-right pr-5 font-semibold">{peso(today.reduce((t, o) => t + o.total, 0))}</TableCell></TableRow></TableFooter>
          </Table>
        </Panel>
        <Panel title="Orders by channel" bodyClass="p-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-5">Channel</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Completed</TableHead><TableHead className="text-right pr-5">Sales</TableHead></TableRow></TableHeader>
            <TableBody>
              {channels.map((x) => (
                <TableRow key={x.ch}><TableCell className="pl-5 font-medium">{CHANNEL_LABEL[x.ch]}</TableCell><TableCell className="text-right">{x.n}</TableCell><TableCell className="text-right">{x.done}</TableCell><TableCell className="text-right pr-5 font-semibold">{peso(x.sales)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-5 py-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {(['cod', 'pay_at_pickup', 'cash'] as const).map((m) => (
              <div key={m}><p className="text-xs text-gray-500">{PAYMENT_LABEL[m]}</p><p className="font-semibold text-[#c8151d]">{peso(cashBy(m))}</p></div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Bike className="w-4 h-4 text-[#c8151d]" {...ICON} />Rider cash accountability (COD)</h2>}
        action={<span className="text-xs text-gray-500">Holding {peso(totalHeld)} · remitted today {peso(totalRemitted)}</span>} bodyClass="p-0" className="mb-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Rider</TableHead>
              <TableHead className="text-right">COD orders today</TableHead>
              <TableHead className="text-right">COD collected today</TableHead>
              <TableHead className="text-right">Expected (held + remitted)</TableHead>
              <TableHead className="text-right">Remitted</TableHead>
              <TableHead className="text-right">Still holding</TableHead>
              <TableHead className="pr-5">Receive cash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {riders.map(({ r, codCount, codToday, remitted, held, expected }) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5"><p className="font-medium text-gray-900">{r.name}</p><p className="text-xs text-gray-500 capitalize">{r.type} · {r.vehicle}</p></TableCell>
                <TableCell className="text-right">{codCount}</TableCell>
                <TableCell className="text-right">{peso(codToday)}</TableCell>
                <TableCell className="text-right font-semibold">{peso(expected)}</TableCell>
                <TableCell className="text-right text-green-700">{peso(remitted)}</TableCell>
                <TableCell className="text-right">{held > 0 ? <Pill className="bg-amber-100 text-amber-800">{peso(held)}</Pill> : <Pill className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3" {...ICON} />Clear</Pill>}</TableCell>
                <TableCell className="pr-5">
                  <div className="flex items-center gap-1.5">
                    <input type="number" min={0} value={remitInput[r.id] ?? ''} disabled={locked || held <= 0} onChange={(e) => setRemitInput((x) => ({ ...x, [r.id]: e.target.value }))}
                      placeholder={held > 0 ? held.toFixed(2) : '0.00'} className={cn(inputClass, 'h-8 w-28 text-right')} />
                    <Button size="sm" variant="outline" className="h-8" disabled={locked || held <= 0} onClick={() => remit(r.id, r.name, held)}>Mark remitted</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Counter cash (pay at pickup + cash)">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Expected in drawer</dt><dd className="font-semibold">{peso(counterExpected)}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt className="text-gray-500">Counted</dt>
              <dd className="flex items-center gap-1.5">
                <input type="number" min={0} value={counted} disabled={locked} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className={cn(inputClass, 'h-8 w-32 text-right')} />
                <Button size="sm" variant="outline" className="h-8" disabled={locked || counted === ''} onClick={saveCounted}>Save</Button>
              </dd></div>
            {counterVariance !== undefined && (
              <div className={cn('flex justify-between rounded-lg px-3 py-2', Math.abs(counterVariance) < 0.01 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')}>
                <dt>Variance</dt><dd className="font-semibold">{counterVariance >= 0 ? '+' : ''}{peso(counterVariance)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-900 mb-2">Manager sign-off</p>
            {eod.signedBy ? (
              <p className="text-sm text-green-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4" {...ICON} />Signed off by {eod.signedBy} · {fmtDateTime(eod.signedAt!)}</p>
            ) : <p className="text-sm text-gray-500">Not signed off yet.</p>}
          </div>
        </Panel>
        <Panel title="Cancellations & day log">
          {cancelled.length === 0 ? <p className="text-sm text-gray-400 mb-3">No cancellations today.</p> : (
            <ul className="space-y-1.5 mb-4">
              {cancelled.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 text-sm"><span><span className="font-medium text-[#c8151d]">{o.number}</span> <span className="text-gray-500">— {o.rejectReason ?? 'No reason'}</span></span><span className="text-gray-700">{peso(o.total)}</span></li>
              ))}
            </ul>
          )}
          <div className="border-t border-gray-100 pt-3 space-y-1.5 max-h-56 overflow-y-auto">
            {eod.log.length === 0 && <p className="text-xs text-gray-400">No end-of-day actions yet.</p>}
            {[...eod.log].reverse().map((l, i) => (
              <p key={i} className="text-xs text-gray-600"><span className="text-gray-400">{fmtDateTime(l.at)}</span> · {l.by} — {l.text}</p>
            ))}
          </div>
        </Panel>
      </div>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] p-4 sm:p-6">
          <DialogHeader><DialogTitle>Reopen {dayKey()}</DialogTitle><DialogDescription>The reason is written to the audit log. The sign-off is cleared and must be repeated.</DialogDescription></DialogHeader>
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Why is the day being reopened? (e.g. late COD remittance from rider)" rows={3} />
          <DialogFooter><Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button><Button disabled={reopenReason.trim().length < 4} onClick={reopen}>Reopen day</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
