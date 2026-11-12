'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ClipboardList, PlusCircle, CalendarCheck, Package, Tags, Warehouse, Truck, MapPinned, Bike,
  Users, TicketPercent, MessagesSquare, BarChart3, Building2, ShieldCheck, Settings, ScrollText, Smartphone, Navigation, Image as ImageIcon,
} from 'lucide-react';
import { Badge } from '@/src/components/ui/shadcn/badge';
import { useStore } from '@/src/lib/store';
import { can } from '@/src/lib/logic';

interface NavItem { label: string; href: string; icon: React.ReactNode; perm?: string; badge?: 'orders' | 'support' }
interface NavModule { key: string; label: string; href?: string; icon?: React.ReactNode; items?: NavItem[] }

const I = (C: React.ComponentType<{ className?: string; strokeWidth?: number }>) => <C className="w-5 h-5" strokeWidth={1.75} />;

// Same grouped flat-list sidebar as the CRM (section headers inside one
// continuous list), gated by the signed-in user's RBAC permissions.
export const navModules: NavModule[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: I(LayoutDashboard) },
  {
    key: 'orders', label: 'Order Desk',
    items: [
      { label: 'Live Orders', href: '/orders', icon: I(ClipboardList), perm: 'orders.view', badge: 'orders' },
      { label: 'New Walk-in / Phone', href: '/orders/new', icon: I(PlusCircle), perm: 'orders.create' },
      { label: 'End of Day', href: '/orders/end-of-day', icon: I(CalendarCheck), perm: 'orders.view' },
    ],
  },
  {
    key: 'catalog', label: 'Catalog & Stock',
    items: [
      { label: 'Products', href: '/catalog/products', icon: I(Package), perm: 'catalog.view' },
      { label: 'Price Lists', href: '/catalog/pricing', icon: I(Tags), perm: 'pricing.view' },
      { label: 'Inventory', href: '/inventory', icon: I(Warehouse), perm: 'inventory.view' },
      { label: 'Purchasing', href: '/purchasing', icon: I(Truck), perm: 'inventory.view' },
    ],
  },
  {
    key: 'delivery', label: 'Delivery',
    items: [
      { label: 'Dispatch Map', href: '/delivery/dispatch', icon: I(Navigation), perm: 'riders.view' },
      { label: 'Riders', href: '/delivery/riders', icon: I(Bike), perm: 'riders.view' },
      { label: 'Zones & Fees', href: '/delivery/zones', icon: I(MapPinned), perm: 'settings.view' },
    ],
  },
  {
    key: 'customers', label: 'Customers',
    items: [
      { label: 'Customers', href: '/customers', icon: I(Users), perm: 'customers.view' },
      { label: 'Promotions', href: '/promotions', icon: I(TicketPercent), perm: 'promotions.view' },
      { label: 'Support Inbox', href: '/support', icon: I(MessagesSquare), perm: 'support.view', badge: 'support' },
    ],
  },
  {
    key: 'reports', label: 'Reports',
    items: [{ label: 'Reports', href: '/reports', icon: I(BarChart3), perm: 'reports.view' }],
  },
  {
    key: 'admin', label: 'Administration',
    items: [
      { label: 'Cities & Branches', href: '/admin/branches', icon: I(Building2), perm: 'settings.view' },
      { label: 'Users & Roles', href: '/admin/users', icon: I(ShieldCheck), perm: 'users.view' },
      { label: 'Settings', href: '/admin/settings', icon: I(Settings), perm: 'settings.view' },
      { label: 'App Content', href: '/admin/content', icon: I(ImageIcon), perm: 'promotions.view' },
      { label: 'Audit Log', href: '/admin/audit', icon: I(ScrollText), perm: 'settings.view' },
    ],
  },
  {
    key: 'apps', label: 'Mobile Apps (Preview)',
    items: [
      { label: 'Shopper App', href: '/shopper', icon: I(Smartphone) },
      { label: 'Rider App', href: '/rider', icon: I(Bike) },
    ],
  },
];

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 68;

