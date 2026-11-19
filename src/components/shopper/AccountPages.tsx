'use client';

// My account pages (customer website): shared layout with the left menu, Personal details,
// Saved addresses, Payment methods, Notifications (+ stock alerts) and Sign-in & security.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck, Banknote, Bell, BriefcaseBusiness, ChevronRight, CreditCard, House, KeyRound, LogOut, MapPin, Plus, ReceiptText,
  ShieldCheck, Smartphone, User, Wallet,
} from 'lucide-react';
import type { Address, Customer, CustomerNotifyPrefs, SavedPaymentMethod } from '@/src/lib/types';
import { mutate, uid } from '@/src/lib/store';
import { available, nearestBranch, timeAgo } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { Container, DIGOS_CENTER, ProductImage, Sheet, useMe, useShop } from './shared';
import { PinPicker, type Pin } from './PinPicker';
import { normalizePhMobile } from './AuthScreens';
import { customerInitials, customerSinceLabel, DEFAULT_NOTIFY_PREFS, fmtPhonePH, paymentMethodsOf, updateCustomer } from './accountHelpers';

// ---------- shared styles ----------
const inputCls = 'w-full h-[52px] rounded-lg border border-[#d9cdc3] bg-white px-4 text-base text-[#2a2322] outline-none focus:border-[#2a2322] focus:ring-2 focus:ring-[#2a2322]/10 placeholder:text-gray-400';
const labelCls = 'block text-sm font-medium text-[#2a2322] mb-1.5';
const primaryBtn = 'h-12 px-6 rounded-lg bg-[#c8151d] hover:bg-[#a3111a] text-white text-[15px] font-semibold transition disabled:bg-[#b9aea8] disabled:cursor-not-allowed';
const outlineBtn = 'h-12 px-5 rounded-lg border border-[#2a2322] bg-white text-[#2a2322] text-[15px] font-semibold hover:bg-[#f5f1ec] flex items-center justify-center gap-2 transition';

type NavKey = 'profile' | 'addresses' | 'payments' | 'notifications' | 'security' | 'orders';
const NAV: { key: NavKey; label: string; href: string; icon: typeof User }[] = [
  { key: 'profile', label: 'Personal details', href: '/account', icon: User },
  { key: 'addresses', label: 'Saved addresses', href: '/account/addresses', icon: MapPin },
  { key: 'payments', label: 'Payment methods', href: '/account/payments', icon: CreditCard },
  { key: 'notifications', label: 'Notifications', href: '/account/notifications', icon: Bell },
  { key: 'security', label: 'Sign-in & security', href: '/account/security', icon: ShieldCheck },
  { key: 'orders', label: 'My orders', href: '/my-orders', icon: ReceiptText },
];

