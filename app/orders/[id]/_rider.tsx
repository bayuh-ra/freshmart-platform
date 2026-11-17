'use client';

// Rider assignment for the staff Order details page: the three suggestion cards on the
// "Assign a rider" banner and the "Choose a rider" drawer (all own riders of the branch).
import { useState } from 'react';
import { Award, Check, Search, Star, X } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/src/components/ui/shadcn/sheet';
import { liveRiderPos, orderDistance, riderJobs } from '@/src/components/delivery/helpers';
import { distanceKm, fmtTime, getSetting, num, riderPosition } from '@/src/lib/logic';
import type { AppState, Order, Rider } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { ICON, OSWALD, Tag, initials } from './_parts';

/** Motorcycle minutes for a distance (~25 km/h in town), at least 1. */
export const rideMins = (km: number) => Math.max(1, Math.round((km / 25) * 60));

export type RiderState = 'available' | 'capacity' | 'offline';
export type RiderSort = 'nearest' | 'fewest' | 'rating';
export interface RiderRow {
  rider: Rider;
  /** Distance from the shop (live position while delivering). */
  km: number;
  /** Ride minutes to the shop. */
  mins: number;
  /** Active orders, not counting this one. */
  load: number;
  state: RiderState;
  /** Rough minutes until an at-capacity rider is free again. */
  freeIn: number;
  /** Already assigned to this order. */
  current: boolean;
}

export const sortFromRule = (rule: string): RiderSort => (rule.startsWith('Lowest') ? 'fewest' : rule.startsWith('Highest') ? 'rating' : 'nearest');

export function sortRows(rows: RiderRow[], sort: RiderSort) {
  return [...rows].sort((a, b) => {
    if (sort === 'fewest') return a.load - b.load || a.km - b.km;
    if (sort === 'rating') return b.rider.rating - a.rider.rating || a.km - b.km;
    return a.km - b.km || a.load - b.load;
  });
}

/** Every own rider serving the order's branch (suspended / pending riders left out), with state and workload. */
export function riderRows(s: AppState, o: Order) {
  const branch = s.branches.find((b) => b.id === o.branchId)!;
  const max = num(getSetting(s, 'maxActiveOrders', o.branchId)) || 2;
  const rule = String(getSetting(s, 'dispatchRule', o.branchId));
  const rows: RiderRow[] = s.riders
    .filter((r) => r.type === 'own' && r.branchIds.includes(o.branchId) && (r.status === 'online' || r.status === 'offline'))
    .map((r) => {
      const jobs = riderJobs(s, r.id).filter((j) => j.id !== o.id);
      const km = distanceKm(branch, liveRiderPos(s, r));
      // Free again after finishing each delivery (remaining ETA, or the full ride when not yet picked up) and riding back.
      const last = jobs[jobs.length - 1];
      const freeIn = jobs.reduce((t, j) => t + (j.status === 'out_for_delivery' ? riderPosition(s, j).etaMins : rideMins(orderDistance(s, j))), 0)
        + (last ? rideMins(orderDistance(s, last)) : 0);
      const state: RiderState = r.status !== 'online' ? 'offline' : jobs.length >= max ? 'capacity' : 'available';
      return { rider: r, km, mins: rideMins(km), load: jobs.length, state, freeIn: Math.max(1, freeIn), current: r.id === o.riderId };
    });
  const sort = sortFromRule(rule);
  const available = sortRows(rows.filter((r) => r.state === 'available' && !r.current), sort);
  return {
    rows, max, rule, sort, available,
    counts: {
      available: rows.filter((r) => r.state === 'available').length,
      capacity: rows.filter((r) => r.state === 'capacity').length,
      offline: rows.filter((r) => r.state === 'offline').length,
    },
  };
}

export type PickBadge = 'best' | 'free' | 'top';
/** Up to three suggestions: best match (first by dispatch rule), a free rider, the top-rated of the rest; gaps filled by rank. */
export function topPicks(available: RiderRow[]) {
  const out: { row: RiderRow; badge?: PickBadge }[] = [];
  const used = new Set<string>();
  const add = (row: RiderRow | undefined, badge?: PickBadge) => { if (row) { out.push({ row, badge }); used.add(row.rider.id); } };
  add(available[0], 'best');
  add(available.find((r) => !used.has(r.rider.id) && r.load === 0), 'free');
  add([...available].filter((r) => !used.has(r.rider.id)).sort((a, b) => b.rider.rating - a.rider.rating)[0], 'top');
  while (out.length < 3) {
    const next = available.find((r) => !used.has(r.rider.id));
    if (!next) break;
    add(next);
  }
  return out;
}

