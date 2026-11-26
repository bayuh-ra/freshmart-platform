'use client';

// Counter: staff ticket screen for walk-in and phone orders, inside the staff layout.
// Gated by the Platform Owner "walkin" module (ClientGate) and by the branch's Walk-in / Phone services.

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Barcode, Bike, ChevronUp, Clock, Hand, MapPin, Phone, Plus, ReceiptText, Search, Store, User, X,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied } from '@/src/components/common';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/src/components/ui/shadcn/sheet';
import { addAudit, currentUserName, mutate, useStore } from '@/src/lib/store';
import {
  applyStatus, available, calcDeliveryFee, can, getPrice, getSetting, num, peso, placeOrder,
} from '@/src/lib/logic';
import type { Address, PaymentMethod, Product } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { ICON, OSWALD } from '../../catalog/_ui';
import {
  AddressDialog, ClearDialog, CustomerDialog, DiscountDialog, DoneDialog, GUEST_ID, PayDialog, QtyDialog, Thumb,
  cutLabel, discountAmount, initialsOf, lineAmount, money, priceSuffix, qtyLabel, round2, unitWord, fmtNum,
  type CustomerPick, type Discount, type PayResult, type TicketLine,
} from './_parts';

type Channel = 'walk_in' | 'phone';
type Fx = 'now' | 'pickup' | 'delivery';
const SLOTS = ['ASAP', 'Today 12:00–1:00 PM', 'Today 2:00–3:00 PM', 'Today 4:00–5:00 PM', 'Today 6:00–7:00 PM', 'Tomorrow 9:00–10:00 AM'];

// ---------- small browser hooks ----------
function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

export default function CounterPage() {
  const s = useStore();
  const branch = s.branches.find((b) => b.id === s.session.branchId);
  const ticket = branch ? `${branch.code}-${s.counters.order + 1}` : '';
  return (
    <DashboardLayout title={ticket ? `Counter · Ticket ${ticket}` : 'Counter'} eyebrow="Orders" bare>
      {/* Fills the screen below the staff top bar (56px phones, 64px md+). */}
      <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] flex flex-col bg-[#f5f1ec] text-[#2a2322] overflow-hidden">
        {!can(s, 'orders.create') ? (
          <div className="p-4 sm:p-8 overflow-y-auto"><AccessDenied permission="orders.create" /></div>
        ) : !branch ? (
          <p className="p-8 text-center text-[#5c5250]">Select a branch first.</p>
        ) : (
          <Counter key={branch.id} />
        )}
      </div>
    </DashboardLayout>
  );
}

