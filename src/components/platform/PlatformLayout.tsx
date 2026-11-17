'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, ToggleRight, SlidersHorizontal, UserCog, ScrollText, LogOut, ShieldCheck, KeySquare } from 'lucide-react';
import { mutate, useStore } from '@/src/lib/store';
import { cn } from '@/src/lib/utils';

const NAV = [
  { href: '/platform', label: 'Overview', icon: Gauge },
  { href: '/platform/modules', label: 'Module Control', icon: ToggleRight },
  { href: '/platform/permissions', label: 'Super Admin Access', icon: KeySquare },
  { href: '/platform/limits', label: 'Plan Limits', icon: SlidersHorizontal },
  { href: '/platform/admins', label: 'Client Admins', icon: UserCog },
  { href: '/platform/log', label: 'Change Log', icon: ScrollText },
];

/**
 * Shell for the Platform Owner console (LAP IT Solutions).
 * Dark slate so it reads as a different console from the client's blue admin.
 * Desktop: left sidebar. Phone/tablet: top bar with scrollable tabs.
 */
export function PlatformLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useStore();
  const path = usePathname() ?? '';

  if (!s.platform.signedIn) return <PlatformSignIn />;

  const signOut = () => mutate((d) => { d.platform.signedIn = false; });

  return (
    <div className="min-h-screen bg-[#f4f5f8]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 bg-[#0f172a] text-slate-300 flex-col z-30">
        <div className="h-16 flex items-center gap-2 px-4 border-b border-white/10">
          <Image src="/lap-logo.png" alt="LAP" width={100} height={71} className="h-8 w-8 object-contain" />
          <div className="leading-tight">
            <p className="text-white font-bold text-sm" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>Platform Owner</p>
            <p className="text-[11px] text-slate-400">LAP IT Solutions</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const active = path === n.href;
            return (
              <Link key={n.href} href={n.href}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors', active ? 'bg-white/10 text-white font-medium' : 'hover:bg-white/5 hover:text-white')}>
                <n.icon className="w-5 h-5" strokeWidth={1.75} />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <p className="px-3 text-xs text-slate-400 mb-2">Signed in as <span className="text-slate-200">{s.platform.ownerName}</span></p>
          <Link href="/login" onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-white/5 hover:text-white">
            <LogOut className="w-4 h-4" /> Sign out
          </Link>
        </div>
      </aside>

      {/* Phone / tablet top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#0f172a] text-slate-300">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Image src="/lap-logo.png" alt="LAP" width={100} height={71} className="h-7 w-7 object-contain" />
            <p className="text-white font-bold text-sm">Platform Owner</p>
          </div>
          <Link href="/login" onClick={signOut} className="flex items-center gap-1.5 text-xs hover:text-white"><LogOut className="w-4 h-4" /> Sign out</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cn('shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap', path === n.href ? 'bg-white text-[#0f172a] font-semibold' : 'bg-white/10 text-slate-200')}>
              <n.icon className="w-3.5 h-3.5" />{n.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="lg:ml-60">
        <div className="hidden lg:flex h-16 items-center px-8 bg-white/80 backdrop-blur-md border-b border-[rgba(15,15,26,0.08)] sticky top-0 z-20">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a3a6b8] leading-none mb-0.5">Platform Owner · FreshMart client</p>
            <h1 className="text-lg font-bold text-[#0f0f1a]" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>{title}</h1>
          </div>
        </div>
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
          <h1 className="lg:hidden text-xl font-bold text-[#0f0f1a] mb-4" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Demo sign-in screen for the Platform Owner (no real authentication in the demo). */
function PlatformSignIn() {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#0f172a] text-white flex items-center justify-center mb-4"><ShieldCheck className="w-6 h-6" /></div>
        <h1 className="text-xl font-bold text-[#0f0f1a]" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>Platform Owner</h1>
        <p className="text-sm text-gray-500 mt-1">LAP IT Solutions only. Client users, including the Super Admin, cannot sign in here.</p>
        <button onClick={() => mutate((d) => { d.platform.signedIn = true; })}
          className="mt-6 w-full h-10 rounded-lg bg-[#0f172a] text-white text-sm font-medium hover:bg-[#1e293b]">
          Sign in as LAP IT Owner (demo)
        </button>
        <p className="text-xs text-gray-400 mt-3">Production: separate account with two-factor sign-in.</p>
        <Link href="/login" className="inline-block mt-4 text-xs text-gray-500 hover:text-[#1e40af]">Back to portals</Link>
      </div>
    </div>
  );
}
