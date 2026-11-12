import type { Metadata } from 'next';
import { Inter, IBM_Plex_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { StoreProvider } from '@/src/lib/store';

// Two-font system per LAP_IT_DESIGN_SYSTEM.md (same as the CRM) — Inter for
// body/UI/forms, IBM Plex Sans for display headings.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const ibmPlexSans = IBM_Plex_Sans({ variable: '--font-ibm-plex-sans', subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'FreshMart Platform', template: '%s | FreshMart Platform' },
  description: 'Multi-Branch Supermarket Delivery & Ordering Platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexSans.variable} h-full antialiased`}>
      <head>
        <meta name="theme-color" content="#1e40af" />
      </head>
      <body className="min-h-full flex flex-col">
        <StoreProvider>{children}</StoreProvider>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
