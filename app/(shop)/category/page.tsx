import type { Metadata } from 'next';
import { CategoriesScreen } from '@/src/components/shopper/BrowseScreens';

export const metadata: Metadata = { title: 'Categories' };

export default function CategoriesPage() {
  return <CategoriesScreen />;
}
