import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { CheckoutScreen } from '@/src/components/shopper/CartCheckout';

export const metadata: Metadata = { title: 'Checkout' };

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <CheckoutScreen />
    </RequireAuth>
  );
}
