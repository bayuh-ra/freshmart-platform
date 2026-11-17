import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { VouchersScreen } from '@/src/components/shopper/AccountScreens';

export const metadata: Metadata = { title: 'Vouchers' };

export default function VouchersPage() {
  return (
    <RequireAuth>
      <VouchersScreen />
    </RequireAuth>
  );
}
