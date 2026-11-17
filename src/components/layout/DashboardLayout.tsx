'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, RotateCcw, Store, ChevronDown, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { MobileNav, Sidebar } from './Sidebar';
import { ClientGate } from '@/src/components/platform/Gates';
import { mutate, resetDemo, useStore } from '@/src/lib/store';
import { currentRole, currentUser, timeAgo, userBranchIds, playAlert } from '@/src/lib/logic';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/src/components/ui/shadcn/dropdown-menu';

interface Props {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  /** Hide the branch switcher (pages that are not branch-scoped). */
  hideBranch?: boolean;
}

/** Staff shell — same structure as the CRM's DashboardLayout (icon rail sidebar + glass navbar). */
export function DashboardLayout({ title, eyebrow, children, hideBranch }: Props) {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Sidebar />
      <Navbar title={title} eyebrow={eyebrow} hideBranch={hideBranch} />
      <NewOrderWatcher />
      {/* md+: offset by the 68px icon rail. Phones: no rail (drawer instead), full width. */}
      <main className="pt-14 md:pt-16 md:ml-[68px] min-h-screen min-w-0 overflow-x-clip">
        <div className="p-4 sm:p-6 md:p-8"><ClientGate>{children}</ClientGate></div>
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

function Navbar({ title, eyebrow, hideBranch }: { title: string; eyebrow?: string; hideBranch?: boolean }) {
  const s = useStore();
  const user = currentUser(s);
  const role = currentRole(s);
  const branchIds = userBranchIds(s);
  const branches = s.branches.filter((b) => branchIds.includes(b.id));
  const branch = s.branches.find((b) => b.id === s.session.branchId);
  const staffNotifs = s.notifications.filter((n) => n.audience === 'staff' && (!n.targetId || branchIds.includes(n.targetId)));
  const unread = staffNotifs.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);

  // Keep the selected branch inside the user's scope when switching "view as".
  useEffect(() => {
    if (branchIds.length && !branchIds.includes(s.session.branchId)) {
      mutate((d) => { d.session.branchId = branchIds[0]; });
    }
  }, [branchIds, s.session.branchId]);

  return (
    <header
      className="fixed top-0 right-0 left-0 md:left-[68px] h-14 md:h-16 bg-white/80 backdrop-blur-md border-b border-[rgba(15,15,26,0.08)] flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 z-20">
      <div className="flex items-center gap-2 min-w-0">
        <MobileNav />
        <div className="min-w-0">
          {eyebrow && <p className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.08em] text-[#a3a6b8] leading-none mb-0.5">{eyebrow}</p>}
          <h1 className="text-base md:text-lg font-bold text-[#0f0f1a] leading-tight truncate" style={{ fontFamily: 'var(--font-oswald)' }}>{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {!hideBranch && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg border border-[rgba(15,15,26,0.1)] bg-black/[0.02] hover:bg-black/[0.04] text-sm text-[#0f0f1a]">
                <Store className="w-4 h-4 text-[#c8151d]" />
                <span className="font-medium">{branch?.name ?? 'Branch'}</span>
                {branch?.status === 'paused' && <span className="text-[10px] font-bold text-amber-600">PAUSED</span>}
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
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
          <button onClick={() => { setOpen(!open); if (!open) mutate((d) => d.notifications.forEach((n) => { if (n.audience === 'staff') n.read = true; })); }}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[#525569] hover:bg-black/5 transition-colors" title="Notifications">
            <Bell className={`w-5 h-5 ${unread > 0 ? 'lap-bell-wiggle' : ''}`} strokeWidth={1.75} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-[#dc2626] text-white text-[10px] font-bold ring-2 ring-white">{unread}</span>
            )}
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
            <button className="flex items-center gap-3 rounded-lg px-1 sm:px-2 py-1.5 hover:bg-black/5 transition-colors outline-none" aria-label="User menu">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-[#0f0f1a] leading-tight">{user.name}</p>
                <p className="text-xs text-gray-500 leading-tight">{role.name}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#c8151d] text-white flex items-center justify-center text-sm font-bold">
                {user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
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
    </header>
  );
}
