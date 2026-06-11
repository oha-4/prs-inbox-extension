import type * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-8 w-full min-w-0 rounded-md border bg-transparent px-2.5 py-1 text-[13px] shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
