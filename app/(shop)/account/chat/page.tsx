import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RequireAuth } from '@/src/components/shop/RequireAuth';
import { ChatPage } from '@/src/components/shop/pages';

export const metadata: Metadata = { title: 'Support chat' };

export default function SupportChatPage() {
  return (
    <RequireAuth>
      <Suspense>
        <ChatPage />
      </Suspense>
    </RequireAuth>
  );
}
