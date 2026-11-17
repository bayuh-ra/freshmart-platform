import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { OrdersScreen } from '@/src/components/shopper/OrderScreens';

export const metadata: Metadata = { title: 'My orders' };

export default function MyOrdersPage() {
  return (
    <RequireAuth>
      <OrdersScreen />
    </RequireAuth>
  );
}
