'use client';

// Dialogs and small pieces for the Counter screen (/orders/new).

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, CheckCircle2, CreditCard, Delete, Link2, MapPin, Search, Smartphone, User, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/shadcn/dialog';
import { ProductImage, isPhoto } from '@/src/components/ProductImage';
import { PinPicker, type Pin } from '@/src/components/shopper/PinPicker';
import { normalizePhMobile } from '@/src/components/shopper/AuthScreens';
import { addAudit, mutate, uid } from '@/src/lib/store';
import { calcDeliveryFee, cutCharge, cutFeeText, peso } from '@/src/lib/logic';
import type { Address, AppState, Branch, Customer, CutOption, Product } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { ICON, OSWALD } from '../../catalog/_ui';

// ---------- shared bits ----------
export const C = { charcoal: '#2a2322', red: '#c8151d', cream: '#f5f1ec', card: '#fffdfb', border: '#eadfd6', green: '#1f6b3f' };
export const GUEST_ID = 'cu-walkin-guest';
export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TicketLine { productId: string; qty: number; cutId?: string; note: string }

/** "1", "0.5", "1.25" — no trailing zeros. */
export const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000);
export const unitWord = (p: Product) => (p.soldByWeight ? 'kg' : p.unit === 'pack' ? 'pack' : 'pc');
export const priceSuffix = (p: Product) => (p.soldByWeight ? '/kg' : p.unit === 'pack' ? '/pk' : '');
/** ₱340 for whole pesos, ₱12.50 otherwise. */
export const money = (n: number) => (Number.isInteger(n) ? `₱${n.toLocaleString('en-PH')}` : peso(n));
export const qtyLabel = (p: Product, q: number) => `${fmtNum(q)} ${unitWord(p)}`;
/** Cut name for chips and ticket lines: "Steak cut (thick)" → "Steak cut". */
export const cutLabel = (c: CutOption) => c.name.replace(/\s*\(.*\)\s*$/, '');
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
/** "Purok 3, Dawis, Digos City" → "Purok 3, Dawis". */
export const shortArea = (line?: string) => (line ? line.replace(/,\s*[^,]*\bCity\b[^,]*$/i, '') : '');

export function lineAmount(price: number, p: Product, l: TicketLine, cut?: CutOption) {
  const c = cut ? { fee: cut.feeType === 'free' ? 0 : cut.fee, feeType: cut.feeType } : undefined;
  return p.soldByWeight ? round2(price * l.qty + cutCharge(c, true, 1, l.qty)) : round2(price * l.qty + cutCharge(c, false, l.qty));
}

/** Product photo, or a soft tint of its category colour when there is none. */
export function Thumb({ p, tint, className }: { p: Product; tint: string; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden', className)} style={{ background: `${tint}22` }}>
      {isPhoto(p.image) && <ProductImage image={p.image} alt={p.name} fill />}
    </div>
  );
}

function SquareClose({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="shrink-0 w-11 h-11 rounded-lg border border-[#eadfd6] bg-white flex items-center justify-center text-[#2a2322] hover:bg-[#f5f1ec]">
      <X className="w-5 h-5" {...ICON} />
    </button>
  );
}

const redBtn = 'w-full h-14 rounded-lg bg-[#c8151d] text-white text-lg font-bold hover:bg-[#a3111a] disabled:bg-[#e8a9ab] disabled:cursor-not-allowed transition-colors';
const fieldCls = 'w-full h-12 rounded-lg border border-[#eadfd6] bg-white px-4 text-[15px] text-[#2a2322] outline-none focus:border-[#2a2322] placeholder:text-gray-400';

// ---------- quantity keypad ----------
const KG_PRESETS = [0.25, 0.5, 1, 1.5, 2];
const UNIT_PRESETS = [1, 2, 3, 5, 10];
const presetLabel = (kg: number, weighed: boolean) => (weighed ? (kg < 1 ? `${kg * 1000} g` : `${fmtNum(kg)} kg`) : String(kg));

