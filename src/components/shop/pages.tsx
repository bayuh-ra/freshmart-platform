'use client';

// Small client wrappers for routes that read the query string (?edit=, ?placed=, ?c=).

import { useSearchParams } from 'next/navigation';
import { moduleOn } from '@/src/lib/platform';
import { useShop } from '@/src/components/shopper/shared';
import { ProductScreen } from '@/src/components/shopper/BrowseScreens';
import { ConfirmScreen } from '@/src/components/shopper/CartCheckout';
import { TrackScreen } from '@/src/components/shopper/OrderScreens';
import { ChatScreen, HelpScreen } from '@/src/components/shopper/AccountScreens';

export function ProductPage({ id }: { id: string }) {
  const edit = useSearchParams().get('edit') ?? undefined;
  return <ProductScreen key={id + (edit ?? '')} id={id} editKey={edit} />;
}

/** /my-orders/[id] — tracking, or the "Order placed!" confirmation right after checkout (?placed=1). */
export function OrderPage({ id }: { id: string }) {
  const placed = useSearchParams().get('placed') === '1';
  return placed ? <ConfirmScreen orderId={id} /> : <TrackScreen orderId={id} />;
}

/** In-app chat exists only with the Support module (Phase 2); otherwise the help page with "Call the branch". */
export function ChatPage() {
  const { s } = useShop();
  const convId = useSearchParams().get('c') ?? undefined;
  return moduleOn(s, 'support') ? <ChatScreen key={convId ?? 'support'} convId={convId} /> : <HelpScreen />;
}
