'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Bike, Check, ChevronRight, CircleCheck, Clock, CreditCard, LoaderCircle, MapPin, Minus, Plus, Scale, ShieldCheck, ShoppingCart, Snowflake, SquarePen, Store, Ticket, Trash2,
  TriangleAlert, Wallet,
} from 'lucide-react';
import type { Fulfillment, PaymentMethod, Product } from '@/src/lib/types';
import { mutate } from '@/src/lib/store';
import { applyVoucher, available, calcDeliveryFee, cutFeeText, getPriceInfo, getSetting, num, ONLINE_METHODS, PAYMENT_LABEL, peso, placeOrder, pesoShort, slotBookable } from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import { cn } from '@/src/lib/utils';
import {
  Card, Container, DEFAULT_SUB_PREF, MobileActionBar, PrimaryButton, ProductImage, ScreenHeader, Sheet, cartRemove, cartUpdate, cutById, cutsFor,
  fmtKg, isCold, lineEst, lineKey, lineWeight, makeSlots, meatMaxMins, minKg, roundKg, useMe, useShop,
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
/** "₱360" for whole amounts, "₱312.50" otherwise. */
const money = (n: number) => (Math.round(n * 100) % 100 === 0 ? pesoShort(n) : peso(n));

/** Street part of an address line without the city: "Purok 3, Dawis, Digos City" → "Purok 3, Dawis". */
const streetPart = (line: string) => line.split(',').map((x) => x.trim()).filter((x) => x && !/digos city|davao/i.test(x)).join(', ') || line;
/** Neighbourhood and city: "Purok 3, Dawis, Digos City" → "Dawis, Digos City". */
const areaPart = (line: string) => line.split(',').map((x) => x.trim()).filter(Boolean).slice(-2).join(', ');

/** Weight step for the cart stepper: the smallest gap between the product's preset weights (0.25 kg by default). */
function weightStep(p: Product) {
  const ch = [...(p.weightChoices ?? [])].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < ch.length; i++) step = Math.min(step, ch[i] - ch[i - 1]);
  return Number.isFinite(step) && step >= 0.25 ? roundKg(step) : 0.25;
}
const unitWord = (p: Product) => (p.soldByWeight ? 'kg' : p.unit === 'pack' ? 'pack' : 'piece');
const qtyLabel = (p: Product, n: number) => (p.unit === 'pack' ? `${n} pack${n === 1 ? '' : 's'}` : `${n} pc${n === 1 ? '' : 's'}`);

/** Outlined "− 1 kg +" box. */
function QtyBox({ label, onMinus, onPlus, minusDisabled, plusDisabled, what }: { label: string; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean; what: string }) {
  return (
    <div className="inline-flex items-center h-12 w-[160px] rounded-lg border border-[#d9ccc1] bg-white">
      <button type="button" onClick={onMinus} disabled={minusDisabled} className="w-11 h-full flex items-center justify-center rounded-l-lg hover:bg-[#f4efea] disabled:opacity-35" aria-label={`Less ${what}`}><Minus className="w-4 h-4" /></button>
      <span className="flex-1 text-center text-sm font-semibold tabular-nums whitespace-nowrap" aria-live="polite">{label}</span>
      <button type="button" onClick={onPlus} disabled={plusDisabled} className="w-11 h-full flex items-center justify-center rounded-r-lg hover:bg-[#f4efea] disabled:opacity-35" aria-label={`More ${what}`}><Plus className="w-4 h-4" /></button>
    </div>
  );
}

const CART_GRID = 'md:grid-cols-[minmax(0,1fr)_160px_120px] md:gap-6';

