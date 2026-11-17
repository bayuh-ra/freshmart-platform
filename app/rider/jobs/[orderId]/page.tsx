import type { Metadata } from 'next';
import { RiderJobPage } from '@/src/components/rider/RiderJobPage';

export const metadata: Metadata = { title: 'Current job' };

export default async function RiderJobRoute({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <RiderJobPage orderId={orderId} />;
}
