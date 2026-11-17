import type { Metadata } from 'next';
import { RiderProfile } from '@/src/components/rider/RiderProfile';

export const metadata: Metadata = { title: 'Profile' };

export default function RiderProfilePage() {
  return <RiderProfile />;
}
