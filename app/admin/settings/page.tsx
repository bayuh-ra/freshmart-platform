'use client';

import { useEffect, useState } from 'react';
import { Globe2, Building2, Store, RotateCcw, CalendarClock, Search, Sparkles, CreditCard, Info } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Panel, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/shadcn/table';
import { Toggle } from '@/src/components/admin/ui';
import { addAudit, mutate, useStore } from '@/src/lib/store';
import { can, cityName, getSetting, settingSource } from '@/src/lib/logic';
import type { AppState, Setting, SettingValue } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

type ScopeKind = 'global' | 'city' | 'branch';
type Source = 'global' | 'city' | 'branch';

const PAY_METHODS = [
  { key: 'gcash', label: 'GCash' },
  { key: 'maya', label: 'Maya' },
  { key: 'card', label: 'Card' },
  { key: 'cod', label: 'Cash on delivery' },
  { key: 'pay_at_pickup', label: 'Pay at pickup' },
  { key: 'bank_qr', label: 'Bank / QR Ph' },
];

const fmt = (v: SettingValue | undefined, st?: Setting) => {
  if (v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (st?.unit === '₱') return `₱${Number(v).toLocaleString('en-PH')}`;
  return st?.unit ? `${v} ${st.unit}` : String(v);
};

/** Plain-language effect of a setting, shown as a live preview. */
function preview(key: string, v: SettingValue): string | null {
  switch (key) {
    case 'autoConfirmPaid': return v
      ? 'Orders paid by GCash, Maya or card skip the confirmation queue and go straight to Preparing. COD and pay-at-pickup orders still wait for a cashier.'
      : 'Every new order, even prepaid ones, lands in “Awaiting confirmation” and a cashier must accept it on the Order Desk.';
    case 'manualConfirmAll': return v ? 'Cashiers must confirm every order manually — auto-confirm is ignored.' : 'Auto-confirm rules apply as configured.';
    case 'confirmTimeoutMins': return `If nobody confirms an order within ${v} minutes, the timeout action runs.`;
    case 'timeoutAction': return `When an order is not confirmed in time: ${v}.`;
    case 'codLimit': return `Cash on delivery is hidden at checkout for baskets above ₱${Number(v).toLocaleString('en-PH')}.`;
    case 'minOrder': return `The shopper’s checkout button stays disabled until the basket reaches ₱${Number(v).toLocaleString('en-PH')}.`;
    case 'deliveryPaused': return v ? 'Shoppers can only choose pickup — delivery is shown as “temporarily unavailable”.' : 'Delivery is offered normally where zones cover the address.';
    case 'safetyBuffer': return `The app hides the last ${v} unit(s) of each item from online shoppers to avoid overselling to walk-ins.`;
    case 'refundApprovalAbove': return `Refunds above ₱${Number(v).toLocaleString('en-PH')} wait for a manager’s approval.`;
    case 'vatRate': return `Receipts compute VAT at ${v}%.`;
    case 'maxActiveOrders': return `A rider can carry at most ${v} order(s) at once.`;
    case 'peakSurcharge': return `Orders placed 5–7 PM pay ₱${v} extra delivery.`;
    case 'weightTolerancePct': return `At packing, an actual weight within ${v}% of what the customer ordered is applied automatically; a bigger difference asks the customer first.`;
    case 'meatMaxDeliveryMins': return `Fresh and frozen orders must reach the customer within ${v} minutes of rider pickup. The Rider App shows a countdown.`;
    case 'insulatedBagRequired': return v
      ? 'Packers must confirm the insulated bag + ice packs before a meat order is marked ready, and the rider confirms the bag at pickup.'
      : 'The insulated-bag check is optional on the Order Desk and Rider App.';
    default:
      if (key.startsWith('ff_')) return v ? 'Feature is switched on in every app — no app update needed.' : 'Feature is hidden in every app — no app update needed.';
      if (key.startsWith('pay_')) return v ? 'This payment method shows at checkout.' : 'This payment method is hidden at checkout.';
      return null;
  }
}

/** Display order of the setting groups (meat & cold-chain rules near the top). Unknown groups follow in data order. */
const GROUP_ORDER: Setting['group'][] = [
  'Order confirmation', 'Order rules', 'Meat & cold chain', 'Fulfillment', 'Delivery fees', 'Payments', 'Pricing & tax',
  'Inventory', 'Riders', 'Support', 'Feature flags', 'Security',
];

function valueAt(s: AppState, st: Setting, kind: ScopeKind, id: string): { value: SettingValue; source: Source; own: boolean } {
  if (kind === 'global') return { value: st.global, source: 'global', own: true };
  if (kind === 'city') {
    const v = st.city[id];
    return v !== undefined ? { value: v, source: 'city', own: true } : { value: st.global, source: 'global', own: false };
  }
  const source = settingSource(s, st.key, id);
  return { value: getSetting(s, st.key, id), source, own: source === 'branch' };
}

export default function SettingsPage() {
  const s = useStore();
  const [group, setGroup] = useState<string>('Order confirmation');
  const [kind, setKind] = useState<ScopeKind>('global');
  const [cityId, setCityId] = useState(s.cities[0]?.id ?? '');
  const [branchId, setBranchId] = useState(s.session.branchId);
  const [effective, setEffective] = useState('');
  const [q, setQ] = useState('');
  const [last, setLast] = useState<{ key: string; label: string; value: SettingValue } | null>(null);

  // Ensure payment-method settings exist (added at runtime; admin-controlled, global default on).
  const missingPay = PAY_METHODS.filter((m) => !s.settings.some((x) => x.key === `pay_${m.key}`)).length;
  useEffect(() => {
    if (!missingPay) return;
    mutate((d) => {
      for (const m of PAY_METHODS) {
        if (!d.settings.some((x) => x.key === `pay_${m.key}`)) {
          d.settings.push({ key: `pay_${m.key}`, label: `Accept ${m.label}`, group: 'Payments', type: 'boolean', help: 'Payment method available at checkout', global: true, city: {}, branch: {} });
        }
      }
    });
  }, [missingPay]);

  if (!can(s, 'settings.view')) {
    return <DashboardLayout title="Settings" eyebrow="Administration" hideBranch><AccessDenied permission="settings.view" /></DashboardLayout>;
  }
  const editable = can(s, 'settings.edit');
  const present = Array.from(new Set(s.settings.map((x) => x.group)));
  const groups = [...GROUP_ORDER.filter((g) => present.includes(g)), ...present.filter((g) => !GROUP_ORDER.includes(g))];
  const scopeId = kind === 'city' ? cityId : kind === 'branch' ? branchId : '';
  const scopeName = kind === 'global' ? 'Global default' : kind === 'city' ? cityName(s, cityId) : s.branches.find((b) => b.id === branchId)?.name ?? '—';
  const list = q
    ? s.settings.filter((x) => `${x.label} ${x.key} ${x.help ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    : s.settings.filter((x) => x.group === group);
  const futureDate = effective && new Date(effective) > new Date() ? effective : '';

  const change = (st: Setting, value: SettingValue) => {
    if (!editable) return toast.error('You need settings.edit to change settings');
    const before = valueAt(s, st, kind, scopeId).value;
    if (before === value) return;
    mutate((d) => {
      const x = d.settings.find((y) => y.key === st.key)!;
      if (kind === 'global') x.global = value;
      else if (kind === 'city') x.city[cityId] = value;
      else x.branch[branchId] = value;
      addAudit(d, {
        module: 'Settings', action: kind === 'global' ? 'Change setting' : `Override setting (${kind})`,
        detail: `${st.label} @ ${scopeName}${futureDate ? ` — scheduled for ${futureDate}` : ''}`,
        branchId: kind === 'branch' ? branchId : undefined,
        oldValue: fmt(before, st), newValue: fmt(value, st),
      });
    });
    setLast({ key: st.key, label: st.label, value });
    toast.success(futureDate ? `Scheduled for ${futureDate}` : 'Setting saved', { description: `${st.label} @ ${scopeName}: ${fmt(before, st)} → ${fmt(value, st)}` });
  };

  const reset = (st: Setting) => {
    if (!editable) return;
    const before = valueAt(s, st, kind, scopeId).value;
    mutate((d) => {
      const x = d.settings.find((y) => y.key === st.key)!;
      if (kind === 'city') delete x.city[cityId];
      else if (kind === 'branch') delete x.branch[branchId];
      addAudit(d, { module: 'Settings', action: 'Reset to inherited', detail: `${st.label} @ ${scopeName} now inherits`, branchId: kind === 'branch' ? branchId : undefined, oldValue: fmt(before, st), newValue: 'inherited' });
    });
    toast.success('Override removed', { description: `${st.label} now inherits from ${kind === 'branch' ? 'city / global' : 'global'}.` });
  };

  const overrideCount = (g: string) => s.settings.filter((x) => x.group === g && (Object.keys(x.city).length || Object.keys(x.branch).length)).length;

  return (
    <DashboardLayout title="Settings" eyebrow="Administration" hideBranch>
      <div className="space-y-5">
        {/* Scope selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Editing scope</p>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {([['global', 'Global', Globe2], ['city', 'City', Building2], ['branch', 'Branch', Store]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => setKind(k)}
                  className={cn('flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-colors', kind === k ? 'bg-white shadow-sm text-[#c8151d]' : 'text-gray-500 hover:text-gray-800')}>
                  <Icon className="w-4 h-4" strokeWidth={1.75} />{label}
                </button>
              ))}
            </div>
          </div>
          {kind === 'city' && (
            <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">City
              <select className={selectClass} value={cityId} onChange={(e) => setCityId(e.target.value)}>
                {s.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {kind === 'branch' && (
            <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">Branch
              <select className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {s.cities.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {s.branches.filter((b) => b.cityId === c.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
            <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" strokeWidth={1.75} />Effective date (optional)</span>
            <input type="date" className={inputClass} value={effective} onChange={(e) => setEffective(e.target.value)} />
          </label>
          <div className="relative w-full sm:w-auto sm:ml-auto">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" strokeWidth={1.75} />
            <input className={cn(inputClass, 'pl-8 w-full sm:w-64')} placeholder="Search all settings" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className="basis-full text-xs text-gray-500 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.75} />
            <span>
              Most specific value wins: <b>Branch override</b> → <b>City override</b> → <b>Global default</b>. You are editing <b className="text-[#c8151d]">{scopeName}</b>{kind !== 'global' && ' — changes here create an override for this scope only'}.
              {futureDate && <span className="text-amber-700 font-medium"> Changes will be logged as scheduled for {futureDate}.</span>}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5 items-start">
          {/* Groups */}
          {/* Phones/tablets: a horizontal scroll strip. lg+: the vertical list. */}
          <nav className="bg-white rounded-xl shadow-sm border border-gray-100 p-2 lg:sticky lg:top-20 flex gap-1 overflow-x-auto lg:block min-w-0">
            {groups.map((g) => {
              const n = overrideCount(g);
              return (
                <button key={g} onClick={() => { setGroup(g); setQ(''); }}
                  className={cn('shrink-0 lg:w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between gap-2 whitespace-nowrap transition-colors', !q && group === g ? 'bg-[#c8151d]/10 text-[#c8151d] font-medium' : 'text-gray-700 hover:bg-gray-50')}>
                  <span>{g}</span>
                  <span className="text-[10px] text-gray-400">{s.settings.filter((x) => x.group === g).length}{n ? ` · ${n}↓` : ''}</span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-5 min-w-0">
            {last && preview(last.key, last.value) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                <div><b>Live preview — {last.label}:</b> {preview(last.key, last.value)} <span className="text-emerald-700">Applies to new orders in all apps instantly.</span></div>
              </div>
            )}

            <Panel title={q ? `Search results (${list.length})` : group} bodyClass="p-0">
              <ul className="divide-y divide-gray-100">
                {list.map((st) => {
                  const r = valueAt(s, st, kind, scopeId);
                  const canReset = kind !== 'global' && r.own;
                  const pv = preview(st.key, r.value);
                  return (
                    <li key={st.key} className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 sm:gap-4">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 text-sm">{st.label}</p>
                          <SourceBadge source={r.source} />
                          {q && <span className="text-[10px] text-gray-400">{st.group}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{st.help ?? pv ?? <code className="text-gray-400">{st.key}</code>}</p>
                        {kind === 'global' && (Object.keys(st.city).length > 0 || Object.keys(st.branch).length > 0) && (
                          <p className="text-[11px] text-amber-700 mt-1">
                            Overridden in: {[...Object.keys(st.city).map((id) => `${cityName(s, id)} (${fmt(st.city[id], st)})`), ...Object.keys(st.branch).map((id) => `${s.branches.find((b) => b.id === id)?.name ?? id} (${fmt(st.branch[id], st)})`)].join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 max-w-full">
                        <Editor st={st} value={r.value} disabled={!editable} onChange={(v) => change(st, v)} />
                        {canReset ? (
                          <Button size="sm" variant="ghost" disabled={!editable} onClick={() => reset(st)} title="Remove this override"><RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />Reset to inherited</Button>
                        ) : <span className="hidden sm:block w-[148px]" />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {(group === 'Payments' || q.toLowerCase().includes('pay')) && <PaymentsMatrix editable={editable} />}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SourceBadge({ source }: { source: Source }) {
  const map = {
    global: ['Global', 'bg-gray-100 text-gray-600'],
    city: ['City override', 'bg-purple-100 text-purple-800'],
    branch: ['Branch override', 'bg-amber-100 text-amber-800'],
  } as const;
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', map[source][1])}>{map[source][0]}</span>;
}

function Editor({ st, value, disabled, onChange }: { st: Setting; value: SettingValue; disabled: boolean; onChange: (v: SettingValue) => void }) {
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) { setSynced(value); setText(String(value)); }
  if (st.type === 'boolean') return <Toggle checked={!!value} disabled={disabled} onChange={onChange} label={st.label} />;
  if (st.type === 'select') {
    return (
      <select className={cn(selectClass, 'w-56 max-w-full')} disabled={disabled} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {(st.options ?? []).map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  const commit = () => {
    if (st.type === 'number') {
      const n = Number(text);
      if (text.trim() === '' || Number.isNaN(n)) { setText(String(value)); return toast.error('Enter a number'); }
      onChange(n);
    } else onChange(text);
  };
  return (
    <div className="flex items-center gap-1.5">
      {st.unit === '₱' && <span className="text-sm text-gray-500">₱</span>}
      <input className={cn(inputClass, st.type === 'number' ? 'w-24 text-right' : 'w-56 max-w-full')} disabled={disabled} value={text}
        type={st.type === 'number' ? 'number' : 'text'}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {st.unit && st.unit !== '₱' && <span className="text-xs text-gray-500 w-10">{st.unit}</span>}
    </div>
  );
}

function PaymentsMatrix({ editable }: { editable: boolean }) {
  const s = useStore();
  const toggle = (branchId: string, method: { key: string; label: string }) => {
    if (!editable) return toast.error('You need settings.edit to change settings');
    const key = `pay_${method.key}`;
    const cur = getSetting(s, key, branchId) !== false;
    const next = !cur;
    const b = s.branches.find((x) => x.id === branchId)!;
    mutate((d) => {
      const st = d.settings.find((x) => x.key === key);
      if (!st) return;
      const inherited = st.city[b.cityId] !== undefined ? st.city[b.cityId] : st.global;
      if (inherited === next) delete st.branch[branchId];
      else st.branch[branchId] = next;
      addAudit(d, { module: 'Settings', action: 'Payment method', detail: `${method.label} ${next ? 'enabled' : 'disabled'} at ${b.name}`, branchId, oldValue: cur ? 'On' : 'Off', newValue: next ? 'On' : 'Off' });
    });
    toast.success(`${method.label} ${next ? 'enabled' : 'disabled'} at ${b.name}`, { description: 'Checkout updates instantly in the Customer App.' });
  };
  return (
    <Panel title={<h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />Payment methods per branch</h2>} bodyClass="p-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5">Branch</TableHead>
            {PAY_METHODS.map((m) => <TableHead key={m.key} className="text-center">{m.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.branches.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="pl-5"><p className="font-medium text-gray-900">{b.name}</p><p className="text-xs text-gray-400">{cityName(s, b.cityId)}</p></TableCell>
              {PAY_METHODS.map((m) => {
                const key = `pay_${m.key}`;
                const on = getSetting(s, key, b.id) !== false;
                const overridden = settingSource(s, key, b.id) === 'branch';
                return (
                  <TableCell key={m.key} className="text-center">
                    <div className="inline-flex items-center gap-1">
                      <Checkbox checked={on} disabled={!editable} onCheckedChange={() => toggle(b.id, m)} aria-label={`${m.label} at ${b.name}`} />
                      {overridden && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Branch override" />}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">Orange dot = branch override. COD limit and gateway fee are configured above.</p>
    </Panel>
  );
}
