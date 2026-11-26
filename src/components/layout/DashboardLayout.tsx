'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, RotateCcw, Store, ChevronDown, ChevronRight, LogOut, Search, X, ClipboardList, User, Beef } from 'lucide-react';
import { toast } from 'sonner';
import { MobileNav, Sidebar } from './Sidebar';
import { ClientGate } from '@/src/components/platform/Gates';
import { mutate, resetDemo, useStore } from '@/src/lib/store';
import { currentRole, currentUser, timeAgo, userBranchIds, playAlert } from '@/src/lib/logic';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';

export interface Crumb { label: string; href?: string }

interface Props {
  title: string;
  eyebrow?: string;
  /** Breadcrumb trail for the top bar. Defaults to "eyebrow › title". */
  crumbs?: Crumb[];
  children: React.ReactNode;
  /** Hide the branch switcher (pages that are not branch-scoped). */
  hideBranch?: boolean;
  /** Full-bleed content: no page padding (used by the Counter screen). */
  bare?: boolean;
}

/** Staff shell: icon-rail sidebar + top bar (breadcrumb, search, branch, notifications, user). */
export function DashboardLayout({ title, eyebrow, crumbs, children, hideBranch, bare }: Props) {
  const trail = crumbs ?? [...(eyebrow ? [{ label: eyebrow }] : []), { label: title }];
  return (
    <div className="min-h-screen bg-[#f7f3ef]">
      <Sidebar />
      <Navbar crumbs={trail} hideBranch={hideBranch} />
      <NewOrderWatcher />
      {/* md+: offset by the 68px icon rail. Phones: no rail (drawer instead), full width. */}
      <main className="pt-14 md:pt-16 md:ml-[68px] min-h-screen min-w-0 overflow-x-clip">
        <div className={bare ? undefined : 'p-4 sm:p-6 md:p-8'}><ClientGate>{children}</ClientGate></div>
      </main>
    </div>
  );
}

/** Plays a sound + toast when a new order arrives at the selected branch (from any tab). */
function NewOrderWatcher() {
  const s = useStore();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = s.orders.filter((o) => o.branchId === s.session.branchId && !o.acknowledged).map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(s.orders.map((o) => o.id));
      return;
    }
    for (const o of s.orders) {
      if (!seen.current.has(o.id)) {
        seen.current.add(o.id);
        if (ids.includes(o.id)) {
          playAlert();
          toast.info(`New order ${o.number}`, { description: `${o.customerName} · ${o.fulfillment} · ₱${o.total.toFixed(2)}`, action: { label: 'Open', onClick: () => (window.location.href = `/orders/${o.id}`) } });
        }
      }
    }
  }, [s.orders, s.session.branchId]);
  return null;
}

