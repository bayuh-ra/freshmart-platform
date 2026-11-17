import type { Metadata } from 'next';
import { RiderEarnings } from '@/src/components/rider/RiderEarnings';

export const metadata: Metadata = { title: 'Earnings' };

export default function RiderEarningsPage() {
  return <RiderEarnings />;
}
