import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { PaymentMethodsScreen } from '@/src/components/shopper/AccountPages';

export const metadata: Metadata = { title: 'Payment methods' };

export default function PaymentMethodsPage() {
  return (
    <RequireAuth>
      <PaymentMethodsScreen />
    </RequireAuth>
  );
}
