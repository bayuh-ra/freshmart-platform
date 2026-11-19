'use client';

// Header "Hello, Maria / Account & orders" button with its dropdown (tablet / desktop header).
// Opens on click; closes on an outside click, Escape, choosing an item or a route change.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronDown, LogOut, MapPin, ReceiptText, User } from 'lucide-react';
import type { Customer } from '@/src/lib/types';
import { cn } from '@/src/lib/utils';
import { customerInitials, fmtPhonePH } from '@/src/components/shopper/accountHelpers';

const ITEMS = [
  { href: '/account', label: 'My account', icon: User },
  { href: '/my-orders', label: 'My orders', icon: ReceiptText },
  { href: '/account/addresses', label: 'Saved addresses', icon: MapPin },
  { href: '/account/notifications', label: 'Notifications & alerts', icon: Bell },
];

export function AccountMenu({ shopper, pathname, onSignOut }: { shopper: Customer; pathname: string; onSignOut: () => void }) {
  // The menu stays open only on the page where it was opened, so a route change closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const close = () => setOpenAt(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const firstName = shopper.firstName || shopper.name.split(' ')[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpenAt(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpenAt(null); button.current?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const row = 'w-full h-12 px-4 flex items-center gap-3 text-[15px] text-left transition';
  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account & orders"
        className={cn('h-11 px-2 rounded-lg hover:bg-white/10 flex items-center gap-2 text-left max-w-[220px]', (open || pathname.startsWith('/account')) && 'bg-white/10')}
      >
        <span className="w-8 h-8 rounded-full bg-[#d6202a] text-white text-[11px] font-bold flex items-center justify-center shrink-0" aria-hidden>{customerInitials(shopper)}</span>
        <span className="hidden lg:block min-w-0 leading-tight">
          <span className="block text-[11px] text-white/60 truncate">Hello, {firstName}</span>
          <span className="block text-sm font-semibold whitespace-nowrap">Account &amp; orders</span>
        </span>
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-white/70 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-[calc(100%+10px)] z-50 w-[300px] rounded-xl bg-[#fffdfb] text-[#2a2322] border border-[#eadfd6] shadow-[0_12px_32px_rgba(42,35,34,0.18)] overflow-hidden fm-fade">
          <div className="px-4 py-3.5 border-b border-[#eadfd6]">
            <p className="text-[15px] font-bold truncate">{shopper.name}</p>
            <p className="text-[13px] text-gray-500 truncate">{fmtPhonePH(shopper.mobile)}</p>
          </div>
          <div className="py-1 border-b border-[#eadfd6]">
            {ITEMS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} role="menuitem" onClick={close}
                className={cn(row, 'hover:bg-[#f5f1ec]', pathname === href && 'font-semibold')}>
                <Icon className="w-5 h-5 shrink-0" strokeWidth={1.75} aria-hidden /> {label}
              </Link>
            ))}
          </div>
          <div className="py-1">
            <button type="button" role="menuitem" onClick={() => { close(); onSignOut(); }} className={cn(row, 'text-[#c8151d] hover:bg-[#fdecec]')}>
              <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.75} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