function Navbar({ crumbs, hideBranch }: { crumbs: Crumb[]; hideBranch?: boolean }) {
  const s = useStore();
  const user = currentUser(s);
  const role = currentRole(s);
  const branchIds = userBranchIds(s);
  const branches = s.branches.filter((b) => branchIds.includes(b.id));
  const branch = s.branches.find((b) => b.id === s.session.branchId);
  const staffNotifs = s.notifications.filter((n) => n.audience === 'staff' && (!n.targetId || branchIds.includes(n.targetId)));
  const unread = staffNotifs.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const last = crumbs[crumbs.length - 1];

  // Keep the selected branch inside the user's scope when switching "view as".
  useEffect(() => {
    if (branchIds.length && !branchIds.includes(s.session.branchId)) {
      mutate((d) => { d.session.branchId = branchIds[0]; });
    }
  }, [branchIds, s.session.branchId]);

  return (
    <header className="fixed top-0 right-0 left-0 md:left-[68px] z-20 bg-[#f7f3ef]/90 backdrop-blur-md border-b border-[#e8ddd4]">
      <div className="h-14 md:h-16 flex items-center gap-2 md:gap-4 px-3 sm:px-4 md:px-6">
        {/* Left: menu (phones) + breadcrumb */}
        <div className="flex items-center gap-2 min-w-0 flex-1 md:flex-none md:max-w-[34%]">
          <MobileNav />
          <nav aria-label="Breadcrumb" className="min-w-0">
            <p className="md:hidden text-base font-semibold text-[#1d1716] truncate">{last.label}</p>
            <ol className="hidden md:flex items-center gap-2 text-[15px] min-w-0">
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <Fragment key={`${c.label}-${i}`}>
                    {i > 0 && <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" aria-hidden />}
                    <li className={isLast ? 'font-semibold text-[#1d1716] truncate' : 'text-gray-500 whitespace-nowrap'}>
                      {c.href && !isLast
                        ? <Link href={c.href} className="hover:text-[#c8151d]">{c.label}</Link>
                        : <span aria-current={isLast ? 'page' : undefined}>{c.label}</span>}
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </nav>
        </div>

        {/* Middle: search (tablet/desktop) */}
        <div className="hidden md:block flex-1 min-w-0 max-w-xl mx-auto">
          <GlobalSearch />
        </div>

        {/* Right: branch, bell, user */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0 ml-auto md:ml-0">
          <button onClick={() => setMobileSearch((v) => !v)} className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-[#3d3432] hover:bg-black/5" aria-label="Search">
            {mobileSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" strokeWidth={1.75} />}
          </button>

          {!hideBranch && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center gap-2 h-11 px-4 rounded-xl border border-[#e3d6cc] bg-white hover:bg-[#faf6f2] text-[15px] text-[#1d1716]">
                  <Store className="w-4 h-4 text-[#c8151d]" strokeWidth={1.75} />
                  <span className="font-semibold">{branch?.name ?? 'Branch'}</span>
                  {branch?.status === 'paused' && <span className="text-[10px] font-bold text-amber-600">PAUSED</span>}
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Switch branch</DropdownMenuLabel>
                {s.cities.map((c) => {
                  const bs = branches.filter((b) => b.cityId === c.id);
                  if (!bs.length) return null;
                  return (
                    <div key={c.id}>
                      <p className="px-2 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{c.name}</p>
                      {bs.map((b) => (
                        <DropdownMenuItem key={b.id} onClick={() => mutate((d) => { d.session.branchId = b.id; })}>
                          <span className="flex-1">{b.name}</span>
                          {b.status !== 'active' && <span className="text-[10px] text-amber-600 uppercase">{b.status}</span>}
                          {b.id === s.session.branchId && <span className="text-[#c8151d]">●</span>}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="relative">
            <button
              onClick={() => { setOpen(!open); if (!open) mutate((d) => d.notifications.forEach((n) => { if (n.audience === 'staff') n.read = true; })); }}
              className="relative w-10 h-10 flex items-center justify-center rounded-xl text-[#3d3432] hover:bg-black/5 transition-colors"
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <Bell className={`w-5 h-5 ${unread > 0 ? 'lap-bell-wiggle' : ''}`} strokeWidth={1.75} />
              {unread > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#e0282f] ring-2 ring-[#f7f3ef]" />}
            </button>
            {open && (
              <div className="fixed left-2 right-2 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm">Notifications</div>
                <div className="max-h-80 overflow-y-auto">
                  {staffNotifs.length === 0 && <p className="text-sm text-gray-400 p-6 text-center">No notifications yet.</p>}
                  {staffNotifs.slice(0, 20).map((n) => (
                    <Link key={n.id} href={n.orderId ? `/orders/${n.orderId}` : '#'} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-50">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      <p className="text-xs text-gray-500">{n.body}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.at)}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-xl pl-1 sm:pl-2 py-1 hover:bg-black/5 transition-colors outline-none" aria-label="User menu">
                <div className="text-right hidden lg:block">
                  <p className="text-[15px] font-semibold text-[#1d1716] leading-tight">{user.name}</p>
                  <p className="text-xs text-gray-500 leading-tight">{role.name}</p>
                </div>
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-[#2a2322] text-white flex items-center justify-center text-sm md:text-base font-bold" style={{ fontFamily: 'var(--font-oswald)' }}>
                  {initials}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)]">
              <DropdownMenuLabel>View as (RBAC demo)</DropdownMenuLabel>
              {s.staff.filter((u) => u.status === 'active' || u.status === 'suspended').map((u) => (
                <DropdownMenuItem key={u.id} onClick={() => { mutate((d) => { d.session.staffUserId = u.id; }); toast.success(`Now viewing as ${u.name}`, { description: s.roles.find((r) => r.id === u.roleId)?.name }); }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{u.name}</p>
                    <p className="text-xs text-gray-500">{s.roles.find((r) => r.id === u.roleId)?.name}{u.status === 'suspended' ? ' · suspended' : ''}</p>
                  </div>
                  {u.id === user.id && <span className="text-[#c8151d]">●</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { resetDemo(); toast.success('Demo data reset'); }}>
                <RotateCcw className="w-4 h-4" /> Reset demo data
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/staff"><LogOut className="w-4 h-4" /> Sign out</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Phones: search drops down under the bar */}
      {mobileSearch && (
        <div className="md:hidden px-3 pb-3">
          <GlobalSearch autoFocus onDone={() => setMobileSearch(false)} />
        </div>
      )}
    </header>
  );
}

type Result = { key: string; group: string; label: string; sub: string; href: string };

/** Search orders, customers and products (cuts) from anywhere in the staff area. Ctrl/⌘+K focuses it. */
function GlobalSearch({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const s = useStore();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [mac] = useState(() => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform));
  const branchIds = userBranchIds(s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!input.current || input.current.offsetParent === null) return; // hidden on this screen size
        e.preventDefault();
        input.current.focus();
        input.current.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo<Result[]>(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const digits = t.replace(/\s/g, '');
    const orders = s.orders
      .filter((o) => branchIds.includes(o.branchId) && (o.number.toLowerCase().includes(t) || o.customerName.toLowerCase().includes(t)))
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 5)
      .map((o) => ({ key: `o-${o.id}`, group: 'Orders', label: o.number, sub: `${o.customerName} · ${o.status.replace(/_/g, ' ')}`, href: `/orders/${o.id}` }));
    const customers = s.customers
      .filter((c) => c.name.toLowerCase().includes(t) || (digits.length >= 3 && c.mobile.replace(/\s/g, '').includes(digits)))
      .slice(0, 4)
      .map((c) => ({ key: `c-${c.id}`, group: 'Customers', label: c.name, sub: c.mobile, href: `/customers?c=${c.id}` }));
    const products = s.products
      .filter((p) => p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t))
      .slice(0, 5)
      .map((p) => ({ key: `p-${p.id}`, group: 'Products & cuts', label: p.name, sub: `${p.sku} · ${p.soldByWeight ? 'per kg' : p.size}`, href: `/catalog/products?q=${encodeURIComponent(p.name)}` }));
    return [...orders, ...customers, ...products];
  }, [q, s.orders, s.customers, s.products, branchIds]);

  const go = (href: string) => {
    // Links with a ?filter do a normal page load so the target page reads the filter on first render.
    if (href.includes('?')) window.location.assign(href);
    else router.push(href);
    setQ('');
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
    onDone?.();
  };
  const show = focused && q.trim().length > 0;
  const iconFor = (g: string) => (g === 'Orders' ? ClipboardList : g === 'Customers' ? User : Beef);

  return (
    <div className="relative">
      <Search className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.75} />
      <input
        ref={input}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && results[active]) go(results[active].href);
          if (e.key === 'Escape') { setQ(''); input.current?.blur(); onDone?.(); }
        }}
        placeholder="Search orders, customers, cuts…"
        aria-label="Search orders, customers and cuts"
        className="w-full h-11 rounded-xl border border-[#e3d6cc] bg-white pl-11 pr-16 text-[15px] text-[#1d1716] placeholder:text-gray-400 outline-none focus:border-[#c8151d]/50 focus:ring-4 focus:ring-[#c8151d]/10"
      />
      <kbd className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 h-6 px-1.5 items-center rounded-md border border-[#e3d6cc] bg-[#faf6f2] text-[11px] font-medium text-gray-500">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      {show && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-[#eadfd6] overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No orders, customers or cuts match “{q}”.</p>
          ) : (
            results.map((r, i) => {
              const Icon = iconFor(r.group);
              const header = i === 0 || results[i - 1].group !== r.group;
              return (
                <Fragment key={r.key}>
                  {header && <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{r.group}</p>}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(r.href)}
                    onMouseEnter={() => setActive(i)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${i === active ? 'bg-[#faf1ec]' : ''}`}
                  >
                    <Icon className="w-4 h-4 text-[#ae754d] shrink-0" strokeWidth={1.75} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#1d1716] truncate">{r.label}</span>
                      <span className="block text-xs text-gray-500 truncate">{r.sub}</span>
                    </span>
                  </button>
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
