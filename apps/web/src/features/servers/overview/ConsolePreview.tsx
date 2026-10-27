import { SquareTerminal } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { stripAnsi } from '../console/colors';
import { useConsole } from '../console/useConsole';

const PREVIEW_LINES = 8;

/** The last few console lines on the overview; the full console is one click away. */
export function ConsolePreview({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const feed = useConsole(serverId, true);
  const lines = feed.lines.slice(-PREVIEW_LINES).map(stripAnsi);
  return (
    <Card className="p-5">
      <CardHeader>
        <CardTitle>{t('console.title')}</CardTitle>
        <Link
          to="console"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
        >
          <SquareTerminal className="size-4" />
          {t('actions.openConsole')}
        </Link>
      </CardHeader>
      <pre
        className="min-h-[170px] overflow-x-auto rounded-[12px] bg-console px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-console-foreground"
        role="log"
      >
        {lines.length ? lines.join('\n') : ' '}
      </pre>
    </Card>
  );
}
