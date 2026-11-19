'use client';

// Small helpers for the My account pages, the header account menu and stock alerts.

import type { Customer, CustomerNotifyPrefs, SavedPaymentMethod } from '@/src/lib/types';
import { mutate } from '@/src/lib/store';
import { useShop } from './shared';

/** "0917 123 4567" → "+63 917 123 4567". Leaves other formats unchanged. */
export function fmtPhonePH(mobile: string) {
  const d = mobile.replace(/\D/g, '');
  const local = d.startsWith('63') ? d.slice(2) : d.startsWith('0') ? d.slice(1) : d;
  if (local.length !== 10) return mobile;
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** Two-letter initials, e.g. "MS". */
export function customerInitials(c: Customer) {
  const first = c.firstName?.[0] ?? c.name[0] ?? '';
  const last = c.lastName?.[0] ?? c.name.split(' ')[1]?.[0] ?? '';
  return `${first}${last}`.toUpperCase();
}

/** "March 2025" */
export function customerSinceLabel(c: Customer) {
  const d = new Date(c.customerSince ?? c.createdAt);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const DEFAULT_NOTIFY_PREFS: CustomerNotifyPrefs = { emailReceipts: true, backInStock: true, offers: false };

/** Cash on delivery is always available, so customers without saved methods still see it. */
export function paymentMethodsOf(c: Customer): SavedPaymentMethod[] {
  return c.paymentMethods?.length ? c.paymentMethods : [{ id: 'pm-cod', kind: 'cod', label: 'Cash on delivery', isDefault: true }];
}

/** Update the signed-in customer's record. */
export function updateCustomer(id: string, recipe: (c: Customer) => void) {
  mutate((d) => {
    const c = d.customers.find((x) => x.id === id);
    if (c) recipe(c);
  });
}

/**
 * "Notify me when available" for an out-of-stock product. Signed-in customers follow the product
 * (listed under My account > Notifications > Stock alerts); guests are asked to sign in.
 */
export function useStockAlert(productId: string, productName: string) {
  const { shopper, flash } = useShop();
  const following = !!shopper?.stockAlerts?.includes(productId);
  const follow = () => {
    if (!shopper) {
      flash('Sign in to get a text when it is back', 'info', { label: 'Sign in', href: '/signin' });
      return;
    }
    if (following) return;
    mutate((d) => {
      const c = d.customers.find((x) => x.id === shopper.id);
      if (!c) return;
      c.stockAlerts = [...(c.stockAlerts ?? []).filter((x) => x !== productId), productId];
    });
    flash(`We'll text you when ${productName} is back`, 'info', { label: 'View alerts', href: '/account/notifications' });
  };
  return { following, follow };
}
