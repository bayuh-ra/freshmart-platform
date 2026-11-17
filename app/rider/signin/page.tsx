import type { Metadata } from 'next';
import { RiderSignIn } from '@/src/components/rider/RiderSignIn';

export const metadata: Metadata = { title: 'Sign in' };

export default function RiderSignInPage() {
  return <RiderSignIn />;
}
