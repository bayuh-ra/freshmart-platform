import Image from 'next/image';
import { cn } from '@/src/lib/utils';

// Jovanne's Meat Shop brand pieces, matching the shop's Facebook logo:
// charcoal sign, red block letters ("JOVANNE'S"), white script ("Meat Shop"), copper cleavers.
export const BRAND = {
  name: 'Jovanne’s Meat Shop',
  short: 'Jovanne’s',
  tagline: 'Premium Quality Meats',
  red: '#ec1b26',
  redDeep: '#c8151d',
  charcoal: '#2a2322',
  charcoalSoft: '#372e2f',
  copper: '#ae754d',
  cream: '#faf6f2',
};

/** Full logo (white background) — use on light surfaces. */
export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/jovannes-logo.png" alt="Jovanne’s Meat Shop — Premium Quality Meats" width={1657} height={1090} priority={priority} className={cn('h-auto w-auto', className)} />;
}

/** Square cleaver icon on charcoal — use for app icons, avatars, small spaces. */
export function BrandIcon({ className }: { className?: string }) {
  return <Image src="/jovannes-icon.png" alt="Jovanne’s Meat Shop" width={512} height={512} className={cn('h-9 w-9 rounded-xl', className)} />;
}

/**
 * Text wordmark: red block "JOVANNE'S" + white (or charcoal) script "Meat Shop".
 * `tone="dark"` for charcoal backgrounds (default), `tone="light"` for white backgrounds.
 */
export function BrandWordmark({ className, tone = 'dark', size = 'md' }: { className?: string; tone?: 'dark' | 'light'; size?: 'sm' | 'md' | 'lg' }) {
  const big = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-base' : 'text-xl';
  const script = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  return (
    <span className={cn('inline-flex flex-col leading-none', className)}>
      <span className={cn('font-bold uppercase tracking-wide text-[#ec1b26]', big)} style={{ fontFamily: 'var(--font-oswald)' }}>Jovanne’s</span>
      <span className={cn('-mt-0.5', script, tone === 'dark' ? 'text-white' : 'text-[#2a2322]')} style={{ fontFamily: 'var(--font-lobster)' }}>Meat Shop</span>
    </span>
  );
}
