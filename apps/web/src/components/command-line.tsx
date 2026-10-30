import type { ReactElement } from 'react';
import { CopyButton } from '@/components/copy-button';
import { cn } from '@/lib/utils';

/**
 * A command or config snippet to copy. A one-liner wraps instead of pushing the card wider than the screen;
 * a block (several lines, e.g. docker-compose) keeps its layout and scrolls sideways inside its box.
 */
export function CommandLine({
  text,
  block = false,
  className,
}: {
  text: string;
  block?: boolean;
  className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex min-w-0 max-w-full items-start gap-2 rounded-[10px] bg-secondary px-3 py-2',
        className,
      )}
    >
      {block ? (
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[13px]">{text}</pre>
      ) : (
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[13px]">{text}</code>
      )}
      <CopyButton text={text} className="size-7 shrink-0" />
    </div>
  );
}
