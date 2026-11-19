import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { SecurityScreen } from '@/src/components/shopper/AccountPages';

export const metadata: Metadata = { title: 'Sign-in & security' };

export default function SecurityPage() {
  return (
    <RequireAuth>
      <SecurityScreen />
    </RequireAuth>
  );
}
