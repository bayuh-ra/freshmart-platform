import type { Metadata } from 'next';
import { CategoryScreen } from '@/src/components/shopper/BrowseScreens';

// The category name is set as the tab title on the client (data lives in the browser).
export const metadata: Metadata = { title: 'Shop' };

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CategoryScreen key={id} id={id} />;
}
