import type { Viewport } from 'next';
import { ShopShell } from '@/src/components/shop/ShopShell';

// Jovanne's Meat Shop customer website (phone, tablet and desktop).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2a2322',
  // lets the header and bottom tab bar use the safe-area insets on notched phones
  viewportFit: 'cover',
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <ShopShell>{children}</ShopShell>;
}