export function CartScreen() {
  const { s, shopper, branch, go, effMode, setMode, deliveryOk, deliveryBlockReason, address, openLocation, flash } = useShop();
  const lines = useCartLines();
  const [clearOpen, setClearOpen] = useState(false);
  const okLines = lines.filter((l) => l.avail > 0);
  const subtotal = Math.round(okLines.reduce((n, l) => n + l.total, 0) * 100) / 100;
  const minOrder = num(getSetting(s, 'minOrder', branch.id));
  const unavailable = lines.filter((l) => l.avail === 0);
  const short = lines.filter((l) => l.avail > 0 && !l.p.soldByWeight && l.c.qty > l.avail);
  const belowMin = subtotal < minOrder;
  const hasWeighted = okLines.some((l) => l.p.soldByWeight);
  const approx = hasWeighted ? '≈ ' : '';
  const cold = okLines.some((l) => isCold(l.p));
  const prep = num(getSetting(s, 'prepMinutes', branch.id)) || 20;
  const canPickup = branch.services.pickup;
  const dz = deliveryOk ? calcDeliveryFee(s, branch.id, subtotal, address) : null;
  const eta = dz?.zone?.etaMins ?? 45;
  const delivery = effMode === 'delivery';
  const deliveryFee = delivery ? dz?.fee ?? 0 : 0;
  const estTotal = Math.round((subtotal + deliveryFee) * 100) / 100;
  const freeAbove = delivery ? dz?.zone?.freeAbove : undefined;

  if (!lines.length) {
    return (
      <Container className="max-w-[1280px] pb-10">
        <CartHeading />
        <div className="mt-6 rounded-xl border border-[#eadfd6] bg-[#fffdfb] flex flex-col items-center justify-center text-center px-6 py-16">
          <ShoppingCart className="w-12 h-12 text-gray-300" aria-hidden />
          <p className="text-lg font-semibold mt-4">Your cart is empty</p>
          <p className="text-sm text-gray-600 mt-1">Fresh meat from our {branch.name} branch is a few clicks away.</p>
          <Link href="/category" className="mt-6 h-12 px-8 rounded-lg bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm inline-flex items-center">Start shopping</Link>
        </div>
      </Container>
    );
  }

  const checkoutLabel = belowMin ? `Minimum order ${pesoShort(minOrder)}` : shopper ? 'Proceed to checkout' : 'Sign in to check out';
  const checkoutBtn = (
    <button
      onClick={() => go({ name: 'checkout' })} disabled={belowMin || okLines.length === 0}
      className="w-full h-12 md:h-14 rounded-lg bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-base disabled:bg-gray-300 disabled:text-gray-600 transition"
    >
      {checkoutLabel}
    </button>
  );

  return (
    <Container className="max-w-[1280px] pb-10">
      <CartHeading
        sub={`${lines.length} item${lines.length === 1 ? '' : 's'} · ${delivery ? `Delivery to ${areaPart(address.line)}` : `Pickup at ${branch.name}`}`}
        right={
          <button onClick={() => setClearOpen(true)} className="min-h-11 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#c8151d]">
            <Trash2 className="w-4 h-4" /> Remove all<span className="hidden sm:inline"> items</span>
          </button>
        }
      />

      <div className="mt-5 md:mt-7 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 items-start">
        <div className="min-w-0 space-y-3">
          {(unavailable.length > 0 || short.length > 0) && (
            <div className="rounded-xl bg-[#fdecec] border border-[#f5c6c8] p-3 text-xs md:text-sm text-[#7d0d12] flex gap-2">
              <TriangleAlert className="w-4 h-4 shrink-0 text-[#c8151d] mt-0.5" />
              <div>
                {unavailable.length > 0 && <p><b>{unavailable.length} item{unavailable.length > 1 ? 's are' : ' is'} no longer available</b> at {branch.name} and will not be ordered.</p>}
                {short.length > 0 && <p className={unavailable.length ? 'mt-1' : ''}>Limited stock: quantities above what&apos;s available will be reduced.</p>}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#eadfd6] bg-[#fffdfb] overflow-hidden">
            <div className={cn(CART_GRID, 'hidden md:grid px-5 py-3 border-b border-[#eadfd6] text-[11px] font-semibold tracking-[0.08em] text-gray-500 uppercase')}>
              <span>Product</span><span className="text-center">Quantity</span><span className="text-right">Est. total</span>
            </div>
            {lines.map((l) => {
              const cuts = cutsFor(s, l.p);
              const step = weightStep(l.p);
              const storage = l.p.storage === 'fresh' ? 'Kept chilled' : l.p.storage === 'frozen' ? 'Kept frozen' : '';
              return (
                <div key={l.key} className={cn(CART_GRID, 'grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 md:px-5 py-4 md:py-5 border-b border-[#f0e7df]')}>
                  {/* Product */}
                  <div className="contents md:flex md:gap-4 md:min-w-0">
                    <Link href={editHref(l.p.id, l.key)} aria-label={`Edit ${l.p.name}`} className={cn('shrink-0 row-span-2 md:row-auto', l.avail === 0 && 'opacity-60')}>
                      <ProductImage emoji={l.p.image} size="sm" className="w-[72px] h-[72px] md:w-[110px] md:h-[110px] rounded-lg" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/products/${l.p.id}`} className="text-base md:text-lg font-semibold text-[#2a2322] leading-snug hover:text-[#c8151d]">{l.p.name}</Link>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {money(l.info.price)} per {unitWord(l.p)}
                        {storage && <> · <span className="font-semibold text-[#1f6b3f]">{storage}</span></>}
                      </p>
                      {l.avail === 0 ? (
                        <p className="text-xs font-semibold text-[#a3111a] mt-1">Unavailable at {branch.name}. Remove this item.</p>
                      ) : !l.p.soldByWeight && l.c.qty > l.avail ? (
                        <p className="text-xs font-semibold text-amber-800 mt-1">Only {l.avail} available</p>
                      ) : null}
                      {l.avail > 0 && cuts.length > 0 && (
                        <label className="mt-2.5 flex items-center gap-2.5 text-sm">
                          <span className="font-medium text-gray-700">Preparation</span>
                          <select
                            value={l.c.cutId ?? ''} onChange={(e) => cartUpdate(l.key, { cutId: e.target.value || null })}
                            className="h-11 min-w-0 flex-1 sm:flex-none max-w-[220px] rounded-lg border border-[#d9ccc1] bg-white pl-3 pr-8 text-base md:text-sm text-[#2a2322] outline-none focus:border-[#2a2322]"
                          >
                            {!l.c.cutId && <option value="">Choose</option>}
                            {cuts.map((c) => <option key={c.id} value={c.id}>{c.name}{cutFeeText(c) ? ` (${cutFeeText(c)})` : ''}</option>)}
                          </select>
                        </label>
                      )}
                      {l.avail > 0 && (
                        <label className="mt-2.5 flex items-center gap-2 h-11 max-w-[550px] rounded-lg border border-dashed border-[#d9ccc1] px-3 focus-within:border-[#2a2322] focus-within:border-solid">
                          <SquarePen className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                          <span className="sr-only">Note for the butcher</span>
                          <input
                            key={`${l.key}|${l.c.note ?? ''}`} defaultValue={l.c.note ?? ''} placeholder="Add a note for the butcher" maxLength={140}
                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.c.note ?? '')) cartUpdate(l.key, { note: v }); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="flex-1 min-w-0 bg-transparent outline-none text-base md:text-sm"
                          />
                        </label>
                      )}
                      <button onClick={() => cartRemove(l.key)} className="mt-1.5 min-h-9 text-sm text-gray-700 underline underline-offset-4 hover:text-[#c8151d]" aria-label={`Remove ${l.p.name}`}>Remove</button>
                    </div>
                  </div>

                  {/* Quantity + total (one row on phones) */}
                  <div className="col-start-2 md:col-start-auto flex items-center justify-between gap-3 md:contents">
                    <div className="md:flex md:justify-center md:self-start">
                      {l.avail > 0 && (l.p.soldByWeight ? (
                        <QtyBox
                          what="weight" label={fmtKg(l.kg!)}
                          onMinus={() => cartUpdate(l.key, { weightKg: Math.max(minKg(l.p), l.kg! - step) })} minusDisabled={l.kg! <= minKg(l.p)}
                          onPlus={() => cartUpdate(l.key, { weightKg: l.kg! + step })}
                        />
                      ) : (
                        <QtyBox
                          what="quantity" label={qtyLabel(l.p, l.c.qty)}
                          onMinus={() => cartUpdate(l.key, { qty: l.c.qty - 1 })}
                          onPlus={() => cartUpdate(l.key, { qty: l.c.qty + 1 })} plusDisabled={l.c.qty >= l.avail}
                        />
                      ))}
                    </div>
                    <div className="text-right md:self-start md:pt-2.5">
                      <p className={cn('text-lg font-bold tabular-nums whitespace-nowrap',l.avail === 0 ? 'text-gray-400 line-through' : 'text-[#2a2322]')}>{l.p.soldByWeight ? '≈ ' : ''}{money(l.total)}</p>
                      {l.p.soldByWeight && <p className="text-xs text-gray-500">by weight</p>}
                    </div>
                  </div>
                </div>
              );
            })}
            {hasWeighted && (
              <div className="px-4 md:px-5 py-4 flex gap-3 text-sm text-gray-600">
                <Scale className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <p>Items sold by weight are estimates. We weigh each cut after preparation and you pay the actual weight, usually within 5%. Any difference is refunded or charged automatically.</p>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-[140px] space-y-3">
          <section className="rounded-xl border border-[#eadfd6] bg-[#fffdfb]" aria-labelledby="cart-summary">
            <h2 id="cart-summary" className="px-5 py-4 border-b border-[#eadfd6] text-lg md:text-xl font-semibold text-[#2a2322]">Order summary</h2>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#efe9e4] p-1" role="radiogroup" aria-label="Delivery or pickup">
                <ModeBtn on={delivery} disabled={!deliveryOk} onClick={() => setMode('delivery')} label="Delivery" sub={deliveryOk ? `about ${eta} min` : 'Not available'} />
                <ModeBtn on={!delivery} disabled={!canPickup} onClick={() => setMode('pickup')} label="Pickup" sub={canPickup ? `ready in ${prep} min` : 'Not available'} />
              </div>
              {!deliveryOk && deliveryBlockReason && <p className="mt-2 text-xs text-amber-800">{deliveryBlockReason}</p>}

              <div className="mt-3 rounded-lg border border-[#eadfd6] bg-white p-3.5 flex items-center gap-3">
                {delivery ? <MapPin className="w-5 h-5 text-[#2a2322] shrink-0" aria-hidden /> : <Store className="w-5 h-5 text-[#2a2322] shrink-0" aria-hidden />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#2a2322] truncate">{delivery ? `${address.label} · ${streetPart(address.line)}` : `${branch.name} branch`}</p>
                  <p className="text-xs text-gray-600 truncate">{delivery ? `${dz?.distance ?? 0} km · about ${eta} min` : `${branch.address} · ready in ${prep} min`}</p>
                </div>
                <button onClick={openLocation} className="min-h-11 px-1 text-sm font-semibold text-[#c8151d] hover:underline shrink-0">Change</button>
              </div>

              <div className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-2"><span className="text-gray-700">Items ({okLines.length}{hasWeighted ? ', estimated' : ''})</span><span className="tabular-nums">{approx}{money(subtotal)}</span></div>
                {delivery && <div className="flex justify-between gap-2"><span className="text-gray-700">Delivery fee</span><span className={cn('tabular-nums', deliveryFee === 0 && 'text-[#1f6b3f] font-semibold')}>{deliveryFee === 0 ? 'Free' : money(deliveryFee)}</span></div>}
              </div>
              <div className="mt-3 pt-3 border-t border-[#eadfd6] flex justify-between items-baseline gap-2">
                <span className="text-base md:text-lg font-semibold text-[#2a2322]">Estimated total</span>
                <span className="text-lg md:text-xl font-bold tabular-nums text-[#2a2322]">{approx}{money(estTotal)}</span>
              </div>

              {!!freeAbove && (
                <div className="mt-3">
                  <p className="text-xs text-[#2a2322]">{subtotal >= freeAbove ? 'You get free delivery' : `${money(freeAbove - subtotal)} more for free delivery`}</p>
                  <div className="h-1.5 bg-[#ece5de] rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-[#1f6b3f] rounded-full" style={{ width: `${Math.min(100, (subtotal / freeAbove) * 100)}%` }} /></div>
                </div>
              )}

              {belowMin && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mt-3">
                  <p className="text-xs text-amber-900"><b>Add {peso(minOrder - subtotal)} more</b> to reach the {pesoShort(minOrder)} minimum order.</p>
                  <div className="h-1.5 bg-amber-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (subtotal / minOrder) * 100)}%` }} /></div>
                </div>
              )}

              <div className="hidden md:block mt-4">{checkoutBtn}</div>
              {!shopper && <p className="text-xs text-gray-500 mt-2 text-center">You&apos;ll sign in or create an account next.</p>}
              <p className="mt-3 text-xs text-gray-500 text-center">GCash · Maya · Visa · Mastercard · {delivery ? 'Cash on delivery' : 'Pay at pickup'}</p>
            </div>
          </section>

          {cold && (
            <div className="rounded-xl border border-[#eadfd6] bg-[#fffdfb] px-4 py-3.5 flex gap-3 text-sm text-[#2a2322]">
              <Snowflake className="w-5 h-5 shrink-0 text-[#2c4f9e]" aria-hidden />
              <p>
                {delivery
                  ? <>Packed in an insulated bag with ice packs and delivered within {meatMaxMins(s, branch.id)} minutes of packing.</>
                  : <>Packed in an insulated bag with ice packs. Please keep it cold on the way home.</>}
              </p>
            </div>
          )}
          <Link href="/category" className="flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-[#c8151d] hover:underline">
            <ArrowLeft className="w-4 h-4" /> Continue shopping
          </Link>
        </div>
      </div>

      <MobileActionBar>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Estimated total</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">{approx}{money(estTotal)}</span>
        </div>
        {checkoutBtn}
      </MobileActionBar>

      <Sheet open={clearOpen} onClose={() => setClearOpen(false)} title="Remove all items?">
        <p className="text-sm text-gray-700">This empties your cart ({lines.length} item{lines.length === 1 ? '' : 's'}). You can&apos;t undo this.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => setClearOpen(false)} className="h-12 rounded-lg border border-[#d9ccc1] text-sm font-semibold text-[#2a2322]">Keep items</button>
          <button onClick={() => { mutate((d) => { d.cart = []; }); setClearOpen(false); flash('Cart cleared', 'info'); }} className="h-12 rounded-lg bg-[#c8151d] hover:bg-[#a3111a] text-white font-semibold text-sm">Remove all</button>
        </div>
      </Sheet>
    </Container>
  );
}

function CartHeading({ sub, right }: { sub?: string; right?: React.ReactNode }) {
  return (
    <>
      <nav className="hidden md:flex items-center gap-1.5 text-sm text-gray-500 pt-6" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[#c8151d]">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        <span className="font-semibold text-[#2a2322]">Shopping cart</span>
      </nav>
      <div className="flex items-end justify-between gap-3 pt-4 md:pt-5">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-[32px] font-semibold text-[#2a2322] leading-tight">Shopping cart</h1>
          {sub && <p className="text-sm text-gray-600 mt-1 truncate">{sub}</p>}
        </div>
        {right}
      </div>
    </>
  );
}

function ModeBtn({ on, disabled, onClick, label, sub }: { on: boolean; disabled?: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      role="radio" aria-checked={on} disabled={disabled} onClick={onClick}
      className={cn('rounded-md px-2 py-2 min-h-12 text-center transition', on ? 'bg-white shadow-sm text-[#2a2322]' : 'text-gray-600 hover:text-[#2a2322]', disabled && 'opacity-40')}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="block text-xs text-gray-500">{sub}</span>
    </button>
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
  // Delivery slots closed by staff or already full today are not offered (Delivery › Zones & fees).
  const slots = makeSlots(branch, fulfillment === 'delivery' ? 60 : prep).filter((sl) => fulfillment !== 'delivery' || slotBookable(s, branch.id, sl));
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
