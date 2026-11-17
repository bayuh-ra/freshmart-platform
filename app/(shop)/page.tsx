import type { Metadata } from 'next';
import { HomeScreen } from '@/src/components/shopper/BrowseScreens';

export const metadata: Metadata = { title: { absolute: 'Jovanne’s Meat Shop — Premium Quality Meats, Digos City' } };

export default function HomePage() {
  return <HomeScreen />;
}
