import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { ReceiptScreen } from '@/src/components/shopper/OrderScreens';

export const metadata: Metadata = { title: 'Receipt' };

export default async function ReceiptRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <ReceiptScreen orderId={id} />
    </RequireAuth>
  );
}
