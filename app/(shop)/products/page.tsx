import type { Metadata } from 'next';
import { AllProductsScreen } from '@/src/components/shopper/BrowseScreens';

export const metadata: Metadata = { title: 'All products' };

export default function AllProductsPage() {
  return <AllProductsScreen />;
}
