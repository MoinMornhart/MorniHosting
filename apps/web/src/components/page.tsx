import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      <div className="min-w-[220px] flex-1">
        <h1 className="text-balance text-[26px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'grid justify-items-center gap-3 rounded-[16px] border-2 border-dashed border-input px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="grid size-12 place-items-center rounded-[14px] bg-accent text-primary [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h2 className="text-lg font-bold">{title}</h2>
      {text ? <p className="max-w-[52ch] text-sm text-muted-foreground">{text}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
