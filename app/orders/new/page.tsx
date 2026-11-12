'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Barcode, CheckCircle2, MapPin, Minus, Phone, Plus, Search, ShoppingCart, Store, Trash2, User, UserPlus, X,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, EmptyState, Panel, Pill, inputClass, selectClass } from '@/src/components/common';
import { Button } from '@/src/components/ui/shadcn/button';
import { Checkbox } from '@/src/components/ui/shadcn/checkbox';
import { addAudit, currentUserName, mutate, uid, useStore } from '@/src/lib/store';
import {
  applyStatus, available, calcDeliveryFee, can, getPrice, getSetting, num, peso, placeOrder,
} from '@/src/lib/logic';
import type { Address, Customer, PaymentMethod, Product, SubstitutionPref } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';

const ICON = { strokeWidth: 1.75 };
type Channel = 'walk_in' | 'phone';
type PayChoice = 'cash' | 'gcash' | 'card' | 'cod' | 'link';
interface Line { productId: string; qty: number; note: string; subPref: SubstitutionPref; override?: number }

const SLOTS = ['ASAP', 'Today 12:00–1:00 PM', 'Today 2:00–3:00 PM', 'Today 4:00–5:00 PM', 'Today 6:00–7:00 PM', 'Tomorrow 9:00–10:00 AM'];

