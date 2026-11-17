import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { ProfileScreen } from '@/src/components/shopper/AccountScreens';

export const metadata: Metadata = { title: 'Edit profile' };

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileScreen />
    </RequireAuth>
  );
}
