import { useEffect, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { SOFTWARE } from '@mornihosting/shared';
import { EmptyState } from '@/components/page';
import { useServer } from '../ServerLayout';
import { DangerZone } from './DangerZone';
import { GeneralCard } from './GeneralCard';
import { IconCard } from './IconCard';
import { PropertiesCard } from './PropertiesCard';
import { WorldsCard } from './WorldsCard';

const SECTIONS = ['general', 'game', 'worlds', 'icon', 'danger'] as const;

/** Everything about one server on one page, with a section list to jump around. */
export default function SettingsTab(): ReactElement {
  const { t } = useTranslation();
  const { server, can } = useServer();
  const { hash } = useLocation();
  const proxy = SOFTWARE[server.software].proxy;

  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  if (!can('config')) return <EmptyState title={t('server.noPermission')} />;
  const sections = SECTIONS.filter((s) => !proxy || (s !== 'game' && s !== 'worlds'));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
      <nav aria-label={t('server.tabs.settings')} className="sticky top-4 hidden gap-0.5 lg:grid">
        {sections.map((s) => (
          <a
            key={s}
            href={`#s-${s}`}
            className="rounded-[10px] px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {t(`settings.sections.${s}`)}
          </a>
        ))}
      </nav>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <section id="s-general" className="scroll-mt-4">
          <GeneralCard key={`${server.id}-${server.memoryMb}-${server.version}`} server={server} />
        </section>
        {proxy ? null : (
          <section id="s-game" className="scroll-mt-4">
            <PropertiesCard server={server} />
          </section>
        )}
        {proxy ? null : (
          <section id="s-worlds" className="scroll-mt-4">
            <WorldsCard server={server} />
          </section>
        )}
        <section id="s-icon" className="scroll-mt-4">
          <IconCard server={server} />
        </section>
        <section id="s-danger" className="scroll-mt-4">
          <DangerZone server={server} />
        </section>
      </div>
    </div>
  );
}
