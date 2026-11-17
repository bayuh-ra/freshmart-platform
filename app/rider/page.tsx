import type { Metadata } from 'next';
import { RiderHome } from '@/src/components/rider/RiderHome';

export const metadata: Metadata = { title: 'Jobs' };

export default function RiderJobsPage() {
  return <RiderHome />;
}
