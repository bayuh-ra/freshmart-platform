'use client';

// Riders page → "COD remittance" tab (master–detail): riders holding cash on the left, the selected rider's
// COD orders and the inline "Record remittance" form on the right. Handed-over-today list under the riders.
import { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { fmtTime, peso, pesoShort } from '@/src/lib/logic';
import type { AppState, Rider } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { Avatar, ICON, OSWALD, STATE, areaOf, heldCod, plural, recordRemittance, round2, sameDay, type RiderView } from './_own';

/** Shared master–detail bits (also used by Payout statements). */
export const selRowCls = (on: boolean) => cn('w-full text-left border-l-[3px] transition-colors', on ? 'bg-[#fdf1f0] border-l-[#c8151d]' : 'border-l-transparent hover:bg-[#faf6f2]');
export const smallCaps = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500';
/** On phones the detail panel sits under the list: bring it into view after a tap. */
export function scrollToDetail(el: HTMLElement | null) {
  if (el && typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function CodTab({ s, views, now, canEdit, selectedId, onSelect }: {
  s: AppState; views: RiderView[]; now: number; canEdit: boolean; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const [showSettled, setShowSettled] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const active = views.filter((v) => v.r.status !== 'pending');
  const holders = active.filter((v) => v.r.codHeld > 0)
    .sort((a, b) => Number(b.r.status === 'offline') - Number(a.r.status === 'offline') || b.r.codHeld - a.r.codHeld);
  const settled = active.filter((v) => v.r.codHeld <= 0).sort((a, b) => a.r.name.localeCompare(b.r.name));
  const total = holders.reduce((t, v) => t + v.r.codHeld, 0);
  const handed = (s.remittances ?? []).filter((x) => sameDay(x.at, now)).sort((a, b) => b.at.localeCompare(a.at));
  const handedTotal = handed.reduce((t, x) => t + x.amount, 0);
  const remittedToday = new Set(handed.map((x) => x.riderId).filter(Boolean));
  const sel = holders.find((v) => v.r.id === selectedId) ?? holders[0];

  const pick = (id: string) => { onSelect(id); scrollToDetail(detailRef.current); };
  /** After recording: next rider still holding cash (after the current one), else none. */
  const confirmed = (r: Rider, amount: number, method: 'cash' | 'gcash', orders: number) => {
    const i = holders.findIndex((v) => v.r.id === r.id);
    recordRemittance(r, amount, method, orders);
    const stillHolds = round2(r.codHeld - amount) > 0;
    const next = holders[i + 1] ?? holders.find((v) => v.r.id !== r.id) ?? (stillHolds ? holders[i] : undefined);
    onSelect(next?.r.id ?? null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] gap-4 lg:gap-6 items-start">
      {/* LEFT: riders holding cash */}
      <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4">
          <h2 className="text-base font-semibold text-[#1d1716]">Cash to collect</h2>
          <span className="text-lg font-semibold tabular-nums text-[#ae754d]">{peso(total)}</span>
        </div>

        {holders.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-gray-500 border-t border-[#f0e8e2]">No rider is holding COD cash right now.</p>
        ) : (
          <ul className="divide-y divide-[#f0e8e2] border-t border-[#f0e8e2]">
            {holders.map((v) => {
              const { r } = v;
              const held = heldCod(s, r, now);
              const off = r.status === 'offline';
              const sub = `${plural(held.count, 'COD order')}${held.since ? ` · holding since ${fmtTime(held.since)}` : ''}`;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => pick(r.id)} aria-current={sel?.r.id === r.id ? 'true' : undefined}
                    className={cn(selRowCls(sel?.r.id === r.id), 'flex items-center gap-3 px-4 sm:px-5 py-3')}>
                    <Avatar name={r.name} size="sm" dim={off} dot={STATE[v.state].dot} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[#1d1716] truncate">{r.name}</span>
                      <span className={cn('block text-xs truncate', off ? 'text-[#c8151d] font-medium' : 'text-gray-500')}>{off ? `Offline · ${sub}` : sub}</span>
                    </span>
                    <span className="font-bold tabular-nums text-[#1d1716] shrink-0">{peso(r.codHeld)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" onClick={() => setShowSettled((x) => !x)} aria-expanded={showSettled}
          className="w-full flex items-center gap-2 px-4 sm:px-5 py-3 border-t border-[#f0e8e2] text-left text-sm font-medium text-[#1f6b3f] hover:bg-[#faf6f2]">
          <CheckCircle2 className="w-4 h-4 shrink-0" {...ICON} />
          <span className="flex-1">{plural(settled.length, 'rider')} settled or no cash today</span>
          {showSettled ? <ChevronUp className="w-4 h-4 text-gray-400" {...ICON} /> : <ChevronDown className="w-4 h-4 text-gray-400" {...ICON} />}
        </button>
        {showSettled && settled.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 bg-[#faf6f2] border-t border-[#f0e8e2]">
            {settled.map((v) => (
              <li key={v.r.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-r border-[#efe6de] min-w-0">
                <Avatar name={v.r.name} size="sm" dim={v.state === 'offline' || v.state === 'suspended'} dot={STATE[v.state].dot} />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#1d1716] truncate">{v.r.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{remittedToday.has(v.r.id) ? 'Settled today' : v.r.tripsToday ? 'No cash orders today' : 'No trips today'}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-[#f0e8e2]">
          <p className={cn(smallCaps, 'px-4 sm:px-5 pt-4 pb-2')}>Handed over today · {pesoShort(handedTotal)}</p>
          {handed.length === 0 ? (
            <p className="px-4 sm:px-5 pb-4 text-sm text-gray-500">Nothing handed over yet today.</p>
          ) : (
            <ul className="divide-y divide-[#f0e8e2]">
              {handed.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1d1716] truncate">{x.riderName}</p>
                    <p className="text-xs text-gray-500">
                      {x.method === 'gcash' ? 'GCash' : 'Cash'} · {plural(x.orders, 'order')} · {fmtTime(x.at)}
                      {x.shortBy ? <span className="text-[#c8151d] font-medium"> · {pesoShort(x.shortBy)} short</span> : null}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[#1f6b3f] whitespace-nowrap">{pesoShort(x.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* RIGHT: selected rider */}
      <div ref={detailRef} className="min-w-0 scroll-mt-20">
        {sel ? (
          <CodDetail key={`${sel.r.id}-${sel.r.codHeld}`} s={s} v={sel} now={now} canEdit={canEdit} onConfirm={confirmed} />
        ) : (
          <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] px-5 py-12 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto text-[#1f6b3f]" {...ICON} />
            <p className="mt-3 text-lg font-semibold text-[#1d1716]">All cash collected today</p>
            <p className="mt-1 text-sm text-gray-500">No rider is holding COD cash.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function CodDetail({ s, v, now, canEdit, onConfirm }: {
  s: AppState; v: RiderView; now: number; canEdit: boolean; onConfirm: (r: Rider, amount: number, method: 'cash' | 'gcash', orders: number) => void;
}) {
  const { r } = v;
  const held = heldCod(s, r, now);
  const off = r.status === 'offline';
  const [amount, setAmount] = useState(r.codHeld.toFixed(2));
  const [method, setMethod] = useState<'cash' | 'gcash'>('cash');
  const amt = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(amt) && amt > 0;
  const diff = valid ? round2(amt - r.codHeld) : 0;
  const tel = r.phone.replace(/\s+/g, '');
  const sub = off ? `Offline${r.offlineSince ? ` since ${fmtTime(r.offlineSince)}` : ''} · ${r.phone}` : `${STATE[v.state].label} · ${r.phone}`;

  const stats = [
    { label: 'Expected', value: peso(r.codHeld) },
    { label: 'COD orders', value: String(held.count) },
    { label: 'Holding since', value: held.since ? fmtTime(held.since) : '–', red: off },
  ];

  return (
    <section className="rounded-2xl border border-[#eadfd6] bg-[#fffdfb] min-w-0">
      <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
        <Avatar name={r.name} dim={off} dot={STATE[v.state].dot} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#1d1716] truncate">{r.name}</p>
          <p className={cn('text-xs truncate', off ? 'text-[#c8151d] font-medium' : 'text-gray-500')}>{sub}</p>
        </div>
        <a href={`tel:${tel}`} aria-label={`Call ${r.name}`}
          className="w-11 h-11 rounded-full border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0">
          <Phone className="w-4 h-4" {...ICON} />
        </a>
      </div>

      <div className="mx-4 sm:mx-5 grid grid-cols-3 divide-x divide-[#f0e8e2] rounded-xl border border-[#eadfd6] bg-white">
        {stats.map((x) => (
          <div key={x.label} className="px-3 py-2.5 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 truncate">{x.label}</p>
            <p className={cn('mt-0.5 text-lg sm:text-xl leading-tight tabular-nums truncate', x.red ? 'text-[#c8151d]' : 'text-[#1d1716]')} style={OSWALD}>{x.value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 sm:px-5 pt-5">
        <p className={smallCaps}>COD orders</p>
        {held.orders.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No order details for this cash (collected before today).</p>
        ) : (
          <ul className="mt-1 divide-y divide-[#f0e8e2]">
            {held.orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#1d1716]">{o.number}</p>
                  <p className="text-xs text-gray-500 truncate">{areaOf(o)} · delivered {fmtTime(o.completedAt ?? o.updatedAt)}</p>
                </div>
                <span className="tabular-nums text-[#1d1716] shrink-0">{peso(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="px-4 sm:px-5 pt-5 pb-5 mt-1 border-t border-[#f0e8e2]"
        onSubmit={(e) => { e.preventDefault(); if (valid && canEdit) onConfirm(r, amt, method, held.count); }}>
        <p className={cn(smallCaps, 'pt-4')}>Record remittance</p>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">₱</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount received" disabled={!canEdit}
              className="w-full h-11 rounded-lg border border-[#e3d6cc] bg-white pl-7 pr-3 text-[15px] tabular-nums text-[#1d1716] outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10 disabled:bg-[#f6f0eb]" />
          </label>
          <div role="group" aria-label="Handed over by" className="grid grid-cols-2 gap-1 rounded-lg bg-[#ebe4dd] p-1 sm:w-48 shrink-0">
            {([['cash', 'Cash'], ['gcash', 'GCash']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={method === k} onClick={() => setMethod(k)}
                className={cn('h-9 rounded-md text-sm transition-colors', method === k ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'font-medium text-[#5b4f4b] hover:text-[#1d1716]')}>{label}</button>
            ))}
          </div>
        </div>
        <p className={cn('mt-2 text-sm', !valid ? 'text-[#c8151d]' : diff === 0 ? 'text-[#1f6b3f]' : diff < 0 ? 'text-[#c8151d]' : 'text-[#ae754d]')}>
          {!valid ? 'Enter the amount received.' : diff === 0 ? 'Matches expected' : diff < 0 ? `${peso(-diff)} short — the rest stays with the rider` : `${peso(diff)} over expected`}
        </p>
        <button type="submit" disabled={!valid || !canEdit}
          className="mt-3 w-full h-11 rounded-lg bg-[#d6202a] text-sm font-semibold text-white hover:bg-[#c8151d] disabled:bg-[#efa4a8]">
          Confirm {valid ? (amt % 1 ? peso(amt) : pesoShort(amt)) : ''} received
        </button>
        {!canEdit && <p className="mt-2 text-xs text-gray-500">You need the riders.edit permission to record remittances.</p>}
      </form>
    </section>
  );
}
