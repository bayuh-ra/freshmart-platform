'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, CircleHelp, Copy, Gift, Heart, LogOut, Mail, MapPin, MessageCircle, Phone, ReceiptText, Send, ShieldCheck, Ticket, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { Conversation } from '@/src/lib/types';
import { mutate, uid } from '@/src/lib/store';
import { findZone, fmtDate, fmtTime, getSetting, nearestBranch, peso, pesoShort, timeAgo } from '@/src/lib/logic';
import { cn } from '@/src/lib/utils';
import { Card, ScreenHeader, useShop } from './shared';
import { Toggle } from './CartCheckout';

// ====================== ACCOUNT ======================
export function AccountScreen() {
  const { s, shopper, go, branch, flash } = useShop();
  const vouchers = s.vouchers.filter((v) => v.active && new Date(v.end) > new Date());
  const unread = s.notifications.filter((n) => n.audience === 'shopper' && n.targetId === shopper.id && !n.read).length;
  const supportUnread = s.conversations.filter((c) => c.customerId === shopper.id && c.kind === 'support').reduce((n, c) => n + c.unreadShopper, 0);
  const orders = s.orders.filter((o) => o.customerId === shopper.id).length;
  const loyaltyOn = getSetting(s, 'ff_loyalty', branch.id) !== false;
  const [prefs, setPrefs] = useState({ status: true, promos: true, chat: true });
  const initials = shopper.name.split(' ').map((x) => x[0]).join('').slice(0, 2);


  return (
    <div className="min-h-full pb-6">
      <div className="bg-gradient-to-br from-[#1e40af] to-[#2563eb] text-white px-5 pt-4 pb-14 rounded-b-[28px]">
        <div className="flex items-center gap-3">
          <span className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-xl font-bold">{initials}</span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{shopper.name}</p>
            <p className="text-xs text-blue-100">{shopper.mobile} · {shopper.email}</p>
            <p className="text-[11px] text-blue-200 mt-0.5">Member since {fmtDate(shopper.createdAt)}{shopper.group ? ` · ${shopper.group}` : ''}</p>
          </div>
        </div>
      </div>
      <div className="mx-4 -mt-10 grid grid-cols-3 gap-2">
        {loyaltyOn && <Stat label="FreshPoints" value={shopper.points.toLocaleString()} onClick={() => flash(`${shopper.points} pts = ${pesoShort(shopper.points / 10)} off at checkout`, 'info')} />}
        <Stat label="Store credit" value={pesoShort(shopper.storeCredit)} />
        <Stat label="Vouchers" value={String(vouchers.length)} onClick={() => go({ name: 'vouchers' })} />
        {!loyaltyOn && <Stat label="Orders" value={String(orders)} onClick={() => go({ name: 'orders' })} />}
      </div>

      <Card className="mx-4 mt-4 overflow-hidden">
        <AccountItem icon={<ReceiptText className="w-4 h-4" />} label="My orders" sub={`${orders} orders · receipts & reorder`} onClick={() => go({ name: 'orders' })} />
        <AccountItem icon={<MapPin className="w-4 h-4" />} label="Saved addresses" sub={shopper.addresses.map((a) => a.label).join(', ')} onClick={() => go({ name: 'addresses' })} />
        <AccountItem icon={<Ticket className="w-4 h-4" />} label="Vouchers wallet" sub={`${vouchers.length} available`} onClick={() => go({ name: 'vouchers' })} />
        <AccountItem icon={<Wallet className="w-4 h-4" />} label="Payment methods" sub="GCash 0917 ••• 4567 · Visa •••• 4242" onClick={() => flash('Cards are tokenized by the payment gateway', 'info')} />
        <AccountItem icon={<Heart className="w-4 h-4" />} label="Favorite branch" sub={`${branch.name} · ${branch.hours}`} />
      </Card>

      <Card className="mx-4 mt-3 overflow-hidden">
        <AccountItem icon={<Bell className="w-4 h-4" />} label="Notifications" badge={unread} onClick={() => go({ name: 'notifications' })} />
        <AccountItem icon={<MessageCircle className="w-4 h-4" />} label="Chat with support" sub="Typically replies in 5 min" badge={supportUnread} onClick={() => go({ name: 'chat' })} />
        <AccountItem icon={<CircleHelp className="w-4 h-4" />} label="Help center & FAQ" onClick={() => go({ name: 'help' })} />
      </Card>

      <Card className="mx-4 mt-3 p-4">
        <p className="text-sm font-semibold mb-2">Notification preferences</p>
        {([['status', 'Order status updates'], ['chat', 'Chat messages'], ['promos', 'Promos & vouchers']] as const).map(([k, l]) => (
          <div key={k} className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-700">{l}</span>
            <Toggle on={prefs[k]} onClick={() => setPrefs({ ...prefs, [k]: !prefs[k] })} />
          </div>
        ))}
      </Card>

      <Card className="mx-4 mt-3 overflow-hidden">
        <AccountItem icon={<ShieldCheck className="w-4 h-4" />} label="Privacy & security" sub="Change password · Request account deletion" onClick={() => flash('Opens privacy settings (demo)', 'info')} />
        <Link href="/login" className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <span className="w-8 h-8 rounded-xl bg-red-50 text-[#dc2626] flex items-center justify-center"><LogOut className="w-4 h-4" /></span>
          <span className="flex-1 text-sm text-[#dc2626]">Sign out</span>
        </Link>
      </Card>
      <p className="text-center text-[10px] text-gray-400 mt-4">FreshMart v2.4.1 (build 318) · Up to date</p>
    </div>
  );
}

