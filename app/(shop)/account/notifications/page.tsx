import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { NotificationsScreen } from '@/src/components/shopper/AccountScreens';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsScreen />
    </RequireAuth>
  );
}
