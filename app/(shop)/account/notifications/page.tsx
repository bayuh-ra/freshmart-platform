import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { NotificationSettingsScreen } from '@/src/components/shopper/AccountPages';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationSettingsScreen />
    </RequireAuth>
  );
}
