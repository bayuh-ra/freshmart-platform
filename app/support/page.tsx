'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Search, Send, Smile, MessageSquareText, StickyNote, Undo2, Ticket, Truck, XCircle, ArrowUpCircle, Star, Phone, Wallet, Ban, Inbox, Tag, Plus, X, ExternalLink, UserRound,
} from 'lucide-react';
import { DashboardLayout } from '@/src/components/layout/DashboardLayout';
import { AccessDenied, Pill, StatusBadge, PaymentBadge, EmptyState, inputClass, selectClass } from '@/src/components/common';
import { mutate, addAudit, addNotification, useStore, currentUserName, useTick } from '@/src/lib/store';
import { can, branchName, cityName, peso, pesoShort, timeAgo, fmtTime, playAlert, currentRole, getSetting, num } from '@/src/lib/logic';
import type { AppState, Conversation } from '@/src/lib/types';
import { Button } from '@/src/components/ui/shadcn/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';
import { CancelOrderDialog, ConversationX, RedeliverDialog, RefundDialog, VoucherSendDialog, pushMessage } from '@/src/components/support/actions';
import { cn } from '@/src/lib/utils';

type StatusFilter = 'open' | 'pending' | 'resolved' | 'all';
const CATEGORIES: Conversation['category'][] = ['Missing item', 'Damaged item', 'Late delivery', 'Payment issue', 'Rider behavior', 'Other'];
const EMOJIS = ['😊', '🙏', '👍', '🙂', '😔', '🎉', '❤️', '🛒', '🚚', '✅', '⏱️', '🥬'];
const SAVED_REPLIES = [
  { title: 'Greeting', text: 'Hi {name}! Thanks for reaching out to FreshMart support. Let me check this for you right away.' },
  { title: 'Missing item — refund', text: "Sorry about the missing item, {name}. I've processed a refund for it to your store credit — you can use it on your next order." },
  { title: 'Damaged item', text: 'So sorry the item arrived damaged. Could you send a quick photo so we can file a quality report with the branch?' },
  { title: 'Late delivery', text: 'Apologies for the delay, {name}. Your rider is on the way — you can follow them live on the tracking map in the app.' },
  { title: 'Payment double charge', text: "I can see the duplicate charge. The second payment will be reversed by the payment provider within 3–7 banking days. We'll keep you updated." },
  { title: 'Closing', text: 'Is there anything else I can help you with today? Have a great day! 🥬' },
];
const TAG_OPTIONS = ['refund', 'quality', 'rider', 'repeat-issue', 'vip', 'gcash', 'cold-chain'];

