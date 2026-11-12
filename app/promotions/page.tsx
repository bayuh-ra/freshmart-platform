'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Megaphone, Send, Bell, MessageSquare, Mail, TicketPercent, Truck, BadgePercent, Download } from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, Pill, EmptyState, inputClass, selectClass } from '@/src/components/common';
import { mutate, addAudit, addNotification, useStore, uid } from '@/src/lib/store';
import { can, peso, pesoShort, fmtDate, exportCsv, cityName } from '@/src/lib/logic';
import type { AppState, Customer, Voucher } from '@/src/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Button } from '@/src/components/ui/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { DAY, avg, isSale, netSales } from '@/src/components/reports/analytics';
import { cn } from '@/src/lib/utils';

const TYPE_LABEL: Record<Voucher['type'], string> = { percent: 'Percent off', fixed: 'Fixed amount', free_delivery: 'Free delivery' };
const TYPE_ICON: Record<Voucher['type'], typeof TicketPercent> = { percent: BadgePercent, fixed: TicketPercent, free_delivery: Truck };
const PERCENT_CAP = 150; // matches applyVoucher()
const SAMPLE_FEE = 49;

function discountFor(v: Pick<Voucher, 'type' | 'value'>, basket: number, fee = SAMPLE_FEE) {
  return v.type === 'percent' ? Math.min(PERCENT_CAP, Math.round((basket * v.value) / 100)) : v.type === 'fixed' ? v.value : fee;
}
function valueLabel(v: Pick<Voucher, 'type' | 'value'>) {
  return v.type === 'percent' ? `${v.value}% (max ${pesoShort(PERCENT_CAP)})` : v.type === 'fixed' ? pesoShort(v.value) : 'Delivery fee';
}
function voucherState(v: Voucher) {
  const now = new Date();
  if (!v.active) return { label: 'Inactive', cls: 'bg-gray-100 text-gray-600' };
  if (v.used >= v.maxUses) return { label: 'Fully redeemed', cls: 'bg-gray-200 text-gray-700' };
  if (new Date(v.end) < now) return { label: 'Expired', cls: 'bg-gray-200 text-gray-700' };
  if (new Date(v.start) > now) return { label: 'Scheduled', cls: 'bg-blue-100 text-blue-800' };
  return { label: 'Live', cls: 'bg-green-100 text-green-800' };
}

