import { Check, Copy } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './ui/button';

const RESET_MS = 1600;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Plain-HTTP pages in the LAN have no clipboard API; fall back to a hidden text field.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function CopyButton({
  text,
  label,
  toastText,
  className,
  variant = 'ghost',
  size = 'icon-sm',
  showLabel = false,
}: {
  text: string;
  label?: string;
  toastText?: string;
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  showLabel?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const name = label ?? t('common.copy');
  const visibleLabel = done ? t('common.copied') : name;
  const onClick = async (): Promise<void> => {
    if (await copyText(text)) {
      setDone(true);
      toast.success(toastText ?? t('common.copied'));
      window.setTimeout(() => setDone(false), RESET_MS);
    }
  };
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={name}
      title={name}
      className={cn(!showLabel && 'text-muted-foreground hover:text-foreground', className)}
      onClick={() => void onClick()}
    >
      {done ? <Check /> : <Copy />}
      {showLabel ? visibleLabel : null}
    </Button>
  );
}
