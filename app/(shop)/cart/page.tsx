import type { Metadata } from 'next';
import { CartScreen } from '@/src/components/shopper/CartCheckout';

export const metadata: Metadata = { title: 'Shopping cart' };

export default function CartPage() {
  return <CartScreen />;
}
