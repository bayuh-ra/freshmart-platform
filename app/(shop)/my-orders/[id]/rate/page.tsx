import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { RateScreen } from '@/src/components/shopper/OrderScreens';

export const metadata: Metadata = { title: 'Rate your order' };

export default async function RateRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <RateScreen orderId={id} />
    </RequireAuth>
  );
}
