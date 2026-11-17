import type { Metadata, Viewport } from 'next';
import { RiderShell } from '@/src/components/rider/RiderShell';

// Rider website for Jovanne’s Meat Shop’s own riders (works on phone, tablet and desktop).
export const metadata: Metadata = {
  title: { default: 'Rider', template: '%s – Rider | Jovanne’s Meat Shop' },
};

// viewport-fit=cover so the top bar and bottom tab bar can respect phone safe areas.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2a2322',
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return <RiderShell>{children}</RiderShell>;
}
