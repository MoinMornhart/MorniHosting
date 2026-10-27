import { useEffect, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './ui/dialog';
import { Field } from './ui/label';
import { Input } from './ui/input';

export interface NameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly label: ReactNode;
  readonly initial?: string;
  readonly confirmLabel: ReactNode;
  readonly onSubmit: (name: string) => Promise<void>;
}

/** Asks for a single name (new folder, rename, ZIP name); selects the part before the extension. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initial = '',
  confirmLabel,
  onSubmit,
}: NameDialogProps): ReactElement {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onSubmit(value.trim());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <Field id="name-dialog-input" label={label}>
            <Input
              id="name-dialog-input"
              value={value}
              autoFocus
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => {
                const dot = e.target.value.lastIndexOf('.');
                e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
              }}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