export function QtyDialog({ product, price, avail, cuts, tint, initial, onSave, onClose }: {
  product: Product; price: number; avail: number; cuts: CutOption[]; tint: string;
  initial?: TicketLine; onSave: (l: TicketLine) => void; onClose: () => void;
}) {
  const weighed = product.soldByWeight;
  const [entry, setEntry] = useState(initial ? fmtNum(initial.qty) : '1');
  const [fresh, setFresh] = useState(true);
  const [cutId, setCutId] = useState<string | undefined>(initial ? initial.cutId : cuts[0]?.id);
  const [note, setNote] = useState(initial?.note ?? '');
  const qty = Number(entry) || 0;
  const cut = cuts.find((c) => c.id === cutId);
  const amount = lineAmount(price, product, { productId: product.id, qty, cutId, note }, cut);
  const error = qty <= 0 ? 'Enter a quantity' : qty > avail ? `Only ${fmtNum(avail)} ${unitWord(product)} in stock` : '';

  const press = (k: string) => {
    if (k === 'back') { setEntry((e) => (fresh || e.length <= 1 ? '0' : e.slice(0, -1))); setFresh(false); return; }
    if (k === '.') {
      if (!weighed) return;
      setEntry((e) => (fresh ? '0.' : e.includes('.') ? e : `${e}.`));
      setFresh(false);
      return;
    }
    setEntry((e) => {
      if (fresh || e === '0') return k;
      const dec = e.split('.')[1];
      if ((dec && dec.length >= 3) || e.length >= 6) return e;
      return e + k;
    });
    setFresh(false);
  };
  const save = () => {
    if (error) { toast.error(error); return; }
    onSave({ productId: product.id, qty: weighed ? Math.round(qty * 1000) / 1000 : Math.floor(qty), cutId, note: note.trim() });
  };

  // Physical keyboard: digits, ".", Backspace and Enter (not while typing the note).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === '.' || e.key === ',') { e.preventDefault(); press('.'); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
      else if (e.key === 'Enter') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
  const presets = weighed ? KG_PRESETS : UNIT_PRESETS;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[550px] w-[calc(100%-1.5rem)] p-4 sm:p-5 gap-0 rounded-2xl bg-white max-h-[94dvh]">
        <div className="flex items-start gap-3 sm:gap-4">
          <Thumb p={product} tint={tint} className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl sm:text-[22px] font-semibold text-[#2a2322] leading-tight">{product.name}</DialogTitle>
            <DialogDescription className="text-sm text-[#5c5250] mt-1">
              {peso(price)} per {weighed ? 'kg' : unitWord(product)} · {fmtNum(avail)} {unitWord(product)} in stock
            </DialogDescription>
          </div>
          <SquareClose onClick={onClose} />
        </div>

        <div className="mt-4 rounded-xl bg-[#2a2322] text-white px-5 py-3 flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-2 min-w-0">
            <span className="text-5xl sm:text-6xl font-semibold leading-none truncate" style={OSWALD}>{entry}</span>
            <span className="text-xl text-white/80">{unitWord(product)}</span>
          </p>
          <p className="text-2xl font-bold pb-1" style={OSWALD}>{peso(amount)}</p>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {presets.map((v) => {
            const on = qty === v;
            return (
              <button key={v} type="button" onClick={() => { setEntry(fmtNum(v)); setFresh(true); }}
                className={cn('h-12 rounded-lg border text-[15px] font-medium', on ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#eadfd6] text-[#2a2322] hover:bg-[#f5f1ec]')}>
                {presetLabel(v, weighed)}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button key={k} type="button" onClick={() => press(k)} disabled={k === '.' && !weighed} aria-label={k === 'back' ? 'Delete digit' : k}
              className="h-14 sm:h-16 rounded-lg border border-[#eadfd6] bg-[#faf6f2] text-2xl font-medium text-[#2a2322] flex items-center justify-center hover:bg-[#f1e9e1] active:bg-[#eadfd6] disabled:opacity-30">
              {k === 'back' ? <Delete className="w-7 h-7" {...ICON} /> : k}
            </button>
          ))}
        </div>

        {cuts.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-[#2a2322] mb-2">Preparation</p>
            <div className="flex flex-wrap gap-2">
              {cuts.map((c) => {
                const on = c.id === cutId;
                const fee = cutFeeText(c);
                return (
                  <button key={c.id} type="button" onClick={() => setCutId(c.id)}
                    className={cn('h-11 px-4 rounded-lg border text-[15px] font-medium', on ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#eadfd6] text-[#2a2322] hover:bg-[#f5f1ec]')}>
                    {cutLabel(c)}{fee && <span className={cn('ml-1.5 text-xs', on ? 'text-white/70' : 'text-gray-500')}>{fee}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Note for the butcher (optional)" className={cn(fieldCls, 'mt-4 h-[52px]')} />

        {error && qty > 0 && <p className="mt-3 text-sm font-medium text-[#c8151d]">{error}</p>}
        <button type="button" onClick={save} disabled={!!error} className={cn(redBtn, 'mt-4')}>
          {initial ? 'Update ticket' : 'Add to ticket'} · {peso(amount)}
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- customer picker ----------
export type CustomerPick = { kind: 'guest' } | { kind: 'customer'; id: string };

export function CustomerDialog({ s, mode, branch, orderCounts, onPick, onClose }: {
  s: AppState; mode: 'walk_in' | 'phone'; branch: Branch; orderCounts: Map<string, number>;
  onPick: (p: CustomerPick) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return s.customers
      .filter((c) => c.id !== GUEST_ID)
      .filter((c) => !t || c.name.toLowerCase().includes(t) || (digits.length >= 3 && c.mobile.replace(/\D/g, '').includes(digits)))
      .sort((a, b) => (orderCounts.get(b.id) ?? 0) - (orderCounts.get(a.id) ?? 0))
      .slice(0, 40);
  }, [q, s.customers, orderCounts]);
  const normalized = normalizePhMobile(mobile);
  const valid = name.trim().length >= 2 && !!normalized;

  const add = () => {
    if (!valid || !normalized) return;
    const dup = s.customers.find((c) => c.mobile.replace(/\D/g, '') === normalized.replace(/\D/g, ''));
    if (dup) { toast.info(`That number belongs to ${dup.name}. Selected.`); onPick({ kind: 'customer', id: dup.id }); return; }
    const id = uid('cu');
    const full = name.trim().replace(/\s+/g, ' ');
    mutate((d) => {
      d.customers.push({
        id, name: full, firstName: full.split(' ')[0], lastName: full.split(' ').slice(1).join(' '), mobile: normalized, email: '',
        cityId: branch.cityId, addresses: [], createdAt: new Date().toISOString(), blocked: false, storeCredit: 0, points: 0, source: mode,
      });
      addAudit(d, { module: 'Customers', action: 'Quick customer added', detail: `${full} (${normalized}) via ${mode === 'phone' ? 'phone' : 'walk-in'} order`, branchId: branch.id });
    });
    toast.success(`Customer ${full} added`);
    onPick({ kind: 'customer', id });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[550px] w-[calc(100%-1.5rem)] p-0 gap-0 rounded-2xl bg-white max-h-[92dvh] flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">Choose customer</DialogTitle>
        <DialogDescription className="sr-only">Search by name or mobile number, use a walk-in guest, or add a new customer.</DialogDescription>
        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-[#f0e8e1]">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" {...ICON} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or mobile number"
              className="w-full h-[60px] rounded-lg border-2 border-[#2a2322] bg-white pl-12 pr-4 text-[17px] outline-none placeholder:text-gray-400" />
          </div>
          <SquareClose onClick={onClose} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {mode === 'walk_in' && !q.trim() && (
            <button type="button" onClick={() => onPick({ kind: 'guest' })} className="w-full flex items-center gap-3 px-5 py-4 bg-[#faf6f2] hover:bg-[#f5ede6] border-b border-[#f0e8e1] text-left">
              <User className="w-6 h-6 text-[#2a2322]" {...ICON} />
              <span className="flex-1 text-[17px] font-semibold text-[#2a2322]">Walk-in guest</span>
              <span className="text-sm text-[#5c5250]">No account</span>
            </button>
          )}
          {list.length === 0 && <p className="px-5 py-6 text-sm text-gray-500">No customer matches “{q}”. Add them below.</p>}
          {list.map((c) => <CustomerRow key={c.id} c={c} orders={orderCounts.get(c.id) ?? 0} onClick={() => onPick({ kind: 'customer', id: c.id })} />)}
          <div className="p-5 border-t border-[#f0e8e1] space-y-3">
            <p className="text-[15px] font-medium text-[#2a2322]">Or add a new customer</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={cn(fieldCls, 'h-[52px]')} />
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} inputMode="tel" placeholder="09XX XXX XXXX" className={cn(fieldCls, 'h-[52px]')} />
            {mobile.trim() && !normalized && <p className="text-xs text-[#c8151d]">Enter an 11-digit mobile number that starts with 09.</p>}
            <button type="button" onClick={add} disabled={!valid}
              className="w-full h-[52px] rounded-lg bg-[#c8151d] text-white text-[17px] font-bold hover:bg-[#a3111a] disabled:bg-[#b8aaa5] disabled:cursor-not-allowed">Add customer</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomerRow({ c, orders, onClick }: { c: Customer; orders: number; onClick: () => void }) {
  const area = shortArea(c.addresses[0]?.line);
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 px-5 py-3 border-b border-[#f0e8e1] text-left hover:bg-[#faf6f2]">
      <span className="w-11 h-11 rounded-full bg-[#2a2322] text-white text-sm font-bold flex items-center justify-center shrink-0">{initialsOf(c.name)}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-semibold text-[#2a2322] truncate">{c.name}{c.blocked && <span className="ml-2 text-xs font-semibold text-[#c8151d]">Blocked</span>}</span>
        <span className="block text-sm text-[#5c5250] truncate">{[c.mobile, `${orders} order${orders === 1 ? '' : 's'}`, area].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );
}

// ---------- delivery address ----------
export function AddressDialog({ s, branch, customer, subtotal, value, instructions, onSave, onClose }: {
  s: AppState; branch: Branch; customer: Customer; subtotal: number; value?: Address; instructions: string;
  onSave: (a: Address, instructions: string) => void; onClose: () => void;
}) {
  const savedIdx = value ? customer.addresses.findIndex((a) => a.line === value.line && a.lat === value.lat) : customer.addresses.length ? 0 : -1;
  const [pick, setPick] = useState<number>(savedIdx);
  const [line, setLine] = useState(savedIdx === -1 && value ? value.line : '');
  const [landmark, setLandmark] = useState(savedIdx === -1 && value ? value.landmark ?? '' : '');
  const [pin, setPin] = useState<Pin>(savedIdx === -1 && value ? { lat: value.lat, lng: value.lng } : { lat: branch.lat + 0.006, lng: branch.lng + 0.004 });
  const [note, setNote] = useState(instructions);
  const addr: Address | undefined = pick >= 0 ? customer.addresses[pick] : line.trim() ? { label: 'Other', line: line.trim(), landmark: landmark.trim() || undefined, lat: pin.lat, lng: pin.lng } : undefined;
  const fee = addr ? calcDeliveryFee(s, branch.id, subtotal, addr) : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[550px] w-[calc(100%-1.5rem)] p-4 sm:p-5 gap-0 rounded-2xl bg-white max-h-[92dvh]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-xl font-semibold text-[#2a2322]">Delivery address</DialogTitle>
            <DialogDescription className="text-sm text-[#5c5250] mt-0.5">{customer.name} · {customer.mobile}</DialogDescription>
          </div>
          <SquareClose onClick={onClose} />
        </div>
        <div className="mt-4 space-y-2">
          {customer.addresses.map((a, i) => (
            <button key={i} type="button" onClick={() => setPick(i)}
              className={cn('w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left', pick === i ? 'border-[#c8151d] bg-[#fdf3f3]' : 'border-[#eadfd6] hover:bg-[#faf6f2]')}>
              <MapPin className={cn('w-5 h-5 mt-0.5 shrink-0', pick === i ? 'text-[#c8151d]' : 'text-gray-400')} {...ICON} />
              <span className="min-w-0"><span className="block font-semibold text-[#2a2322]">{a.label}</span><span className="block text-sm text-[#5c5250]">{a.line}{a.landmark ? ` · ${a.landmark}` : ''}</span></span>
            </button>
          ))}
          <button type="button" onClick={() => setPick(-1)}
            className={cn('w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left', pick === -1 ? 'border-[#c8151d] bg-[#fdf3f3]' : 'border-[#eadfd6] hover:bg-[#faf6f2]')}>
            <MapPin className={cn('w-5 h-5 shrink-0', pick === -1 ? 'text-[#c8151d]' : 'text-gray-400')} {...ICON} />
            <span className="font-semibold text-[#2a2322]">New address</span>
          </button>
          {pick === -1 && (
            <div className="space-y-2 pt-1">
              <input autoFocus value={line} onChange={(e) => setLine(e.target.value)} placeholder="House no., street, barangay" className={fieldCls} />
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Landmark (optional)" className={fieldCls} />
              <p className="text-xs text-[#5c5250]">Tap the map or drag the pin to the house.</p>
              <PinPicker value={pin} onChange={setPin} className="h-44" />
            </div>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rider instructions (optional)" className={fieldCls} />
          {fee && (
            <p className={cn('text-sm rounded-lg px-3 py-2', fee.outside ? 'bg-[#fdf3f3] text-[#c8151d]' : 'bg-[#f5f1ec] text-[#2a2322]')}>
              {fee.outside ? `Outside the delivery zones (${fee.distance} km)` : `${fee.distance} km · Delivery fee ${peso(fee.fee)}`}
            </p>
          )}
        </div>
        <button type="button" disabled={!addr || !!fee?.outside} onClick={() => addr && onSave(addr, note.trim())} className={cn(redBtn, 'mt-4 h-[52px] text-base')}>Use this address</button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- discount ----------
export interface Discount { type: 'peso' | 'pct'; value: number; reason: string }
export const discountAmount = (d: Discount | null, subtotal: number) =>
  !d ? 0 : Math.min(subtotal, d.type === 'pct' ? Math.round((subtotal * d.value) / 100 * 100) / 100 : d.value);

export function DiscountDialog({ subtotal, initial, onSave, onClose }: { subtotal: number; initial: Discount | null; onSave: (d: Discount | null) => void; onClose: () => void }) {
  const [type, setType] = useState<Discount['type']>(initial?.type ?? 'peso');
  const [value, setValue] = useState(initial ? String(initial.value) : '');
  const [reason, setReason] = useState(initial?.reason ?? '');
  const v = Number(value) || 0;
  const err = v <= 0 ? 'Enter an amount' : type === 'pct' && v > 100 ? 'Up to 100%' : type === 'peso' && v > subtotal ? `Up to ${peso(subtotal)}` : reason.trim().length < 3 ? 'Give a reason (it is logged)' : '';
  const amt = discountAmount({ type, value: v, reason }, subtotal);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[440px] w-[calc(100%-1.5rem)] p-5 gap-0 rounded-2xl bg-white">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <DialogTitle className="text-xl font-semibold text-[#2a2322]">Add discount</DialogTitle>
            <DialogDescription className="text-sm text-[#5c5250] mt-0.5">Subtotal {peso(subtotal)}. The reason goes to the audit log.</DialogDescription>
          </div>
          <SquareClose onClick={onClose} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-[#f5f1ec] p-1">
          {([['peso', 'Amount (₱)'], ['pct', 'Percent (%)']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setType(k)} className={cn('h-10 rounded-lg text-sm font-semibold', type === k ? 'bg-[#2a2322] text-white' : 'text-[#5c5250]')}>{label}</button>
          ))}
        </div>
        <input autoFocus type="number" min={0} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === 'pct' ? '10' : '50.00'} className={cn(fieldCls, 'mt-3')} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. Suki discount, damaged pack)" className={cn(fieldCls, 'mt-3')} />
        <p className="mt-3 text-sm text-[#5c5250]">{err ? <span className="text-[#c8151d]">{err}</span> : <>Discount <b className="text-[#2a2322]">−{peso(amt)}</b></>}</p>
        <div className="mt-4 flex gap-2">
          {initial && <button type="button" onClick={() => onSave(null)} className="h-[52px] px-4 rounded-lg border border-[#eadfd6] text-[15px] font-semibold text-[#2a2322] hover:bg-[#f5f1ec]">Remove</button>}
          <button type="button" disabled={!!err} onClick={() => onSave({ type, value: v, reason: reason.trim() })} className={cn(redBtn, 'h-[52px] text-base flex-1')}>Apply discount</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- payment ----------
export type PayChoice = 'cash' | 'gcash' | 'card' | 'cod' | 'link';
export interface PayResult { pay: PayChoice; cashReceived?: number; confirmNow: boolean }

export function PayDialog({ channel, handOver, delivery, subtotal, baseTotal, gatewayPct, codLimit, customerName, onConfirm, onClose }: {
  channel: 'walk_in' | 'phone'; handOver: boolean; delivery: boolean; subtotal: number; baseTotal: number; gatewayPct: number; codLimit: number;
  customerName: string; onConfirm: (r: PayResult) => void; onClose: () => void;
}) {
  const later = delivery ? 'Cash on delivery' : 'Pay at pickup';
  const all: { v: PayChoice; label: string; sub: string; icon: typeof Banknote }[] = [
    { v: 'cash', label: 'Cash', sub: 'Paid now at the counter', icon: Banknote },
    { v: 'gcash', label: 'GCash / e-wallet', sub: 'Scan the QR at the counter', icon: Smartphone },
    { v: 'card', label: 'Card', sub: 'Card terminal', icon: CreditCard },
    { v: 'cod', label: later, sub: delivery ? `Limit ${peso(codLimit)}` : 'Collected at handover', icon: Wallet },
    { v: 'link', label: 'Send payment link', sub: 'SMS link to the customer', icon: Link2 },
  ];
  const options = handOver ? all.slice(0, 3) : channel === 'phone' ? all.slice(3) : all;
  const [pay, setPay] = useState<PayChoice>(options[0].v);
  const [cash, setCash] = useState('');
  const [confirmNow, setConfirmNow] = useState(true);
  const serviceFee = pay === 'gcash' || pay === 'card' ? Math.round((subtotal * gatewayPct) / 100) : 0;
  const total = round2(baseTotal + serviceFee);
  const received = Number(cash) || 0;
  const change = round2(received - total);
  const err = pay === 'cash' && received < total ? 'Enter the cash received' : pay === 'cod' && delivery && total > codLimit ? `Cash on delivery limit is ${peso(codLimit)}` : '';
  const quick = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[520px] w-[calc(100%-1.5rem)] p-4 sm:p-5 gap-0 rounded-2xl bg-white max-h-[94dvh]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-xl font-semibold text-[#2a2322]">{channel === 'phone' ? 'Place phone order' : 'Charge'}</DialogTitle>
            <DialogDescription className="text-sm text-[#5c5250] mt-0.5 truncate">{customerName} · {handOver ? 'Hand over now' : delivery ? 'Delivery' : 'Pickup'}</DialogDescription>
          </div>
          <SquareClose onClick={onClose} />
        </div>
        <div className="mt-4 rounded-xl bg-[#2a2322] text-white px-5 py-4 flex items-end justify-between">
          <span className="text-sm text-white/70">{channel === 'phone' ? 'Estimated total' : 'Total'}</span>
          <span className="text-4xl font-semibold leading-none" style={OSWALD}>{peso(total)}</span>
        </div>
        {serviceFee > 0 && <p className="mt-2 text-xs text-[#5c5250]">Includes {gatewayPct}% service fee ({peso(serviceFee)}).</p>}
        <div className={cn('mt-4 grid gap-2', options.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
          {options.map((o) => {
            const on = pay === o.v;
            const Icon = o.icon;
            return (
              <button key={o.v} type="button" onClick={() => setPay(o.v)}
                className={cn('rounded-lg border px-3 py-3 text-left', on ? 'border-[#c8151d] bg-[#fdf3f3]' : 'border-[#eadfd6] hover:bg-[#faf6f2]')}>
                <Icon className={cn('w-5 h-5', on ? 'text-[#c8151d]' : 'text-[#5c5250]')} {...ICON} />
                <span className={cn('block mt-1.5 text-sm font-semibold', on ? 'text-[#c8151d]' : 'text-[#2a2322]')}>{o.label}</span>
                <span className="block text-xs text-[#5c5250]">{o.sub}</span>
              </button>
            );
          })}
        </div>
        {pay === 'cash' && (
          <div className="mt-4">
            <p className="text-sm font-medium text-[#2a2322] mb-2">Cash received</p>
            <input type="number" min={0} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={total.toFixed(2)} className={fieldCls} />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {quick.map((v) => (
                <button key={v} type="button" onClick={() => setCash(String(v))} className="h-10 rounded-lg border border-[#eadfd6] bg-[#faf6f2] text-sm font-medium hover:bg-[#f1e9e1]">{money(v)}</button>
              ))}
            </div>
            {received >= total && <p className="mt-3 text-base text-[#1f6b3f] font-semibold">Change {peso(change)}</p>}
          </div>
        )}
        {!handOver && (
          <label className="mt-4 flex items-center gap-2 text-sm text-[#2a2322]">
            <input type="checkbox" checked={confirmNow} onChange={(e) => setConfirmNow(e.target.checked)} className="w-4 h-4 accent-[#c8151d]" />
            Confirm now and send to the butcher
          </label>
        )}
        {err && pay !== 'cash' && <p className="mt-3 text-sm text-[#c8151d]">{err}</p>}
        <button type="button" disabled={!!err} onClick={() => onConfirm({ pay, cashReceived: pay === 'cash' ? received : undefined, confirmNow: handOver || confirmNow })} className={cn(redBtn, 'mt-4')}>
          {channel === 'phone' ? `Place order · ${peso(total)}` : pay === 'cash' ? `Confirm cash · ${peso(total)}` : pay === 'link' ? `Send link · ${peso(total)}` : pay === 'cod' ? `Place order · ${peso(total)}` : `Confirm payment · ${peso(total)}`}
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- done ----------
export function DoneDialog({ number, total, change, handOver, phone, onView, onNew }: {
  number: string; total: number; change?: number; handOver: boolean; phone: boolean; onView: () => void; onNew: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onNew()}>
      <DialogContent showCloseButton={false} className="max-w-[420px] w-[calc(100%-1.5rem)] p-6 gap-0 rounded-2xl bg-white text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#e8f3ec] text-[#1f6b3f] flex items-center justify-center"><CheckCircle2 className="w-8 h-8" {...ICON} /></div>
        <DialogTitle className="mt-3 text-xl font-semibold text-[#2a2322]">{phone ? 'Order placed' : handOver ? 'Paid and handed over' : 'Order created'}</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#5c5250]">Ticket {number} · {peso(total)}</DialogDescription>
        {change !== undefined && change > 0 && <p className="mt-3 text-3xl font-semibold text-[#1f6b3f]" style={OSWALD}>Change {peso(change)}</p>}
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={onNew} className={cn(redBtn, 'h-[52px] text-base')}><Check className="inline w-5 h-5 mr-1 -mt-0.5" {...ICON} />New ticket</button>
          <button type="button" onClick={onView} className="h-[52px] rounded-lg border border-[#eadfd6] text-base font-semibold text-[#2a2322] hover:bg-[#f5f1ec]">View order and print receipt</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- clear confirm ----------
export function ClearDialog({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[400px] w-[calc(100%-1.5rem)] p-5 gap-0 rounded-2xl bg-white">
        <DialogTitle className="text-lg font-semibold text-[#2a2322]">Clear this ticket?</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-[#5c5250]">{count} item{count === 1 ? '' : 's'}, the customer and any discount will be removed.</DialogDescription>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-lg border border-[#eadfd6] font-semibold text-[#2a2322] hover:bg-[#f5f1ec]">Keep ticket</button>
          <button type="button" onClick={onConfirm} className="flex-1 h-12 rounded-lg bg-[#c8151d] text-white font-semibold hover:bg-[#a3111a]">Clear ticket</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
