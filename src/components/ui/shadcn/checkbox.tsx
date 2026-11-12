'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-gray-300 data-[state=checked]:bg-[#1e40af] data-[state=checked]:text-white data-[state=checked]:border-[#1e40af] data-[state=indeterminate]:bg-[#1e40af] data-[state=indeterminate]:text-white data-[state=indeterminate]:border-[#1e40af] focus-visible:ring-[#1e40af]/30 focus-visible:ring-2 size-4 shrink-0 rounded-[4px] border shadow-xs outline-none transition-shadow disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        {props.checked === 'indeterminate' ? (
          <MinusIcon className="size-3" />
        ) : (
          <CheckIcon className="size-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
