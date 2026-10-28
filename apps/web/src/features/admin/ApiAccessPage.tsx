import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, KeyRound, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiTokenEntry } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { EmptyState, PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';

const NEVER = 'never';
const EXPIRY_DAYS: readonly number[] = [30, 90, 365]; // eslint-disable-line ts-patterns/no-magic-numbers -- choices offered in the select

/** Personal API keys for scripts and tools, plus the link to the API documentation. */
export function ApiAccessPage(): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState<string>('90');
  const [created, setCreated] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ApiTokenEntry | null>(null);
  const { data } = useQuery({ queryKey: ['tokens'], queryFn: () => api<ApiTokenEntry[]>('/api/tokens') });
  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['tokens'] });
  const create = useMutation({
    mutationFn: () =>
      api<{ token: string; entry: ApiTokenEntry }>('/api/tokens', {
        method: 'POST',
        body: { name: name.trim(), expiresInDays: expiry === NEVER ? null : Number(expiry) },
      }),
    onSuccess: async (result) => {
      setCreating(false);
      setName('');
      setCreated(result.token);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (entry: ApiTokenEntry) => api(`/api/tokens/${entry.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (name.trim()) create.mutate();
  };
  const example = `curl -H "Authorization: Bearer ${created ?? 'mh_…'}" ${window.location.origin}/api/servers`;

  const list = (): ReactElement => {
    if (!data) return <Skeleton className="h-40 rounded-[16px]" />;
    if (!data.length) {
      return (
        <EmptyState icon={<KeyRound />} title={t('apiAccess.emptyTitle')} text={t('apiAccess.emptyText')} />
      );
    }
    return (
      <Card className="divide-y divide-border overflow-hidden">
        {data.map((entry) => {
          const expired = entry.expiresAt !== null && Date.parse(entry.expiresAt) < Date.now();
          return (
            <div key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid size-10 place-items-center rounded-[10px] bg-accent text-primary">
                <KeyRound className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">{entry.name}</b>
                <p className="truncate text-[12px] text-muted-foreground">
                  <code className="font-mono">{entry.prefix}…</code> ·{' '}
                  {entry.lastUsedAt
                    ? t('apiAccess.lastUsed', { when: formatRelative(entry.lastUsedAt) })
                    : t('apiAccess.neverUsed')}{' '}
                  ·{' '}
                  {entry.expiresAt
                    ? t(expired ? 'apiAccess.expired' : 'apiAccess.expires', {
                        when: formatDateTime(entry.expiresAt),
                      })
                    : t('apiAccess.noExpiry')}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('apiAccess.revoke', { name: entry.name })}
                onClick={() => setDeleting(entry)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title={t('nav.api')}
        subtitle={t('apiAccess.subtitle')}
        actions={
          <>
            <Button variant="secondary" asChild>
              <a href="/api/docs" target="_blank" rel="noreferrer">
                <BookOpen />
                {t('apiAccess.docs')}
              </a>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('apiAccess.new')}
            </Button>
          </>
        }
      />
      {created ? (
        <Card className="grid gap-3 border-primary/50 p-5">
          <CardTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-warning" aria-hidden />
            {t('apiAccess.copyNow')}
          </CardTitle>
          <div className="flex items-center gap-2 rounded-[10px] bg-secondary px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{created}</code>
            <CopyButton text={created} />
          </div>
          <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => setCreated(null)}>
            {t('common.done')}
          </Button>
        </Card>
      ) : null}
      {list()}
      <Card className="p-5">
        <CardHeader className="mb-1">
          <CardTitle>{t('apiAccess.howTitle')}</CardTitle>
        </CardHeader>
        <CardDescription className="mb-3">{t('apiAccess.howText')}</CardDescription>
        <div className="flex items-center gap-2 rounded-[10px] bg-secondary px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono text-[12px]">{example}</code>
          <CopyButton text={example} />
        </div>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogTitle>{t('apiAccess.new')}</DialogTitle>
          <DialogDescription>{t('apiAccess.newText')}</DialogDescription>
          <form onSubmit={submit} className="grid gap-4">
            <Field id="token-name" label={t('common.name')} hint={t('apiAccess.nameHint')}>
              <Input
                id="token-name"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <label className="grid gap-2 text-sm font-semibold">
              {t('apiAccess.expiry')}
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t('apiAccess.days', { count: d })}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEVER}>{t('apiAccess.noExpiry')}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('apiAccess.revokeTitle', { name: deleting?.name ?? '' })}
        description={t('apiAccess.revokeText')}
        confirmLabel={t('apiAccess.revokeButton')}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting);
        }}
      />
    </>
  );
}
