import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, KeyRound, Save } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GAMES, type GameId, type ServerDetail } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { errorText } from '@/lib/query';

/**
 * The game's own settings (logins, tokens, switches) with an explanation each. Secrets are never shown again:
 * the field says "stored" and only a new value replaces it.
 */
export function GameFieldsForm({
  game,
  values,
  secretsSet,
  onChange,
}: {
  game: GameId;
  values: Readonly<Record<string, string>>;
  secretsSet: readonly string[];
  onChange: (values: Record<string, string>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const set = (key: string, value: string): void => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {GAMES[game].fields.map((field) => {
        const id = `game-field-${field.key}`;
        const label = t(`games.${game}.fields.${field.key}`);
        const hint = (
          <>
            {t(`games.${game}.fields.${field.key}Hint`)}
            {field.helpUrl ? (
              <>
                {' '}
                <a
                  href={field.helpUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {t('games.whereToFind')}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            ) : null}
          </>
        );
        if (field.kind === 'boolean') {
          const on = (values[field.key] ?? field.fallback ?? 'false') === 'true';
          return (
            <div
              key={field.key}
              className="grid gap-1.5 rounded-[12px] border border-border p-3 sm:col-span-2"
            >
              <label className="flex items-center justify-between gap-3 text-sm font-semibold" htmlFor={id}>
                {label}
                <Switch id={id} checked={on} onCheckedChange={(v) => set(field.key, String(v))} />
              </label>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          );
        }
        const stored = secretsSet.includes(field.key);
        return (
          <Field key={field.key} id={id} label={label} hint={hint}>
            <Input
              id={id}
              type={field.kind === 'secret' ? 'password' : field.kind === 'number' ? 'number' : 'text'}
              autoComplete="off"
              spellCheck={false}
              value={values[field.key] ?? ''}
              placeholder={stored ? t('games.secretStored') : (field.fallback ?? '')}
              onChange={(e) => set(field.key, e.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}

/** Settings tab of another game's server. */
export function GameSettingsCard({ server }: { server: ServerDetail }): ReactElement | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const game = server.software as GameId;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...(server.gameSettings?.values ?? {}),
  }));
  const save = useMutation({
    mutationFn: () => api(`/api/servers/${server.id}/game-settings`, { method: 'PUT', body: { values } }),
    onSuccess: async () => {
      toast.success(t('games.saved'));
      // Typed secrets are stored now; the fields go back to "stored".
      setValues((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) =>
            GAMES[game].fields.some((f) => f.key === key && f.kind !== 'secret'),
          ),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['server', server.id] });
    },
  });
  if (!GAMES[game].fields.length) return null;
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="mb-1">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" aria-hidden />
          {t('games.settingsTitle')}
        </CardTitle>
      </CardHeader>
      <CardDescription>{t('games.settingsCardText', { game: GAMES[game].label })}</CardDescription>
      <div className="mt-4 grid gap-4">
        <GameFieldsForm
          game={game}
          values={values}
          secretsSet={server.gameSettings?.secretsSet ?? []}
          onChange={setValues}
        />
        {save.error ? (
          <p className="rounded-[10px] bg-destructive-soft px-3 py-2 text-sm">{errorText(save.error)}</p>
        ) : null}
        <Button className="justify-self-start" disabled={save.isPending} onClick={() => save.mutate()}>
          <Save />
          {t('games.save')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('games.restartHint')}</p>
      </div>
    </Card>
  );
}
