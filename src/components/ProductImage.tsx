import { cn } from '@/src/lib/utils';

/** A product/category image value is either an emoji ("🥩") or a photo URL ("/images/…", "data:…", "https://…"). */
export function isPhoto(image?: string) {
  return !!image && (image.startsWith('/') || image.startsWith('data:') || image.startsWith('http'));
}

/**
 * Shows a product photo or, when there is none, its emoji.
 * - default: sized in `em`, so it drops into any spot that used to show the emoji text
 *   (e.g. `<span className="text-2xl"><ProductImage image={p.image} /></span>`).
 * - `fill`: covers its (relative, sized) parent — for product tiles and cards.
 */
export function ProductImage({ image, alt = '', fill, className }: { image?: string; alt?: string; fill?: boolean; className?: string }) {
  if (!isPhoto(image)) {
    return fill
      ? <span className={cn('absolute inset-0 flex items-center justify-center', className)} aria-hidden>{image || '🥩'}</span>
      : <span className={className} aria-hidden>{image || '🥩'}</span>;
  }
  // Plain <img>: works for local files, uploaded data URLs and remote URLs alike.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image} alt={alt} loading="lazy" decoding="async"
    className={cn(fill ? 'absolute inset-0 h-full w-full object-cover' : 'inline-block h-[1.6em] w-[1.6em] rounded-[0.3em] object-cover align-middle', className)} />;
}
