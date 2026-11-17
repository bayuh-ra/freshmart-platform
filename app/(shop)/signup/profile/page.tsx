import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CompleteProfileScreen } from '@/src/components/shopper/AuthScreens';

export const metadata: Metadata = { title: 'Complete your profile' };

export default function CompleteProfilePage() {
  return (
    <Suspense>
      <CompleteProfileScreen />
    </Suspense>
  );
}
