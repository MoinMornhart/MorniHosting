import type { KeyboardEvent, ReactElement } from 'react';
import { Input } from '@/components/ui/input';

/** "survival" plus the fixed ".example.de" behind it, so it is clear only the name is typed. */
export function NetbirdNameInput({
  id,
  value,
  domain,
  onChange,
  onEnter,
}: {
  id: string;
  value: string;
  domain: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}): ReactElement {
  const enter = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !onEnter) return;
    e.preventDefault();
    onEnter();
  };
  return (
    <div className="flex min-w-0 flex-1">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        className="rounded-r-none font-mono"
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        onKeyDown={enter}
      />
      <span className="inline-flex max-w-[60%] shrink-0 items-center truncate rounded-r-[10px] border border-l-0 border-input bg-background px-3 font-mono text-[13px] text-muted-foreground">
        .{domain}
      </span>
    </div>
  );
}
