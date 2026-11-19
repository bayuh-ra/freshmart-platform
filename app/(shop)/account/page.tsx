import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { PersonalDetailsScreen } from '@/src/components/shopper/AccountPages';

export const metadata: Metadata = { title: 'My account' };

export default function AccountPage() {
  return (
    <RequireAuth>
      <PersonalDetailsScreen />
    </RequireAuth>
  );
}
