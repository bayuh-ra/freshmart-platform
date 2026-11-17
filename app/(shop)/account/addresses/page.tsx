import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { AddressesScreen } from '@/src/components/shopper/AccountScreens';

export const metadata: Metadata = { title: 'Saved addresses' };

export default function AddressesPage() {
  return (
    <RequireAuth>
      <AddressesScreen />
    </RequireAuth>
  );
}
