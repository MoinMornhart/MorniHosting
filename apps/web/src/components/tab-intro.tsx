import type { ReactElement, ReactNode } from 'react';

/** Title, one explaining sentence and an optional main button at the top of a server tab. */
export function TabIntro({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid min-w-0 max-w-3xl gap-1">
        <h2 className="text-[22px] font-bold tracking-[-0.01em]">{title}</h2>
        {text ? <p className="text-muted-foreground">{text}</p> : null}
      </div>
      {action}
    </div>
  );
}