export default function PromotionsPage() {
  const s = useStore();
  const [editing, setEditing] = useState<Voucher | 'new' | null>(null);

  if (!can(s, 'promotions.view')) {
    return <DashboardLayout title="Promotions" eyebrow="Marketing"><AccessDenied permission="promotions.view" /></DashboardLayout>;
  }
  const canCreate = can(s, 'promotions.create');
  const canEdit = can(s, 'promotions.edit');

  const toggle = (v: Voucher) => {
    if (!canEdit) { toast.error('Your role cannot edit promotions'); return; }
    mutate((d) => {
      const x = d.vouchers.find((y) => y.id === v.id);
      if (!x) return;
      x.active = !x.active;
      addAudit(d, { module: 'Promotions', action: x.active ? 'Voucher activated' : 'Voucher deactivated', detail: x.code, oldValue: v.active ? 'Active' : 'Inactive', newValue: x.active ? 'Active' : 'Inactive' });
    });
    toast.success(`${v.code} ${v.active ? 'deactivated' : 'activated'}`);
  };

  return (
    <DashboardLayout title="Promotions" eyebrow="Marketing" hideBranch>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vouchers & promotions</h1>
          <p className="text-sm text-gray-500 mt-0.5">{s.vouchers.filter((v) => voucherState(v).label === 'Live').length} live vouchers · {s.vouchers.reduce((a, v) => a + v.used, 0).toLocaleString()} total redemptions</p>
        </div>
        {canCreate && <Button onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> New voucher</Button>}
      </div>

      <Panel title="Vouchers" bodyClass="p-0" className="mb-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Code</TableHead>
              <TableHead>Type / value</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead className="w-48">Usage</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.vouchers.map((v) => {
              const Icon = TYPE_ICON[v.type];
              const st = voucherState(v);
              const pct = Math.min(100, (v.used / Math.max(1, v.maxUses)) * 100);
              return (
                <TableRow key={v.id}>
                  <TableCell className="pl-5">
                    <div className="font-mono font-semibold text-[#1e40af]">{v.code}</div>
                    <div className="text-xs text-gray-400 max-w-56 truncate">{v.description}</div>
                  </TableCell>
                  <TableCell><div className="flex items-center gap-2 text-sm"><Icon className="w-4 h-4 text-gray-400" strokeWidth={1.75} /><span>{TYPE_LABEL[v.type]}</span></div><div className="text-xs text-gray-500 ml-6">{valueLabel(v)}</div></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-56">
                      <Pill>Min {pesoShort(v.minBasket)}</Pill>
                      {v.firstOrderOnly && <Pill className="bg-purple-100 text-purple-800">First order</Pill>}
                      {v.fulfillment && <Pill className="bg-cyan-100 text-cyan-800 capitalize">{v.fulfillment} only</Pill>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-between text-xs mb-1"><span className="font-medium text-gray-700">{v.used.toLocaleString()} / {v.maxUses.toLocaleString()}</span><span className="text-gray-400">{pct.toFixed(0)}%</span></div>
                    <div className="h-1.5 rounded-full bg-gray-100"><div className={cn('h-1.5 rounded-full', pct >= 100 ? 'bg-gray-400' : pct > 80 ? 'bg-amber-500' : 'bg-[#1e40af]')} style={{ width: `${pct}%` }} /></div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">{fmtDate(v.start)}<br />→ {fmtDate(v.end)}</TableCell>
                  <TableCell><Pill className={st.cls}>{st.label}</Pill></TableCell>
                  <TableCell><Switch checked={v.active} onChange={() => toggle(v)} disabled={!canEdit} /></TableCell>
                  <TableCell className="pr-5 text-right">{canEdit && <Button variant="ghost" size="sm" onClick={() => setEditing(v)}><Pencil className="w-4 h-4" /> Edit</Button>}</TableCell>
                </TableRow>
              );
            })}
            {s.vouchers.length === 0 && <TableRow><TableCell colSpan={8}><EmptyState title="No vouchers yet" sub="Create your first voucher to start a promotion" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RedemptionReport s={s} />
        <CampaignComposer s={s} />
      </div>

      {editing && <VoucherDialog s={s} voucher={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </DashboardLayout>
  );
}

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch" aria-checked={checked} disabled={disabled} onClick={onChange}
      className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-[#1e40af]' : 'bg-gray-300')}
    >
      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

// ---------------------------------------------------------------- Redemption report
function RedemptionReport({ s }: { s: AppState }) {
  const sales = s.orders.filter(isSale);
  const avgBasket = avg(sales.map((o) => o.subtotal));
  const avgFee = avg(sales.filter((o) => o.fulfillment === 'delivery' && o.deliveryFee > 0).map((o) => o.deliveryFee)) || SAMPLE_FEE;
  const rows = s.vouchers.map((v) => {
    const orders = sales.filter((o) => o.voucherCode?.toUpperCase() === v.code.toUpperCase());
    const avgDisc = orders.length ? avg(orders.map((o) => o.discount)) : discountFor(v, Math.max(avgBasket, v.minBasket), avgFee);
    return { v, avgDisc, cost: v.used * avgDisc, revenue: orders.length ? avg(orders.map(netSales)) * v.used : Math.max(avgBasket, v.minBasket) * v.used, measured: orders.length > 0 };
  }).sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((a, r) => a + r.cost, 0);
  const csv = () => {
    exportCsv('voucher-redemptions.csv', [['Code', 'Type', 'Redemptions', 'Avg discount', 'Discount cost', 'Attributed sales'], ...rows.map((r) => [r.v.code, TYPE_LABEL[r.v.type], r.v.used, r.avgDisc.toFixed(2), r.cost.toFixed(2), r.revenue.toFixed(2)])]);
    toast.success('Redemption report exported');
  };
  return (
    <Panel title="Redemption report" action={<Button variant="outline" size="sm" onClick={csv}><Download className="w-4 h-4" /> CSV</Button>} bodyClass="p-0">
      <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-gray-100">
        <div><p className="text-xs text-gray-500">Total discount cost</p><p className="text-2xl font-bold text-[#dc2626]">{pesoShort(total)}</p></div>
        <div><p className="text-xs text-gray-500">Attributed sales</p><p className="text-2xl font-bold text-[#1e40af]">{pesoShort(rows.reduce((a, r) => a + r.revenue, 0))}</p></div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Code</TableHead>
            <TableHead className="text-right">Used</TableHead>
            <TableHead className="text-right">Avg discount</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right pr-5">ROI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.v.id}>
              <TableCell className="pl-5 font-mono font-medium">{r.v.code}</TableCell>
              <TableCell className="text-right">{r.v.used.toLocaleString()}</TableCell>
              <TableCell className="text-right">{peso(r.avgDisc)}{!r.measured && <span className="text-gray-400 text-xs"> est.</span>}</TableCell>
              <TableCell className="text-right font-semibold text-[#dc2626]">{pesoShort(r.cost)}</TableCell>
              <TableCell className="text-right pr-5 text-green-700 font-medium">{r.cost ? `${(r.revenue / r.cost).toFixed(1)}×` : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-gray-400 px-5 py-3 border-t border-gray-100">Cost ≈ redemptions × average discount. “est.” uses the average basket ({pesoShort(avgBasket)}) when no tracked orders used the code.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------- Campaign composer
type Channel = 'push' | 'sms' | 'email';
function useSegments(s: AppState) {
  return useMemo(() => {
    const spend = new Map<string, number>();
    const last = new Map<string, string>();
    for (const o of s.orders) {
      if (isSale(o)) spend.set(o.customerId, (spend.get(o.customerId) ?? 0) + netSales(o));
      if (!last.has(o.customerId) || o.placedAt > last.get(o.customerId)!) last.set(o.customerId, o.placedAt);
    }
    const active = s.customers.filter((c) => !c.blocked);
    const segs: { key: string; label: string; list: Customer[] }[] = [
      { key: 'all', label: 'All customers (not blocked)', list: active },
      { key: 'high', label: 'High spenders', list: active.filter((c) => c.group === 'High spenders' || (spend.get(c.id) ?? 0) >= 5000) },
      { key: 'inactive', label: 'Inactive 30 days', list: active.filter((c) => { const l = last.get(c.id); return !l || Date.now() - new Date(l).getTime() > 30 * DAY; }) },
      { key: 'inactive7', label: 'Inactive 7 days (churn risk)', list: active.filter((c) => { const l = last.get(c.id); return !l || Date.now() - new Date(l).getTime() > 7 * DAY; }) },
      ...s.cities.map((ct) => ({ key: `city:${ct.id}`, label: `City: ${ct.name}`, list: active.filter((c) => c.cityId === ct.id) })),
    ];
    return segs;
  }, [s]);
}

function CampaignComposer({ s }: { s: AppState }) {
  const segs = useSegments(s);
  const [segKey, setSegKey] = useState('high');
  const [channel, setChannel] = useState<Channel>('push');
  const [title, setTitle] = useState('Weekend fresh deals 🥬');
  const [msg, setMsg] = useState('Hi {name}! Get 10% off fresh produce this weekend with code FRESH10. Order now for same-day delivery.');
  const [sending, setSending] = useState(false);
  const seg = segs.find((x) => x.key === segKey) ?? segs[0];
  const sample = seg.list[0];
  const preview = (c?: Customer) => msg.replaceAll('{name}', c ? c.name.split(' ')[0] : 'Maria').replaceAll('{city}', c ? cityName(s, c.cityId) : 'Davao City');
  const canSend = can(s, 'promotions.create');
  const smsParts = Math.ceil(preview(sample).length / 160);

  const send = () => {
    if (!msg.trim()) { toast.error('Write a message first'); return; }
    if (!seg.list.length) { toast.error('This segment has no customers'); return; }
    setSending(true);
    setTimeout(() => {
      const campaignId = uid('cmp');
      mutate((d) => {
        for (const c of seg.list) {
          addNotification(d, { audience: 'shopper', targetId: c.id, title: channel === 'push' ? title : `${channel.toUpperCase()}: ${title}`, body: preview(c) });
        }
        addAudit(d, { module: 'Promotions', action: 'Campaign sent', detail: `${channel.toUpperCase()} “${title}” → ${seg.label} (${seg.list.length} customers) [${campaignId}]` });
      });
      setSending(false);
      toast.success(`Campaign sent to ${seg.list.length} customers`, { description: `${channel === 'push' ? 'Push notification' : channel === 'sms' ? 'SMS' : 'Email'} · ${seg.label}` });
    }, 700);
  };

  const CH: { k: Channel; label: string; icon: typeof Bell }[] = [{ k: 'push', label: 'Push', icon: Bell }, { k: 'sms', label: 'SMS', icon: MessageSquare }, { k: 'email', label: 'Email', icon: Mail }];

  return (
    <Panel title={<div className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-[#1e40af]" strokeWidth={1.75} /><h2 className="text-base font-semibold text-gray-900">Campaign composer</h2></div>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Segment</span>
            <select className={cn(selectClass, 'w-full mt-1')} value={segKey} onChange={(e) => setSegKey(e.target.value)}>
              {segs.map((x) => <option key={x.key} value={x.key}>{x.label} ({x.list.length})</option>)}
            </select>
          </label>
          <div><span className="text-xs font-medium text-gray-600">Channel</span>
            <div className="mt-1 inline-flex w-full rounded-lg border border-gray-200 p-0.5">
              {CH.map(({ k, label, icon: Icon }) => (
                <button key={k} onClick={() => setChannel(k)} className={cn('flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md font-medium', channel === k ? 'bg-[#1e40af] text-white' : 'text-gray-600 hover:bg-gray-50')}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {channel !== 'sms' && (
          <label className="block"><span className="text-xs font-medium text-gray-600">{channel === 'email' ? 'Subject' : 'Title'}</span>
            <input className={cn(inputClass, 'w-full mt-1')} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-gray-600 flex justify-between">Message <span className="text-gray-400 font-normal">Variables: {'{name}'} {'{city}'}</span></span>
          <textarea rows={3} className="w-full mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus-glow" value={msg} onChange={(e) => setMsg(e.target.value)} />
        </label>
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Preview for {sample?.name ?? 'sample customer'}</p>
          <div className="rounded-lg bg-white shadow-sm border border-gray-100 p-3 flex gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1e40af] text-white flex items-center justify-center text-sm font-bold shrink-0">FM</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{channel === 'sms' ? 'FreshMart' : title}</p>
              <p className="text-sm text-gray-600">{preview(sample)}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {seg.list.length} recipients{channel === 'sms' ? ` · ${smsParts} SMS part${smsParts > 1 ? 's' : ''} each · est. cost ${peso(seg.list.length * smsParts * 0.5)}` : ''}
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={send} disabled={!canSend || sending}><Send className="w-4 h-4" /> {sending ? 'Sending…' : `Send to ${seg.list.length}`}</Button>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- Create / edit dialog
function VoucherDialog({ s, voucher, onClose }: { s: AppState; voucher?: Voucher; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    code: voucher?.code ?? '',
    description: voucher?.description ?? '',
    type: voucher?.type ?? ('percent' as Voucher['type']),
    value: voucher?.value ?? 10,
    minBasket: voucher?.minBasket ?? 500,
    maxUses: voucher?.maxUses ?? 500,
    start: (voucher?.start ?? new Date().toISOString()).slice(0, 10),
    end: (voucher?.end ?? new Date(Date.now() + 14 * DAY).toISOString()).slice(0, 10),
    firstOrderOnly: voucher?.firstOrderOnly ?? false,
    fulfillment: voucher?.fulfillment ?? ('' as '' | 'delivery' | 'pickup'),
    active: voucher?.active ?? true,
  });
  const [basket, setBasket] = useState(Math.max(1200, f.minBasket));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const meets = basket >= f.minBasket;
  const disc = meets ? discountFor(f, basket) : 0;
  const fee = SAMPLE_FEE;
  const totalBefore = basket + fee;
  const totalAfter = totalBefore - disc;

  const save = () => {
    const code = f.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9]{3,20}$/.test(code)) { toast.error('Code must be 3–20 letters or numbers'); return; }
    if (s.vouchers.some((v) => v.code.toUpperCase() === code && v.id !== voucher?.id)) { toast.error('That code already exists'); return; }
    if (f.type !== 'free_delivery' && (!f.value || f.value <= 0)) { toast.error('Enter a discount value'); return; }
    if (f.type === 'percent' && f.value > 90) { toast.error('Percent discount cannot exceed 90%'); return; }
    if (f.end < f.start) { toast.error('End date must be after the start date'); return; }
    const data: Omit<Voucher, 'id' | 'used'> = {
      code, description: f.description.trim() || `${valueLabel(f)} on orders ${pesoShort(f.minBasket)}+`, type: f.type, value: f.type === 'free_delivery' ? 0 : Number(f.value),
      minBasket: Number(f.minBasket), maxUses: Number(f.maxUses), start: new Date(f.start).toISOString(), end: new Date(`${f.end}T23:59:59`).toISOString(),
      active: f.active, firstOrderOnly: f.firstOrderOnly || undefined, fulfillment: f.fulfillment || undefined,
    };
    mutate((d) => {
      if (voucher) {
        const x = d.vouchers.find((v) => v.id === voucher.id);
        if (!x) return;
        const old = `${valueLabel(x)}, min ${pesoShort(x.minBasket)}, max ${x.maxUses}`;
        Object.assign(x, data);
        if (!data.firstOrderOnly) delete x.firstOrderOnly;
        if (!data.fulfillment) delete x.fulfillment;
        addAudit(d, { module: 'Promotions', action: 'Voucher updated', detail: code, oldValue: old, newValue: `${valueLabel(x)}, min ${pesoShort(x.minBasket)}, max ${x.maxUses}` });
      } else {
        d.vouchers.unshift({ id: uid('v'), used: 0, ...data });
        addAudit(d, { module: 'Promotions', action: 'Voucher created', detail: `${code} — ${data.description}`, newValue: valueLabel(data) });
      }
    });
    toast.success(voucher ? `${code} updated` : `${code} created`);
    onClose();
  };

  const lbl = 'text-xs font-medium text-gray-600';
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{voucher ? `Edit ${voucher.code}` : 'New voucher'}</DialogTitle>
          <DialogDescription>Vouchers apply at checkout in the Shopper App and at the Order Desk.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={lbl}>Code</span><input className={cn(inputClass, 'w-full mt-1 font-mono uppercase')} placeholder="SUMMER20" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></label>
              <label className="block"><span className={lbl}>Type</span>
                <select className={cn(selectClass, 'w-full mt-1')} value={f.type} onChange={(e) => set('type', e.target.value as Voucher['type'])}>
                  <option value="percent">Percent off</option><option value="fixed">Fixed amount</option><option value="free_delivery">Free delivery</option>
                </select>
              </label>
            </div>
            <label className="block"><span className={lbl}>Description (shown to shoppers)</span><input className={cn(inputClass, 'w-full mt-1')} placeholder="10% off fresh produce" value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className={lbl}>{f.type === 'percent' ? 'Percent (%)' : 'Amount (₱)'}</span>
                <input type="number" min={0} disabled={f.type === 'free_delivery'} className={cn(inputClass, 'w-full mt-1 disabled:bg-gray-50')} value={f.type === 'free_delivery' ? '' : f.value} onChange={(e) => set('value', Number(e.target.value))} />
              </label>
              <label className="block"><span className={lbl}>Min basket (₱)</span><input type="number" min={0} className={cn(inputClass, 'w-full mt-1')} value={f.minBasket} onChange={(e) => set('minBasket', Number(e.target.value))} /></label>
              <label className="block"><span className={lbl}>Max uses</span><input type="number" min={1} className={cn(inputClass, 'w-full mt-1')} value={f.maxUses} onChange={(e) => set('maxUses', Number(e.target.value))} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className={lbl}>Start date</span><input type="date" className={cn(inputClass, 'w-full mt-1')} value={f.start} min={voucher ? undefined : today} onChange={(e) => set('start', e.target.value)} /></label>
              <label className="block"><span className={lbl}>End date</span><input type="date" className={cn(inputClass, 'w-full mt-1')} value={f.end} onChange={(e) => set('end', e.target.value)} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <label className="block"><span className={lbl}>Fulfillment restriction</span>
                <select className={cn(selectClass, 'w-full mt-1')} value={f.fulfillment} onChange={(e) => set('fulfillment', e.target.value as typeof f.fulfillment)}>
                  <option value="">Delivery & pickup</option><option value="delivery">Delivery only</option><option value="pickup">Pickup only</option>
                </select>
              </label>
              <div className="space-y-2 pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.firstOrderOnly} onChange={(e) => set('firstOrderOnly', e.target.checked)} className="accent-[#1e40af]" /> First order only</label>
                <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} className="accent-[#1e40af]" /> Active</label>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Promotion preview</p>
            <label className="block mt-3"><span className={lbl}>Example basket: {pesoShort(basket)}</span>
              <input type="range" min={100} max={5000} step={50} value={basket} onChange={(e) => setBasket(Number(e.target.value))} className="w-full accent-[#1e40af]" />
            </label>
            <div className="mt-3 rounded-lg bg-white border border-gray-100 p-3 text-sm space-y-1.5">
              <Row label="Subtotal" value={peso(basket)} />
              <Row label={f.fulfillment === 'pickup' ? 'Delivery fee (n/a)' : 'Delivery fee'} value={peso(f.fulfillment === 'pickup' ? 0 : fee)} />
              <Row label={<span className="font-mono">{f.code || 'CODE'}</span>} value={meets ? `− ${peso(f.type === 'free_delivery' && f.fulfillment === 'pickup' ? 0 : disc)}` : '—'} className={meets ? 'text-green-700' : 'text-gray-400'} />
              <div className="border-t border-gray-100 pt-1.5"><Row label={<span className="font-semibold">Total</span>} value={<span className="font-bold text-[#1e40af]">{peso(meets ? totalAfter : totalBefore)}</span>} /></div>
            </div>
            <p className={cn('text-xs mt-2', meets ? 'text-green-700' : 'text-amber-700')}>
              {meets ? `Shopper saves ${peso(disc)} (${((disc / totalBefore) * 100).toFixed(1)}%).` : `Basket below minimum ${pesoShort(f.minBasket)} — voucher will be rejected.`}
            </p>
            <p className="text-xs text-gray-500 mt-2">Max budget if fully redeemed ≈ <span className="font-semibold text-[#dc2626]">{pesoShort(discountFor(f, Math.max(f.minBasket, 1200)) * f.maxUses)}</span></p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{voucher ? 'Save changes' : 'Create voucher'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return <div className={cn('flex justify-between text-gray-600', className)}><span>{label}</span><span>{value}</span></div>;
}

