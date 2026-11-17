'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bike, Check, ChevronRight, CircleCheck, Clock, CreditCard, LoaderCircle, MapPin, MessageSquareText, Pencil, ShieldCheck, Snowflake, Store, Ticket, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import type { Fulfillment, PaymentMethod } from '@/src/lib/types';
import { mutate } from '@/src/lib/store';
import { applyVoucher, available, calcDeliveryFee, cutFeeText, getPriceInfo, getSetting, num, ONLINE_METHODS, PAYMENT_LABEL, peso, placeOrder, pesoShort } from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import { cn } from '@/src/lib/utils';
import {
  Card, Container, DEFAULT_SUB_PREF, MobileActionBar, PrimaryButton, ProductImage, ScreenHeader, Stepper, StorageBadge, WeightStepper, cartRemove, cartUpdate, cutById, cutsFor,
  fmtKg, isCold, lineEst, lineKey, lineWeight, makeSlots, meatMaxMins, minKg, useMe, useShop,
} from './shared';

/** Cart lines with estimated totals: weight × price/kg (or qty × price) + cut charge — same as lineTotal(). */
function useCartLines() {
  const { s, branch } = useShop();
  return s.cart
    .map((c) => {
      const p = s.products.find((x) => x.id === c.productId);
      if (!p) return null;
      const info = getPriceInfo(s, p.id, branch.id);
      const avail = p.status === 'active' ? available(s, p.id, branch.id) : 0;
      const cut = cutById(s, c.cutId);
      const kg = p.soldByWeight ? lineWeight(c, p) : undefined;
      const qty = p.soldByWeight ? 1 : Math.min(c.qty, Math.max(avail, 0));
      const total = lineEst(p, info.price, kg ?? qty, cut);
      return { key: lineKey(c), c, p, info, avail, cut, kg, qty, total };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

/** Cold-chain notice for carts with fresh or frozen items. */
function ColdChainNotice({ fulfillment, mins }: { fulfillment: Fulfillment; mins: number }) {
  return (
    <div className="rounded-2xl bg-white border border-[#eadfd6] p-3 text-xs md:text-sm text-[#2a2322] flex gap-2">
      <Snowflake className="w-4 h-4 shrink-0 text-[#ae754d] mt-0.5" />
      <p>
        {fulfillment === 'delivery'
          ? <>Packed in an insulated bag with ice packs and delivered within <b>{mins} minutes</b> of pickup.</>
          : <>Packed in an insulated bag with ice packs. Please keep it cold on the way home.</>}
      </p>
    </div>
  );
}

const editHref = (productId: string, key: string) => `/products/${productId}?edit=${encodeURIComponent(key)}`;

// ====================== CART ======================
export function CartScreen() {
  const { s, shopper, branch, go, effMode, flash } = useShop();
  const lines = useCartLines();
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const okLines = lines.filter((l) => l.avail > 0);
  const subtotal = Math.round(okLines.reduce((n, l) => n + l.total, 0) * 100) / 100;
  const minOrder = num(getSetting(s, 'minOrder', branch.id));
  const unavailable = lines.filter((l) => l.avail === 0);
  const short = lines.filter((l) => l.avail > 0 && !l.p.soldByWeight && l.c.qty > l.avail);
  const belowMin = subtotal < minOrder;
  const hasWeighted = lines.some((l) => l.p.soldByWeight);
  const cold = okLines.some((l) => isCold(l.p));

  if (!lines.length) {
    return (
      <Container className="pb-6">
        <ScreenHeader title="My cart" back={false} />
        <div className="flex flex-col items-center justify-center text-center px-6 py-16">
          <span className="text-6xl" aria-hidden>🛒</span>
          <p className="text-lg font-semibold mt-4">Your cart is empty</p>
          <p className="text-sm text-gray-600 mt-1">Fresh meat from our {branch.name} branch is a few clicks away.</p>
          <Link href="/category" className="mt-6 h-12 px-8 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm inline-flex items-center">Start shopping</Link>
        </div>
      </Container>
    );
  }

  const checkoutBtn = (
    <PrimaryButton disabled={belowMin || okLines.length === 0} onClick={() => go({ name: 'checkout' })}>
      {belowMin ? `Minimum order ${pesoShort(minOrder)}` : shopper ? 'Proceed to checkout' : 'Sign in to check out'}
    </PrimaryButton>
  );

  return (
    <Container className="pb-6">
      <ScreenHeader
        title="My cart"
        sub={`${lines.length} item${lines.length === 1 ? '' : 's'} · ${effMode === 'delivery' ? 'Delivery' : 'Pickup'} from ${branch.name}`}
        back={false}
        right={<button onClick={() => { mutate((d) => { d.cart = []; }); flash('Cart cleared', 'info'); }} className="min-h-11 text-sm text-gray-600 hover:text-[#c8151d] px-2">Clear cart</button>}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_360px] md:gap-6 items-start">
        <div className="space-y-3 min-w-0">
          {(unavailable.length > 0 || short.length > 0) && (
            <div className="rounded-2xl bg-[#fdecec] border border-[#f5c6c8] p-3 text-xs md:text-sm text-[#7d0d12] flex gap-2">
              <TriangleAlert className="w-4 h-4 shrink-0 text-[#c8151d] mt-0.5" />
              <div>
                {unavailable.length > 0 && <p><b>{unavailable.length} item{unavailable.length > 1 ? 's are' : ' is'} no longer available</b> at {branch.name} and will not be ordered.</p>}
                {short.length > 0 && <p className={unavailable.length ? 'mt-1' : ''}>Limited stock: quantities above what&apos;s available will be reduced.</p>}
              </div>
            </div>
          )}
          {cold && <ColdChainNotice fulfillment={effMode} mins={meatMaxMins(s, branch.id)} />}

          {lines.map((l) => {
            const cuts = cutsFor(s, l.p);
            return (
              <Card key={l.key} className={cn('p-3 md:p-4', l.avail === 0 && 'opacity-80')}>
                <div className="flex gap-3">
                  <Link href={editHref(l.p.id, l.key)} aria-label={`Edit ${l.p.name}`} className="shrink-0">
                    <ProductImage emoji={l.p.image} size="sm" className="w-16 h-16 md:w-20 md:h-20 rounded-xl" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/products/${l.p.id}`} className="text-sm md:text-base font-semibold leading-tight hover:text-[#c8151d]">{l.p.name}</Link>
                      <button onClick={() => cartRemove(l.key)} className="w-11 h-11 -mr-2 -mt-2 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-[#c8151d] hover:bg-[#fdecec]" aria-label={`Remove ${l.p.name}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <p className="text-xs text-gray-600 -mt-2">
                      {l.p.soldByWeight ? `${fmtKg(l.kg!)} · ${peso(l.info.price)}/kg` : `${l.p.size} · ${peso(l.info.price)}`}
                      {l.cut && ` · ${l.cut.name}${cutFeeText(l.cut) ? ` (${cutFeeText(l.cut)})` : ''}`}
                    </p>
                    <StorageBadge p={l.p} className="mt-1" />
                    {l.avail === 0 ? (
                      <p className="text-xs font-semibold text-[#a3111a] mt-1">Unavailable at {branch.name} — remove this item</p>
                    ) : !l.p.soldByWeight && l.c.qty > l.avail ? (
                      <p className="text-xs font-semibold text-amber-800 mt-1">Only {l.avail} available</p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                      <p className="text-base font-bold text-[#c8151d]">{peso(l.total)}{l.p.soldByWeight && <span className="text-[11px] font-medium text-gray-500"> est.</span>}</p>
                      {l.avail > 0 && (l.p.soldByWeight
                        ? <WeightStepper size="sm" kg={l.kg!} min={minKg(l.p)} onChange={(kg) => cartUpdate(l.key, { weightKg: kg })} />
                        : <Stepper size="sm" qty={l.c.qty} max={l.avail} onChange={(n) => cartUpdate(l.key, { qty: n })} />)}
                    </div>
                  </div>
                </div>
                {l.avail > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#f1e8e1] flex items-center gap-2 text-xs">
                    <button onClick={() => setNoteOpen(noteOpen === l.key ? null : l.key)} className="flex items-center gap-1.5 text-gray-700 min-w-0 flex-1 text-left min-h-11 hover:text-[#c8151d]">
                      <MessageSquareText className="w-4 h-4 shrink-0" />
                      <span className="truncate">{l.c.note ? `“${l.c.note}”` : 'Add note for the butcher'}</span>
                    </button>
                    {cuts.length > 0 && (
                      <select value={l.c.cutId ?? ''} onChange={(e) => cartUpdate(l.key, { cutId: e.target.value || null })} aria-label="Cut and preparation" className="h-11 md:h-9 max-w-[45%] rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-[#c8151d]">
                        {!l.c.cutId && <option value="">Choose cut</option>}
                        {cuts.map((c) => <option key={c.id} value={c.id}>{c.name}{cutFeeText(c) ? ` (${cutFeeText(c)})` : ''}</option>)}
                      </select>
                    )}
                    <Link href={editHref(l.p.id, l.key)} className="w-11 h-11 md:w-9 md:h-9 shrink-0 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:border-[#c8151d] hover:text-[#c8151d]" aria-label={`Edit ${l.p.name}`}><Pencil className="w-4 h-4" /></Link>
                  </div>
                )}
                {noteOpen === l.key && (
                  <input autoFocus defaultValue={l.c.note ?? ''} onBlur={(e) => { cartUpdate(l.key, { note: e.target.value }); setNoteOpen(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    aria-label="Note for the butcher" placeholder="e.g. less fat, please" className="mt-2 w-full h-11 rounded-xl border border-gray-200 px-3 text-base md:text-sm outline-none focus:border-[#c8151d]" />
                )}
              </Card>
            );
          })}
          {hasWeighted && <p className="text-xs text-gray-600 px-1">⚖️ Weights are estimates. Final price is set when your meat is weighed.</p>}
        </div>

        {/* Summary */}
        <div className="md:sticky md:top-[140px] space-y-3">
          <Card className="p-4">
            <p className="font-display uppercase tracking-wide text-lg font-semibold">Order summary</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm text-gray-600">Subtotal ({okLines.length} item{okLines.length === 1 ? '' : 's'})</span>
              <span className="text-lg font-bold text-gray-900">{peso(subtotal)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Delivery fee and payment options are shown at checkout.</p>
            {belowMin && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-3">
                <p className="text-xs text-amber-900"><b>Add {peso(minOrder - subtotal)} more</b> to reach the {pesoShort(minOrder)} minimum order.</p>
                <div className="h-1.5 bg-amber-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (subtotal / minOrder) * 100)}%` }} /></div>
              </div>
            )}
            <div className="hidden md:block mt-4">{checkoutBtn}</div>
            {!shopper && <p className="text-xs text-gray-500 mt-2 text-center">You&apos;ll sign in or create an account next.</p>}
          </Card>
          <Link href="/category" className="hidden md:flex min-h-11 items-center justify-center gap-1 text-sm font-semibold text-[#c8151d] hover:underline">Continue shopping <ChevronRight className="w-4 h-4" /></Link>
        </div>
      </div>

      <MobileActionBar>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Subtotal</span>
          <span className="text-lg font-bold text-gray-900">{peso(subtotal)}</span>
        </div>
        {checkoutBtn}
      </MobileActionBar>
    </Container>
  );
}

// ====================== CHECKOUT ======================
const PAY_ICON: Record<string, React.ReactNode> = {
  gcash: <span className="w-9 h-9 rounded-lg bg-[#007dfe] text-white text-xs font-black flex items-center justify-center">G</span>,
  maya: <span className="w-9 h-9 rounded-lg bg-[#0f9d58] text-white text-xs font-black flex items-center justify-center">M</span>,
  card: <span className="w-9 h-9 rounded-lg bg-[#2a2322] text-white flex items-center justify-center"><CreditCard className="w-4 h-4" /></span>,
  cod: <span className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center"><Wallet className="w-4 h-4" /></span>,
  pay_at_pickup: <span className="w-9 h-9 rounded-lg bg-[#fdecec] text-[#c8151d] flex items-center justify-center"><Store className="w-4 h-4" /></span>,
};

export function CheckoutScreen() {
  const { s, branch, address, deliveryOk, deliveryBlockReason, effMode, replace, flash, openLocation, pendingVoucher, setPendingVoucher } = useShop();
  const shopper = useMe();
  const lines = useCartLines().filter((l) => l.avail > 0);
  const subtotal = Math.round(lines.reduce((n, l) => n + l.total, 0) * 100) / 100;
  const promosOn = moduleOn(s, 'promotions');
  const cold = lines.some((l) => isCold(l.p));
  const canDeliver = deliveryOk;
  const canPickup = branch.services.pickup;
  const [ful, setFul] = useState<Fulfillment>(effMode === 'delivery' && canDeliver ? 'delivery' : 'pickup');
  const fulfillment: Fulfillment = ful === 'delivery' && !canDeliver ? 'pickup' : ful;
  const prep = num(getSetting(s, 'prepMinutes', branch.id)) || 20;
  const scheduledOn = getSetting(s, 'ff_scheduled', branch.id) !== false;
  const slots = makeSlots(branch, fulfillment === 'delivery' ? 60 : prep);
  const [slot, setSlot] = useState('ASAP');
  const [instr, setInstr] = useState(address.landmark ? `Landmark: ${address.landmark}. ` : '');
  const [code, setCode] = useState(promosOn ? pendingVoucher : '');
  const [applied, setApplied] = useState(promosOn ? pendingVoucher : '');
  const [pay, setPay] = useState<PaymentMethod>('gcash');
  const [terms, setTerms] = useState(false);
  const [paying, setPaying] = useState<null | 'sheet' | 'done'>(null);

  const feeInfo = fulfillment === 'delivery' ? calcDeliveryFee(s, branch.id, subtotal, address) : null;
  const deliveryFee = feeInfo?.fee ?? 0;
  const online = ONLINE_METHODS.includes(pay);
  const gwPct = num(getSetting(s, 'gatewayFeePct', branch.id));
  const serviceFee = online ? Math.round((subtotal * gwPct) / 100) : 0;
  const vres = promosOn && applied ? applyVoucher(s, applied, subtotal, deliveryFee, fulfillment) : null;
  const voucherDisc = vres?.ok ? vres.discount : 0;
  const pickupPct = fulfillment === 'pickup' ? num(getSetting(s, 'pickupDiscountPct', branch.id)) : 0;
  const pickupDisc = Math.round((subtotal * pickupPct) / 100);
  const total = Math.max(0, Math.round((subtotal + deliveryFee + serviceFee - voucherDisc - pickupDisc) * 100) / 100);
  const codLimit = num(getSetting(s, 'codLimit', branch.id));
  const minOrder = num(getSetting(s, 'minOrder', branch.id));
  const methods: PaymentMethod[] = fulfillment === 'delivery' ? ['gcash', 'maya', 'card', 'cod'] : ['gcash', 'maya', 'card', 'pay_at_pickup'];
  const payMethod: PaymentMethod = methods.includes(pay) && !(pay === 'cod' && total > codLimit) ? pay : 'gcash';
  const walletVouchers = s.vouchers.filter((v) => v.active && new Date(v.end) > new Date());
  const eta = feeInfo?.zone?.etaMins ?? calcDeliveryFee(s, branch.id, subtotal, address).zone?.etaMins ?? 45;

  if (!lines.length && !paying) {
    return (
      <Container className="pb-6">
        <ScreenHeader title="Checkout" back="/cart" />
        <div className="text-center py-16">
          <span className="text-6xl" aria-hidden>🛒</span>
          <p className="text-lg font-semibold mt-4">Your cart is empty</p>
          <Link href="/category" className="mt-6 h-12 px-8 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm inline-flex items-center">Start shopping</Link>
        </div>
      </Container>
    );
  }

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
      lines: lines.map((l) => ({ productId: l.p.id, qty: l.qty, weightKg: l.kg, cutId: l.cut?.id, note: l.c.note, subPref: DEFAULT_SUB_PREF })),
      paymentMethod: payMethod,
      voucherCode: vres?.ok ? applied.toUpperCase() : undefined,
      riderInstructions: fulfillment === 'delivery' && instr.trim() ? instr.trim() : undefined,
    });
    mutate((d) => { d.cart = []; });
    setPendingVoucher('');
    replace({ name: 'confirm', orderId: id });
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

  const placeBtn = (
    <PrimaryButton onClick={place} disabled={!!paying}>
      {problems.length && problems[0] !== 'Please accept the terms' ? problems[0] : `Place order · ${peso(total)}`}
    </PrimaryButton>
  );

  return (
    <Container className="pb-6">
      <ScreenHeader title="Checkout" sub={`${branch.name} branch · ${lines.length} item${lines.length === 1 ? '' : 's'}`} back="/cart" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px] md:gap-6 items-start">
        <div className="space-y-3 min-w-0">
          {/* Fulfillment */}
          <Card className="p-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <FulBtn on={fulfillment === 'delivery'} disabled={!canDeliver} onClick={() => setFul('delivery')} icon={<Bike className="w-4 h-4" />} label="Delivery" sub={canDeliver ? `about ${eta} min` : 'Not available'} />
              <FulBtn on={fulfillment === 'pickup'} disabled={!canPickup} onClick={() => setFul('pickup')} icon={<Store className="w-4 h-4" />} label="Pickup" sub={canPickup ? `Ready in about ${prep} min` : 'Not available'} />
            </div>
            {!canDeliver && <p className="text-xs text-amber-800 px-2 pt-2 pb-1">{deliveryBlockReason}</p>}
          </Card>

          {/* Address / branch */}
          {fulfillment === 'delivery' ? (
            <Card className="p-4">
              <Row icon={<MapPin className="w-4 h-4 text-[#c8151d]" />} title={`Deliver to ${address.label}`} sub={address.line} action={<button onClick={openLocation} className="min-h-11 px-2 text-sm font-semibold text-[#c8151d] hover:underline">Change</button>} />
              <label htmlFor="rider-instr" className="sr-only">Instructions for the rider</label>
              <textarea id="rider-instr" value={instr} onChange={(e) => setInstr(e.target.value)} rows={2} placeholder="Instructions for the rider (gate, landmark, call on arrival…)" className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-base md:text-sm outline-none focus:border-[#c8151d] resize-none" />
            </Card>
          ) : (
            <Card className="p-4">
              <Row icon={<Store className="w-4 h-4 text-[#c8151d]" />} title={`Pick up at ${branch.name}`} sub={branch.address} action={<button onClick={openLocation} className="min-h-11 px-2 text-sm font-semibold text-[#c8151d] hover:underline">Change</button>} />
              <div className="mt-3 rounded-xl bg-[#f6ece4] px-3 py-2 text-xs text-[#5c3b24]">📍 {branch.pickupInstructions} · Open {branch.hours}</div>
            </Card>
          )}

          {/* Slot */}
          <Card className="p-4">
            <p className="text-sm font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-[#c8151d]" /> {fulfillment === 'delivery' ? 'Delivery time' : 'Pickup time'}</p>
            <div className="flex gap-2 overflow-x-auto fm-noscroll mt-3 -mx-1 px-1 md:flex-wrap">
              <SlotBtn on={slot === 'ASAP'} onClick={() => setSlot('ASAP')} top={fulfillment === 'delivery' ? 'ASAP' : 'Earliest'} bottom={fulfillment === 'delivery' ? `about ${feeInfo?.zone?.etaMins ?? 45} min` : `about ${prep} min`} />
              {scheduledOn && slots.map((sl) => {
                const [day, ...rest] = sl.split(' ');
                return <SlotBtn key={sl} on={slot === sl} onClick={() => setSlot(sl)} top={day} bottom={rest.join(' ')} />;
              })}
            </div>
          </Card>

          {cold && <ColdChainNotice fulfillment={fulfillment} mins={meatMaxMins(s, branch.id)} />}

          {/* Voucher (Phase 2: only when the Promotions module is on) */}
          {promosOn && (
            <Card className="p-4">
              <p className="text-sm font-semibold flex items-center gap-2"><Ticket className="w-4 h-4 text-[#c8151d]" /> Voucher</p>
              <form onSubmit={(e) => { e.preventDefault(); setApplied(code.trim()); }} className="flex gap-2 mt-3">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter code" aria-label="Voucher code" className="flex-1 min-w-0 h-11 rounded-xl border border-gray-200 px-3 text-base md:text-sm uppercase outline-none focus:border-[#c8151d]" />
                {applied && vres?.ok ? (
                  <button type="button" onClick={() => { setApplied(''); setCode(''); }} className="h-11 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Remove</button>
                ) : (
                  <button type="submit" disabled={!code.trim()} className="h-11 px-4 rounded-xl bg-[#2a2322] text-white text-sm font-semibold disabled:bg-gray-300 disabled:text-gray-600">Apply</button>
                )}
              </form>
              {vres && (vres.ok ? (
                <p className="mt-2 text-xs text-emerald-800 flex items-center gap-1"><CircleCheck className="w-3.5 h-3.5" /> {vres.voucher.code} applied — you save {peso(vres.discount)} ({vres.voucher.description})</p>
              ) : (
                <p className="mt-2 text-xs text-[#a3111a] flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" /> {applied}: {vres.reason}</p>
              ))}
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {[...walletVouchers.map((v) => v.code), 'PAYDAY50'].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
                  <button key={c} onClick={() => { setCode(c); setApplied(c); }} className="h-9 text-xs font-semibold px-3 rounded-lg border border-dashed border-[#c8151d]/50 text-[#a3111a] bg-[#fdf5f5]">{c}</button>
                ))}
              </div>
            </Card>
          )}

          {/* Payment */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3">Payment method</p>
            <div className="space-y-2" role="radiogroup" aria-label="Payment method">
              {methods.map((m) => {
                const codBlocked = m === 'cod' && total > codLimit;
                return (
                  <button key={m} role="radio" aria-checked={payMethod === m} disabled={codBlocked} onClick={() => setPay(m)} className={cn('w-full flex items-center gap-3 rounded-xl border p-3 text-left min-h-14', payMethod === m ? 'border-[#c8151d] bg-[#fdf5f5]' : 'border-gray-200 hover:border-gray-300', codBlocked && 'opacity-50')}>
                    {PAY_ICON[m]}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold">{m === 'card' ? 'Credit / Debit card' : PAYMENT_LABEL[m]}</span>
                      <span className="block text-xs text-gray-600">
                        {m === 'card' ? 'Online · Visa or Mastercard, handled by the payment gateway' : m === 'gcash' ? 'Online · pay with your GCash wallet' : m === 'maya' ? 'Online · pay with your Maya wallet' : codBlocked ? `Not available above ${pesoShort(codLimit)}` : m === 'cod' ? `Pay the rider in cash · up to ${pesoShort(codLimit)}` : 'Pay cash at the branch counter'}
                      </span>
                    </span>
                    <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0', payMethod === m ? 'border-[#c8151d] bg-[#c8151d]' : 'border-gray-300')}>{payMethod === m && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Summary */}
        <div className="md:sticky md:top-[140px] space-y-3">
          <Card className="p-4 text-sm">
            <p className="font-display uppercase tracking-wide text-lg font-semibold mb-3">Order summary</p>
            <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
              {lines.map((l) => (
                <div key={l.key} className="flex justify-between gap-2 text-xs text-gray-700">
                  <span className="min-w-0">{l.p.soldByWeight ? fmtKg(l.kg!) : `${l.qty} ×`} {l.p.name}{l.cut ? ` · ${l.cut.name}` : ''}</span>
                  <span className="tabular-nums shrink-0">{peso(l.total)}{l.p.soldByWeight ? ' est.' : ''}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#f1e8e1] pt-3 space-y-1.5">
              <SumRow label="Subtotal" value={peso(subtotal)} />
              {fulfillment === 'delivery' && <SumRow label="Delivery fee" value={deliveryFee === 0 ? 'FREE' : peso(deliveryFee)} sub={feeInfo?.rule} green={deliveryFee === 0} />}
              {online && <SumRow label={`Service fee (${gwPct}% online payment)`} value={peso(serviceFee)} />}
              {pickupDisc > 0 && <SumRow label={`Pickup discount (${pickupPct}%)`} value={`−${peso(pickupDisc)}`} green />}
              {voucherDisc > 0 && <SumRow label={`Voucher ${applied.toUpperCase()}`} value={`−${peso(voucherDisc)}`} green />}
              <div className="flex justify-between pt-2 border-t border-[#f1e8e1]">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold text-[#c8151d]">{peso(total)}</span>
              </div>
              <p className="text-[11px] text-gray-500">Prices are VAT inclusive. Final price is set when your meat is weighed.</p>
            </div>
            <label className="mt-4 flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[#c8151d]" />
              <span>I agree to the Jovanne’s Meat Shop <u>Terms of Service</u> and <u>Privacy Policy</u>. If an item is unavailable, the branch will call me at {shopper.mobile || 'my mobile number'}.</span>
            </label>
            <div className="hidden md:block mt-4">{placeBtn}</div>
            <p className="hidden md:flex text-[11px] text-center text-gray-500 mt-2 items-center justify-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Secured payment · PCI-DSS compliant gateway</p>
          </Card>
        </div>
      </div>

      <MobileActionBar>
        {placeBtn}
        <p className="text-[11px] text-center text-gray-500 mt-1.5 flex items-center justify-center gap-1"><ShieldCheck className="w-3 h-3" /> Secured payment · PCI-DSS compliant gateway</p>
      </MobileActionBar>

      {paying && <PaymentSheet method={payMethod} total={total} branchName={branch.name} done={paying === 'done'} />}
    </Container>
  );
}

function PaymentSheet({ method, total, branchName, done }: { method: PaymentMethod; total: number; branchName: string; done: boolean }) {
  const online = ONLINE_METHODS.includes(method);
  const brand = method === 'gcash' ? { name: 'GCash', color: '#007dfe' } : method === 'maya' ? { name: 'Maya', color: '#0f9d58' } : method === 'card' ? { name: 'Card payment', color: '#2a2322' } : { name: 'Jovanne’s Meat Shop', color: '#c8151d' };
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Payment">
      <div className="absolute inset-0 bg-black/50 fm-fade" />
      <div className="relative bg-white rounded-t-3xl md:rounded-3xl overflow-hidden fm-sheet-up w-full md:max-w-md pb-[env(safe-area-inset-bottom)]">
        <div className="px-5 py-4 text-white" style={{ background: brand.color }}>
          <p className="text-lg font-black tracking-tight">{brand.name}</p>
          <p className="text-xs opacity-85">{online ? `Pay Jovanne’s Meat Shop ${branchName}` : 'Placing your order'}</p>
        </div>
        <div className="px-5 py-6 text-center" aria-live="polite">
          <p className="text-xs text-gray-500">Amount</p>
          <p className="text-3xl font-bold">{peso(total)}</p>
          {method === 'card' && <p className="text-xs text-gray-500 mt-1">3-D Secure card check</p>}
          <div className="mt-5 flex flex-col items-center gap-2">
            {done ? (
              <>
                <span className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center fm-pop"><Check className="w-7 h-7" strokeWidth={3} /></span>
                <p className="text-sm font-semibold text-emerald-800">{online ? 'Payment successful' : 'Order sent to branch'}</p>
              </>
            ) : (
              <>
                <LoaderCircle className="w-10 h-10 animate-spin" style={{ color: brand.color }} />
                <p className="text-sm text-gray-600">{online ? 'Authorizing payment…' : 'Sending your order…'}</p>
              </>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-5">Demo payment — no real money is charged.</p>
        </div>
      </div>
    </div>
  );
}

function FulBtn({ on, disabled, onClick, icon, label, sub }: { on: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <button disabled={disabled} onClick={onClick} aria-pressed={on} className={cn('rounded-xl p-3 text-left transition min-h-14', on ? 'bg-[#c8151d] text-white shadow' : 'bg-transparent text-gray-800 hover:bg-gray-50', disabled && 'opacity-40')}>
      <span className="flex items-center gap-1.5 text-sm font-semibold">{icon} {label}</span>
      <span className={cn('block text-xs mt-0.5', on ? 'text-white/85' : 'text-gray-600')}>{sub}</span>
    </button>
  );
}
function SlotBtn({ on, onClick, top, bottom }: { on: boolean; onClick: () => void; top: string; bottom: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cn('shrink-0 rounded-xl border px-3 py-2 text-left min-w-[104px] min-h-12', on ? 'border-[#c8151d] bg-[#fdecec] text-[#a3111a]' : 'border-gray-200 text-gray-700 hover:border-gray-300')}>
      <span className="block text-xs font-semibold">{top}</span>
      <span className="block text-xs whitespace-nowrap">{bottom}</span>
    </button>
  );
}
function Row({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-full bg-[#fdecec] flex items-center justify-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-gray-600 line-clamp-2">{sub}</p>
      </div>
      {action}
    </div>
  );
}
function SumRow({ label, value, sub, green }: { label: string; value: string; sub?: string; green?: boolean }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={cn('tabular-nums shrink-0', green ? 'text-emerald-700 font-medium' : 'text-gray-900')}>{value}</span>
      </div>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}
export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="w-14 h-11 -mr-1.5 flex items-center justify-center shrink-0" role="switch" aria-checked={on} aria-label={label}>
      <span className={cn('w-11 h-6 rounded-full relative transition', on ? 'bg-[#c8151d]' : 'bg-gray-300')}>
        <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

// ====================== CONFIRMATION ======================
export function ConfirmScreen({ orderId }: { orderId: string }) {
  const { s, replace } = useShop();
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return <Container className="py-16 text-center text-sm text-gray-600">Order not found.</Container>;
  const b = s.branches.find((x) => x.id === o.branchId);
  return (
    <Container className="pb-8">
      <div className="max-w-lg mx-auto flex flex-col items-center pt-10 md:pt-16 text-center">
        <span className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 fm-pop"><Check className="w-10 h-10" strokeWidth={3} /></span>
        <h1 className="font-display uppercase tracking-wide text-3xl font-semibold mt-5">Order placed!</h1>
        <p className="text-sm text-gray-600 mt-1">Thank you. Our {b?.name} branch has received your order.</p>
        <Card className="w-full mt-6 p-4 text-left">
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-gray-600">Order number</span>
            <span className="text-base font-bold text-[#c8151d] tracking-wide">{o.number}</span>
          </div>
          <div className="flex justify-between items-center gap-2 mt-2 text-sm">
            <span className="text-gray-600 text-xs">{o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'} · {o.slot}</span>
            <span className="font-semibold">{peso(o.total)}</span>
          </div>
          <div className="flex justify-between items-center gap-2 mt-2 text-xs">
            <span className="text-gray-600">{PAYMENT_LABEL[o.paymentMethod]}</span>
            <span className={cn('font-semibold', o.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-800')}>{o.paymentStatus === 'paid' ? 'Paid' : 'Pay on ' + (o.fulfillment === 'delivery' ? 'delivery' : 'pickup')}</span>
          </div>
          <div className={cn('mt-3 rounded-xl px-3 py-2 text-xs', o.autoConfirmed ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900')}>
            {o.autoConfirmed ? '✅ Confirmed because you paid online. Our butchers are preparing your order now.' : '⏳ Waiting for the branch to confirm your order. You will get a notification.'}
          </div>
          {o.coldChain && (
            <p className="mt-3 text-xs text-[#2a2322] bg-[#f6ece4] rounded-xl px-3 py-2">
              🧊 Packed in an insulated bag with ice packs{o.fulfillment === 'delivery' ? ` and delivered within ${o.maxDeliveryMins ?? meatMaxMins(s, o.branchId)} minutes of pickup` : ''}.
            </p>
          )}
          <p className="mt-3 text-xs text-gray-700">⚖️ Final price is set when your meat is weighed. If an item is unavailable, the branch will call you.</p>
          {o.fulfillment === 'pickup' && <p className="mt-3 text-xs text-gray-700">Pickup PIN <b className="text-gray-900 tracking-widest">{o.pickupPin}</b> · {b?.pickupInstructions}</p>}
        </Card>
        <div className="w-full mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <PrimaryButton onClick={() => replace({ name: 'track', orderId: o.id })}>Track my order</PrimaryButton>
          <Link href="/" className="w-full h-12 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-800 hover:border-gray-300 flex items-center justify-center gap-1">Continue shopping <ChevronRight className="w-4 h-4" /></Link>
        </div>
      </div>
    </Container>
  );
}