export default function SupportPage() {
  const s = useStore();
  useTick(15000);
  const me = currentUserName(s);
  const [status, setStatus] = useState<StatusFilter>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('c') ? 'all' : 'open'));
  const [mine, setMine] = useState(false);
  const [branch, setBranch] = useState('all');
  const [category, setCategory] = useState('all');
  const [q, setQ] = useState('');
  // Preselect from ?c=<id> (links from the Customers profile).
  const [initialId] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('c')));
  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  const convs = s.conversations.filter((c) => c.kind === 'support') as ConversationX[];

  // Sound + toast when a new shopper message arrives (from any tab).
  const shopperCount = convs.reduce((a, c) => a + c.messages.filter((m) => m.from === 'shopper').length, 0);
  const prevCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevCount.current !== null && shopperCount > prevCount.current) {
      playAlert();
      const latest = [...convs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      toast.info(`New message from ${latest?.customerName ?? 'a shopper'}`, { description: latest?.messages[latest.messages.length - 1]?.text.slice(0, 80) });
    }
    prevCount.current = shopperCount;
  }, [shopperCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const term = q.trim().toLowerCase();
  const filtered = convs
    .filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (mine && c.assignedTo !== me) return false;
      if (branch !== 'all' && c.branchId !== branch) return false;
      if (category !== 'all' && c.category !== category) return false;
      if (term) {
        const order = s.orders.find((o) => o.id === c.orderId);
        const hay = `${c.customerName} ${c.category} ${order?.number ?? ''} ${c.messages.map((m) => m.text).join(' ')} ${(c.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    })
    .sort((a, b) => (b.unreadStaff > 0 ? 1 : 0) - (a.unreadStaff > 0 ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));

  const selected = convs.find((c) => c.id === selectedId) ?? null;

  // Clear unread counter for the open conversation.
  useEffect(() => {
    if (selected && selected.unreadStaff > 0) {
      mutate((d) => {
        const c = d.conversations.find((x) => x.id === selected.id);
        if (c) c.unreadStaff = 0;
      });
    }
  }, [selected?.id, selected?.unreadStaff]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can(s, 'support.view')) {
    return <DashboardLayout title="Support Inbox" eyebrow="Customer Care"><AccessDenied permission="support.view" /></DashboardLayout>;
  }

  const count = (st: StatusFilter) => convs.filter((c) => st === 'all' || c.status === st).length;
  const unreadTotal = convs.reduce((a, c) => a + c.unreadStaff, 0);

  return (
    <DashboardLayout title="Support Inbox" eyebrow="Customer Care" hideBranch>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_340px] gap-4 h-[calc(100vh-8.5rem)] min-h-[560px]">
        {/* ---------------- Left: conversation list ---------------- */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Conversations</h2>
              {unreadTotal > 0 && <span className="rounded-full bg-[#dc2626] text-white text-xs font-semibold px-2 py-0.5">{unreadTotal} unread</span>}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
              <input className={cn(inputClass, 'pl-8 w-full')} placeholder="Search name, order #, message, tag" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-50 p-0.5">
              {(['open', 'pending', 'resolved', 'all'] as StatusFilter[]).map((st) => (
                <button key={st} onClick={() => setStatus(st)} className={cn('rounded-md py-1 text-xs font-medium capitalize', status === st ? 'bg-white shadow-sm text-[#1e40af]' : 'text-gray-500 hover:text-gray-700')}>
                  {st} <span className="text-gray-400">{count(st)}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <select className={cn(selectClass, 'flex-1 min-w-0 h-8 text-xs')} value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="all">All branches</option>
                {s.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select className={cn(selectClass, 'flex-1 min-w-0 h-8 text-xs')} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" className="accent-[#1e40af]" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me ({me})
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {filtered.map((c) => {
              const last = c.messages[c.messages.length - 1];
              const order = s.orders.find((o) => o.id === c.orderId);
              return (
                <li key={c.id}>
                  <button onClick={() => setSelectedId(c.id)} className={cn('w-full text-left px-3 py-3 hover:bg-gray-50 transition-colors border-l-2', selectedId === c.id ? 'bg-blue-50/60 border-l-[#1e40af]' : 'border-l-transparent')}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', c.priority === 'high' ? 'bg-[#dc2626]' : c.priority === 'normal' ? 'bg-amber-400' : 'bg-gray-300')} title={`${c.priority} priority`} />
                      <span className={cn('text-sm truncate flex-1', c.unreadStaff ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>{c.customerName}</span>
                      <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(c.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 pl-4">
                      <span className="text-[11px] text-gray-500">{c.category}</span>
                      {order && <span className="text-[11px] text-[#1e40af]">· {order.number}</span>}
                      {c.escalated && <span className="text-[11px] text-[#dc2626] font-medium">· Escalated</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-4">
                      <p className={cn('text-xs truncate flex-1', c.unreadStaff ? 'text-gray-800' : 'text-gray-400')}>
                        {last?.internal ? '📝 ' : last?.from === 'agent' ? 'You: ' : ''}{last?.text}
                      </p>
                      {c.unreadStaff > 0 && <span className="rounded-full bg-[#1e40af] text-white text-[10px] font-semibold min-w-5 h-5 px-1.5 flex items-center justify-center">{c.unreadStaff}</span>}
                    </div>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <EmptyState title="No conversations" sub="Try another filter" icon={<Inbox className="w-8 h-8" />} />}
          </ul>
        </section>

        {/* ---------------- Middle: thread ---------------- */}
        {selected ? <Thread key={selected.id} s={s} conv={selected} /> : (
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center xl:col-span-2">
            <EmptyState title="Select a conversation" sub="Messages from the Shopper App appear here in real time" icon={<MessageSquareText className="w-10 h-10" />} />
          </section>
        )}

        {/* ---------------- Right: customer + order + actions ---------------- */}
        {selected && <SidePanel s={s} conv={selected} />}
      </div>
    </DashboardLayout>
  );
}

// ======================================================================= Thread
function Thread({ s, conv }: { s: AppState; conv: ConversationX }) {
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const firstName = conv.customerName.split(' ')[0];
  const canReply = can(s, 'support.create') || can(s, 'support.edit');
  const sla = num(getSetting(s, 'supportSlaMins', conv.branchId)) || 5;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [conv.id, conv.messages.length, typing]);

  // SLA: first shopper message after the last agent reply.
  const lastAgentIdx = conv.messages.map((m) => m.from).lastIndexOf('agent');
  const waitingSince = conv.status !== 'resolved' ? conv.messages.slice(lastAgentIdx + 1).find((m) => m.from === 'shopper')?.at : undefined;
  const waitingMins = waitingSince ? (Date.now() - new Date(waitingSince).getTime()) / 60000 : 0;

  const send = () => {
    const body = text.trim();
    if (!body) return;
    mutate((d) => {
      pushMessage(d, conv.id, { from: 'agent', text: body, internal }, !internal);
      const c = d.conversations.find((x) => x.id === conv.id);
      if (c) {
        c.unreadStaff = 0;
        if (!internal && c.status === 'open') c.status = 'pending';
        if (!c.assignedTo) c.assignedTo = currentUserName(d);
      }
    });
    setText('');
    if (!internal) {
      setTyping(false);
      setTimeout(() => setTyping(true), 900);
      setTimeout(() => setTyping(false), 4200);
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-0">
      <header className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#1e40af]/10 text-[#1e40af] font-semibold flex items-center justify-center text-sm">{conv.customerName.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{conv.customerName}</p>
          <p className="text-xs text-gray-500">{conv.category} · {branchName(s, conv.branchId)} · {conv.assignedTo ? `Assigned to ${conv.assignedTo}` : 'Unassigned'}</p>
        </div>
        {waitingSince && (
          <Pill className={waitingMins > sla ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'}>
            {waitingMins > sla ? 'SLA breached' : 'Waiting'} · {Math.floor(waitingMins)} min
          </Pill>
        )}
        <Pill className={conv.status === 'resolved' ? 'bg-green-100 text-green-800' : conv.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}>
          {conv.status === 'pending' ? 'Pending customer' : conv.status}
        </Pill>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#fafafa]">
        {conv.messages.map((m, i) => {
          if (m.from === 'system') {
            return (
              <div key={i} className="flex justify-center">
                <div className={cn('max-w-[80%] text-center text-xs rounded-full px-3 py-1', m.internal ? 'bg-yellow-100 text-yellow-900' : 'bg-gray-100 text-gray-600')}>
                  {m.internal && '🔒 '}{m.text} <span className="text-gray-400">· {fmtTime(m.at)}</span>
                </div>
              </div>
            );
          }
          const mineSide = m.from === 'agent';
          return (
            <div key={i} className={cn('flex', mineSide ? 'justify-end' : 'justify-start')}>
              <div className="max-w-[75%]">
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                    m.internal ? 'bg-yellow-50 border border-yellow-300 text-yellow-950 rounded-br-sm'
                      : mineSide ? 'bg-[#1e40af] text-white rounded-br-sm'
                        : m.from === 'rider' ? 'bg-green-50 border border-green-200 text-gray-800 rounded-bl-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm',
                  )}
                >
                  {m.internal && <p className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 mb-0.5 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Internal note · staff only</p>}
                  {m.text}
                </div>
                <p className={cn('text-[11px] text-gray-400 mt-0.5', mineSide ? 'text-right' : 'text-left')}>
                  {m.name}{m.from === 'rider' ? ' (rider)' : ''} · {fmtTime(m.at)}
                  {mineSide && !m.internal && i === conv.messages.length - 1 && <span> · {conv.unreadShopper > 0 ? 'Delivered' : 'Seen'}</span>}
                </p>
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white border border-gray-200 px-3.5 py-2.5 flex items-center gap-1">
              {[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              <span className="text-xs text-gray-400 ml-1.5">{firstName} is typing…</span>
            </div>
          </div>
        )}
      </div>

      {conv.status === 'resolved' && (
        <div className="px-5 py-2 border-t border-gray-100 bg-green-50 text-sm text-green-800 flex items-center gap-2">
          <Star className="w-4 h-4" />
          {conv.csat ? <span>Shopper rated this chat <b>{'★'.repeat(conv.csat)}{'☆'.repeat(5 - conv.csat)}</b> ({conv.csat}/5)</span> : <span>Resolved · waiting for the shopper&apos;s satisfaction rating</span>}
        </div>
      )}

      <footer className={cn('border-t p-3', internal ? 'bg-yellow-50 border-yellow-200' : 'border-gray-100')}>
        {canReply ? (
          <>
            <div className="flex items-center gap-1 mb-2">
              <button onClick={() => setInternal(false)} className={cn('text-xs font-medium px-2.5 py-1 rounded-md', !internal ? 'bg-[#1e40af] text-white' : 'text-gray-500 hover:bg-gray-100')}>Reply to shopper</button>
              <button onClick={() => setInternal(true)} className={cn('text-xs font-medium px-2.5 py-1 rounded-md inline-flex items-center gap-1', internal ? 'bg-yellow-400 text-yellow-950' : 'text-gray-500 hover:bg-gray-100')}><StickyNote className="w-3 h-3" /> Internal note</button>
              <div className="ml-auto flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MessageSquareText className="w-4 h-4" /> Saved replies</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Saved replies</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {SAVED_REPLIES.map((r) => (
                      <DropdownMenuItem key={r.title} onSelect={() => setText(r.text.replaceAll('{name}', firstName))} className="flex-col items-start">
                        <span className="font-medium">{r.title}</span>
                        <span className="text-xs text-gray-500 line-clamp-1">{r.text.replaceAll('{name}', firstName)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Emoji"><Smile className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 p-2">
                    <div className="grid grid-cols-6 gap-1">
                      {EMOJIS.map((e) => <button key={e} onClick={() => setText((t) => t + e)} className="text-lg rounded hover:bg-gray-100">{e}</button>)}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={internal ? 'Internal note — only staff can see this' : `Reply to ${firstName}… (Enter to send, Shift+Enter for new line)`}
                className={cn('flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus-glow', internal ? 'border-yellow-300 bg-white' : 'border-gray-300')}
              />
              <Button onClick={send} disabled={!text.trim()} className={internal ? 'bg-yellow-500 hover:bg-yellow-600 text-yellow-950' : ''}>
                <Send className="w-4 h-4" /> {internal ? 'Add note' : 'Send'}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500 text-center py-2">Your role can view conversations but not reply.</p>
        )}
      </footer>
    </section>
  );
}

// ======================================================================= Side panel
function SidePanel({ s, conv }: { s: AppState; conv: ConversationX }) {
  const [dlg, setDlg] = useState<null | 'refund' | 'voucher' | 'redeliver' | 'cancel'>(null);
  const [tagInput, setTagInput] = useState('');
  const customer = s.customers.find((c) => c.id === conv.customerId);
  const order = s.orders.find((o) => o.id === conv.orderId);
  const custOrders = s.orders.filter((o) => o.customerId === conv.customerId);
  const canAct = can(s, 'support.edit');
  const agents = useMemo(() => s.staff.filter((u) => u.status === 'active' && s.roles.find((r) => r.id === u.roleId)?.permissions.includes('support.view')), [s.staff, s.roles]);
  const role = currentRole(s);

  const update = (patch: Partial<ConversationX>, action: string, detail: string, opts?: { system?: string; internal?: boolean }) => {
    mutate((d) => {
      const c = d.conversations.find((x) => x.id === conv.id) as ConversationX | undefined;
      if (!c) return;
      Object.assign(c, patch);
      c.updatedAt = new Date().toISOString();
      if (opts?.system) pushMessage(d, conv.id, { from: 'system', text: opts.system, internal: opts.internal }, false);
      addAudit(d, { module: 'Support', action, detail: `${conv.customerName} (${conv.category}) — ${detail}`, branchId: conv.branchId });
    });
  };

  const setStatus = (st: Conversation['status']) => {
    if (st === conv.status) return;
    update({ status: st }, 'Conversation status changed', `${conv.status} → ${st}`, { system: st === 'resolved' ? `Conversation resolved by ${currentUserName(s)}. Shopper asked to rate the chat.` : `Status changed to ${st}.`, internal: st !== 'resolved' });
    if (st === 'resolved') {
      mutate((d) => addNotification(d, { audience: 'shopper', targetId: conv.customerId, title: 'How did we do?', body: 'Your support chat was resolved. Tap to rate your experience.', orderId: conv.orderId }));
      toast.success('Conversation resolved', { description: 'The shopper has been asked for a rating.' });
      // Demo: the shopper rates the chat a few seconds later.
      setTimeout(() => {
        mutate((d) => {
          const c = d.conversations.find((x) => x.id === conv.id) as ConversationX | undefined;
          if (!c || c.status !== 'resolved' || c.csat) return;
          c.csat = conv.priority === 'high' ? 4 : 5;
          c.messages.push({ from: 'system', name: 'System', text: `${conv.customerName} rated this chat ${c.csat}/5.`, at: new Date().toISOString() });
        });
      }, 5000);
    } else toast.success(`Marked ${st}`);
  };

  const escalate = () => {
    const mgr = s.staff.find((u) => u.status === 'active' && u.roleId === 'role-branch' && u.scope.ids.includes(conv.branchId ?? ''))
      ?? s.staff.find((u) => u.status === 'active' && u.roleId === 'role-city' && u.scope.ids.includes(s.branches.find((b) => b.id === conv.branchId)?.cityId ?? ''))
      ?? s.staff.find((u) => u.roleId === 'role-super');
    update({ escalated: true, priority: 'high', assignedTo: mgr?.name ?? conv.assignedTo }, 'Conversation escalated', `to ${mgr?.name ?? 'manager'}`, { system: `Escalated to ${mgr?.name ?? 'manager'} by ${currentUserName(s)}.`, internal: true });
    mutate((d) => addNotification(d, { audience: 'staff', targetId: conv.branchId, title: 'Support case escalated', body: `${conv.customerName} · ${conv.category} → ${mgr?.name ?? 'manager'}`, orderId: conv.orderId }));
    toast.success(`Escalated to ${mgr?.name ?? 'manager'}`);
  };

  const addTag = (t: string) => {
    const tag = t.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || conv.tags?.includes(tag)) return;
    update({ tags: [...(conv.tags ?? []), tag] }, 'Tag added', tag);
    setTagInput('');
  };
  const removeTag = (t: string) => update({ tags: (conv.tags ?? []).filter((x) => x !== t) }, 'Tag removed', t);

  const field = 'text-[11px] font-semibold uppercase tracking-wide text-gray-400';

  return (
    <aside className="hidden xl:flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 min-h-0 overflow-y-auto">
      {/* Customer */}
      <div className="p-4 border-b border-gray-100">
        <p className={field}>Customer</p>
        {customer ? (
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <UserRound className="w-4 h-4 text-gray-400" />
              <span className="font-semibold text-gray-900">{customer.name}</span>
              {customer.blocked && <Pill className="bg-red-100 text-red-700"><Ban className="w-3 h-3" /> Blocked</Pill>}
              {customer.group && <Pill className="bg-amber-50 text-amber-800">{customer.group}</Pill>}
            </div>
            <p className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{customer.mobile}</p>
            <p className="text-gray-500 text-xs">{cityName(s, customer.cityId)} · {custOrders.length} orders · since {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
            <div className="flex gap-3 pt-1">
              <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Wallet className="w-3.5 h-3.5 text-green-600" /> Credit <b className="text-[#1e40af]">{peso(customer.storeCredit)}</b></span>
              <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Star className="w-3.5 h-3.5 text-amber-500" /> {customer.points} pts</span>
            </div>
            <Link href="/customers" className="text-xs text-[#1e40af] hover:underline inline-flex items-center gap-1">Customer profile <ExternalLink className="w-3 h-3" /></Link>
          </div>
        ) : <p className="text-sm text-gray-400 mt-2">Unknown customer</p>}
      </div>

      {/* Order */}
      <div className="p-4 border-b border-gray-100">
        <p className={field}>Attached order</p>
        {order ? (
          <div className="mt-2 rounded-lg border border-gray-100 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Link href={`/orders/${order.id}`} className="font-semibold text-[#1e40af] hover:underline inline-flex items-center gap-1">{order.number} <ExternalLink className="w-3 h-3" /></Link>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs text-gray-500">{branchName(s, order.branchId)} · {order.fulfillment} · {timeAgo(order.placedAt)}</p>
            <ul className="text-xs text-gray-600 space-y-0.5 max-h-28 overflow-y-auto">
              {order.items.map((i) => <li key={i.productId} className="flex justify-between gap-2"><span className="truncate">{i.image} {i.name}</span><span className="text-gray-400 shrink-0">× {i.qty}</span></li>)}
            </ul>
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <PaymentBadge status={order.paymentStatus} />
              <span className="text-sm font-bold text-[#1e40af]">{peso(order.total)}</span>
            </div>
            {order.refundedAmount > 0 && <p className="text-xs text-[#dc2626]">Refunded {peso(order.refundedAmount)}</p>}
          </div>
        ) : <p className="text-sm text-gray-400 mt-2">No order attached</p>}
      </div>

      {/* Actions */}
      <div className="p-4 border-b border-gray-100">
        <p className={field}>Quick actions</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <ActionBtn icon={Undo2} label="Issue refund" onClick={() => setDlg('refund')} disabled={!canAct || (order ? order.total - order.refundedAmount <= 0 : false)} />
          <ActionBtn icon={Ticket} label="Send voucher" onClick={() => setDlg('voucher')} disabled={!canAct} />
          <ActionBtn icon={Truck} label="Re-deliver" onClick={() => setDlg('redeliver')} disabled={!canAct || !order} />
          <ActionBtn icon={XCircle} label="Cancel order" onClick={() => setDlg('cancel')} disabled={!canAct || !order} danger />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Refunds above {pesoShort(num(getSetting(s, 'refundApprovalAbove', conv.branchId)))} need manager approval · you are {role.name}.</p>
      </div>

      {/* Case details */}
      <div className="p-4 space-y-3">
        <p className={field}>Case</p>
        <div>
          <span className="text-xs text-gray-500">Status</span>
          <div className="grid grid-cols-3 gap-1 mt-1">
            {(['open', 'pending', 'resolved'] as const).map((st) => (
              <button key={st} disabled={!canAct} onClick={() => setStatus(st)} className={cn('rounded-md border py-1 text-xs font-medium capitalize disabled:opacity-50', conv.status === st ? 'border-[#1e40af] bg-blue-50 text-[#1e40af]' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>{st}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="text-xs text-gray-500">Priority</span>
            <select disabled={!canAct} className={cn(selectClass, 'w-full mt-1 h-8 text-xs')} value={conv.priority} onChange={(e) => update({ priority: e.target.value as Conversation['priority'] }, 'Priority changed', `${conv.priority} → ${e.target.value}`)}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
          </label>
          <label className="block"><span className="text-xs text-gray-500">Category</span>
            <select disabled={!canAct} className={cn(selectClass, 'w-full mt-1 h-8 text-xs')} value={conv.category} onChange={(e) => update({ category: e.target.value as Conversation['category'] }, 'Category changed', `${conv.category} → ${e.target.value}`)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><span className="text-xs text-gray-500">Assigned to</span>
          <select
            disabled={!canAct} className={cn(selectClass, 'w-full mt-1 h-8 text-xs')} value={conv.assignedTo ?? ''}
            onChange={(e) => { update({ assignedTo: e.target.value || undefined }, 'Conversation assigned', e.target.value || 'Unassigned', { system: e.target.value ? `Assigned to ${e.target.value}.` : 'Unassigned.', internal: true }); toast.success(e.target.value ? `Assigned to ${e.target.value}` : 'Unassigned'); }}
          >
            <option value="">Unassigned</option>
            {agents.map((u) => <option key={u.id} value={u.name}>{u.name} · {s.roles.find((r) => r.id === u.roleId)?.name}</option>)}
            {conv.assignedTo && !agents.some((u) => u.name === conv.assignedTo) && <option value={conv.assignedTo}>{conv.assignedTo}</option>}
          </select>
        </label>
        <div>
          <span className="text-xs text-gray-500 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {(conv.tags ?? []).map((t) => (
              <Pill key={t} className="bg-blue-50 text-[#1e40af]">#{t}{canAct && <button onClick={() => removeTag(t)} aria-label={`Remove ${t}`}><X className="w-3 h-3" /></button>}</Pill>
            ))}
            {(conv.tags ?? []).length === 0 && <span className="text-xs text-gray-400">No tags</span>}
          </div>
          {canAct && (
            <div className="flex gap-1 mt-2">
              <input list="tag-options" className={cn(inputClass, 'h-8 text-xs flex-1 min-w-0')} placeholder="Add tag" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag(tagInput)} />
              <datalist id="tag-options">{TAG_OPTIONS.map((t) => <option key={t} value={t} />)}</datalist>
              <Button size="sm" variant="outline" onClick={() => addTag(tagInput)}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </div>
        <Button variant="outline" className="w-full text-[#dc2626] border-red-200 hover:bg-red-50" disabled={!canAct || conv.escalated} onClick={escalate}>
          <ArrowUpCircle className="w-4 h-4" /> {conv.escalated ? 'Escalated to manager' : 'Escalate to manager'}
        </Button>
        {conv.status === 'resolved' && (
          <div className="rounded-lg bg-green-50 p-3 text-sm">
            <p className="text-xs text-green-700 font-medium">Satisfaction rating</p>
            {conv.csat ? <p className="text-lg text-amber-500">{'★'.repeat(conv.csat)}<span className="text-gray-300">{'★'.repeat(5 - conv.csat)}</span> <span className="text-sm text-gray-600">{conv.csat}/5</span></p> : <p className="text-gray-500 text-xs mt-0.5">Not rated yet</p>}
          </div>
        )}
      </div>

      {dlg === 'refund' && <RefundDialog s={s} conv={conv} order={order} open onOpenChange={(v) => !v && setDlg(null)} />}
      {dlg === 'voucher' && <VoucherSendDialog s={s} conv={conv} open onOpenChange={(v) => !v && setDlg(null)} />}
      {dlg === 'redeliver' && order && <RedeliverDialog conv={conv} order={order} open onOpenChange={(v) => !v && setDlg(null)} />}
      {dlg === 'cancel' && order && <CancelOrderDialog conv={conv} order={order} open onOpenChange={(v) => !v && setDlg(null)} />}
    </aside>
  );
}

function ActionBtn({ icon: Icon, label, onClick, disabled, danger }: { icon: typeof Undo2; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={cn('flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed', danger ? 'border-red-100 text-[#dc2626] hover:bg-red-50' : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-[#1e40af]/40')}
    >
      <Icon className="w-4 h-4" strokeWidth={1.75} />
      {label}
    </button>
  );
}
