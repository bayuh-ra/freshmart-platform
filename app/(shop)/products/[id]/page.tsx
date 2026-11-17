import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProductPage } from '@/src/components/shop/pages';

// The product name is set as the tab title on the client (data lives in the browser).
export const metadata: Metadata = { title: 'Product' };

export default async function ProductRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ProductPage id={id} />
    </Suspense>
  );
}
