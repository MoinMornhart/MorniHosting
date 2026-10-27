import type { ComponentProps, ReactElement } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return (
    <div
      data-slot="card"
      className={cn(
        'min-w-0 rounded-[16px] border border-border bg-card text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return <div className={cn('mb-4 flex items-center justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>): ReactElement {
  return <h3 className={cn('text-[15px] font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>): ReactElement {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
