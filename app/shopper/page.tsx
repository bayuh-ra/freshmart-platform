'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, Smartphone } from 'lucide-react';
import { useStore } from '@/src/lib/store';
import { PhoneFrame } from '@/src/components/common';
import { ShopperApp } from '@/src/components/shopper/ShopperApp';

export default function ShopperPage() {
  const s = useStore();
  const shopper = s.customers.find((c) => c.id === s.session.shopperId);
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="h-12 shrink-0 bg-white border-b border-gray-200 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#1e40af]">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} /> Portals
          </Link>
          <span className="w-px h-5 bg-gray-200" />
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 truncate">
            <Smartphone className="w-4 h-4 text-[#1e40af]" strokeWidth={1.75} /> Shopper App preview · iOS/Android
            {shopper && <span className="hidden sm:inline text-xs font-normal text-gray-500">— signed in as {shopper.name}</span>}
          </p>
        </div>
        <p className="hidden md:flex items-center gap-1.5 text-xs text-gray-500">
          Open the <Link href="/orders" target="_blank" className="text-[#1e40af] font-medium hover:underline inline-flex items-center gap-0.5">Order Desk <ExternalLink className="w-3 h-3" /></Link> in another tab to see orders arrive live
        </p>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <PhoneFrame className="max-h-[calc(100vh-5rem)] min-h-[600px]">
          <ShopperApp />
        </PhoneFrame>
      </main>
    </div>
  );
}
