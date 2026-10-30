import { DropdownMenu as Menu } from 'radix-ui';
import type { ComponentProps, ReactElement } from 'react';
import { cn } from '@/lib/utils';

const MENU_OFFSET = 6;

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = MENU_OFFSET,
  align = 'end',
  ...props
}: ComponentProps<typeof Menu.Content>): ReactElement {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-[12px] border border-border bg-popover p-1 text-popover-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof Menu.Item> & { destructive?: boolean }): ReactElement {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-secondary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive && 'text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>): ReactElement {
  return <Menu.Label className={cn('px-2.5 py-1.5 text-xs text-muted-foreground', className)} {...props} />;
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>): ReactElement {
  return <Menu.Separator className={cn('my-1 h-px bg-border', className)} {...props} />;
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>): ReactElement {
  return (
    <Menu.RadioItem
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-secondary data-[state=checked]:font-semibold',
        className,
      )}
      {...props}
    >
      <span className="size-1.5 rounded-full bg-transparent data-[state=checked]:bg-primary" />
      {children}
    </Menu.RadioItem>
  );
}
