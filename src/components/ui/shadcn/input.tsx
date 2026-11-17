import * as React from 'react';
import { cn } from '@/src/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-gray-300 placeholder:text-gray-400 focus-visible:border-[#c8151d] focus-visible:ring-[#c8151d]/30 flex h-9 w-full min-w-0 rounded-lg border bg-white px-3 py-1 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
