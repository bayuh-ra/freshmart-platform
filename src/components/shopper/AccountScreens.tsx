'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Copy, Gift, Mail, MessageCircle, Phone, Send, Store } from 'lucide-react';
import type { Conversation } from '@/src/lib/types';
import { mutate, uid } from '@/src/lib/store';
import { fmtDate, fmtTime, getSetting, peso, pesoShort } from '@/src/lib/logic';
import { moduleOn } from '@/src/lib/platform';
import { cn } from '@/src/lib/utils';
import { Card, Container, ScreenHeader, useMe, useShop } from './shared';

// My account pages (personal details, addresses, payments, notifications, security) are in AccountPages.tsx.

// ====================== VOUCHERS ======================
export function VouchersScreen() {
  const { s, flash, setPendingVoucher, go } = useShop();
  if (!moduleOn(s, 'promotions')) {
    return (
      <Container className="pb-6">
        <ScreenHeader title="Vouchers wallet" back="/account" />
        <p className="text-sm text-gray-600 py-10 text-center">Vouchers are not available right now.</p>
      </Container>
    );
  }
  const now = new Date();
  const active = s.vouchers.filter((v) => v.active && new Date(v.end) > now);
  const past = s.vouchers.filter((v) => !(v.active && new Date(v.end) > now));
  return (
    <Container className="pb-6">
      <ScreenHeader title="Vouchers wallet" sub={`${active.length} available`} back="/account" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {active.map((v) => (
          <div key={v.id} className="flex bg-white rounded-2xl border border-[#eadfd6] shadow-sm overflow-hidden">
            <div className="w-24 bg-gradient-to-b from-[#c8151d] to-[#7d0d12] text-white flex flex-col items-center justify-center p-2 text-center shrink-0">
              <Gift className="w-5 h-5" />
              <p className="text-base font-bold mt-1 leading-tight">{v.type === 'percent' ? `${v.value}%` : v.type === 'fixed' ? pesoShort(v.value) : 'FREE'}</p>
              <p className="text-[10px] opacity-85">{v.type === 'free_delivery' ? 'delivery' : 'off'}</p>
            </div>
            <div className="flex-1 p-3 border-l-2 border-dashed border-gray-200 min-w-0">
              <p className="text-sm font-bold tracking-wide">{v.code}</p>
              <p className="text-xs text-gray-700">{v.description}</p>
              <p className="text-[11px] text-gray-500 mt-1">Min. {pesoShort(v.minBasket)} · Valid until {fmtDate(v.end)}{v.firstOrderOnly ? ' · First order' : ''}{v.fulfillment ? ` · ${v.fulfillment} only` : ''}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => { setPendingVoucher(v.code); flash(`${v.code} will be applied at checkout`); go({ name: 'cart' }); }} className="h-11 md:h-9 px-4 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white text-xs font-semibold">Use now</button>
                <button onClick={() => { try { void navigator.clipboard?.writeText(v.code); } catch { /* ignore */ } flash('Code copied'); }} className="h-11 md:h-9 px-4 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {past.length > 0 && <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide pt-6 pb-2">Promo history</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {past.map((v) => (
          <div key={v.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 opacity-80">
            <div className="flex justify-between gap-2"><p className="text-sm font-bold text-gray-600 line-through">{v.code}</p><span className="text-[11px] text-gray-600">Expired {fmtDate(v.end)}</span></div>
            <p className="text-xs text-gray-600">{v.description}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}

// ====================== HELP (public) ======================
const FAQ = [
  ['Why is my final price different from the estimate?', 'Meat is sold by weight. You choose an estimated weight (for example 1.5 kg); the final price is set when your meat is weighed, and you only pay for the actual weight. Cut and preparation fees are a flat charge per item.'],
  ['How is my meat kept cold?', 'Fresh and frozen items are packed in an insulated bag with ice packs, and the rider delivers them within the maximum delivery time set by the branch.'],
  ['What happens if an item is unavailable?', 'The branch will call you to agree on a replacement or to remove the item. You never pay for items you did not receive.'],
  ['Can I cancel my order?', 'Yes, while the order is still before the cutoff set by the branch (usually until it is confirmed). Online payments are refunded automatically.'],
  ['How do refunds work?', 'Refunds go back to your original payment method (GCash, Maya or card) within 3–7 banking days, or instantly as store credit if you prefer.'],
  ['How do I pick up my order?', 'When your order is ready, show the QR code or tell the 4-digit PIN at the branch pickup counter.'],
];
export function HelpScreen() {
  const { s, shopper, branch } = useShop();
  const [open, setOpen] = useState<number | null>(0);
  const supportOn = moduleOn(s, 'support') && !!shopper;
  const hours = String(getSetting(s, 'supportHours', branch.id) || branch.hours);
  return (
    <Container className="pb-6">
      <ScreenHeader title="Help center" sub={`${supportOn ? 'Support hours' : 'Branch hours'}: ${hours}`} back={shopper ? '/account' : '/'} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_340px] md:gap-6 items-start">
        <div className="min-w-0 md:order-2 space-y-2">
          {supportOn && (
            <Link href="/account/chat" className="bg-white rounded-2xl border border-[#eadfd6] shadow-sm p-4 flex items-center gap-3 hover:border-[#c8151d]">
              <MessageCircle className="w-5 h-5 text-[#c8151d]" /><span className="text-sm font-semibold">Chat with support</span>
            </Link>
          )}
          <a href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`} className="bg-white rounded-2xl border border-[#eadfd6] shadow-sm p-4 flex items-center gap-3 hover:border-[#c8151d]">
            <Phone className="w-5 h-5 text-[#c8151d] shrink-0" />
            <span className="min-w-0"><span className="block text-sm font-semibold">Call the branch</span><span className="block text-xs text-gray-600">{branch.name} · {branch.phone}</span></span>
          </a>
          <a href={`mailto:${branch.email}`} className="bg-white rounded-2xl border border-[#eadfd6] shadow-sm p-4 flex items-center gap-3 hover:border-[#c8151d]">
            <Mail className="w-5 h-5 text-[#c8151d] shrink-0" />
            <span className="min-w-0"><span className="block text-sm font-semibold">Email us</span><span className="block text-xs text-gray-600 break-all">{branch.email}</span></span>
          </a>
          <div className="bg-white rounded-2xl border border-[#eadfd6] shadow-sm p-4 flex items-start gap-3">
            <Store className="w-5 h-5 text-[#c8151d] shrink-0" />
            <span className="min-w-0"><span className="block text-sm font-semibold">{branch.name} branch</span><span className="block text-xs text-gray-600">{branch.address}</span><span className="block text-xs text-gray-600">Open daily · {branch.hours}</span></span>
          </div>
        </div>
        <div className="min-w-0 md:order-1">
          <p className="font-display uppercase tracking-wide text-lg font-semibold mb-2">Frequently asked questions</p>
          <Card className="overflow-hidden">
            {FAQ.map(([q, a], i) => (
              <div key={q} className="border-b border-[#f6efe9] last:border-0">
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="w-full flex items-center justify-between gap-2 px-4 min-h-14 py-3 text-left hover:bg-[#fdf8f4]">
                  <span className="text-sm font-medium">{q}</span>
                  <ChevronDown className={cn('w-4 h-4 text-gray-500 shrink-0 transition', open === i && 'rotate-180')} />
                </button>
                {open === i && <p className="px-4 pb-4 text-sm text-gray-700 leading-relaxed">{a}</p>}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Container>
  );
}

// ====================== CHAT (support or rider; Support module only) ======================
export function ChatScreen({ convId }: { convId?: string }) {
  const { s, branch } = useShop();
  const shopper = useMe();
  const [text, setText] = useState('');
  const [createdId, setCreatedId] = useState<string | undefined>();
  const endRef = useRef<HTMLDivElement>(null);
  const conv: Conversation | undefined = convId
    ? s.conversations.find((c) => c.id === convId && c.customerId === shopper.id)
    : s.conversations.find((c) => c.id === createdId) ??
      s.conversations
        .filter((c) => c.kind === 'support' && c.customerId === shopper.id && c.status !== 'resolved')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const order = conv?.orderId ? s.orders.find((o) => o.id === conv.orderId) : undefined;
  const rider = conv?.kind === 'rider' ? s.riders.find((r) => r.id === order?.riderId) : undefined;
  const msgs = (conv?.messages ?? []).filter((m) => !m.internal);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
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

  const title = conv?.kind === 'rider' ? (rider?.name ?? 'Your rider') : 'Jovanne’s Support';
  const sub = conv?.kind === 'rider' ? `Masked chat · Order ${order?.number ?? ''}` : conv?.assignedTo ? `${conv.assignedTo} · Support agent` : 'Typically replies in 5 min';

  return (
    <Container className="pb-4 flex-1 flex flex-col">
      <ScreenHeader title={title} sub={sub} back={order ? `/my-orders/${order.id}` : '/account'}
        right={conv && <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', conv.status === 'resolved' ? 'bg-gray-100 text-gray-700' : 'bg-emerald-50 text-emerald-800')}>{conv.status}</span>} />
      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
        {order && (
          <div className="rounded-2xl bg-white border border-[#eadfd6] p-3 flex items-center gap-2.5 shadow-sm">
            <span className="text-xl" aria-hidden>🧾</span>
            <div className="flex-1 min-w-0"><p className="text-xs font-semibold">Order {order.number}</p><p className="text-[11px] text-gray-600 truncate">{order.items.length} items · {peso(order.total)} · {conv?.category}</p></div>
            <span className="text-[11px] text-gray-500">attached</span>
          </div>
        )}
        <div className="flex-1 py-3 space-y-2" aria-live="polite">
          {msgs.length === 0 && (
            <div className="text-center py-10 px-6">
              <p className="text-4xl" aria-hidden>💬</p>
              <p className="text-sm font-semibold mt-2">{conv?.kind === 'rider' ? `Message ${title}` : 'How can we help?'}</p>
              <p className="text-xs text-gray-600 mt-1">{conv?.kind === 'rider' ? 'Your number stays private.' : 'Send us a message and a support agent will reply here.'}</p>
            </div>
          )}
          {msgs.map((m, i) => {
            if (m.from === 'system') return <p key={i} className="text-center text-[11px] text-gray-600 bg-white/80 rounded-full px-3 py-1 mx-auto w-fit max-w-[90%]">{m.text}</p>;
            const mine = m.from === 'shopper';
            return (
              <div key={i} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 shadow-sm', mine ? 'bg-[#c8151d] text-white rounded-br-md' : 'bg-white text-gray-900 rounded-bl-md')}>
                  {!mine && <p className="text-[11px] font-semibold text-[#a3111a] mb-0.5">{m.name}</p>}
                  <p className="text-sm leading-snug whitespace-pre-wrap">{m.text}</p>
                  <p className={cn('text-[10px] mt-0.5 text-right', mine ? 'text-white/75' : 'text-gray-500')}>{fmtTime(m.at)}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="sticky bottom-0 bg-[#faf6f2] pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" placeholder="Type a message…" className="flex-1 min-w-0 h-12 rounded-full bg-white border border-[#eadfd6] px-4 text-base md:text-sm outline-none focus:border-[#c8151d]" />
          <button type="submit" disabled={!text.trim()} className="w-12 h-12 rounded-full bg-[#c8151d] hover:bg-[#a3111a] text-white flex items-center justify-center disabled:bg-gray-300 shrink-0" aria-label="Send"><Send className="w-5 h-5" /></button>
        </form>
      </div>
    </Container>
  );
}
