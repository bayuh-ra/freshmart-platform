'use client';

import { useState } from 'react';
import { Bike, Check, ChevronRight, CircleCheck, Clock, CreditCard, LoaderCircle, MapPin, MessageSquareText, ShieldCheck, Store, Ticket, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import type { Fulfillment, PaymentMethod } from '@/src/lib/types';
import { mutate } from '@/src/lib/store';
import { applyVoucher, available, calcDeliveryFee, getPriceInfo, getSetting, num, ONLINE_METHODS, PAYMENT_LABEL, peso, placeOrder, pesoShort } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { Card, PrimaryButton, ScreenHeader, Stepper, SUB_LABEL, cartPatch, cartSet, makeSlots, unitEst, useShop } from './shared';

function useCartLines() {
  const { s, branch } = useShop();
  return s.cart
    .map((c) => {
      const p = s.products.find((x) => x.id === c.productId);
      if (!p) return null;
      const info = getPriceInfo(s, p.id, branch.id);
      const avail = p.status === 'active' ? available(s, p.id, branch.id) : 0;
      const unit = unitEst(p, info.price);
      return { c, p, info, avail, unit, total: Math.round(unit * c.qty * 100) / 100 };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

// ====================== CART ======================
export function CartScreen() {
  const { s, branch, go, effMode, flash } = useShop();
  const lines = useCartLines();
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const okLines = lines.filter((l) => l.avail > 0);
  const subtotal = Math.round(okLines.reduce((n, l) => n + l.unit * Math.min(l.c.qty, l.avail), 0) * 100) / 100;
  const minOrder = num(getSetting(s, 'minOrder', branch.id));
  const unavailable = lines.filter((l) => l.avail === 0);
  const short = lines.filter((l) => l.avail > 0 && l.c.qty > l.avail);
  const belowMin = subtotal < minOrder;
  const hasWeighted = lines.some((l) => l.p.soldByWeight);

  if (!lines.length) {
    return (
      <div className="min-h-full flex flex-col">
        <ScreenHeader title="My cart" />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-10 py-16">
          <span className="text-6xl">🛒</span>
          <p className="text-base font-semibold mt-4">Your cart is empty</p>
          <p className="text-sm text-gray-500 mt-1">Fresh groceries from {branch.name} are a few taps away.</p>
          <PrimaryButton onClick={() => go({ name: 'browse' })} className="mt-6 w-48">Start shopping</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      <ScreenHeader
        title="My cart"
        sub={`${lines.length} item${lines.length === 1 ? '' : 's'} · ${effMode === 'delivery' ? 'Delivery' : 'Pickup'} from ${branch.name}`}
        right={<button onClick={() => { mutate((d) => { d.cart = []; }); flash('Cart cleared', 'info'); }} className="text-xs text-gray-500 px-2">Clear</button>}
      />
      <div className="flex-1 px-4 pt-3 pb-4 space-y-3">
        {(unavailable.length > 0 || short.length > 0) && (
          <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-xs text-red-800 flex gap-2">
            <TriangleAlert className="w-4 h-4 shrink-0 text-[#dc2626]" />
            <div>
              {unavailable.length > 0 && <p><b>{unavailable.length} item{unavailable.length > 1 ? 's are' : ' is'} no longer available</b> at {branch.name} and will not be ordered.</p>}
              {short.length > 0 && <p className={unavailable.length ? 'mt-1' : ''}>Limited stock: quantities above what&apos;s available will be reduced.</p>}
            </div>
          </div>
        )}
        {belowMin && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-900"><b>Add {peso(minOrder - subtotal)} more</b> to reach the {pesoShort(minOrder)} minimum order.</p>
            <div className="h-1.5 bg-amber-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (subtotal / minOrder) * 100)}%` }} /></div>
          </div>
        )}

        {lines.map((l) => (
          <Card key={l.p.id} className={cn('p-3', l.avail === 0 && 'opacity-80')}>
            <div className="flex gap-3">
              <button onClick={() => go({ name: 'product', id: l.p.id })} className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center text-3xl shrink-0">{l.p.image}</button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{l.p.name}</p>
                  <button onClick={() => cartSet(l.p.id, 0)} className="text-gray-300 hover:text-[#dc2626]" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
                <p className="text-[11px] text-gray-500">{l.p.size}{l.p.soldByWeight && ` · ${peso(l.info.price)}/kg · est. ${((l.p.estWeightKg ?? 1) * l.c.qty).toFixed(1)} kg`}</p>
                {l.avail === 0 ? (
                  <p className="text-[11px] font-semibold text-[#dc2626] mt-1">Unavailable at {branch.name} — remove this item</p>
                ) : l.c.qty > l.avail ? (
                  <p className="text-[11px] font-semibold text-amber-700 mt-1">Only {l.avail} available</p>
                ) : null}
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-bold text-[#1e40af]">{peso(l.total)}{l.p.soldByWeight && <span className="text-[10px] font-medium text-gray-400"> est.</span>}</p>
                  {l.avail > 0 && <Stepper size="sm" qty={l.c.qty} max={l.avail} onChange={(n) => cartSet(l.p.id, n)} />}
                </div>
              </div>
            </div>
            {l.avail > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-2 text-[11px]">
                <button onClick={() => setNoteOpen(noteOpen === l.p.id ? null : l.p.id)} className="flex items-center gap-1 text-gray-600 min-w-0 flex-1 text-left">
                  <MessageSquareText className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{l.c.note ? `“${l.c.note}”` : 'Add note'}</span>
                </button>
                <select value={l.c.subPref} onChange={(e) => cartPatch(l.p.id, { subPref: e.target.value as typeof l.c.subPref })} className="h-7 rounded-lg border border-gray-200 bg-white px-1.5 text-[11px] text-gray-700 outline-none">
                  {(['similar', 'ask', 'refund'] as const).map((k) => <option key={k} value={k}>If missing: {SUB_LABEL[k]}</option>)}
                </select>
              </div>
            )}
            {noteOpen === l.p.id && (
              <input autoFocus defaultValue={l.c.note ?? ''} onBlur={(e) => { cartPatch(l.p.id, { note: e.target.value || undefined }); setNoteOpen(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="e.g. ripe bananas, please" className="mt-2 w-full h-9 rounded-xl border border-gray-200 px-3 text-xs outline-none focus:border-[#1e40af]" />
            )}
          </Card>
        ))}
        {hasWeighted && <p className="text-[11px] text-gray-500 px-1">⚖️ Items sold by weight are estimated. The final price is set at weighing.</p>}
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm text-gray-600">Subtotal</span>
          <span className="text-lg font-bold text-gray-900">{peso(subtotal)}</span>
        </div>
        <PrimaryButton disabled={belowMin || okLines.length === 0} onClick={() => go({ name: 'checkout' })}>
          {belowMin ? `Minimum order ${pesoShort(minOrder)}` : 'Proceed to checkout'}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ====================== CHECKOUT ======================
const PAY_ICON: Record<string, React.ReactNode> = {
  gcash: <span className="w-8 h-8 rounded-lg bg-[#007dfe] text-white text-[11px] font-black flex items-center justify-center">G</span>,
  maya: <span className="w-8 h-8 rounded-lg bg-[#0f9d58] text-white text-[11px] font-black flex items-center justify-center">M</span>,
  card: <span className="w-8 h-8 rounded-lg bg-[#1a1f71] text-white flex items-center justify-center"><CreditCard className="w-4 h-4" /></span>,
  cod: <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><Wallet className="w-4 h-4" /></span>,
  pay_at_pickup: <span className="w-8 h-8 rounded-lg bg-blue-100 text-[#1e40af] flex items-center justify-center"><Store className="w-4 h-4" /></span>,
};

export function CheckoutScreen() {
  const { s, shopper, branch, address, deliveryOk, deliveryBlockReason, effMode, reset, flash, openLocation, pendingVoucher, setPendingVoucher } = useShop();
  const lines = useCartLines().filter((l) => l.avail > 0);
  const subtotal = Math.round(lines.reduce((n, l) => n + l.unit * Math.min(l.c.qty, l.avail), 0) * 100) / 100;
  const canDeliver = deliveryOk;
  const canPickup = branch.services.pickup;
  const [ful, setFul] = useState<Fulfillment>(effMode === 'delivery' && canDeliver ? 'delivery' : 'pickup');
  const fulfillment: Fulfillment = ful === 'delivery' && !canDeliver ? 'pickup' : ful;
  const prep = num(getSetting(s, 'prepMinutes', branch.id)) || 20;
  const scheduledOn = getSetting(s, 'ff_scheduled', branch.id) !== false;
  const slots = makeSlots(branch, fulfillment === 'delivery' ? 60 : prep);
  const [slot, setSlot] = useState('ASAP');
  const [instr, setInstr] = useState(address.landmark ? `Landmark: ${address.landmark}. ` : '');
  const [code, setCode] = useState(pendingVoucher);
  const [applied, setApplied] = useState(pendingVoucher);
  const [usePts, setUsePts] = useState(false);
  const [pay, setPay] = useState<PaymentMethod>('gcash');
  const [terms, setTerms] = useState(false);
  const [paying, setPaying] = useState<null | 'sheet' | 'done'>(null);

  const feeInfo = fulfillment === 'delivery' ? calcDeliveryFee(s, branch.id, subtotal, address) : null;
  const deliveryFee = feeInfo?.fee ?? 0;
  const online = ONLINE_METHODS.includes(pay);
  const gwPct = num(getSetting(s, 'gatewayFeePct', branch.id));
  const serviceFee = online ? Math.round((subtotal * gwPct) / 100) : 0;
  const vres = applied ? applyVoucher(s, applied, subtotal, deliveryFee, fulfillment) : null;
  const voucherDisc = vres?.ok ? vres.discount : 0;
  const pickupPct = fulfillment === 'pickup' ? num(getSetting(s, 'pickupDiscountPct', branch.id)) : 0;
  const pickupDisc = Math.round((subtotal * pickupPct) / 100);
  const loyaltyOn = getSetting(s, 'ff_loyalty', branch.id) !== false;
  const ptsValue = Math.min(Math.floor(shopper.points / 10), Math.floor(subtotal * 0.2));
  const ptsDisc = loyaltyOn && usePts ? ptsValue : 0;
  const total = Math.max(0, Math.round((subtotal + deliveryFee + serviceFee - voucherDisc - pickupDisc - ptsDisc) * 100) / 100);
  const codLimit = num(getSetting(s, 'codLimit', branch.id));
  const minOrder = num(getSetting(s, 'minOrder', branch.id));
  const methods: PaymentMethod[] = fulfillment === 'delivery' ? ['gcash', 'maya', 'card', 'cod'] : ['gcash', 'maya', 'card', 'pay_at_pickup'];
  const payMethod: PaymentMethod = methods.includes(pay) && !(pay === 'cod' && total > codLimit) ? pay : 'gcash';
  const walletVouchers = s.vouchers.filter((v) => v.active && new Date(v.end) > new Date());

  const problems: string[] = [];
  if (!lines.length) problems.push('Your cart is empty');
  if (subtotal < minOrder) problems.push(`Minimum order is ${pesoShort(minOrder)}`);
  if (fulfillment === 'delivery' && feeInfo?.outside) problems.push('Address is outside the delivery zone');
  if (!terms) problems.push('Please accept the terms');

  const doPlace = () => {
    const id = placeOrder({
      branchId: branch.id, customerId: shopper.id, channel: 'app', fulfillment,
      address: fulfillment === 'delivery' ? address : undefined,
      slot: slot === 'ASAP' ? 'ASAP' : slot,
      lines: lines.map((l) => ({ productId: l.p.id, qty: Math.min(l.c.qty, l.avail), note: l.c.note, subPref: l.c.subPref })),
      paymentMethod: payMethod,
      voucherCode: vres?.ok ? applied.toUpperCase() : undefined,
      riderInstructions: fulfillment === 'delivery' && instr.trim() ? instr.trim() : undefined,
      discountOverride: ptsDisc || undefined,
    });
    mutate((d) => {
      d.cart = [];
      if (ptsDisc) {
        const c = d.customers.find((x) => x.id === shopper.id);
        if (c) c.points = Math.max(0, c.points - ptsDisc * 10);
      }
    });
    setPendingVoucher('');
    reset([{ name: 'orders' }, { name: 'confirm', orderId: id }]);
  };

  const place = () => {
    if (problems.length) { flash(problems[0], 'err'); return; }
    if (paying) return;
    setPaying('sheet');
    setTimeout(() => {
      setPaying('done');
      setTimeout(doPlace, ONLINE_METHODS.includes(payMethod) ? 500 : 250);
    }, ONLINE_METHODS.includes(payMethod) ? 1500 : 700);
  };

  return (
    <div className="min-h-full flex flex-col">
      <ScreenHeader title="Checkout" sub={`${branch.name} branch · ${lines.length} items`} />
      <div className="flex-1 px-4 py-3 space-y-3">
        {/* Fulfillment */}
        <Card className="p-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <FulBtn on={fulfillment === 'delivery'} disabled={!canDeliver} onClick={() => setFul('delivery')} icon={<Bike className="w-4 h-4" />} label="Delivery" sub={canDeliver ? `~${feeInfo?.zone?.etaMins ?? calcDeliveryFee(s, branch.id, subtotal, address).zone?.etaMins ?? 45} min` : 'Not available'} />
            <FulBtn on={fulfillment === 'pickup'} disabled={!canPickup} onClick={() => setFul('pickup')} icon={<Store className="w-4 h-4" />} label="Pickup" sub={canPickup ? `Ready in ~${prep} min` : 'Not available'} />
          </div>
          {!canDeliver && <p className="text-[11px] text-amber-700 px-2 pt-2 pb-1">{deliveryBlockReason}</p>}
        </Card>

        {/* Address / branch */}
        {fulfillment === 'delivery' ? (
          <Card className="p-3.5">
            <Row icon={<MapPin className="w-4 h-4 text-[#1e40af]" />} title={`Deliver to ${address.label}`} sub={address.line} action={<button onClick={openLocation} className="text-xs font-semibold text-[#1e40af]">Change</button>} />
            <textarea value={instr} onChange={(e) => setInstr(e.target.value)} rows={2} placeholder="Instructions for the rider (gate, landmark, call on arrival…)" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#1e40af] resize-none" />
          </Card>
        ) : (
          <Card className="p-3.5">
            <Row icon={<Store className="w-4 h-4 text-[#1e40af]" />} title={`Pick up at ${branch.name}`} sub={branch.address} action={<button onClick={openLocation} className="text-xs font-semibold text-[#1e40af]">Change</button>} />
            <div className="mt-2.5 rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-900">📍 {branch.pickupInstructions} · Open {branch.hours}</div>
          </Card>
        )}

        {/* Slot */}
        <Card className="p-3.5">
          <p className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-[#1e40af]" /> {fulfillment === 'delivery' ? 'Delivery time' : 'Pickup time'}</p>
          <div className="flex gap-2 overflow-x-auto fm-noscroll mt-2.5 -mx-1 px-1">
            <SlotBtn on={slot === 'ASAP'} onClick={() => setSlot('ASAP')} top={fulfillment === 'delivery' ? 'ASAP' : 'Earliest'} bottom={fulfillment === 'delivery' ? `~${feeInfo?.zone?.etaMins ?? 45} min` : `~${prep} min`} />
            {scheduledOn && slots.map((sl) => {
              const [day, ...rest] = sl.split(' ');
              return <SlotBtn key={sl} on={slot === sl} onClick={() => setSlot(sl)} top={day} bottom={rest.join(' ')} />;
            })}
          </div>
        </Card>

        {/* Voucher */}
        <Card className="p-3.5">
          <p className="text-sm font-semibold flex items-center gap-2"><Ticket className="w-4 h-4 text-[#1e40af]" /> Voucher</p>
          <form onSubmit={(e) => { e.preventDefault(); setApplied(code.trim()); }} className="flex gap-2 mt-2.5">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter code" className="flex-1 h-10 rounded-xl border border-gray-200 px-3 text-sm uppercase outline-none focus:border-[#1e40af]" />
            {applied && vres?.ok ? (
              <button type="button" onClick={() => { setApplied(''); setCode(''); }} className="h-10 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">Remove</button>
            ) : (
              <button type="submit" disabled={!code.trim()} className="h-10 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:bg-gray-300">Apply</button>
            )}
          </form>
          {vres && (vres.ok ? (
            <p className="mt-2 text-xs text-emerald-700 flex items-center gap-1"><CircleCheck className="w-3.5 h-3.5" /> {vres.voucher.code} applied — you save {peso(vres.discount)} ({vres.voucher.description})</p>
          ) : (
            <p className="mt-2 text-xs text-[#dc2626] flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" /> {applied}: {vres.reason}</p>
          ))}
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {[...walletVouchers.map((v) => v.code), 'PAYDAY50'].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
              <button key={c} onClick={() => { setCode(c); setApplied(c); }} className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-dashed border-[#1e40af]/40 text-[#1e40af] bg-blue-50/50">{c}</button>
            ))}
          </div>
        </Card>

        {/* Points */}
        {loyaltyOn && ptsValue > 0 && (
          <Card className="p-3.5 flex items-center gap-3">
            <span className="text-xl">⭐</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Use {(ptsValue * 10).toLocaleString()} FreshPoints</p>
              <p className="text-[11px] text-gray-500">Save {peso(ptsValue)} · balance {shopper.points.toLocaleString()} pts</p>
            </div>
            <Toggle on={usePts} onClick={() => setUsePts(!usePts)} />
          </Card>
        )}

        {/* Payment */}
        <Card className="p-3.5">
          <p className="text-sm font-semibold mb-2">Payment method</p>
          <div className="space-y-2">
            {methods.map((m) => {
              const codBlocked = m === 'cod' && total > codLimit;
              return (
                <button key={m} disabled={codBlocked} onClick={() => setPay(m)} className={cn('w-full flex items-center gap-3 rounded-xl border p-2.5 text-left', payMethod === m ? 'border-[#1e40af] bg-blue-50/40' : 'border-gray-200', codBlocked && 'opacity-50')}>
                  {PAY_ICON[m]}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{m === 'card' ? 'Visa •••• 4242' : PAYMENT_LABEL[m]}</span>
                    <span className="block text-[11px] text-gray-500">
                      {m === 'card' ? 'Saved card · tokenized, we never store your card number' : m === 'gcash' ? 'Linked: 0917 ••• 4567' : m === 'maya' ? 'Pay with Maya wallet' : codBlocked ? `Not available above ${pesoShort(codLimit)}` : m === 'cod' ? `Cash on delivery · up to ${pesoShort(codLimit)}` : 'Pay cash or card at the counter'}
                    </span>
                  </span>
                  <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center', payMethod === m ? 'border-[#1e40af] bg-[#1e40af]' : 'border-gray-300')}>{payMethod === m && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Summary */}
        <Card className="p-3.5 text-sm">
          <p className="font-semibold mb-2">Order summary</p>
          <div className="space-y-1.5 mb-3">
            {lines.map((l) => (
              <div key={l.p.id} className="flex justify-between text-xs text-gray-600">
                <span className="truncate pr-2">{Math.min(l.c.qty, l.avail)} × {l.p.name}</span>
                <span className="tabular-nums">{peso(l.unit * Math.min(l.c.qty, l.avail))}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-2.5 space-y-1.5">
            <SumRow label="Subtotal" value={peso(subtotal)} />
            {fulfillment === 'delivery' && <SumRow label="Delivery fee" value={deliveryFee === 0 ? 'FREE' : peso(deliveryFee)} sub={feeInfo?.rule} green={deliveryFee === 0} />}
            {online && <SumRow label={`Service fee (${gwPct}% online payment)`} value={peso(serviceFee)} />}
            {pickupDisc > 0 && <SumRow label={`Pickup discount (${pickupPct}%)`} value={`−${peso(pickupDisc)}`} green />}
            {voucherDisc > 0 && <SumRow label={`Voucher ${applied.toUpperCase()}`} value={`−${peso(voucherDisc)}`} green />}
            {ptsDisc > 0 && <SumRow label="FreshPoints" value={`−${peso(ptsDisc)}`} green />}
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold text-[#1e40af]">{peso(total)}</span>
            </div>
            <p className="text-[10px] text-gray-400">Prices are VAT inclusive. Weighted items are charged by actual weight.</p>
          </div>
        </Card>

        <label className="flex items-start gap-2.5 px-1 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#1e40af]" />
          <span>I agree to the FreshMart <u>Terms of Service</u> and <u>Privacy Policy</u>, and to the substitution preferences in my cart.</span>
        </label>
      </div>

      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 pt-3 pb-4 z-10">
        <PrimaryButton onClick={place} disabled={!!paying}>
          {problems.length && problems[0] !== 'Please accept the terms' ? problems[0] : `Place order · ${peso(total)}`}
        </PrimaryButton>
        <p className="text-[10px] text-center text-gray-400 mt-1.5 flex items-center justify-center gap-1"><ShieldCheck className="w-3 h-3" /> Secured payment · PCI-DSS compliant gateway</p>
      </div>

      {paying && <PaymentSheet method={payMethod} total={total} branchName={branch.name} done={paying === 'done'} />}
    </div>
  );
}

function PaymentSheet({ method, total, branchName, done }: { method: PaymentMethod; total: number; branchName: string; done: boolean }) {
  const online = ONLINE_METHODS.includes(method);
  const brand = method === 'gcash' ? { name: 'GCash', color: '#007dfe' } : method === 'maya' ? { name: 'Maya', color: '#0f9d58' } : method === 'card' ? { name: 'Visa Secure', color: '#1a1f71' } : { name: 'FreshMart', color: '#1e40af' };
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50 fm-fade" />
      <div className="relative bg-white rounded-t-3xl overflow-hidden fm-sheet-up">
        <div className="px-5 py-4 text-white" style={{ background: brand.color }}>
          <p className="text-lg font-black tracking-tight">{brand.name}</p>
          <p className="text-xs opacity-85">{online ? `Pay FreshMart ${branchName}` : 'Placing your order'}</p>
        </div>
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-gray-500">Amount</p>
          <p className="text-3xl font-bold">{peso(total)}</p>
          {method === 'card' && <p className="text-xs text-gray-500 mt-1">Visa •••• 4242 · 3-D Secure</p>}
          {method === 'gcash' && <p className="text-xs text-gray-500 mt-1">GCash account 0917 ••• 4567</p>}
          <div className="mt-5 flex flex-col items-center gap-2">
            {done ? (
              <>
                <span className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center fm-pop"><Check className="w-7 h-7" strokeWidth={3} /></span>
                <p className="text-sm font-semibold text-emerald-700">{online ? 'Payment successful' : 'Order sent to branch'}</p>
              </>
            ) : (
              <>
                <LoaderCircle className="w-10 h-10 animate-spin" style={{ color: brand.color }} />
                <p className="text-sm text-gray-600">{online ? 'Authorizing payment…' : 'Sending your order…'}</p>
              </>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-5">Demo payment — no real money is charged.</p>
        </div>
      </div>
    </div>
  );
}

function FulBtn({ on, disabled, onClick, icon, label, sub }: { on: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <button disabled={disabled} onClick={onClick} className={cn('rounded-xl p-2.5 text-left transition', on ? 'bg-[#1e40af] text-white shadow' : 'bg-transparent text-gray-700', disabled && 'opacity-40')}>
      <span className="flex items-center gap-1.5 text-sm font-semibold">{icon} {label}</span>
      <span className={cn('block text-[11px] mt-0.5', on ? 'text-blue-100' : 'text-gray-500')}>{sub}</span>
    </button>
  );
}
function SlotBtn({ on, onClick, top, bottom }: { on: boolean; onClick: () => void; top: string; bottom: string }) {
  return (
    <button onClick={onClick} className={cn('shrink-0 rounded-xl border px-3 py-2 text-left min-w-[96px]', on ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]' : 'border-gray-200 text-gray-700')}>
      <span className="block text-xs font-semibold">{top}</span>
      <span className="block text-[11px] whitespace-nowrap">{bottom}</span>
    </button>
  );
}
function Row({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-gray-500 line-clamp-2">{sub}</p>
      </div>
      {action}
    </div>
  );
}
function SumRow({ label, value, sub, green }: { label: string; value: string; sub?: string; green?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={cn('tabular-nums', green ? 'text-emerald-600 font-medium' : 'text-gray-900')}>{value}</span>
      </div>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}
export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('w-11 h-6 rounded-full relative transition shrink-0', on ? 'bg-[#1e40af]' : 'bg-gray-300')} role="switch" aria-checked={on}>
      <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

// ====================== CONFIRMATION ======================
export function ConfirmScreen({ orderId }: { orderId: string }) {
  const { s, reset } = useShop();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return <div className="p-8 text-center text-sm text-gray-500">Order not found.</div>;
  const b = s.branches.find((x) => x.id === o.branchId);
  return (
    <div className="min-h-full flex flex-col items-center px-6 pt-12 pb-8 text-center bg-gradient-to-b from-blue-50 to-[#f5f6f8]">
      <span className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 fm-pop"><Check className="w-10 h-10" strokeWidth={3} /></span>
      <h2 className="text-xl font-bold mt-5">Order placed!</h2>
      <p className="text-sm text-gray-600 mt-1">Thank you. {b?.name} branch has received your order.</p>
      <Card className="w-full mt-6 p-4 text-left">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Order number</span>
          <span className="text-base font-bold text-[#1e40af] tracking-wide">{o.number}</span>
        </div>
        <div className="flex justify-between items-center mt-2 text-sm">
          <span className="text-gray-500 text-xs">{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {o.slot}</span>
          <span className="font-semibold">{peso(o.total)}</span>
        </div>
        <div className="flex justify-between items-center mt-2 text-xs">
          <span className="text-gray-500">{PAYMENT_LABEL[o.paymentMethod]}</span>
          <span className={cn('font-semibold', o.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600')}>{o.paymentStatus === 'paid' ? 'Paid' : 'Pay on ' + (o.fulfillment === 'delivery' ? 'delivery' : 'pickup')}</span>
        </div>
        <div className={cn('mt-3 rounded-xl px-3 py-2 text-xs', o.autoConfirmed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
          {o.autoConfirmed ? '✅ Auto-confirmed because you paid online. We are preparing your order now.' : '⏳ Waiting for the branch to confirm your order. You will get a notification.'}
        </div>
        {o.fulfillment === 'pickup' && <p className="mt-3 text-xs text-gray-600">Pickup PIN <b className="text-gray-900 tracking-widest">{o.pickupPin}</b> · {b?.pickupInstructions}</p>}
      </Card>
      <div className="w-full mt-6 space-y-2.5">
        <PrimaryButton onClick={() => reset([{ name: 'orders' }, { name: 'track', orderId: o.id }])}>Track my order</PrimaryButton>
        <button onClick={() => reset([{ name: 'home' }])} className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 flex items-center justify-center gap-1">Continue shopping <ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