export default function NewOrderPage() {
  const s = useStore();
  const router = useRouter();
  const branchId = s.session.branchId;
  const branch = s.branches.find((b) => b.id === branchId);

  const [channel, setChannel] = useState<Channel>('walk_in');
  const [custQ, setCustQ] = useState('');
  const [customerId, setCustomerId] = useState<string>('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [qaName, setQaName] = useState('');
  const [qaMobile, setQaMobile] = useState('');
  const [prodQ, setProdQ] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [addrIdx, setAddrIdx] = useState<string>('new');
  const [addrText, setAddrText] = useState('');
  const [landmark, setLandmark] = useState('');
  const [slot, setSlot] = useState('ASAP');
  const [pay, setPay] = useState<PayChoice>('cash');
  const [discount, setDiscount] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [confirmNow, setConfirmNow] = useState(true);
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const customer = s.customers.find((c) => c.id === customerId);
  const canApprove = can(s, 'orders.approve');

  const custResults = useMemo(() => {
    const t = custQ.trim().toLowerCase();
    if (!t) return [] as Customer[];
    const digits = t.replace(/\D/g, '');
    return s.customers.filter((c) => c.name.toLowerCase().includes(t) || (digits.length >= 3 && c.mobile.replace(/\D/g, '').includes(digits))).slice(0, 6);
  }, [custQ, s.customers]);

  const prodResults = useMemo(() => {
    const t = prodQ.trim().toLowerCase();
    if (!t) return [] as Product[];
    return s.products.filter((p) => p.status === 'active' && (p.name.toLowerCase().includes(t) || p.brand.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || p.barcode.includes(t))).slice(0, 8);
  }, [prodQ, s.products]);

  if (!can(s, 'orders.create')) {
    return <DashboardLayout title="New Order" eyebrow="Order Desk"><AccessDenied permission="orders.create" /></DashboardLayout>;
  }
  if (!branch) return <DashboardLayout title="New Order" eyebrow="Order Desk"><EmptyState title="Select a branch" /></DashboardLayout>;

  const price = (pid: string) => getPrice(s, pid, branchId, channel);
  const productOf = (pid: string) => s.products.find((p) => p.id === pid);
  const lineAmount = (l: Line) => {
    const p = productOf(l.productId);
    const unit = l.override ?? price(l.productId);
    return p?.soldByWeight ? Math.round(unit * l.qty * (p.estWeightKg ?? 1) * 100) / 100 : unit * l.qty;
  };
  const subtotal = Math.round(lines.reduce((t, l) => t + lineAmount(l), 0) * 100) / 100;

  const addressObj: Address | undefined = fulfillment === 'delivery'
    ? (addrIdx !== 'new' && customer?.addresses[Number(addrIdx)]) || (addrText.trim() ? { label: 'Other', line: addrText.trim(), landmark: landmark.trim() || undefined, lat: branch.lat + 0.012, lng: branch.lng + 0.008 } : undefined)
    : undefined;
  const fee = fulfillment === 'delivery' && addressObj ? calcDeliveryFee(s, branchId, subtotal, addressObj) : undefined;
  const method: PaymentMethod = pay === 'link' ? 'gcash' : pay === 'cod' ? (fulfillment === 'pickup' ? 'pay_at_pickup' : 'cod') : pay;
  const gatewayFee = ['gcash', 'card'].includes(method) ? Math.round((subtotal * num(getSetting(s, 'gatewayFeePct', branchId))) / 100) : 0;
  const pickupDisc = fulfillment === 'pickup' ? Math.round((subtotal * num(getSetting(s, 'pickupDiscountPct', branchId))) / 100) : 0;
  const manualDisc = canApprove ? Math.max(0, Number(discount) || 0) : 0;
  const total = Math.max(0, subtotal + (fee?.fee ?? 0) + gatewayFee - manualDisc - pickupDisc);
  const minOrder = num(getSetting(s, 'minOrder', branchId));
  const codLimit = num(getSetting(s, 'codLimit', branchId));
  const hasOverride = lines.some((l) => l.override !== undefined) || manualDisc > 0;

  const problems: string[] = [];
  if (!customer) problems.push('Choose or add a customer');
  if (!lines.length) problems.push('Add at least one item');
  if (fulfillment === 'delivery' && !addressObj) problems.push('Enter a delivery address');
  if (fee?.outside) problems.push('Address is outside the delivery zones');
  if (method === 'cod' && total > codLimit) problems.push(`COD limit is ${peso(codLimit)}`);
  if (hasOverride && !overrideReason.trim()) problems.push('Give a reason for the discount / price override');
  if (customer?.blocked) problems.push(`Customer is blocked: ${customer.blockReason ?? ''}`);

  const addProduct = (p: Product) => {
    const avail = available(s, p.id, branchId);
    setLines((cur) => {
      const ex = cur.find((l) => l.productId === p.id);
      if (ex) return cur.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...cur, { productId: p.id, qty: 1, note: '', subPref: 'similar' }];
    });
    if (avail <= 0) toast.warning(`${p.name} shows 0 available`, { description: 'Check the shelf before confirming' });
    else toast.success(`Added ${p.name}`);
  };
  const scan = () => {
    const code = barcode.trim();
    if (!code) return;
    const p = s.products.find((x) => x.barcode === code || x.sku.toLowerCase() === code.toLowerCase());
    if (!p) { toast.error('No product with that barcode'); return; }
    addProduct(p);
    setBarcode('');
  };
  const updateLine = (pid: string, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.productId === pid ? { ...l, ...patch } : l)));

  const quickAdd = () => {
    const name = qaName.trim();
    const mobile = qaMobile.trim();
    if (name.length < 2 || mobile.replace(/\D/g, '').length < 10) { toast.error('Enter a name and an 11-digit mobile number'); return; }
    const dup = s.customers.find((c) => c.mobile.replace(/\D/g, '') === mobile.replace(/\D/g, ''));
    if (dup) { setCustomerId(dup.id); setQuickOpen(false); toast.info(`Mobile already belongs to ${dup.name} — selected`); return; }
    const id = uid('cu');
    mutate((d) => {
      d.customers.push({ id, name, mobile, email: '', cityId: branch.cityId, addresses: [], createdAt: new Date().toISOString(), blocked: false, storeCredit: 0, points: 0, source: channel });
      addAudit(d, { module: 'Customers', action: 'Quick customer added', detail: `${name} (${mobile}) via ${channel === 'phone' ? 'phone' : 'walk-in'} order`, branchId });
    });
    setCustomerId(id);
    setQuickOpen(false);
    setQaName(''); setQaMobile('');
    toast.success(`Customer ${name} added`);
  };

  const submit = () => {
    if (problems.length || !customer) { toast.error(problems[0]); return; }
    setSubmitting(true);
    const by = currentUserName();
    const id = placeOrder({
      branchId, customerId: customer.id, channel, fulfillment, address: addressObj, slot,
      lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note || undefined, subPref: l.subPref, priceOverride: l.override })),
      paymentMethod: method, riderInstructions: fulfillment === 'delivery' && instructions.trim() ? instructions.trim() : undefined,
      by, discountOverride: manualDisc || undefined,
    });
    let number = '';
    mutate((d) => {
      const o = d.orders.find((x) => x.id === id);
      if (!o) return;
      number = o.number;
      const now = new Date().toISOString();
      if (pay === 'link') {
        o.paymentStatus = 'pending';
        if (o.autoConfirmed) {
          o.autoConfirmed = false;
          o.status = 'awaiting_confirmation';
          o.timeline = o.timeline.filter((e) => e.status === 'placed');
        }
        o.timeline.push({ status: 'payment', at: now, by, note: `Payment link sent by SMS to ${o.customerMobile} (expires in ${num(getSetting(d, 'paymentLinkExpiryMins', branchId))} min)` });
      }
      if (pay === 'card' || pay === 'gcash') o.timeline.push({ status: 'payment', at: now, by, note: `${pay === 'card' ? 'Card' : 'GCash'} ${peso(o.total)} paid at counter` });
      if (pay === 'cash') o.timeline.push({ status: 'payment', at: now, by, note: `Cash ${peso(o.total)} received at counter` });
      if (confirmNow && (o.status === 'awaiting_confirmation' || o.status === 'placed')) {
        applyStatus(d, id, 'confirmed', { by, note: 'Confirmed at the counter' });
        applyStatus(d, id, 'preparing', { by });
      }
      o.acknowledged = true;
      addAudit(d, { module: 'Orders', action: `${channel === 'phone' ? 'Phone' : 'Walk-in'} order created`, detail: `${o.number} · ${o.customerName} · ${peso(o.total)} · ${fulfillment}`, branchId });
      if (hasOverride) {
        const ov = lines.filter((l) => l.override !== undefined).map((l) => `${productOf(l.productId)?.name}: ${peso(price(l.productId))} → ${peso(l.override!)}`);
        addAudit(d, { module: 'Pricing', action: 'Price override / discount', detail: `${o.number} — ${[...ov, manualDisc ? `discount ${peso(manualDisc)}` : ''].filter(Boolean).join('; ')} — reason: ${overrideReason.trim()}`, branchId });
        o.timeline.push({ status: 'edit', at: now, by, note: `Override approved by ${by}: ${overrideReason.trim()}` });
      }
    });
    toast.success(`Order ${number} created`, { description: `${peso(total)} · ${fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}` });
    if (pay === 'link') toast.info('Payment link sent by SMS', { description: `${customer.mobile} · GCash / Maya / card` });
    if (channel === 'phone') toast.info('SMS tracking link sent', { description: `freshmart.ph/t/${number} → ${customer.mobile}` });
    router.push(`/orders/${id}`);
  };

  const payOptions: { v: PayChoice; label: string; sub: string }[] = [
    { v: 'cash', label: 'Cash', sub: 'Paid now at counter' },
    { v: 'gcash', label: 'GCash / e-wallet', sub: 'Scan QR at counter' },
    { v: 'card', label: 'Card at counter', sub: 'Terminal payment' },
    { v: 'cod', label: fulfillment === 'pickup' ? 'Pay at pickup' : 'Cash on delivery', sub: fulfillment === 'pickup' ? 'Collected at handover' : `Limit ${peso(codLimit)}` },
    { v: 'link', label: 'Send payment link', sub: 'SMS link to shopper' },
  ];

  return (
    <DashboardLayout title="New Walk-in / Phone Order" eyebrow="Order Desk">
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1e40af] mb-3"><ArrowLeft className="w-4 h-4" {...ICON} />Live orders</Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-5 min-w-0">
          {/* Channel */}
          <Panel title="1. Channel" action={<span className="text-xs text-gray-500 flex items-center gap-1"><Store className="w-3.5 h-3.5" {...ICON} />{branch.name}</span>}>
            <div className="grid grid-cols-2 gap-3">
              {([['walk_in', 'Walk-in', 'Customer is at the counter', Store], ['phone', 'Phone order', 'Customer called the branch', Phone]] as const).map(([v, label, sub, Icon]) => (
                <button key={v} onClick={() => setChannel(v)} disabled={v === 'phone' ? !branch.services.phone : !branch.services.walkIn}
                  className={cn('flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-40', channel === v ? 'border-[#1e40af] bg-blue-50' : 'border-gray-200 hover:border-gray-300')}>
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', channel === v ? 'bg-[#1e40af] text-white' : 'bg-gray-100 text-gray-500')}><Icon className="w-5 h-5" {...ICON} /></div>
                  <div><p className="font-semibold text-gray-900">{label}</p><p className="text-xs text-gray-500">{sub}</p></div>
                </button>
              ))}
            </div>
          </Panel>

          {/* Customer */}
          <Panel title="2. Customer" action={!quickOpen && <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)}><UserPlus className="w-4 h-4" {...ICON} />Quick add</Button>}>
            {customer ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[#1e40af]/20 bg-blue-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1e40af] text-white flex items-center justify-center"><User className="w-5 h-5" {...ICON} /></div>
                  <div>
                    <p className="font-semibold text-gray-900">{customer.name} {customer.blocked && <Pill className="bg-red-100 text-red-700 ml-1">Blocked</Pill>}</p>
                    <p className="text-sm text-gray-500">{customer.mobile} · {customer.addresses.length} saved address{customer.addresses.length !== 1 ? 'es' : ''} · {s.orders.filter((o) => o.customerId === customer.id).length} orders</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setCustomerId(''); setAddrIdx('new'); }}><X className="w-4 h-4" {...ICON} />Change</Button>
              </div>
            ) : quickOpen ? (
              <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2">
                <input autoFocus value={qaName} onChange={(e) => setQaName(e.target.value)} placeholder="Full name" className={inputClass} />
                <input value={qaMobile} onChange={(e) => setQaMobile(e.target.value)} placeholder="Mobile (0917 123 4567)" className={inputClass} onKeyDown={(e) => e.key === 'Enter' && quickAdd()} />
                <Button onClick={quickAdd}>Add customer</Button>
                <Button variant="ghost" onClick={() => setQuickOpen(false)}>Cancel</Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" {...ICON} />
                  <input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Search by name or mobile number" className={cn(inputClass, 'pl-8 w-full')} />
                </div>
                {custQ.trim() && (
                  <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {custResults.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-500 flex items-center justify-between">No customer found.
                        <Button size="sm" variant="outline" onClick={() => { setQuickOpen(true); if (/\d/.test(custQ)) setQaMobile(custQ); else setQaName(custQ); }}><UserPlus className="w-4 h-4" {...ICON} />Add “{custQ}”</Button>
                      </div>
                    )}
                    {custResults.map((c) => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustQ(''); setAddrIdx(c.addresses.length ? '0' : 'new'); }} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50">
                        <span><span className="font-medium text-gray-900">{c.name}</span><span className="text-sm text-gray-500 ml-2">{c.mobile}</span></span>
                        <span className="text-xs text-gray-400 capitalize">{c.source.replace('_', '-')}{c.blocked ? ' · blocked' : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* Items */}
          <Panel title="3. Items" action={<span className="text-xs text-gray-500">Prices from the {branch.name} price list · {channel === 'phone' ? 'Phone' : 'Walk-in'} channel</span>}>
            <div className="grid sm:grid-cols-[1fr_220px] gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" {...ICON} />
                <input value={prodQ} onChange={(e) => setProdQ(e.target.value)} placeholder="Search product name, brand or SKU" className={cn(inputClass, 'pl-8 w-full')} />
              </div>
              <div className="relative">
                <Barcode className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" {...ICON} />
                <input value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()} placeholder="Scan / type barcode ⏎" className={cn(inputClass, 'pl-8 w-full font-mono')} />
              </div>
            </div>
            {prodQ.trim() && (
              <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                {prodResults.length === 0 && <p className="px-3 py-3 text-sm text-gray-500">No products match “{prodQ}”.</p>}
                {prodResults.map((p) => {
                  const avail = available(s, p.id, branchId);
                  return (
                    <button key={p.id} onClick={() => addProduct(p)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                      <span className="text-2xl">{p.image}</span>
                      <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{p.name}</span><span className="block text-xs text-gray-500">{p.brand} · {p.size} · {p.barcode}</span></span>
                      <span className="text-right"><span className="block font-semibold text-gray-900">{peso(price(p.id))}{p.soldByWeight ? '/kg' : ''}</span><span className={cn('block text-xs', avail <= 0 ? 'text-[#dc2626]' : avail < 10 ? 'text-amber-700' : 'text-green-700')}>{avail} available</span></span>
                      <Plus className="w-4 h-4 text-[#1e40af]" {...ICON} />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              {lines.length === 0 ? <EmptyState title="No items yet" sub="Search or scan a barcode to add items." icon={<ShoppingCart className="w-8 h-8" {...ICON} />} /> : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {lines.map((l) => {
                    const p = productOf(l.productId);
                    if (!p) return null;
                    const listPrice = price(p.id);
                    const avail = available(s, p.id, branchId);
                    return (
                      <div key={l.productId} className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{p.image}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{p.name}</p>
                            <p className="text-xs text-gray-500">{peso(l.override ?? listPrice)}{p.soldByWeight ? `/kg · est. ${((p.estWeightKg ?? 1) * l.qty).toFixed(2)} kg` : ''} · {avail} available{l.override !== undefined && <span className="text-amber-700"> · list {peso(listPrice)}</span>}</p>
                          </div>
                          <div className="flex items-center rounded-lg border border-gray-300">
                            <button className="p-1.5 hover:bg-gray-50" onClick={() => updateLine(p.id, { qty: Math.max(1, l.qty - 1) })} aria-label="Decrease"><Minus className="w-3.5 h-3.5" {...ICON} /></button>
                            <input type="number" min={1} value={l.qty} onChange={(e) => updateLine(p.id, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="w-12 text-center text-sm outline-none" />
                            <button className="p-1.5 hover:bg-gray-50" onClick={() => updateLine(p.id, { qty: l.qty + 1 })} aria-label="Increase"><Plus className="w-3.5 h-3.5" {...ICON} /></button>
                          </div>
                          <p className="w-24 text-right font-semibold">{peso(lineAmount(l))}</p>
                          <button className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-[#dc2626]" onClick={() => setLines((cur) => cur.filter((x) => x.productId !== p.id))} aria-label="Remove"><Trash2 className="w-4 h-4" {...ICON} /></button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
                          <input value={l.note} onChange={(e) => updateLine(p.id, { note: e.target.value })} placeholder="Note (e.g. ripe, thin slices)" className={cn(inputClass, 'h-8 text-xs flex-1 min-w-[160px]')} />
                          <select value={l.subPref} onChange={(e) => updateLine(p.id, { subPref: e.target.value as SubstitutionPref })} className={cn(selectClass, 'h-8 text-xs')}>
                            <option value="similar">Replace with similar</option><option value="ask">Ask me first</option><option value="refund">Don&apos;t replace</option>
                          </select>
                          {canApprove && (l.override === undefined ? (
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => updateLine(p.id, { override: listPrice })}>Override price</Button>
                          ) : (
                            <span className="flex items-center gap-1">
                              <input type="number" min={0} step="0.25" value={l.override} onChange={(e) => updateLine(p.id, { override: Math.max(0, Number(e.target.value) || 0) })} className={cn(inputClass, 'h-8 w-24 text-xs border-amber-300')} />
                              <button className="text-xs text-gray-500 hover:underline" onClick={() => updateLine(p.id, { override: undefined })}>reset</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Right column */}
        <div className="space-y-5 lg:sticky lg:top-20">
          <Panel title="4. Fulfillment">
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(['pickup', 'delivery'] as const).map((f) => (
                <button key={f} disabled={f === 'delivery' ? !branch.services.delivery : !branch.services.pickup} onClick={() => setFulfillment(f)}
                  className={cn('rounded-lg border px-3 py-2 text-sm font-medium capitalize disabled:opacity-40', fulfillment === f ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]' : 'border-gray-200 text-gray-600')}>{f}</button>
              ))}
            </div>
            {fulfillment === 'delivery' && (
              <div className="space-y-2">
                {customer && customer.addresses.length > 0 && (
                  <select value={addrIdx} onChange={(e) => setAddrIdx(e.target.value)} className={cn(selectClass, 'w-full')}>
                    {customer.addresses.map((a, i) => <option key={i} value={String(i)}>{a.label}: {a.line}</option>)}
                    <option value="new">New address…</option>
                  </select>
                )}
                {(addrIdx === 'new' || !customer?.addresses.length) && (
                  <>
                    <input value={addrText} onChange={(e) => setAddrText(e.target.value)} placeholder="House no., street, barangay, city" className={cn(inputClass, 'w-full')} />
                    <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Landmark (optional)" className={cn(inputClass, 'w-full')} />
                  </>
                )}
                <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Rider instructions (optional)" className={cn(inputClass, 'w-full')} />
                {fee && (
                  <p className={cn('text-xs rounded-lg px-3 py-2 flex items-start gap-1.5', fee.outside ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600')}>
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" {...ICON} />{fee.outside ? `Outside delivery zones (${fee.distance} km)` : `${fee.distance} km · ${fee.rule}`}
                  </p>
                )}
              </div>
            )}
            {fulfillment === 'pickup' && <p className="text-xs text-gray-500">{branch.pickupInstructions}</p>}
            <label className="block mt-3 text-xs text-gray-500">Time slot
              <select value={slot} onChange={(e) => setSlot(e.target.value)} className={cn(selectClass, 'w-full mt-1')}>{SLOTS.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
          </Panel>

          <Panel title="5. Payment">
            <div className="space-y-1.5">
              {payOptions.map((o) => (
                <label key={o.v} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer', pay === o.v ? 'border-[#1e40af] bg-blue-50' : 'border-gray-200 hover:bg-gray-50')}>
                  <input type="radio" name="pay" checked={pay === o.v} onChange={() => setPay(o.v)} className="accent-[#1e40af]" />
                  <span className="flex-1"><span className="block text-sm font-medium text-gray-900">{o.label}</span><span className="block text-[11px] text-gray-500">{o.sub}</span></span>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Summary">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Subtotal ({lines.length} line{lines.length !== 1 ? 's' : ''})</dt><dd className="font-medium">{peso(subtotal)}</dd></div>
              {fulfillment === 'delivery' && <div className="flex justify-between"><dt className="text-gray-500">Delivery fee</dt><dd className="font-medium">{peso(fee?.fee ?? 0)}</dd></div>}
              {gatewayFee > 0 && <div className="flex justify-between"><dt className="text-gray-500">Service fee ({String(getSetting(s, 'gatewayFeePct', branchId))}%)</dt><dd className="font-medium">{peso(gatewayFee)}</dd></div>}
              {pickupDisc > 0 && <div className="flex justify-between text-green-700"><dt>Pickup discount</dt><dd>−{peso(pickupDisc)}</dd></div>}
              {canApprove && (
                <div className="flex items-center justify-between gap-2"><dt className="text-gray-500">Discount (₱)</dt>
                  <dd><input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className={cn(inputClass, 'h-8 w-24 text-right')} /></dd></div>
              )}
              {hasOverride && (
                <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Reason for discount / override (logged)" className={cn(inputClass, 'w-full border-amber-300')} />
              )}
              <div className="flex justify-between border-t border-gray-100 pt-2 mt-2 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold text-[#1e40af]">{peso(total)}</dd></div>
            </dl>
            {subtotal > 0 && subtotal < minOrder && <p className="mt-2 text-xs text-amber-700">Below the {peso(minOrder)} online minimum — allowed for counter orders.</p>}
            {!canApprove && <p className="mt-2 text-[11px] text-gray-400">Discounts and price overrides need the orders.approve permission.</p>}
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <Checkbox checked={confirmNow} onCheckedChange={(v) => setConfirmNow(!!v)} />Confirm now and send to picking
            </label>
            {problems.length > 0 && lines.length > 0 && <p className="mt-2 text-xs text-[#dc2626]">{problems[0]}</p>}
            <Button className="w-full mt-3 h-10" disabled={submitting || problems.length > 0} onClick={submit}>
              <CheckCircle2 className="w-4 h-4" {...ICON} />Place {channel === 'phone' ? 'phone' : 'walk-in'} order · {peso(total)}
            </Button>
          </Panel>
        </div>
      </div>
    </DashboardLayout>
  );
}
