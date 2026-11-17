import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { AccountScreen } from '@/src/components/shopper/AccountScreens';

export const metadata: Metadata = { title: 'My account' };

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountScreen />
    </RequireAuth>
  );
}
