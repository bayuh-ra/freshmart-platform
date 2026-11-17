import type { Metadata, Viewport } from 'next';
import { Inter, Oswald, Lobster } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { StoreProvider } from '@/src/lib/store';

// Jovanne's Meat Shop brand fonts:
// Inter for body/UI/forms, Oswald (condensed block letters, like "JOVANNE'S" in the logo)
// for headings, Lobster (script, like "Meat Shop") for the wordmark only.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const oswald = Oswald({ variable: '--font-oswald', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const lobster = Lobster({ variable: '--font-lobster', subsets: ['latin'], weight: ['400'] });

export const metadata: Metadata = {
  title: { default: 'Jovanne’s Meat Shop', template: '%s | Jovanne’s Meat Shop' },
  description: 'Premium quality meats from Jovanne’s Meat Shop, Digos City — order online for delivery or pickup.',
  icons: { icon: '/jovannes-icon.png', apple: '/jovannes-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2a2322',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable} ${lobster.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <StoreProvider>{children}</StoreProvider>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