function Counter() {
  const s = useStore();
  const router = useRouter();
  const wide = useMedia('(min-width: 1024px)');
  const branchId = s.session.branchId;
  const branch = s.branches.find((b) => b.id === branchId)!;

  const modes: Channel[] = [...(branch.services.walkIn ? ['walk_in' as const] : []), ...(branch.services.phone ? ['phone' as const] : [])];
  const [chosen, setChosen] = useState<Channel>('walk_in');
  const channel: Channel = modes.includes(chosen) ? chosen : modes[0] ?? 'walk_in';

  const [q, setQ] = useState('');
  const [sku, setSku] = useState('');
  const [cat, setCat] = useState<string>('best');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState<CustomerPick | null>(null);
  const [fxRaw, setFx] = useState<Fx>('now');
  const [slot, setSlot] = useState('ASAP');
  const [address, setAddress] = useState<Address | undefined>();
  const [instructions, setInstructions] = useState('');
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [dialog, setDialog] = useState<'customer' | 'address' | 'discount' | 'pay' | 'clear' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [done, setDone] = useState<{ id: string; number: string; total: number; change?: number; handOver: boolean; phone: boolean } | null>(null);

  // Phone orders have no "hand over now"; fall back to pickup.
  const fx: Fx = channel === 'phone' && fxRaw === 'now' ? 'pickup' : fxRaw;
  const fulfillment = fx === 'delivery' ? 'delivery' : 'pickup';

  // ---------- catalog data ----------
  const products = useMemo(() => s.products.filter((p) => p.status === 'active'), [s.products]);
  const topCats = useMemo(() => s.categories.filter((c) => !c.parentId).sort((a, b) => a.sort - b.sort), [s.categories]);
  const catOf = useMemo(() => new Map(s.categories.map((c) => [c.id, c])), [s.categories]);
  const avail = useMemo(() => new Map(products.map((p) => [p.id, available(s, p.id, branchId)])), [s, products, branchId]);
  const bestSellers = useMemo(() => {
    const count = new Map<string, number>();
    for (const o of s.orders) if (o.branchId === branchId) for (const i of o.items) count.set(i.productId, (count.get(i.productId) ?? 0) + 1);
    return products.filter((p) => count.has(p.id)).sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)).slice(0, 12);
  }, [s.orders, products, branchId]);
  const orderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of s.orders) m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    return m;
  }, [s.orders]);

  const tint = (p: Product) => catOf.get(p.categoryId)?.color ?? '#a8612e';
  const price = (pid: string) => getPrice(s, pid, branchId, channel);
  const productOf = (pid: string) => s.products.find((p) => p.id === pid);
  const cutsOf = (p: Product) => (p.cutOptionIds ?? []).map((id) => s.cutOptions.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c && c.active);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t) return products.filter((p) => p.name.toLowerCase().includes(t) || p.brand.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || p.barcode.includes(t));
    if (cat === 'best') return bestSellers;
    const sorted = [...products].sort((a, b) => (catOf.get(a.categoryId)?.sort ?? 99) - (catOf.get(b.categoryId)?.sort ?? 99) || a.aisle - b.aisle || a.name.localeCompare(b.name));
    return cat === 'all' ? sorted : sorted.filter((p) => p.categoryId === cat);
  }, [q, cat, products, bestSellers, catOf]);

  // ---------- customer ----------
  const customer = pick?.kind === 'customer' ? s.customers.find((c) => c.id === pick.id) : undefined;
  const isGuest = pick?.kind === 'guest';

  // ---------- money ----------
  const amountOf = (l: TicketLine) => {
    const p = productOf(l.productId);
    if (!p) return 0;
    return lineAmount(price(p.id), p, l, s.cutOptions.find((c) => c.id === l.cutId));
  };
  const subtotal = round2(lines.reduce((t, l) => t + amountOf(l), 0));
  const deliveryAddr = fx === 'delivery' ? address : undefined;
  const addrFee = deliveryAddr ? calcDeliveryFee(s, branchId, subtotal, deliveryAddr) : undefined;
  const fee = lines.length ? addrFee : undefined;
  const pickupDisc = fulfillment === 'pickup' ? Math.round((subtotal * num(getSetting(s, 'pickupDiscountPct', branchId))) / 100) : 0;
  const canDiscount = can(s, 'orders.approve');
  const discAmt = canDiscount ? discountAmount(discount, subtotal) : 0;
  const total = Math.max(0, round2(subtotal + (fee?.fee ?? 0) - discAmt - pickupDisc));
  const prepMins = num(getSetting(s, 'prepMinutes', branchId)) || 30;

  const problems: string[] = [];
  if (!pick) problems.push(channel === 'phone' ? 'Choose the customer who called' : 'Choose a customer or walk-in guest');
  if (customer?.blocked) problems.push(`Customer is blocked${customer.blockReason ? `: ${customer.blockReason}` : ''}`);
  if (fx === 'delivery' && isGuest) problems.push('Delivery needs a customer, not a walk-in guest');
  else if (fx === 'delivery' && pick && !deliveryAddr) problems.push('Choose a delivery address');
  if (addrFee?.outside) problems.push('Address is outside the delivery zones');
  const ready = lines.length > 0 && problems.length === 0;

  // ---------- actions ----------
  const openProduct = (p: Product) => {
    if ((avail.get(p.id) ?? 0) <= 0 && !lines.some((l) => l.productId === p.id)) { toast.error(`${p.name} is out of stock`); return; }
    setEditing(p.id);
  };
  const scan = () => {
    const code = sku.trim().toLowerCase();
    if (!code) return;
    const p = s.products.find((x) => x.sku.toLowerCase() === code || x.barcode === code);
    if (!p || p.status !== 'active') { toast.error(`No product with SKU ${sku.trim()}`); return; }
    setSku('');
    openProduct(p);
  };
  const saveLine = (l: TicketLine) => {
    setLines((cur) => (cur.some((x) => x.productId === l.productId) ? cur.map((x) => (x.productId === l.productId ? l : x)) : [...cur, l]));
    setEditing(null);
  };
  const removeLine = (pid: string) => setLines((cur) => cur.filter((l) => l.productId !== pid));
  const reset = () => {
    setLines([]); setPick(null); setDiscount(null); setFx(channel === 'phone' ? 'pickup' : 'now'); setSlot('ASAP');
    setAddress(undefined); setInstructions(''); setDialog(null); setSheetOpen(false);
  };
  const switchMode = (m: Channel) => {
    setChosen(m);
    setFx(m === 'phone' ? 'pickup' : 'now');
    if (m === 'phone' && isGuest) setPick(null);
  };
  const choosePick = (p: CustomerPick) => {
    setPick(p);
    setDialog(null);
    const c = p.kind === 'customer' ? s.customers.find((x) => x.id === p.id) : undefined;
    setAddress(c?.addresses[0]);
  };

  const finish = (r: PayResult) => {
    if (!ready || !pick) { toast.error(problems[0] ?? 'Add at least one item'); return; }
    const handOver = fx === 'now';
    let customerId = pick.kind === 'customer' ? pick.id : GUEST_ID;
    if (pick.kind === 'guest' && !s.customers.some((c) => c.id === GUEST_ID)) {
      // One shared record for counter sales without an account (orders need a customer).
      mutate((d) => {
        d.customers.push({ id: GUEST_ID, name: 'Walk-in guest', mobile: '', email: '', cityId: branch.cityId, addresses: [], createdAt: new Date().toISOString(), blocked: false, storeCredit: 0, points: 0, source: 'walk_in', note: 'Shared record for counter sales without an account.' });
      });
      customerId = GUEST_ID;
    }
    const by = currentUserName();
    const method: PaymentMethod = r.pay === 'link' ? 'gcash' : r.pay === 'cod' ? (fulfillment === 'pickup' ? 'pay_at_pickup' : 'cod') : r.pay;
    const id = placeOrder({
      branchId, customerId, channel, fulfillment, address: deliveryAddr, slot: fx === 'now' || (channel === 'phone' && fx === 'pickup') ? 'ASAP' : slot,
      lines: lines.map((l) => {
        const p = productOf(l.productId)!;
        return p.soldByWeight
          ? { productId: l.productId, qty: 1, weightKg: l.qty, cutId: l.cutId, note: l.note || undefined, subPref: 'similar' as const }
          : { productId: l.productId, qty: l.qty, cutId: l.cutId, note: l.note || undefined, subPref: 'similar' as const };
      }),
      paymentMethod: method, riderInstructions: fx === 'delivery' && instructions ? instructions : undefined,
      by, discountOverride: discAmt || undefined,
    });
    let number = '';
    let orderTotal = 0;
    let change: number | undefined;
    mutate((d) => {
      const o = d.orders.find((x) => x.id === id);
      if (!o) return;
      number = o.number;
      orderTotal = o.total;
      const now = new Date().toISOString();
      if (r.pay === 'link') {
        o.paymentStatus = 'pending';
        if (o.autoConfirmed) {
          o.autoConfirmed = false;
          o.status = 'awaiting_confirmation';
          o.timeline = o.timeline.filter((e) => e.status === 'placed');
        }
        o.timeline.push({ status: 'payment', at: now, by, note: `Payment link sent by SMS to ${o.customerMobile} (expires in ${num(getSetting(d, 'paymentLinkExpiryMins', branchId))} min)` });
      }
      if (r.pay === 'card' || r.pay === 'gcash') o.timeline.push({ status: 'payment', at: now, by, note: `${r.pay === 'card' ? 'Card' : 'GCash'} ${peso(o.total)} paid at counter` });
      if (r.pay === 'cash') {
        change = round2((r.cashReceived ?? o.total) - o.total);
        o.timeline.push({ status: 'payment', at: now, by, note: `Cash ${peso(o.total)} received at counter${change > 0 ? ` (tendered ${peso(r.cashReceived ?? 0)}, change ${peso(change)})` : ''}` });
      }
      if (r.confirmNow && (o.status === 'awaiting_confirmation' || o.status === 'placed')) {
        applyStatus(d, id, 'confirmed', { by, note: 'Confirmed at the counter' });
        applyStatus(d, id, 'preparing', { by });
      }
      if (handOver) {
        // Weighed and paid at the counter: complete now (records the walk-in sale stock movements).
        applyStatus(d, id, 'ready', { by });
        applyStatus(d, id, 'collected', { by, note: 'Handed over at the counter' });
      }
      o.acknowledged = true;
      addAudit(d, { module: 'Orders', action: `${channel === 'phone' ? 'Phone' : 'Walk-in'} order created`, detail: `${o.number} · ${o.customerName} · ${peso(o.total)} · ${handOver ? 'handed over' : fulfillment}`, branchId });
      if (discAmt > 0 && discount) {
        addAudit(d, { module: 'Pricing', action: 'Price override / discount', detail: `${o.number} — discount ${peso(discAmt)}${discount.type === 'pct' ? ` (${discount.value}%)` : ''} — reason: ${discount.reason}`, branchId });
        o.timeline.push({ status: 'edit', at: now, by, note: `Discount ${peso(discAmt)} approved by ${by}: ${discount.reason}` });
      }
    });
    const mobile = customer?.mobile;
    if (r.pay === 'link' && mobile) toast.info('Payment link sent by SMS', { description: `${mobile} · GCash / Maya / card` });
    if (channel === 'phone' && mobile) toast.info('SMS tracking link sent', { description: `freshmart.ph/t/${number} → ${mobile}` });
    setDialog(null);
    setSheetOpen(false);
    setDone({ id, number, total: orderTotal, change, handOver, phone: channel === 'phone' });
  };

  if (modes.length === 0) {
    return (
      <div className="p-6 flex-1 flex items-center justify-center">
        <div className="max-w-md text-center bg-[#fffdfb] border border-[#eadfd6] rounded-xl p-8">
          <Store className="w-10 h-10 mx-auto text-[#c8151d]" {...ICON} />
          <h2 className="mt-3 text-lg font-semibold">Walk-in and phone orders are off at {branch.name}</h2>
          <p className="mt-1 text-sm text-[#5c5250]">Turn on the Walk-in or Phone service for this branch in Cities &amp; Branches.</p>
          <Link href="/orders" className="mt-5 inline-block text-sm font-semibold text-[#c8151d] hover:underline">Back to orders</Link>
        </div>
      </div>
    );
  }

  // ---------- ticket panel (right column on wide screens, bottom sheet otherwise) ----------
  const tile = (on: boolean) => cn('flex-1 min-w-0 h-[62px] rounded-lg border bg-white flex flex-col items-center justify-center gap-1 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed',
    on ? 'border-[#c8151d] text-[#c8151d] ring-1 ring-[#c8151d]' : 'border-[#eadfd6] text-[#5c5250] hover:bg-[#faf6f2]');
  const fxTiles: { v: Fx; label: string; icon: typeof Hand; off?: boolean }[] = channel === 'phone'
    ? [{ v: 'pickup', label: 'Pickup', icon: Store, off: !branch.services.pickup }, { v: 'delivery', label: 'Delivery', icon: Bike, off: !branch.services.delivery }]
    : [{ v: 'now', label: 'Hand over now', icon: Hand }, { v: 'pickup', label: 'Pickup later', icon: Clock, off: !branch.services.pickup }, { v: 'delivery', label: 'Delivery', icon: Bike, off: !branch.services.delivery }];

  const panel = (
    <div className="h-full flex flex-col bg-[#fffdfb] min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
      <div className="shrink-0 p-4 space-y-3 border-b border-[#f0e8e1]">
        <div className={cn('grid gap-1 rounded-lg bg-[#efe8e1] p-1', modes.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {modes.map((m) => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={cn('h-11 rounded-lg flex items-center justify-center gap-2 text-[15px] font-semibold', channel === m ? 'bg-[#2a2322] text-white' : 'text-[#5c5250] hover:text-[#2a2322]')}>
              {m === 'walk_in' ? <Store className="w-4 h-4" {...ICON} /> : <Phone className="w-4 h-4" {...ICON} />}{m === 'walk_in' ? 'Walk-in' : 'Phone order'}
            </button>
          ))}
        </div>

        {pick ? (
          <div className="flex items-center gap-3 rounded-lg border border-[#eadfd6] bg-white px-3 py-2.5">
            {isGuest
              ? <span className="w-10 h-10 rounded-full bg-[#f5f1ec] flex items-center justify-center shrink-0"><User className="w-5 h-5" {...ICON} /></span>
              : <span className="w-10 h-10 rounded-full bg-[#2a2322] text-white text-xs font-bold flex items-center justify-center shrink-0">{initialsOf(customer?.name ?? '?')}</span>}
            <button type="button" onClick={() => setDialog('customer')} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold truncate">{isGuest ? 'Walk-in guest' : customer?.name}{customer?.blocked && <span className="ml-2 text-xs text-[#c8151d]">Blocked</span>}</span>
              <span className="block text-sm text-[#5c5250] truncate">{isGuest ? 'No account' : customer?.mobile}</span>
            </button>
            <button type="button" aria-label="Remove customer" onClick={() => { setPick(null); setAddress(undefined); }} className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#2a2322] hover:bg-[#f5f1ec]"><X className="w-5 h-5" {...ICON} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setDialog('customer')} className="w-full flex items-center gap-3 rounded-lg border border-dashed border-[#c8151d] bg-white px-3 py-2.5 text-left hover:bg-[#fdf6f6]">
            <span className="w-10 h-10 rounded-full bg-[#d9d2cd] text-white flex items-center justify-center shrink-0"><Plus className="w-4 h-4" {...ICON} /></span>
            <span className="min-w-0">
              <span className="block text-[17px] font-semibold">Add customer</span>
              <span className="block text-sm text-[#5c5250]">{channel === 'phone' ? 'Required for phone orders' : 'Search, add new, or use walk-in guest'}</span>
            </span>
          </button>
        )}

        <div className="flex gap-2">
          {fxTiles.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.v} type="button" disabled={t.off} onClick={() => setFx(t.v)} className={tile(fx === t.v)}>
                <Icon className="w-5 h-5" {...ICON} />{t.label}
              </button>
            );
          })}
        </div>
        {channel === 'phone' && fx === 'pickup' && <p className="text-sm text-[#5c5250]">Ready at the pickup counter in about {prepMins} min</p>}
        {(fx === 'delivery' || (channel === 'walk_in' && fx === 'pickup')) && (
          <label className="flex items-center gap-2 text-sm text-[#5c5250]">
            <span className="shrink-0">{fx === 'delivery' ? 'Delivery time' : 'Pickup time'}</span>
            <select value={slot} onChange={(e) => setSlot(e.target.value)} className="min-w-0 flex-1 h-10 rounded-lg border border-[#eadfd6] bg-white px-2 text-sm text-[#2a2322] outline-none focus:border-[#2a2322]">
              {SLOTS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        )}
        {fx === 'delivery' && (
          customer ? (
            <button type="button" onClick={() => setDialog('address')} className="w-full flex items-start gap-2 rounded-lg border border-[#eadfd6] bg-white px-3 py-2 text-left hover:bg-[#faf6f2]">
              <MapPin className={cn('w-4 h-4 mt-0.5 shrink-0', deliveryAddr ? 'text-[#c8151d]' : 'text-gray-400')} {...ICON} />
              <span className="min-w-0 flex-1 text-sm">
                {deliveryAddr ? (
                  <>
                    <span className="block font-semibold truncate">{deliveryAddr.label} · {deliveryAddr.line}</span>
                    <span className={cn('block', addrFee?.outside ? 'text-[#c8151d]' : 'text-[#5c5250]')}>{addrFee?.outside ? 'Outside the delivery zones' : `${addrFee?.distance} km · Delivery fee ${peso(addrFee?.fee ?? 0)}`}</span>
                  </>
                ) : <span className="font-semibold">Choose delivery address</span>}
              </span>
              <span className="text-sm font-semibold text-[#c8151d]">{deliveryAddr ? 'Change' : 'Choose'}</span>
            </button>
          ) : <p className="text-sm text-[#5c5250]">{isGuest ? 'Delivery needs a customer with a mobile number.' : 'Choose the customer to set the delivery address.'}</p>
        )}
      </div>

      <div className="flex-1">
        {lines.length === 0 ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center text-[#5c5250] px-6">
            <ReceiptText className="w-10 h-10 text-[#b8aaa5]" strokeWidth={1.25} />
            <p className="mt-3 text-[15px]">Tap a product to start the ticket</p>
          </div>
        ) : lines.map((l) => {
          const p = productOf(l.productId);
          if (!p) return null;
          const cuts = cutsOf(p);
          const cut = s.cutOptions.find((c) => c.id === l.cutId);
          const showCut = cut && cuts[0]?.id !== cut.id;
          const sub = `${p.soldByWeight ? `${l.qty.toFixed(2)} kg` : `${l.qty} ${unitWord(p)}`} × ${peso(price(p.id))}${showCut ? ` · ${cutLabel(cut)}` : ''}`;
          return (
            <div key={l.productId} className="flex items-start gap-2 px-4 py-3 border-b border-[#f0e8e1]">
              <button type="button" onClick={() => setEditing(p.id)} className="min-w-0 flex-1 text-left">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[17px] font-semibold leading-snug">{p.name}</span>
                  <span className="text-[17px] font-bold whitespace-nowrap">{peso(amountOf(l))}</span>
                </span>
                <span className="block text-sm text-[#5c5250] mt-0.5">{sub}</span>
                {l.note && <span className="block text-xs text-[#5c5250] italic mt-0.5 truncate">Note: {l.note}</span>}
              </button>
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removeLine(p.id)} className="w-9 h-9 -mr-1 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#c8151d] hover:bg-[#fdf3f3]"><X className="w-5 h-5" {...ICON} /></button>
            </div>
          );
        })}
      </div>
      </div>

      <div className="shrink-0 border-t border-[#f0e8e1] px-4 pt-3 pb-4">
        <div className="flex justify-between text-[15px] text-[#5c5250]"><span>Subtotal · {lines.length} item{lines.length === 1 ? '' : 's'}</span><span>{peso(subtotal)}</span></div>
        {fee && !fee.outside && <div className="flex justify-between text-[15px] text-[#5c5250] mt-1"><span>Delivery fee</span><span>{peso(fee.fee)}</span></div>}
        {pickupDisc > 0 && <div className="flex justify-between text-[15px] text-[#1f6b3f] mt-1"><span>Pickup discount</span><span>−{peso(pickupDisc)}</span></div>}
        {discAmt > 0 && discount && (
          <div className="flex justify-between gap-2 text-[15px] text-[#1f6b3f] mt-1">
            <button type="button" onClick={() => setDialog('discount')} className="min-w-0 truncate text-left hover:underline">Discount{discount.type === 'pct' ? ` ${discount.value}%` : ''} · {discount.reason}</button>
            <span>−{peso(discAmt)}</span>
          </div>
        )}
        {!discount && (canDiscount ? (
          <button type="button" disabled={!lines.length} onClick={() => setDialog('discount')} className="mt-1 text-[15px] font-semibold text-[#c8151d] hover:underline disabled:opacity-50 disabled:no-underline">+ Add discount</button>
        ) : (
          <p className="mt-1 text-xs text-gray-400">Discounts need the orders.approve permission.</p>
        ))}
        <div className="flex items-end justify-between gap-3 border-t border-[#f0e8e1] mt-2 pt-2">
          <span className="text-[17px] font-semibold pb-1">{channel === 'phone' ? 'Estimated total' : 'Total'}</span>
          <span className="text-5xl font-semibold leading-none" style={OSWALD}>{peso(total)}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => (lines.length ? setDialog('clear') : reset())}
            className="h-[64px] px-5 rounded-lg border border-[#eadfd6] bg-white text-[17px] font-medium text-[#5c5250] hover:bg-[#f5f1ec]">Clear</button>
          <button type="button" disabled={!ready} onClick={() => setDialog('pay')}
            className="flex-1 min-w-0 h-[64px] rounded-lg bg-[#c8151d] text-white text-xl font-bold hover:bg-[#a3111a] disabled:bg-[#e8a9ab] disabled:cursor-not-allowed truncate px-3">
            {channel === 'phone' ? `Place order${lines.length ? ` · ${peso(total)}` : ''}` : `Charge${lines.length ? ` ${peso(total)}` : ''}`}
          </button>
        </div>
        {lines.length > 0 && problems[0] && <p className="mt-2 text-center text-sm font-medium text-[#c8151d]">{problems[0]}</p>}
      </div>
    </div>
  );

  const editingProduct = editing ? productOf(editing) : undefined;

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Products */}
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 border-b border-[#eadfd6] px-3 sm:px-5 pt-3 sm:pt-4 pb-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" {...ICON} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product" aria-label="Search product"
                className="w-full h-12 lg:h-[58px] rounded-lg border border-[#eadfd6] bg-white pl-12 pr-10 text-[17px] outline-none focus:border-[#2a2322] placeholder:text-gray-400" />
              {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#2a2322]"><X className="w-5 h-5" {...ICON} /></button>}
            </div>
            <div className="relative sm:w-[220px] xl:w-[280px] shrink-0">
              <Barcode className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" {...ICON} />
              <input value={sku} onChange={(e) => setSku(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()} placeholder="Scan SKU" aria-label="Scan SKU"
                className="w-full h-12 lg:h-[58px] rounded-lg border border-[#eadfd6] bg-white pl-12 pr-3 text-[17px] font-mono outline-none focus:border-[#2a2322] placeholder:font-sans placeholder:text-gray-400" />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:-mx-5 sm:px-5 pb-1 [scrollbar-width:none]">
            {[
              { id: 'best', label: 'Best sellers', count: bestSellers.length, color: undefined as string | undefined },
              { id: 'all', label: 'All', count: products.length, color: '#6f6764' },
              ...topCats.map((c) => ({ id: c.id, label: c.name.replace(/\s+Meats?$/i, ''), count: products.filter((p) => p.categoryId === c.id).length, color: c.color })),
            ].map((c) => {
              const on = !q.trim() && cat === c.id;
              return (
                <button key={c.id} type="button" onClick={() => { setCat(c.id); setQ(''); }}
                  className={cn('shrink-0 h-11 lg:h-12 px-4 lg:px-5 rounded-full border flex items-center gap-2 text-[15px] lg:text-base font-semibold', on ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#eadfd6] text-[#2a2322] hover:bg-[#faf6f2]')}>
                  {c.color && <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />}
                  {c.label}
                  <span className={cn('font-normal', on ? 'text-white/70' : 'text-gray-400')}>{c.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn('flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4', !wide && 'pb-24')}>
          {shown.length === 0 ? (
            <p className="py-16 text-center text-[#5c5250]">{q.trim() ? `No products match “${q.trim()}”.` : 'No products here yet.'}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 lg:gap-4">
              {shown.map((p) => {
                const left = avail.get(p.id) ?? 0;
                const line = lines.find((l) => l.productId === p.id);
                const out = left <= 0 && !line;
                return (
                  <button key={p.id} type="button" disabled={out} onClick={() => openProduct(p)}
                    className={cn('relative text-left rounded-lg bg-[#fffdfb] overflow-hidden border transition-shadow',
                      line ? 'border-2 border-[#c8151d]' : 'border-[#eadfd6] hover:shadow-md',
                      out && 'opacity-45 cursor-not-allowed')}>
                    <Thumb p={p} tint={tint(p)} className="aspect-[16/10] w-full" />
                    {line && <span className="absolute top-2 right-2 rounded-full bg-[#c8151d] text-white text-sm font-bold px-2.5 py-1 shadow">{qtyLabel(p, line.qty)}</span>}
                    {out && <span className="absolute top-2 left-2 rounded-full bg-[#2a2322] text-white text-xs font-semibold px-2 py-0.5">Out of stock</span>}
                    <div className="px-3 pt-2.5 pb-3">
                      <p className="text-[15px] lg:text-base font-semibold leading-snug line-clamp-2 min-h-[2.6em] sm:min-h-0 sm:line-clamp-1">{p.name}</p>
                      <div className="mt-2 sm:mt-3 flex items-end justify-between gap-2">
                        <span className="text-lg font-bold leading-none">{money(price(p.id))}{priceSuffix(p)}</span>
                        <span className="text-xs text-[#5c5250] whitespace-nowrap">{fmtNum(left)} {unitWord(p)} left</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Ticket */}
      {wide ? (
        <aside className="w-[440px] xl:w-[500px] shrink-0 border-l border-[#eadfd6] min-h-0">{panel}</aside>
      ) : (
        <>
          <button type="button" onClick={() => setSheetOpen(true)}
            className="fixed inset-x-0 bottom-0 z-30 h-16 bg-[#2a2322] text-white flex items-center justify-between gap-3 px-4 pb-[env(safe-area-inset-bottom)]">
            <span className="flex items-center gap-2 font-semibold"><ReceiptText className="w-5 h-5" {...ICON} />Ticket · {lines.length} item{lines.length === 1 ? '' : 's'} · {money(total)}</span>
            <ChevronUp className="w-5 h-5" {...ICON} />
          </button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="h-[92dvh] rounded-t-2xl overflow-hidden p-0">
              <SheetTitle className="sr-only">Ticket</SheetTitle>
              <SheetDescription className="sr-only">Customer, fulfilment, items and total for this ticket.</SheetDescription>
              <div className="shrink-0 flex items-center justify-between px-4 h-12 border-b border-[#f0e8e1] bg-[#fffdfb]">
                <span className="font-semibold">Ticket</span>
                <button type="button" aria-label="Close ticket" onClick={() => setSheetOpen(false)} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#f5f1ec]"><X className="w-5 h-5" {...ICON} /></button>
              </div>
              <div className="flex-1 min-h-0">{panel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Dialogs */}
      {editingProduct && (
        <QtyDialog key={editingProduct.id} product={editingProduct} price={price(editingProduct.id)} avail={avail.get(editingProduct.id) ?? 0}
          cuts={cutsOf(editingProduct)} tint={tint(editingProduct)} initial={lines.find((l) => l.productId === editingProduct.id)}
          onSave={saveLine} onClose={() => setEditing(null)} />
      )}
      {dialog === 'customer' && <CustomerDialog s={s} mode={channel} branch={branch} orderCounts={orderCounts} onPick={choosePick} onClose={() => setDialog(null)} />}
      {dialog === 'address' && customer && (
        <AddressDialog s={s} branch={branch} customer={customer} subtotal={subtotal} value={address} instructions={instructions}
          onSave={(a, ins) => { setAddress(a); setInstructions(ins); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
      {dialog === 'discount' && canDiscount && (
        <DiscountDialog subtotal={subtotal} initial={discount} onSave={(d) => { setDiscount(d); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
      {dialog === 'pay' && ready && (
        <PayDialog channel={channel} handOver={fx === 'now'} delivery={fx === 'delivery'} subtotal={subtotal} baseTotal={total}
          gatewayPct={num(getSetting(s, 'gatewayFeePct', branchId))} codLimit={num(getSetting(s, 'codLimit', branchId))}
          customerName={isGuest ? 'Walk-in guest' : customer?.name ?? ''} onConfirm={finish} onClose={() => setDialog(null)} />
      )}
      {dialog === 'clear' && <ClearDialog count={lines.length} onConfirm={reset} onClose={() => setDialog(null)} />}
      {done && (
        <DoneDialog number={done.number} total={done.total} change={done.change} handOver={done.handOver} phone={done.phone}
          onView={() => router.push(`/orders/${done.id}`)} onNew={() => { setDone(null); reset(); }} />
      )}
    </div>
  );
}
