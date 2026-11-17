import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { OrderPage } from '@/src/components/shop/pages';

export const metadata: Metadata = { title: 'Track order' };

export default async function OrderRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <Suspense>
        <OrderPage id={id} />
      </Suspense>
    </RequireAuth>
  );
}
