import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Standard shadcn/ui className-merge helper — new to this repo (added
// alongside the shadcn/ui primitives in src/components/ui/shadcn/, see
// CLAUDE.md's "DataTable / pagination + bulk select" section). Every other
// component in this app builds classNames via plain template literals; this
// helper is scoped to the new shadcn-derived components only, not a
// retroactive sweep of the existing component library.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
