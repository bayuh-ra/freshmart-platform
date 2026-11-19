import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { SavedAddressesScreen } from '@/src/components/shopper/AccountPages';

export const metadata: Metadata = { title: 'Saved addresses' };

export default function AddressesPage() {
  return (
    <RequireAuth>
      <SavedAddressesScreen />
    </RequireAuth>
  );
}
