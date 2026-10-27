import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { CrashInfo } from '@mornihosting/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { serversQuery } from '../live';

interface Fix {
  readonly label: string;
  readonly to: string;
}

const FIXES: Readonly<Record<string, (crash: CrashInfo) => { label: string; to: string } | null>> = {
  'out-of-memory': () => ({ label: 'crash.increaseMemory', to: 'settings#memory' }),
  'wrong-java': () => ({ label: 'crash.openSettings', to: 'settings#java' }),
  'port-in-use': () => ({ label: 'crash.openSettings', to: 'settings#port' }),
  'version-not-found': () => ({ label: 'crash.openSettings', to: 'settings#version' }),
  'missing-dependency': (c) => ({
    label: 'crash.openMarket',
    to: `content?q=${encodeURIComponent(c.params['dependency'] ?? '')}`,
  }),
  'mod-version-mismatch': () => ({ label: 'crash.openPlugins', to: 'content?view=installed' }),
  'plugin-error': () => ({ label: 'crash.openPlugins', to: 'content?view=installed' }),
  'world-broken': () => ({ label: 'crash.openBackups', to: 'backups' }),
};

/** The crash helper: what went wrong, in plain words, and one button towards the fix. */
export function CrashCard({
  serverId,
  crash,
  canControl,
}: {
  serverId: string;
  crash: CrashInfo;
  canControl: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => api(`/api/servers/${serverId}/crash/dismiss`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['server', serverId] });
      void queryClient.invalidateQueries({ queryKey: serversQuery.queryKey });
    },
  });
  const known = t(`crash.${crash.ruleId}.title`, { defaultValue: '' }) ? crash.ruleId : 'unknown';
  const fix: Fix | null = FIXES[known]?.(crash) ?? null;
  return (
    <section
      className="grid gap-4 rounded-[16px] border border-destructive/30 bg-card p-5 shadow-card"
      aria-labelledby="crash-title"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-destructive-soft text-destructive">
          <LifeBuoy className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-destructive">{t('crash.title')}</p>
          <h2 id="crash-title" className="text-lg font-bold leading-tight">
            {t(`crash.${known}.title`)}
          </h2>
          <p className="mt-1 text-sm">{t(`crash.${known}.text`, crash.params)}</p>
          <p className="mt-2 text-sm font-semibold">{t(`crash.${known}.fix`, crash.params)}</p>
        </div>
        {canControl ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('crash.dismiss')}
            onClick={() => dismiss.mutate()}
          >
            <X />
          </Button>
        ) : null}
      </div>
      {fix ? (
        <Button asChild className="justify-self-start">
          <Link to={fix.to}>{t(fix.label)}</Link>
        </Button>
      ) : null}
      {crash.excerpt.length ? (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {t('crash.excerpt')}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-[10px] bg-console p-3 font-mono text-xs leading-relaxed text-console-foreground">
            {crash.excerpt.join('\n')}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
