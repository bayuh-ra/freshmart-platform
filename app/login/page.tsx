'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LayoutDashboard, ClipboardList, Smartphone, Bike, ArrowRight, ShieldCheck } from 'lucide-react';
import { moduleOn } from '@/src/lib/platform';
import { mutate, useStore } from '@/src/lib/store';

// Same split-screen brand panel as the CRM login (mesh orbs + dot grid),
// but the right side is a portal launcher for the demo: each card opens one
// of the platform's four applications with a matching demo account.
const PORTALS = [
  { href: '/dashboard', title: 'Admin Dashboard', who: 'Head office · Super Admin', icon: LayoutDashboard, user: 'u-1', desc: 'Cities, branches, catalog, pricing, inventory, riders, settings, roles, reports.' },
  { href: '/orders', title: 'Order Desk', who: 'Matina branch · Cashier', icon: ClipboardList, user: 'u-3', desc: 'Live order board, confirm, pick, substitute, walk-in & phone orders, pickup handover.' },
  { href: '/shopper', title: 'Shopper App', who: 'Maria Santos · iOS / Android', icon: Smartphone, desc: 'Browse, cart, checkout, pay, live tracking, ratings and support chat.' },
  { href: '/rider', title: 'Rider App', who: 'Jomar Villar · Own rider', icon: Bike, desc: 'Job offers, pickup, navigation, proof of delivery, COD and earnings.', module: 'delivery' as const },
];

export default function LoginPage() {
  const s = useStore();
  return (
    <div className="min-h-screen grid md:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden md:flex flex-col justify-between h-full min-h-screen px-12 py-8 overflow-hidden text-white"
        style={{ background: 'linear-gradient(150deg, #14266e 0%, #1e3a8a 55%, #2563eb 100%)' }}>
        <div className="pointer-events-none absolute -top-24 -left-16 w-96 h-96 rounded-full blur-3xl opacity-40" style={{ background: '#1e40af', animation: 'lap-drift-a 18s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30" style={{ background: '#dc2626', animation: 'lap-drift-b 22s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-25" style={{ background: '#8b5cf6', animation: 'lap-drift-c 16s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }} />
        <div className="relative z-10 lap-rise-in">
          <Image src="/lap-logo.png" alt="LAP" width={100} height={71} className="h-32 w-auto mb-6" />
          <h1 className="text-3xl font-extrabold leading-tight max-w-md" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>
            Multi-Branch Supermarket Delivery &amp; Ordering Platform
          </h1>
          <p className="text-blue-100 mt-3 max-w-md">One live data set for shoppers, branches, riders and head office. Every rule is a setting the admin controls.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
            {[['3', 'Cities'], ['6', 'Branches'], ['4', 'Apps']].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
                <p className="text-2xl font-bold">{n}</p>
                <p className="text-xs text-blue-200">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-blue-200">© 2026 LAP I.T. Solutions Inc. All rights reserved.</p>
      </div>

      <div className="relative flex items-center justify-center px-4 py-12 bg-[#fafafa]">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(30,64,175,0.06), transparent 55%)' }} />
        <div className="relative w-full max-w-[480px] lap-rise-in">
          <h2 className="text-2xl font-bold text-[#0f0f1a]" style={{ fontFamily: 'var(--font-ibm-plex-sans)' }}>Welcome</h2>
          <p className="text-sm text-[#525569] mt-1 mb-6">Choose an application to open. Open two in separate tabs to see live updates between them.</p>
          <div className="space-y-3">
            {PORTALS.filter((p) => !('module' in p) || moduleOn(s, p.module)).map((p) => (
              <Link key={p.href} href={p.href}
                onClick={() => { if (p.user) mutate((d) => { d.session.staffUserId = p.user!; d.session.branchId = 'b-dgs'; }); }}
                className="group flex items-center gap-4 bg-white rounded-2xl border border-[rgba(15,15,26,0.08)] shadow-sm p-4 hover:shadow-md hover:border-[#1e40af]/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#1e40af]/10 text-[#1e40af] flex items-center justify-center shrink-0">
                  <p.icon className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#0f0f1a]">{p.title}</p>
                  <p className="text-xs text-[#1e40af] font-medium">{p.who}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.desc}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#1e40af] transition-colors" />
              </Link>
            ))}
          </div>
          <Link href="/platform"
            className="mt-3 group flex items-center gap-4 rounded-2xl bg-[#0f172a] text-white shadow-sm p-4 hover:bg-[#1e293b] transition-colors">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><ShieldCheck className="w-6 h-6" strokeWidth={1.75} /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Platform Owner</p>
              <p className="text-xs text-slate-300 font-medium">LAP IT Solutions only</p>
              <p className="text-xs text-slate-400 mt-0.5">Switch client modules on or off, set plan limits, manage Super Admin accounts.</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors" />
          </Link>
          <p className="text-center text-xs text-gray-400 mt-6">Demo environment · sample data for 3 cities and 6 branches</p>
        </div>
      </div>
    </div>
  );
}
