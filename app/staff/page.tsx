'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LayoutDashboard, ClipboardList, ShoppingBag, Bike, ArrowRight, ShieldCheck } from 'lucide-react';
import { moduleOn } from '@/src/lib/platform';
import { mutate, useStore } from '@/src/lib/store';
import { BrandLogo } from '@/src/components/brand/Brand';

// Staff sign-in for Jovanne's Meat Shop. In the demo there is no password check:
// each card opens one part of the platform with a matching demo account.
// Customers use the shop website at "/" and riders use "/rider".
const PORTALS = [
  { href: '/dashboard', title: 'Admin Dashboard', who: 'Hannah Admin · Super Admin', icon: LayoutDashboard, user: 'u-1', desc: 'Products & cut options, prices, stock and receiving, riders, settings, staff, reports.' },
  { href: '/orders', title: 'Order Desk', who: 'Digos branch · Cashier', icon: ClipboardList, user: 'u-3', desc: 'Live order board: confirm, weigh and cut, insulated-bag pack check, assign rider, pickup handover.' },
  { href: '/', title: 'Customer website', who: 'Open the shop as a customer', icon: ShoppingBag, desc: 'Sign up with Google, order meat by weight with cut options, pay, track the delivery.', external: true },
  { href: '/rider', title: 'Rider website', who: 'Company riders', icon: Bike, desc: 'Delivery jobs, insulated-bag check at pickup, delivery countdown, proof of delivery, COD.', module: 'delivery' as const, external: true },
];

export default function StaffSignInPage() {
  const s = useStore();
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.05fr_1fr] bg-[#faf6f2]">
      {/* Brand panel — charcoal like the shop sign */}
      <div className="relative hidden md:flex flex-col justify-between min-h-screen px-12 py-10 overflow-hidden text-white bg-[#2a2322]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl opacity-30 bg-[#c8151d]" />
        <div className="relative z-10 lap-rise-in max-w-md">
          <div className="rounded-3xl bg-white p-5 shadow-2xl shadow-black/30 w-fit">
            <BrandLogo className="w-72" priority />
          </div>
          <h1 className="mt-10 text-4xl font-bold uppercase tracking-wide leading-tight" style={{ fontFamily: 'var(--font-oswald)' }}>
            Staff sign-in
          </h1>
          <p className="text-stone-300 mt-3">Order desk, inventory, riders and settings for Jovanne’s Meat Shop, Digos City.</p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[['1', 'Branch'], ['100', 'Products'], ['4', 'Riders']].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <p className="text-2xl font-bold text-[#ec1b26]" style={{ fontFamily: 'var(--font-oswald)' }}>{n}</p>
                <p className="text-xs text-stone-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-xs text-stone-400">
          <Image src="/lap-logo.png" alt="LAP I.T. Solutions" width={100} height={71} className="h-6 w-auto opacity-80" />
          Platform by LAP I.T. Solutions Inc.
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-8 md:py-12">
        <div className="w-full max-w-[480px] lap-rise-in">
          <div className="md:hidden flex flex-col items-center mb-6">
            <div className="rounded-2xl bg-white p-3 shadow-sm"><BrandLogo className="w-56" priority /></div>
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-wide text-[#2a2322]" style={{ fontFamily: 'var(--font-oswald)' }}>Welcome</h2>
          <p className="text-sm text-[#5b5150] mt-1 mb-6">Choose where to go. Demo: no password needed — each card signs in with a sample account.</p>
          <div className="space-y-3">
            {PORTALS.filter((p) => !('module' in p) || moduleOn(s, p.module)).map((p) => (
              <Link key={p.href} href={p.href} target={p.external ? '_blank' : undefined}
                onClick={() => { if (p.user) mutate((d) => { d.session.staffUserId = p.user!; d.session.branchId = 'b-dgs'; }); }}
                className="group flex items-center gap-3 sm:gap-4 bg-white rounded-2xl border border-[#2a2322]/10 shadow-sm p-4 hover:shadow-md hover:border-[#c8151d]/40 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#c8151d]/10 text-[#c8151d] flex items-center justify-center shrink-0">
                  <p.icon className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#2a2322]">{p.title}</p>
                  <p className="text-xs text-[#ae754d] font-medium">{p.who}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                </div>
                <ArrowRight className="w-5 h-5 shrink-0 text-gray-300 group-hover:text-[#c8151d] transition-colors" />
              </Link>
            ))}
          </div>
          <Link href="/platform"
            className="mt-3 group flex items-center gap-3 sm:gap-4 rounded-2xl bg-[#2a2322] text-white shadow-sm p-4 hover:bg-[#3d3432] transition-colors">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><ShieldCheck className="w-6 h-6" strokeWidth={1.75} /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Platform Owner</p>
              <p className="text-xs text-stone-300 font-medium">LAP IT Solutions only</p>
              <p className="text-xs text-stone-400 mt-0.5">Switch modules on or off, set plan limits, manage Super Admin access.</p>
            </div>
            <ArrowRight className="w-5 h-5 shrink-0 text-stone-500 group-hover:text-white transition-colors" />
          </Link>
          <p className="text-center text-xs text-gray-400 mt-6">Demo environment · sample data for Jovanne’s Meat Shop, Digos branch</p>
        </div>
      </div>
    </div>
  );
}
