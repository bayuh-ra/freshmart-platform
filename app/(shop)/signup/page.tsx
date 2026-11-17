import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignUpScreen } from '@/src/components/shopper/AuthScreens';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpScreen />
    </Suspense>
  );
}
