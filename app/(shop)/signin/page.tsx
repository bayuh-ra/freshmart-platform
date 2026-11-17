import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignInScreen } from '@/src/components/shopper/AuthScreens';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Suspense>
      <SignInScreen />
    </Suspense>
  );
}