// ====================== LAYOUT ======================
export function AccountLayout({ active, children }: { active: NavKey; children: React.ReactNode }) {
  const me = useMe();
  const pills = useRef<HTMLElement>(null);
  // Phone: bring the current page's pill into view in the sideways menu.
  useEffect(() => {
    const nav = pills.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && on) nav.scrollLeft = on.offsetLeft - nav.offsetLeft - 16;
  }, [active]);
  return (
    <Container className="max-w-[1280px] pt-4 md:pt-6 pb-4">
      <nav aria-label="Breadcrumb" className="text-sm text-gray-600 flex items-center gap-2">
        <Link href="/" className="hover:text-[#c8151d]">Home</Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-400" aria-hidden />
        <span className="font-semibold text-[#2a2322]" aria-current="page">My account</span>
      </nav>

      <div className="flex items-center gap-4 md:gap-5 mt-5 md:mt-7">
        <span className="w-14 h-14 md:w-[70px] md:h-[70px] rounded-full bg-[#b5121b] text-white text-lg md:text-[22px] font-bold flex items-center justify-center shrink-0" aria-hidden>{customerInitials(me)}</span>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-[32px] leading-tight font-semibold text-[#2a2322] truncate">{me.name}</h1>
          <p className="text-sm md:text-[15px] text-gray-600 mt-0.5">
            {fmtPhonePH(me.mobile)}<span className="hidden min-[400px]:inline"> · </span><br className="min-[400px]:hidden" />Customer since {customerSinceLabel(me)}
          </p>
        </div>
      </div>

      <div className="mt-6 md:mt-10 grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        {/* Phone: menu scrolls sideways */}
        <nav ref={pills} aria-label="My account" className="md:hidden -mx-4 px-4 flex gap-2 overflow-x-auto fm-noscroll">
          {NAV.map(({ key, label, href, icon: Icon }) => (
            <Link key={key} href={href} aria-current={key === active ? 'page' : undefined}
              className={cn('shrink-0 h-10 px-3.5 rounded-full border text-sm flex items-center gap-1.5 whitespace-nowrap',
                key === active ? 'bg-[#2a2322] border-[#2a2322] text-white font-semibold' : 'bg-[#fffdfb] border-[#eadfd6] text-[#2a2322]')}>
              <Icon className="w-4 h-4" strokeWidth={1.75} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        {/* Tablet / desktop: menu card */}
        <nav aria-label="My account" className="hidden md:block rounded-lg border border-[#eadfd6] bg-[#fffdfb] overflow-hidden md:sticky md:top-[132px]">
          {NAV.map(({ key, label, href, icon: Icon }) => {
            const on = key === active;
            return (
              <Link key={key} href={href} aria-current={on ? 'page' : undefined}
                className={cn('h-[57px] pl-5 pr-4 flex items-center gap-3.5 text-[15px] lg:text-base border-b border-[#eadfd6] last:border-b-0 border-l-[3px] transition',
                  on ? 'border-l-[#c8151d] bg-[#f5f1ec] font-semibold text-[#2a2322]' : 'border-l-transparent text-[#2a2322]/85 hover:bg-[#f9f5f1]')}>
                <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </Container>
  );
}

/** Right-hand content card: title + grey subtitle, divider, body. */
export function AccountCard({ title, sub, action, children, footer, bodyClass }: {
  title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; bodyClass?: string;
}) {
  return (
    <section className="rounded-lg border border-[#eadfd6] bg-[#fffdfb] overflow-hidden">
      <header className="px-4 md:px-6 py-4 md:py-5 border-b border-[#eadfd6] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl md:text-[22px] font-semibold text-[#2a2322]">{title}</h2>
          {sub && <p className="text-sm text-gray-600 mt-0.5">{sub}</p>}
        </div>
        {action}
      </header>
      <div className={cn('p-4 md:p-6', bodyClass)}>{children}</div>
      {footer && <div className="px-4 md:px-6 py-4 border-t border-[#eadfd6] flex justify-end">{footer}</div>}
    </section>
  );
}

// ====================== PERSONAL DETAILS ======================
export function PersonalDetailsScreen() {
  const me = useMe();
  return (
    <AccountLayout active="profile">
      {/* key: reset the form when the customer record changes from elsewhere */}
      <PersonalDetailsForm key={`${me.id}|${me.name}|${me.email}|${me.birthday ?? ''}`} me={me} />
    </AccountLayout>
  );
}

function PersonalDetailsForm({ me }: { me: Customer }) {
  const { flash, branch } = useShop();
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [birthday, setBirthday] = useState(me.birthday ?? '');
  const [error, setError] = useState<{ name?: string; email?: string }>({});
  const dirty = name.trim() !== me.name || email.trim() !== me.email || birthday !== (me.birthday ?? '');

  const save = () => {
    const n = name.trim().replace(/\s+/g, ' ');
    const e = email.trim();
    const errs: typeof error = {};
    if (n.split(' ').length < 2) errs.name = 'Enter your first and last name.';
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) errs.email = 'Enter a valid email address.';
    setError(errs);
    if (Object.keys(errs).length) return;
    updateCustomer(me.id, (c) => {
      c.name = n;
      c.firstName = n.split(' ')[0];
      c.lastName = n.split(' ').slice(1).join(' ');
      c.email = e;
      c.birthday = birthday || undefined;
    });
    flash('Personal details saved');
  };

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); save(); }} noValidate>
      <AccountCard
        title="Personal details"
        sub="Used for orders, receipts and delivery contact."
        footer={<button type="submit" disabled={!dirty} className={cn(primaryBtn, 'w-full sm:w-auto')}>Save changes</button>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div>
            <label htmlFor="pd-name" className={labelCls}>Full name</label>
            <input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputCls} aria-invalid={!!error.name} />
            {error.name && <p className="text-xs text-[#a3111a] mt-1">{error.name}</p>}
          </div>
          <div>
            <label htmlFor="pd-email" className={labelCls}>Email (for receipts)</label>
            <input id="pd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" className={inputCls} aria-invalid={!!error.email} />
            {error.email && <p className="text-xs text-[#a3111a] mt-1">{error.email}</p>}
          </div>
          <div>
            <label htmlFor="pd-mobile" className={labelCls}>Mobile number</label>
            <div className="relative">
              <input id="pd-mobile" value={fmtPhonePH(me.mobile)} readOnly className={cn(inputCls, 'bg-[#f0ebe5] border-[#f0ebe5] pr-28 text-[17px] cursor-default focus:ring-0 focus:border-[#f0ebe5]')} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 text-sm font-semibold text-[#1f6b3f]">
                <BadgeCheck className="w-4 h-4 fill-[#1f6b3f] text-white" aria-hidden /> Verified
              </span>
            </div>
            <button type="button" onClick={() => flash(`To change your number, call ${branch.phone} — we verify new numbers by phone`, 'info')}
              className="mt-2 text-[15px] font-semibold text-[#a3111a] hover:underline">Change number</button>
          </div>
          <div>
            <label htmlFor="pd-bday" className={labelCls}>Birthday (optional)</label>
            <input id="pd-bday" type="date" value={birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthday(e.target.value)} autoComplete="bday" className={inputCls} />
          </div>
        </div>
      </AccountCard>
    </form>
  );
}

// ====================== SAVED ADDRESSES ======================
const addressIcon = (label: Address['label']) => (label === 'Home' ? House : label === 'Office' || label === 'Work' ? BriefcaseBusiness : MapPin);

export function SavedAddressesScreen() {
  const me = useMe();
  const { addrIdx, setAddrIdx, flash } = useShop();
  const [edit, setEdit] = useState<number | 'new' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const list = me.addresses;

  const setDefault = (i: number) => {
    const a = list[i];
    updateCustomer(me.id, (c) => { const [x] = c.addresses.splice(i, 1); c.addresses.unshift(x); });
    setAddrIdx(0);
    flash(`${a.label} is now your default address`);
  };
  const remove = (i: number) => {
    const a = list[i];
    updateCustomer(me.id, (c) => { c.addresses.splice(i, 1); });
    if (addrIdx === i) setAddrIdx(0);
    else if (addrIdx > i) setAddrIdx(addrIdx - 1);
    setConfirmRemove(null);
    flash(`${a.label} address removed`, 'info');
  };

  return (
    <AccountLayout active="addresses">
      <AccountCard
        title="Saved addresses"
        sub="Your default address is used to show delivery fees."
        action={<button type="button" onClick={() => setEdit('new')} className={outlineBtn}><Plus className="w-4 h-4" aria-hidden /> Add address</button>}
        bodyClass="p-4 md:p-6 pt-4 md:pt-5"
      >
        {list.length === 0 ? (
          <p className="text-[15px] text-gray-600">No saved addresses yet. Add one to see delivery fees for your area.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {list.map((a, i) => {
              const isDefault = i === 0;
              const Icon = addressIcon(a.label);
              const meta = [a.landmark, a.recipient, a.phone].filter(Boolean).join(' · ');
              return (
                <article key={`${i}-${a.label}-${a.line}`} className={cn('rounded-lg bg-[#fffdfb] p-4 md:p-5 flex flex-col min-w-0', isDefault ? 'border-[1.5px] border-[#2a2322]' : 'border border-[#eadfd6]')}>
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-5 h-5 text-[#2a2322] shrink-0" strokeWidth={1.75} aria-hidden />
                    <h3 className="text-[17px] font-semibold text-[#2a2322]">{a.label}</h3>
                    {isDefault && <span className="text-[11px] font-bold tracking-wide bg-[#2a2322] text-white rounded px-2 py-0.5">DEFAULT</span>}
                  </div>
                  <p className="text-[15px] text-[#2a2322] mt-2.5 break-words">{a.line}</p>
                  {meta && <p className="text-[13px] text-gray-500 mt-2 break-words">{meta}</p>}
                  <div className="mt-auto pt-3">
                    <div className="border-t border-[#eadfd6] pt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-semibold">
                      {confirmRemove === i ? (
                        <>
                          <span className="text-sm font-normal text-gray-700 mr-auto">Remove this address?</span>
                          <button type="button" onClick={() => setConfirmRemove(null)} className="min-h-9 text-gray-600 hover:underline">Cancel</button>
                          <button type="button" onClick={() => remove(i)} className="min-h-9 text-[#a3111a] hover:underline">Remove</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => setEdit(i)} className="min-h-9 text-[#a3111a] hover:underline">Edit</button>
                          {!isDefault && <button type="button" onClick={() => setDefault(i)} className="min-h-9 text-[#2a2322] hover:underline">Set as default</button>}
                          {!isDefault && <button type="button" onClick={() => setConfirmRemove(i)} className="min-h-9 ml-auto font-normal text-gray-600 hover:text-[#2a2322] hover:underline">Remove</button>}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AccountCard>
      {edit !== null && (
        <AddressSheet key={String(edit)} me={me} index={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />
      )}
    </AccountLayout>
  );
}

/** Add / edit one saved address (label, address, rider note, recipient and map pin). */
function AddressSheet({ me, index, onClose }: { me: Customer; index: number | null; onClose: () => void }) {
  const { s, flash } = useShop();
  const cur = index === null ? undefined : me.addresses[index];
  const [label, setLabel] = useState<Address['label']>(cur?.label ?? (me.addresses.some((a) => a.label === 'Home') ? 'Office' : 'Home'));
  const [line, setLine] = useState(cur?.line ?? '');
  const [landmark, setLandmark] = useState(cur?.landmark ?? '');
  const [recipient, setRecipient] = useState(cur ? (cur.recipient ?? '') : me.name);
  const [phone, setPhone] = useState(cur ? (cur.phone ?? '') : me.mobile);
  const [pin, setPin] = useState<Pin>(cur ? { lat: cur.lat, lng: cur.lng } : DIGOS_CENTER);
  const [err, setErr] = useState<{ line?: string; phone?: string }>({});
  const nb = nearestBranch(s, pin, 'delivery');
  const labels: Address['label'][] = cur?.label === 'Work' ? ['Home', 'Work', 'Office', 'Other'] : ['Home', 'Office', 'Other'];

  const save = () => {
    const e: typeof err = {};
    if (!line.trim()) e.line = 'Enter the house no., street and barangay.';
    const ph = phone.trim() ? normalizePhMobile(phone) : '';
    if (ph === null) e.phone = 'Enter a PH mobile number, e.g. 0917 123 4567.';
    setErr(e);
    if (Object.keys(e).length) return;
    const addr: Address = {
      label, line: line.trim(), landmark: landmark.trim() || undefined,
      recipient: recipient.trim() || undefined, phone: ph || undefined, lat: pin.lat, lng: pin.lng,
    };
    updateCustomer(me.id, (c) => {
      if (index === null) c.addresses.push(addr);
      else c.addresses[index] = addr;
    });
    flash(index === null ? `${label} address added` : `${label} address saved`);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={index === null ? 'Add address' : `Edit ${cur?.label ?? ''} address`}>
      <form onSubmit={(ev) => { ev.preventDefault(); save(); }} className="space-y-4" noValidate>
        <fieldset>
          <legend className={labelCls}>Label</legend>
          <div className="flex gap-2">
            {labels.map((l) => (
              <button key={l} type="button" onClick={() => setLabel(l)} aria-pressed={label === l}
                className={cn('h-10 px-4 rounded-lg border text-sm font-semibold', label === l ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#d9cdc3] text-[#2a2322]')}>{l}</button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="ad-line" className={labelCls}>House no., street, barangay</label>
          <input id="ad-line" value={line} onChange={(e) => setLine(e.target.value)} autoComplete="street-address" placeholder="e.g. Purok 3, Dawis, Digos City" className={inputCls} />
          {err.line && <p className="text-xs text-[#a3111a] mt-1">{err.line}</p>}
        </div>
        <div>
          <label htmlFor="ad-note" className={labelCls}>Note for the rider (optional)</label>
          <input id="ad-note" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Blue gate beside the sari-sari store" className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ad-rec" className={labelCls}>Recipient (optional)</label>
            <input id="ad-rec" value={recipient} onChange={(e) => setRecipient(e.target.value)} autoComplete="name" className={inputCls} />
          </div>
          <div>
            <label htmlFor="ad-phone" className={labelCls}>Recipient mobile (optional)</label>
            <input id="ad-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="09XX XXX XXXX" className={inputCls} />
            {err.phone && <p className="text-xs text-[#a3111a] mt-1">{err.phone}</p>}
          </div>
        </div>
        <div>
          <span className={labelCls}>Map pin</span>
          <PinPicker value={pin} onChange={setPin} className="h-48 md:h-56" />
          <p className={cn('text-xs font-medium mt-1.5', nb ? 'text-[#1f6b3f]' : 'text-[#a3111a]')}>
            {nb ? `Delivered by our ${nb.name} branch` : 'Outside our delivery areas — pickup only'}
          </p>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={cn(outlineBtn, 'flex-1')}>Cancel</button>
          <button type="submit" className={cn(primaryBtn, 'flex-1')}>{index === null ? 'Add address' : 'Save address'}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ====================== PAYMENT METHODS ======================
const payIcon = (k: SavedPaymentMethod['kind']) => (k === 'cod' ? Banknote : k === 'card' ? CreditCard : k === 'gcash' || k === 'maya' ? Smartphone : Wallet);

export function PaymentMethodsScreen() {
  const me = useMe();
  const { flash } = useShop();
  const [adding, setAdding] = useState(false);
  const methods = paymentMethodsOf(me);

  const save = (next: SavedPaymentMethod[]) => updateCustomer(me.id, (c) => { c.paymentMethods = next; });
  const setDefault = (id: string) => { save(methods.map((m) => ({ ...m, isDefault: m.id === id }))); flash('Default payment method updated'); };
  const remove = (m: SavedPaymentMethod) => {
    const rest = methods.filter((x) => x.id !== m.id);
    if (m.isDefault && rest.length) rest[0] = { ...rest[0], isDefault: true };
    save(rest);
    flash(`${m.label} removed`, 'info');
  };

  return (
    <AccountLayout active="payments">
      <AccountCard
        title="Payment methods"
        sub="Your default is picked first at checkout. You can always change it when you order."
        action={<button type="button" onClick={() => setAdding(true)} className={outlineBtn}><Plus className="w-4 h-4" aria-hidden /> Add method</button>}
        bodyClass="p-0 md:p-0"
      >
        <ul>
          {methods.map((m) => {
            const Icon = payIcon(m.kind);
            return (
              <li key={m.id} className="px-4 md:px-6 py-4 border-b border-[#eadfd6] last:border-b-0 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-10 h-10 rounded-lg bg-[#f5f1ec] flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-[#2a2322]" strokeWidth={1.75} aria-hidden /></span>
                <div className="flex-1 min-w-[140px]">
                  <p className="text-[15px] font-semibold text-[#2a2322] flex items-center gap-2 flex-wrap">
                    {m.label}
                    {m.isDefault && <span className="text-[11px] font-bold tracking-wide bg-[#2a2322] text-white rounded px-2 py-0.5">DEFAULT</span>}
                  </p>
                  <p className="text-[13px] text-gray-500">{m.detail ?? (m.kind === 'cod' ? 'Pay the rider in cash, or pay at the counter for pickup' : '')}</p>
                </div>
                <div className="flex items-center gap-5 text-[15px] font-semibold">
                  {!m.isDefault && <button type="button" onClick={() => setDefault(m.id)} className="min-h-9 text-[#2a2322] hover:underline">Set as default</button>}
                  {m.kind !== 'cod' && <button type="button" onClick={() => remove(m)} className="min-h-9 font-normal text-gray-600 hover:text-[#2a2322] hover:underline">Remove</button>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="px-4 md:px-6 py-4 border-t border-[#eadfd6] text-[13px] text-gray-500">Cards (Visa, Mastercard) are entered securely at checkout through our payment partner. We don&apos;t store card numbers.</p>
      </AccountCard>
      {adding && <AddWalletSheet me={me} methods={methods} onClose={() => setAdding(false)} />}
    </AccountLayout>
  );
}

function AddWalletSheet({ me, methods, onClose }: { me: Customer; methods: SavedPaymentMethod[]; onClose: () => void }) {
  const { flash } = useShop();
  const [kind, setKind] = useState<'gcash' | 'maya'>(methods.some((m) => m.kind === 'gcash') ? 'maya' : 'gcash');
  const [num, setNum] = useState(me.mobile);
  const [err, setErr] = useState('');
  const label = kind === 'gcash' ? 'GCash' : 'Maya';
  const save = () => {
    const n = normalizePhMobile(num);
    if (!n) { setErr('Enter the mobile number of your e-wallet, e.g. 0917 123 4567.'); return; }
    const detail = `${n.slice(0, 4)} ••• ${n.slice(-4)}`;
    if (methods.some((m) => m.kind === kind && m.detail === detail)) { setErr(`This ${label} account is already saved.`); return; }
    updateCustomer(me.id, (c) => { c.paymentMethods = [...methods, { id: uid('pm'), kind, label, detail }]; });
    flash(`${label} added`);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add e-wallet">
      <form onSubmit={(ev) => { ev.preventDefault(); save(); }} className="space-y-4" noValidate>
        <div className="flex gap-2">
          {(['gcash', 'maya'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={cn('flex-1 h-12 rounded-lg border text-sm font-semibold', kind === k ? 'bg-[#2a2322] border-[#2a2322] text-white' : 'bg-white border-[#d9cdc3] text-[#2a2322]')}>{k === 'gcash' ? 'GCash' : 'Maya'}</button>
          ))}
        </div>
        <div>
          <label htmlFor="pm-num" className={labelCls}>{label} mobile number</label>
          <input id="pm-num" value={num} onChange={(e) => { setNum(e.target.value); setErr(''); }} inputMode="tel" autoComplete="tel" className={inputCls} />
          {err && <p className="text-xs text-[#a3111a] mt-1">{err}</p>}
          <p className="text-xs text-gray-500 mt-1.5">You approve each payment in the {label} app at checkout.</p>
        </div>
        <button type="submit" className={cn(primaryBtn, 'w-full')}>Save {label}</button>
      </form>
    </Sheet>
  );
}

// ====================== NOTIFICATIONS ======================
function Switch({ on, onClick, label, locked }: { on: boolean; onClick?: () => void; label: string; locked?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} aria-disabled={locked || undefined} onClick={locked ? undefined : onClick}
      className={cn('w-[54px] h-[30px] rounded-full relative shrink-0 transition', on ? 'bg-[#1f6b3f]' : 'bg-[#e6dfd9] border border-[#d9cdc3]', locked && 'opacity-50 cursor-not-allowed')}>
      <span className={cn('absolute top-1/2 -translate-y-1/2 w-[24px] h-[24px] rounded-full bg-white shadow transition-all', on ? 'left-[27px]' : 'left-[2px]')} />
    </button>
  );
}

export function NotificationSettingsScreen() {
  const me = useMe();
  const { s, branch, flash } = useShop();
  const prefs = me.notifyPrefs ?? DEFAULT_NOTIFY_PREFS;
  const setPref = (k: keyof CustomerNotifyPrefs) => {
    updateCustomer(me.id, (c) => { c.notifyPrefs = { ...(c.notifyPrefs ?? DEFAULT_NOTIFY_PREFS), [k]: !prefs[k] }; });
  };
  const rows: { key: keyof CustomerNotifyPrefs | 'orders'; title: string; sub: string }[] = [
    { key: 'orders', title: 'Order updates by text', sub: 'Confirmation, rider on the way and delivery. Required while an order is active.' },
    { key: 'emailReceipts', title: 'Email receipts', sub: 'A receipt with final weights after each order.' },
    { key: 'backInStock', title: 'Back-in-stock alerts', sub: 'A single text when an item you follow is available again.' },
    { key: 'offers', title: 'Offers and weekly specials', sub: 'At most one message a week. You can opt out any time.' },
  ];
  const alerts = (me.stockAlerts ?? []).map((id) => s.products.find((p) => p.id === id)).filter((p) => !!p);
  const removeAlert = (id: string, name: string) => {
    updateCustomer(me.id, (c) => { c.stockAlerts = (c.stockAlerts ?? []).filter((x) => x !== id); });
    flash(`Stock alert for ${name} removed`, 'info');
  };

  return (
    <AccountLayout active="notifications">
      <AccountCard title="Notifications" sub="Choose which messages we send to your mobile and email." bodyClass="p-0 md:p-0">
        <ul>
          {rows.map((r) => (
            <li key={r.key} className="px-4 md:px-6 py-4 border-b border-[#eadfd6] last:border-b-0 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] md:text-base font-semibold text-[#2a2322]">{r.title}</p>
                <p className="text-[13px] md:text-sm text-gray-600 mt-0.5">{r.sub}</p>
              </div>
              {r.key === 'orders'
                ? <Switch on locked label={`${r.title} (always on)`} />
                : <Switch on={prefs[r.key as keyof CustomerNotifyPrefs]} label={r.title} onClick={() => setPref(r.key as keyof CustomerNotifyPrefs)} />}
            </li>
          ))}
        </ul>
      </AccountCard>

      <AccountCard title="Stock alerts" sub="We text you once when these items are back in stock." bodyClass={alerts.length ? 'p-0 md:p-0' : undefined}>
        {alerts.length === 0 ? (
          <p className="text-[15px] text-gray-600">No alerts yet. Tap &ldquo;Notify me when available&rdquo; on an out-of-stock product.</p>
        ) : (
          <ul>
            {alerts.map((p) => {
              const back = available(s, p.id, branch.id) > 0;
              return (
                <li key={p.id} className="px-4 md:px-6 py-3.5 border-b border-[#eadfd6] last:border-b-0 flex items-center gap-3">
                  <Link href={`/products/${p.id}`} className="shrink-0"><ProductImage emoji={p.image} size="sm" className="w-12 h-12 rounded-lg" /></Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/products/${p.id}`} className="block text-[15px] font-semibold text-[#2a2322] truncate hover:text-[#c8151d]">{p.name}</Link>
                    <p className={cn('text-[13px]', back ? 'text-[#1f6b3f] font-medium' : 'text-gray-500')}>{back ? `Back in stock at ${branch.name}` : `Out of stock at ${branch.name}`}</p>
                  </div>
                  <button type="button" onClick={() => removeAlert(p.id, p.name)} className="shrink-0 min-h-9 text-[15px] text-gray-600 hover:text-[#2a2322] hover:underline">Remove</button>
                </li>
              );
            })}
          </ul>
        )}
      </AccountCard>

      <RecentMessages />
    </AccountLayout>
  );
}

/** Messages already sent to the customer (order updates etc.); marked read after a moment. */
function RecentMessages() {
  const { s } = useShop();
  const me = useMe();
  const list = s.notifications.filter((n) => n.audience === 'shopper' && n.targetId === me.id).slice(0, 20);
  const unreadKey = list.filter((n) => !n.read).map((n) => n.id).join(',');
  useEffect(() => {
    if (!unreadKey) return;
    const t = setTimeout(() => mutate((d) => { d.notifications.forEach((n) => { if (n.audience === 'shopper' && n.targetId === me.id) n.read = true; }); }), 1200);
    return () => clearTimeout(t);
  }, [unreadKey, me.id]);
  if (list.length === 0) return null;
  return (
    <AccountCard title="Recent messages" sub="Order updates we sent you." bodyClass="p-0 md:p-0">
      <ul>
        {list.map((n) => {
          const linked = !!n.orderId && s.orders.some((o) => o.id === n.orderId);
          const body = (
            <>
              <span className={cn('w-2 h-2 rounded-full mt-2 shrink-0', n.read ? 'bg-transparent' : 'bg-[#c8151d]')} aria-label={n.read ? undefined : 'Unread'} />
              <span className="flex-1 min-w-0">
                <span className="flex justify-between gap-3"><span className="text-[15px] font-semibold text-[#2a2322]">{n.title}</span><span className="text-xs text-gray-500 shrink-0">{timeAgo(n.at)}</span></span>
                <span className="block text-[13px] text-gray-600">{n.body}</span>
              </span>
            </>
          );
          const cls = 'px-4 md:px-6 py-3.5 flex gap-3 border-b border-[#eadfd6] last:border-b-0';
          return (
            <li key={n.id}>
              {linked ? <Link href={`/my-orders/${n.orderId}`} className={cn(cls, 'hover:bg-[#f9f5f1]')}>{body}</Link> : <div className={cls}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </AccountCard>
  );
}

// ====================== SIGN-IN & SECURITY ======================
export function SecurityScreen() {
  const me = useMe();
  const { signOut, flash } = useShop();
  const [pw, setPw] = useState(false);
  const row = 'px-4 md:px-6 py-4 border-b border-[#eadfd6] last:border-b-0 flex flex-wrap items-center gap-x-4 gap-y-3';
  return (
    <AccountLayout active="security">
      <AccountCard title="Sign-in & security" sub="How you sign in to your account." bodyClass="p-0 md:p-0">
        <div className={row}>
          <Smartphone className="w-5 h-5 text-[#2a2322] shrink-0" strokeWidth={1.75} aria-hidden />
          <div className="flex-1 min-w-[160px]">
            <p className="text-[15px] font-semibold text-[#2a2322]">Mobile number</p>
            <p className="text-[13px] text-gray-600">{fmtPhonePH(me.mobile)} · used to sign in and for order texts</p>
          </div>
          <span className="flex items-center gap-1 text-sm font-semibold text-[#1f6b3f]"><BadgeCheck className="w-4 h-4 fill-[#1f6b3f] text-white" aria-hidden /> Verified</span>
        </div>
        <div className={row}>
          <KeyRound className="w-5 h-5 text-[#2a2322] shrink-0" strokeWidth={1.75} aria-hidden />
          <div className="flex-1 min-w-[160px]">
            <p className="text-[15px] font-semibold text-[#2a2322]">Username and password</p>
            <p className="text-[13px] text-gray-600">@{me.username ?? '—'} · {me.password ? 'password set' : 'no password yet'}</p>
          </div>
          <button type="button" onClick={() => setPw(true)} className={cn(outlineBtn, 'h-10 px-4 text-sm')}>Change password</button>
        </div>
        {me.googleEmail && (
          <div className={row}>
            <User className="w-5 h-5 text-[#2a2322] shrink-0" strokeWidth={1.75} aria-hidden />
            <div className="flex-1 min-w-[160px]">
              <p className="text-[15px] font-semibold text-[#2a2322]">Google account</p>
              <p className="text-[13px] text-gray-600 break-all">{me.googleEmail}</p>
            </div>
          </div>
        )}
      </AccountCard>

      <AccountCard title="Sign out" sub="Lost a phone or used a shared computer? Sign out everywhere." bodyClass="flex flex-col sm:flex-row gap-3">
        <button type="button" onClick={signOut} className={outlineBtn}><LogOut className="w-4 h-4" aria-hidden /> Sign out</button>
        <button type="button" onClick={() => { signOut(); flash('Signed out of all devices', 'info'); }} className="h-12 px-5 rounded-lg text-[15px] font-semibold text-[#a3111a] hover:bg-[#fdecec]">Sign out of all devices</button>
      </AccountCard>
      {pw && <PasswordSheet me={me} onClose={() => setPw(false)} />}
    </AccountLayout>
  );
}

function PasswordSheet({ me, onClose }: { me: Customer; onClose: () => void }) {
  const { flash } = useShop();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const save = () => {
    if (me.password && current !== me.password) { setErr('Your current password is not correct.'); return; }
    if (next.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (next !== confirm) { setErr('The new passwords do not match.'); return; }
    updateCustomer(me.id, (c) => { c.password = next; });
    flash('Password changed');
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Change password">
      <form onSubmit={(ev) => { ev.preventDefault(); save(); }} className="space-y-4" noValidate>
        {me.password && (
          <div>
            <label htmlFor="pw-cur" className={labelCls}>Current password</label>
            <input id="pw-cur" type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setErr(''); }} autoComplete="current-password" className={inputCls} />
          </div>
        )}
        <div>
          <label htmlFor="pw-new" className={labelCls}>New password</label>
          <input id="pw-new" type="password" value={next} onChange={(e) => { setNext(e.target.value); setErr(''); }} autoComplete="new-password" className={inputCls} />
        </div>
        <div>
          <label htmlFor="pw-conf" className={labelCls}>Confirm new password</label>
          <input id="pw-conf" type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErr(''); }} autoComplete="new-password" className={inputCls} />
        </div>
        {err && <p className="text-sm text-[#a3111a]" role="alert">{err}</p>}
        <button type="submit" className={cn(primaryBtn, 'w-full')}>Save new password</button>
      </form>
    </Sheet>
  );
}