export function Sidebar() {
  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapsed = !hovered;
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const handleEnter = (e: React.PointerEvent) => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (e.pointerType !== 'touch' && window.matchMedia('(min-width: 768px)').matches) setHovered(true);
  };
  const handleLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), 120);
  };
  const pathname = usePathname() ?? '';
  const s = useStore();

  const pendingOrders = s.orders.filter((o) => o.branchId === s.session.branchId && o.status === 'awaiting_confirmation').length;
  const unreadSupport = s.conversations.reduce((n, c) => n + c.unreadStaff, 0);
  const badgeFor = (b?: NavItem['badge']) => (b === 'orders' ? pendingOrders : b === 'support' ? unreadSupport : 0);

  const visible = navModules
    .map((m) => ({ ...m, items: m.items?.filter((i) => !i.perm || can(s, i.perm)) }))
    .filter((m) => !m.items || m.items.length > 0);

  const allHrefs = navModules.flatMap((m) => m.items?.map((i) => i.href) ?? []);
  const isActiveHref = (href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(href + '/')) return false;
    // Prefer the most specific match (e.g. /orders/new over /orders)
    return !allHrefs.some((h) => h !== href && h.startsWith(href) && (pathname === h || pathname.startsWith(h + '/')));
  };

  return (
    <aside
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      style={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      className="fixed inset-y-0 left-0 z-30 bg-[#1e40af] flex flex-col shrink-0 transition-[width] duration-200"
    >
      <div className="h-16 flex items-center justify-between px-3 shrink-0 border-b border-white/10">
        <Link href="/dashboard" title="FreshMart Platform" className="flex items-center gap-2 min-w-0">
          <Image src="/lap-logo.png" alt="LAP I.T. Solutions Inc." width={100} height={71} className="h-8 w-8 object-contain shrink-0" />
          {!collapsed && (
            <span className="text-white font-bold text-sm leading-tight truncate" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>
              FreshMart Platform
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        {visible.map((m, idx) => {
          if (m.href && !m.items) {
            const active = pathname === m.href;
            return (
              <Link key={m.key} href={m.href} title={collapsed ? m.label : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${active ? 'bg-white text-[#1e40af] font-semibold' : 'text-blue-100 hover:bg-white/10'}`}>
                <span className={`relative shrink-0 ${active ? 'text-[#1e40af]' : 'text-blue-300'}`}>{m.icon}</span>
                {!collapsed && <span className="flex-1 truncate">{m.label}</span>}
              </Link>
            );
          }
          return (
            <div key={m.key} className={idx > 0 ? 'mt-4' : ''}>
              {!collapsed ? (
                <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-200/70 whitespace-nowrap">{m.label}</p>
              ) : (
                idx > 0 && <div className="my-2 mx-3 border-t border-white/10" />
              )}
              <ul className="space-y-0.5">
                {m.items?.map((item) => {
                  const active = isActiveHref(item.href);
                  const badge = badgeFor(item.badge);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} title={collapsed ? item.label : undefined}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-white text-[#1e40af] font-semibold' : 'text-blue-100 hover:bg-white/10'}`}>
                        <span className={`relative shrink-0 ${active ? 'text-[#1e40af]' : 'text-blue-300'}`}>
                          {item.icon}
                          {badge > 0 && collapsed && <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#dc2626] rounded-full ring-2 ring-[#1e40af]" />}
                        </span>
                        {!collapsed && <span className="flex-1 truncate whitespace-nowrap">{item.label}</span>}
                        {!collapsed && badge > 0 && (
                          <Badge variant="destructive" className="text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] justify-center leading-none">{badge > 99 ? '99+' : badge}</Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export const SIDEBAR_EXPANDED_WIDTH = EXPANDED_WIDTH;
export const SIDEBAR_COLLAPSED_WIDTH = COLLAPSED_WIDTH;
