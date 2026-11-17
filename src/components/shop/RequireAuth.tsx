'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useShop } from '@/src/components/shopper/shared';

/**
 * Protected pages (checkout, my orders, account). Signed-out visitors go to /signin?next=…,
 * signed-in customers with an unfinished profile go to the Complete Profile step.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { shopper, signingOut } = useShop();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const ok = !!shopper && !!shopper.profileComplete;

  useEffect(() => {
    if (ok || signingOut.current) return;
    const next = encodeURIComponent(pathname + window.location.search);
    router.replace(shopper ? `/signup/profile?next=${next}` : `/signin?next=${next}`);
  }, [ok, shopper, pathname, router, signingOut]);

  if (!ok) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#c8151d] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600">Taking you to sign in…</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Only allows a relative path inside this site as the "next" page after sign-in. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
