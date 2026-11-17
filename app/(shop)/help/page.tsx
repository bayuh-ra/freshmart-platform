import type { Metadata } from 'next';
import { HelpScreen } from '@/src/components/shopper/AccountScreens';

export const metadata: Metadata = { title: 'Help & contact' };

export default function HelpPage() {
  return <HelpScreen />;
}