const BADGE: Record<PickBadge, { label: string; cls: string; Icon: typeof Star }> = {
  best: { label: 'Best match', cls: 'bg-green-400 text-green-950', Icon: Star },
  free: { label: 'Free now', cls: 'bg-sky-200 text-sky-950', Icon: Check },
  top: { label: 'Top rated', cls: 'bg-[#e3ad8c] text-[#2a2322]', Icon: Award },
};

/** One suggestion card on the dark "Assign a rider" banner. */
export function RiderPickCard({ row, badge, max, onAssign }: { row: RiderRow; badge?: PickBadge; max: number; onAssign: () => void }) {
  const r = row.rider;
  const b = badge ? BADGE[badge] : undefined;
  return (
    <div className={cn('rounded-xl border p-4 min-w-0 flex flex-col', badge === 'best' ? 'border-green-400/30 bg-green-500/[0.08]' : 'border-white/10 bg-white/[0.04]')}>
      {b ? (
        <span className={cn('self-start inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider', b.cls)}>
          <b.Icon className="w-3 h-3" strokeWidth={2.25} />{b.label}
        </span>
      ) : <span aria-hidden className="h-[22px]" />}
      <div className="mt-3 flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-full bg-[#dbe4f5] text-[#2c4f9e] flex items-center justify-center text-base shrink-0" style={OSWALD}>{initials(r.name)}</span>
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{r.name}</p>
          <p className="text-xs text-white/55 truncate">{r.plate} · ★ {r.rating.toFixed(1)}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {[[`~${row.mins} min`, 'to shop'], [`${row.km} km`, 'away'], [`${row.load}/${max}`, 'orders']].map(([v, k]) => (
          <div key={k} className="min-w-0">
            <dt className="sr-only">{k}</dt>
            <dd className="text-sm font-semibold text-white truncate">{v}</dd>
            <dd aria-hidden className="text-[11px] text-white/50">{k}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onAssign}
        className={cn('mt-4 h-11 w-full rounded-xl px-3 text-sm font-semibold transition-colors truncate',
          badge === 'best' ? 'bg-[#d6202a] text-white hover:bg-[#c8151d]' : 'bg-white text-[#1d1716] hover:bg-white/90')}>
        Assign {r.name.split(' ')[0]}
      </button>
    </div>
  );
}

type Filter = 'available' | 'capacity' | 'offline' | 'all';
const SECTIONS: RiderState[] = ['available', 'capacity', 'offline'];

/** Right-hand drawer listing every rider of the branch: search, filter by state, sort, assign. */
export function ChooseRiderDrawer({ open, onClose, o, s, onAssign }: {
  open: boolean; onClose: () => void; o: Order; s: AppState; onAssign: (riderId: string, name: string) => void;
}) {
  const { rows, max, rule, available, counts } = riderRows(s, o);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('available');
  const [sort, setSort] = useState<RiderSort>(() => sortFromRule(rule));
  const branch = s.branches.find((b) => b.id === o.branchId);
  const bestId = available[0]?.rider.id;
  const area = (() => {
    const parts = (o.address?.line ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2] : parts[0];
  })();
  const maxMins = o.maxDeliveryMins ?? (num(getSetting(s, 'meatMaxDeliveryMins', o.branchId)) || 60);
  const subtitle = [o.number, o.address && branch ? `${distanceKm(branch, o.address)} km to ${area}` : undefined, o.coldChain ? `cold chain, ${maxMins} min` : undefined].filter(Boolean).join(' · ');
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  const matches = (r: RiderRow) => !q || r.rider.name.toLowerCase().replace(/\s+/g, '').includes(q) || r.rider.plate.toLowerCase().replace(/\s+/g, '').includes(q);
  const shown = sortRows(rows.filter(matches), sort);
  const sections = (filter === 'all' ? SECTIONS : [filter]).map((st) => ({ st, list: shown.filter((r) => r.state === st) }));
  const sectionLabel: Record<RiderState, string> = { available: 'Available now', capacity: `At capacity · ${max} of ${max} orders`, offline: 'Offline' };
  const filters: { v: Filter; label: string; n: number }[] = [
    { v: 'available', label: 'Available', n: counts.available }, { v: 'capacity', label: 'At capacity', n: counts.capacity },
    { v: 'offline', label: 'Offline', n: counts.offline }, { v: 'all', label: 'All', n: rows.length },
  ];
  const sorts: { v: RiderSort; label: string }[] = [{ v: 'nearest', label: 'Nearest' }, { v: 'fewest', label: 'Fewest orders' }, { v: 'rating', label: 'Rating' }];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full max-w-full sm:max-w-[480px] bg-[#fffdfb] border-[#eadfd6] text-[#1d1716]">
        <div className="px-4 sm:px-5 pt-5 pb-4 space-y-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-3xl leading-none uppercase font-normal text-[#1d1716]" style={OSWALD}>Choose a rider</SheetTitle>
              <SheetDescription className="mt-1.5 text-[13px] text-[#6b5f5a] break-words">{subtitle}</SheetDescription>
            </div>
            <SheetClose className="w-11 h-11 rounded-xl border border-[#eadfd6] bg-white flex items-center justify-center text-[#1d1716] hover:bg-[#faf6f2] shrink-0" aria-label="Close">
              <X className="w-5 h-5" {...ICON} />
            </SheetClose>
          </div>
          <label className="relative block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" {...ICON} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or plate" aria-label="Search riders by name or plate"
              className="h-12 w-full rounded-xl border border-[#eadfd6] bg-white pl-10 pr-3 text-sm placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-2 focus:ring-[#c8151d]/10" />
          </label>
          <div role="tablist" aria-label="Rider status" className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const on = filter === f.v;
              return (
                <button key={f.v} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f.v)}
                  className={cn('inline-flex items-center gap-2 h-10 pl-3.5 pr-2 rounded-full border text-sm font-semibold transition-colors',
                    on ? 'border-[#2a2322] bg-[#2a2322] text-white' : 'border-[#eadfd6] bg-white text-[#1d1716] hover:bg-[#faf6f2]')}>
                  {f.label}
                  <span className={cn('min-w-6 h-6 px-1.5 rounded-full text-xs font-bold flex items-center justify-center', on ? 'bg-[#d6202a] text-white' : 'bg-[#f3ece6] text-[#3d3230]')}>{f.n}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm text-[#6b5f5a] shrink-0">Sort</span>
            <div role="radiogroup" aria-label="Sort riders" className="inline-flex rounded-xl bg-[#f3ece6] p-1 min-w-0">
              {sorts.map((x) => (
                <button key={x.v} type="button" role="radio" aria-checked={sort === x.v} onClick={() => setSort(x.v)}
                  className={cn('h-9 px-2.5 sm:px-3 rounded-lg text-sm whitespace-nowrap transition-colors',
                    sort === x.v ? 'bg-white font-semibold text-[#1d1716] shadow-sm' : 'text-[#5b4f4b] hover:text-[#1d1716]')}>{x.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto border-t border-[#eadfd6]">
          {sections.map(({ st, list }) => (
            <section key={st} aria-label={sectionLabel[st]}>
              <div className="flex items-center justify-between gap-3 bg-[#f7f3ef] border-b border-[#eadfd6] px-4 sm:px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#5b4f4b]">
                <span className="truncate">{sectionLabel[st]}</span><span>{list.length}</span>
              </div>
              {list.length === 0 && <p className="px-4 sm:px-5 py-4 text-sm text-gray-400">{q ? 'No riders match your search.' : 'No riders here right now.'}</p>}
              <ul>
                {list.map((row) => {
                  const r = row.rider;
                  const dim = row.state !== 'available';
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[#f0e7df]">
                      <span className="relative shrink-0">
                        <span className={cn('w-10 h-10 rounded-full flex items-center justify-center text-base', dim ? 'bg-[#f3ece6] text-gray-400' : 'bg-[#e6ecf8] text-[#2c4f9e]')} style={OSWALD}>{initials(r.name)}</span>
                        <span aria-hidden className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#fffdfb]',
                          row.state === 'available' ? 'bg-green-600' : row.state === 'capacity' ? 'bg-[#e8a96b]' : 'bg-gray-300')} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn('flex items-center gap-2 min-w-0 font-semibold text-[15px]', dim ? 'text-gray-500' : 'text-[#1d1716]')}>
                          <span className="truncate">{r.name}</span>
                          {r.id === bestId && <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-800">Best</span>}
                        </p>
                        <p className={cn('text-xs truncate', dim ? 'text-gray-400' : 'text-gray-500')}>
                          {row.state === 'offline'
                            ? `${r.plate} · ${r.offlineSince ? `offline since ${fmtTime(r.offlineSince)}` : 'off shift'}`
                            : `${r.plate} · ${row.km} km · ~${row.mins} min · ${row.load}/${max} · ★ ${r.rating.toFixed(1)}`}
                        </p>
                      </div>
                      {row.current ? <Tag className="shrink-0 bg-red-50 text-[#c8151d] font-semibold">Current</Tag>
                        : row.state === 'available' ? (
                          <button type="button" onClick={() => onAssign(r.id, r.name)}
                            className="shrink-0 h-11 sm:h-10 px-4 rounded-lg bg-[#d6202a] text-sm font-semibold text-white hover:bg-[#c8151d]">Assign</button>
                        ) : (
                          <span className="shrink-0 text-sm font-semibold text-gray-400 whitespace-nowrap">{row.state === 'capacity' ? `Free in ~${row.freeIn} min` : 'Offline'}</span>
                        )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