function AccountItem({ icon, label, sub, badge, onClick }: { icon: React.ReactNode; label: string; sub?: string; badge?: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 active:bg-gray-50">
      <span className="w-8 h-8 rounded-xl bg-blue-50 text-[#1e40af] flex items-center justify-center">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm">{label}</span>
        {sub && <span className="block text-[11px] text-gray-500 truncate">{sub}</span>}
      </span>
      {!!badge && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#dc2626] text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>}
      <ChevronRight className="w-4 h-4 text-gray-300" />
    </button>
  );
}

function Stat({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl shadow-md border border-gray-100 p-3 text-center">
      <p className="text-base font-bold text-[#1e40af]">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </button>
  );
}

// ====================== ADDRESSES ======================
export function AddressesScreen() {
  const { s, shopper, addresses, addrIdx, setAddrIdx, flash } = useShop();
  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title="Saved addresses" />
      <div className="px-4 py-3 space-y-3">
        {addresses.map((a, i) => {
          const nb = nearestBranch(s, a, 'delivery');
          const saved = i < shopper.addresses.length;
          return (
            <Card key={i} className={cn('p-3.5', addrIdx === i && 'ring-2 ring-[#1e40af]')}>
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-blue-50 text-[#1e40af] flex items-center justify-center text-lg">{a.label === 'Home' ? '🏠' : a.label === 'Work' ? '🏢' : '📍'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{a.label} {!saved && <span className="text-[10px] font-normal text-gray-400">· demo</span>}</p>
                  <p className="text-xs text-gray-600">{a.line}</p>
                  {a.landmark && <p className="text-[11px] text-gray-500">Landmark: {a.landmark}</p>}
                  <p className={cn('text-[11px] font-medium mt-1', nb ? 'text-emerald-600' : 'text-[#dc2626]')}>
                    {nb ? `✓ ${nb.name} delivers here (${findZone(s, nb, a)?.name ?? ''})` : '✕ Outside all delivery zones — pickup available'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => { setAddrIdx(i); flash(`Delivering to ${a.label}`); }} disabled={addrIdx === i} className="flex-1 h-9 rounded-xl bg-[#1e40af] text-white text-xs font-semibold disabled:bg-blue-100 disabled:text-[#1e40af]">{addrIdx === i ? 'Selected' : 'Deliver here'}</button>
                <button onClick={() => flash('Pin location on map (demo)', 'info')} className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700">Edit pin</button>
              </div>
            </Card>
          );
        })}
        <button onClick={() => flash('Location permission requested — manual entry fallback (demo)', 'info')} className="w-full h-11 rounded-2xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600">+ Add new address</button>
      </div>
    </div>
  );
}

// ====================== VOUCHERS ======================
export function VouchersScreen() {
  const { s, flash, setPendingVoucher, go } = useShop();
  const now = new Date();
  const active = s.vouchers.filter((v) => v.active && new Date(v.end) > now);
  const past = s.vouchers.filter((v) => !(v.active && new Date(v.end) > now));
  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title="Vouchers wallet" sub={`${active.length} available`} />
      <div className="px-4 py-3 space-y-3">
        {active.map((v) => (
          <div key={v.id} className="flex bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="w-20 bg-gradient-to-b from-[#1e40af] to-[#2563eb] text-white flex flex-col items-center justify-center p-2 text-center">
              <Gift className="w-5 h-5" />
              <p className="text-sm font-bold mt-1 leading-tight">{v.type === 'percent' ? `${v.value}%` : v.type === 'fixed' ? pesoShort(v.value) : 'FREE'}</p>
              <p className="text-[9px] opacity-80">{v.type === 'free_delivery' ? 'delivery' : 'off'}</p>
            </div>
            <div className="flex-1 p-3 border-l-2 border-dashed border-gray-200 min-w-0">
              <p className="text-sm font-bold tracking-wide">{v.code}</p>
              <p className="text-xs text-gray-600">{v.description}</p>
              <p className="text-[10px] text-gray-400 mt-1">Min. {pesoShort(v.minBasket)} · Valid until {fmtDate(v.end)}{v.firstOrderOnly ? ' · First order' : ''}{v.fulfillment ? ` · ${v.fulfillment} only` : ''}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setPendingVoucher(v.code); flash(`${v.code} will be applied at checkout`); go({ name: 'cart' }); }} className="h-7 px-3 rounded-full bg-[#1e40af] text-white text-[11px] font-semibold">Use now</button>
                <button onClick={() => { try { void navigator.clipboard?.writeText(v.code); } catch { /* ignore */ } flash('Code copied'); }} className="h-7 px-3 rounded-full border border-gray-200 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
              </div>
            </div>
          </div>
        ))}
        {past.length > 0 && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Promo history</p>}
        {past.map((v) => (
          <div key={v.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 opacity-70">
            <div className="flex justify-between"><p className="text-sm font-bold text-gray-500 line-through">{v.code}</p><span className="text-[10px] text-gray-500">Expired {fmtDate(v.end)}</span></div>
            <p className="text-xs text-gray-500">{v.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ====================== NOTIFICATIONS ======================
export function NotificationsScreen() {
  const { s, shopper, go } = useShop();
  const list = s.notifications.filter((n) => n.audience === 'shopper' && n.targetId === shopper.id);
  const unreadKey = list.filter((n) => !n.read).map((n) => n.id).join(',');
  useEffect(() => {
    if (!unreadKey) return;
    const t = setTimeout(() => mutate((d) => { d.notifications.forEach((n) => { if (n.audience === 'shopper' && n.targetId === shopper.id) n.read = true; }); }), 1200);
    return () => clearTimeout(t);
  }, [unreadKey, shopper.id]);
  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title="Notifications" />
      {list.length === 0 ? (
        <div className="text-center py-20 px-10">
          <p className="text-5xl">🔔</p>
          <p className="text-sm font-semibold mt-3">You&apos;re all caught up</p>
          <p className="text-xs text-gray-500 mt-1">Order updates, rider messages and promos will appear here.</p>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {list.map((n) => (
            <button key={n.id} onClick={() => n.orderId && s.orders.some((o) => o.id === n.orderId) && go({ name: 'track', orderId: n.orderId })}
              className={cn('w-full text-left rounded-2xl p-3 flex gap-3 border', n.read ? 'bg-white border-gray-100' : 'bg-blue-50/60 border-blue-100')}>
              <span className="w-9 h-9 rounded-xl bg-[#1e40af] text-white flex items-center justify-center shrink-0"><Bell className="w-4 h-4" /></span>
              <span className="flex-1 min-w-0">
                <span className="flex justify-between gap-2"><span className="text-sm font-semibold truncate">{n.title}</span><span className="text-[10px] text-gray-400 shrink-0">{timeAgo(n.at)}</span></span>
                <span className="block text-xs text-gray-600">{n.body}</span>
              </span>
              {!n.read && <span className="w-2 h-2 rounded-full bg-[#1e40af] mt-1.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ====================== HELP ======================
const FAQ = [
  ['How is my branch chosen?', 'We automatically pick the nearest open branch that delivers to your address. You can switch branch from the address bar on the Home screen.'],
  ['Why is my weighted item price different?', 'Items sold by weight (meat, fruit, vegetables) show an estimate. The final price is set when the picker weighs your item, and you only pay for the actual weight.'],
  ['What happens if an item is out of stock?', 'We follow your substitution preference: a similar item, ask you first (you have a few minutes to reply in the app), or refund the item.'],
  ['Can I cancel my order?', 'Yes, while the order is still before the cutoff set by the branch (usually until it is confirmed). Online payments are refunded automatically.'],
  ['How do refunds work?', 'Refunds go back to your original payment method (GCash, Maya or card) within 3–7 banking days, or instantly as store credit if you prefer.'],
  ['How do I pick up my order?', 'When your order is ready, show the QR code or tell the 4-digit PIN at the branch pickup counter.'],
];
export function HelpScreen() {
  const { s, branch, go } = useShop();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="min-h-full pb-6">
      <ScreenHeader title="Help center" />
      <div className="px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => go({ name: 'chat' })} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col items-center gap-1.5"><MessageCircle className="w-5 h-5 text-[#1e40af]" /><span className="text-[11px] font-medium">Chat</span></button>
          <a href={`tel:${branch.phone}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col items-center gap-1.5"><Phone className="w-5 h-5 text-[#1e40af]" /><span className="text-[11px] font-medium">{branch.phone}</span></a>
          <a href="mailto:support@freshmart.ph" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col items-center gap-1.5"><Mail className="w-5 h-5 text-[#1e40af]" /><span className="text-[11px] font-medium">Email</span></a>
        </div>
        <p className="text-[11px] text-gray-500 mt-2 text-center">Support hours: {String(getSetting(s, 'supportHours', branch.id))}</p>
        <p className="text-sm font-semibold mt-5 mb-2">Frequently asked questions</p>
        <Card className="overflow-hidden">
          {FAQ.map(([q, a], i) => (
            <div key={q} className="border-b border-gray-50 last:border-0">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="text-sm font-medium">{q}</span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 shrink-0 transition', open === i && 'rotate-180')} />
              </button>
              {open === i && <p className="px-4 pb-3 text-xs text-gray-600 leading-relaxed">{a}</p>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ====================== CHAT (support or rider) ======================
export function ChatScreen({ convId }: { convId?: string }) {
  const { s, shopper, branch } = useShop();
  const [text, setText] = useState('');
  const [createdId, setCreatedId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const conv: Conversation | undefined = convId
    ? s.conversations.find((c) => c.id === convId)
    : s.conversations.find((c) => c.id === createdId) ??
      s.conversations
        .filter((c) => c.kind === 'support' && c.customerId === shopper.id && c.status !== 'resolved')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const order = conv?.orderId ? s.orders.find((o) => o.id === conv.orderId) : undefined;
  const rider = conv?.kind === 'rider' ? s.riders.find((r) => r.id === order?.riderId) : undefined;
  const msgs = (conv?.messages ?? []).filter((m) => !m.internal);

  useEffect(() => {
    let p = endRef.current?.parentElement ?? null;
    while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement;
    if (p) p.scrollTop = p.scrollHeight;
  }, [msgs.length]);
  useEffect(() => {
    if (conv && conv.unreadShopper > 0) mutate((d) => { const c = d.conversations.find((x) => x.id === conv.id); if (c) c.unreadShopper = 0; });
  }, [conv?.id, conv?.unreadShopper]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const now = new Date().toISOString();
    let id = conv?.id;
    mutate((d) => {
      let c = id ? d.conversations.find((x) => x.id === id) : undefined;
      if (!c) {
        c = { id: uid('cv'), kind: 'support', customerId: shopper.id, customerName: shopper.name, branchId: branch.id, category: 'Other', status: 'open', priority: 'normal', messages: [], unreadStaff: 0, unreadShopper: 0, updatedAt: now };
        d.conversations.unshift(c);
        id = c.id;
      }
      c.messages.push({ from: 'shopper', name: shopper.name, text: t, at: now });
      c.unreadStaff += 1;
      if (c.status === 'resolved') c.status = 'open';
      c.updatedAt = now;
    });
    if (!conv) setCreatedId(id);
    setText('');
    // Rider quick acknowledgement (demo) when the rider has not replied yet.
    if (conv?.kind === 'rider' && rider && !conv.messages.some((m) => m.from === 'rider')) {
      const rid = conv.id;
      const rname = rider.name;
      setTimeout(() => mutate((d) => {
        const c = d.conversations.find((x) => x.id === rid);
        if (c && !c.messages.some((m) => m.from === 'rider')) {
          c.messages.push({ from: 'rider', name: rname, text: 'Noted po, ma\'am! I\'m on my way. 👍', at: new Date().toISOString() });
          c.updatedAt = new Date().toISOString();
        }
      }), 2500);
    }
  };

  const title = conv?.kind === 'rider' ? (rider?.name ?? 'Your rider') : 'FreshMart Support';
  const sub = conv?.kind === 'rider' ? `Masked chat · Order ${order?.number ?? ''}` : conv?.assignedTo ? `${conv.assignedTo} · Support agent` : 'Typically replies in 5 min';

  return (
    <div className="min-h-full flex flex-col bg-[#eef1f6]">
      <ScreenHeader title={title} sub={sub} right={conv && <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize', conv.status === 'resolved' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-700')}>{conv.status}</span>} />
      {order && (
        <div className="mx-3 mt-3 rounded-2xl bg-white border border-gray-100 p-2.5 flex items-center gap-2.5 shadow-sm">
          <span className="text-xl">🧾</span>
          <div className="flex-1 min-w-0"><p className="text-xs font-semibold">Order {order.number}</p><p className="text-[10px] text-gray-500 truncate">{order.items.length} items · {peso(order.total)} · {conv?.category}</p></div>
          <span className="text-[10px] text-gray-400">attached</span>
        </div>
      )}
      <div className="flex-1 px-3 py-3 space-y-2">
        {msgs.length === 0 && (
          <div className="text-center py-10 px-6">
            <p className="text-4xl">💬</p>
            <p className="text-sm font-semibold mt-2">{conv?.kind === 'rider' ? `Message ${title}` : 'How can we help?'}</p>
            <p className="text-xs text-gray-500 mt-1">{conv?.kind === 'rider' ? 'Your number stays private.' : 'Send us a message and a support agent will reply here.'}</p>
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.from === 'system') return <p key={i} className="text-center text-[10px] text-gray-500 bg-white/70 rounded-full px-3 py-1 mx-auto w-fit max-w-[90%]">{m.text}</p>;
          const mine = m.from === 'shopper';
          return (
            <div key={i} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 shadow-sm', mine ? 'bg-[#1e40af] text-white rounded-br-md' : 'bg-white text-gray-900 rounded-bl-md')}>
                {!mine && <p className="text-[10px] font-semibold text-[#1e40af] mb-0.5">{m.name}</p>}
                <p className="text-[13px] leading-snug whitespace-pre-wrap">{m.text}</p>
                <p className={cn('text-[9px] mt-0.5 text-right', mine ? 'text-blue-200' : 'text-gray-400')}>{fmtTime(m.at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="sticky bottom-0 bg-white border-t border-gray-100 px-3 pt-2.5 pb-4 flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="flex-1 h-10 rounded-full bg-gray-100 px-4 text-sm outline-none focus:ring-2 focus:ring-[#1e40af]/30" />
        <button type="submit" disabled={!text.trim()} className="w-10 h-10 rounded-full bg-[#1e40af] text-white flex items-center justify-center disabled:bg-gray-300" aria-label="Send"><Send className="w-4 h-4" /></button>
      </form>
    </div>
  );
}
