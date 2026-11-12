import * as React from 'react';
import { cn } from '@/src/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-gray-300 placeholder:text-gray-400 focus-visible:border-[#1e40af] focus-visible:ring-[#1e40af]/30 flex min-h-16 w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
