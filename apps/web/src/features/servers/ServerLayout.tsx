import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  CalendarClock,
  Folder,
  LayoutGrid,
  MoreHorizontal,
  Package,
  Play,
  RotateCw,
  SlidersHorizontal,
  Square,
  SquareTerminal,
  UsersRound,
  Zap,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { SOFTWARE, type ServerDetail, type ServerPermission } from '@mornihosting/shared';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/page';
import { ServerIcon, StatePill } from '@/components/server-visuals';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/misc';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useServerAction } from '@/features/dashboard/ServerCard';
import { serverQuery } from './live';

const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;

export interface ServerOutletContext {
  readonly server: ServerDetail;
  readonly can: (permission: ServerPermission) => boolean;
}

export function useServer(): ServerOutletContext {
  return useOutletContext<ServerOutletContext>();
}

interface TabDef {
  readonly to: string;
  readonly key: string;
  readonly icon: typeof LayoutGrid;
  readonly permission: ServerPermission | null;
  readonly show: (server: ServerDetail) => boolean;
}

const TABS: readonly TabDef[] = [
  { to: '', key: 'overview', icon: LayoutGrid, permission: null, show: () => true },
  { to: 'console', key: 'console', icon: SquareTerminal, permission: 'console', show: () => true },
  {
    to: 'content',
    key: 'plugins',
    icon: Package,
    permission: 'plugins',
    show: (s) => SOFTWARE[s.software].content !== 'none',
  },
  { to: 'files', key: 'files', icon: Folder, permission: 'files', show: () => true },
  { to: 'backups', key: 'backups', icon: Archive, permission: 'backups', show: () => true },
  { to: 'schedules', key: 'schedules', icon: CalendarClock, permission: 'schedules', show: () => true },
  {
    to: 'players',
    key: 'players',
    icon: UsersRound,
    permission: 'players',
    show: (s) => !SOFTWARE[s.software].proxy,
  },
  { to: 'settings', key: 'settings', icon: SlidersHorizontal, permission: 'config', show: () => true },
];

function ServerActions({ server, can }: ServerOutletContext): ReactElement | null {
  const { t } = useTranslation();
  const action = useServerAction(server.id);
  const [confirmKill, setConfirmKill] = useState(false);
  if (!can('control')) return null;
  const state = server.live.state;
  const running = state === 'running' || state === 'starting';
  return (
    <div className="flex flex-wrap gap-2">
      {state === 'running' ? (
        <Button variant="secondary" disabled={action.isPending} onClick={() => action.mutate('restart')}>
          <RotateCw />
          {t('actions.restart')}
        </Button>
      ) : null}
      {running ? (
        <Button variant="secondary" disabled={action.isPending} onClick={() => action.mutate('stop')}>
          <Square />
          {t('actions.stop')}
        </Button>
      ) : null}
      {state === 'stopped' || state === 'crashed' ? (
        <Button disabled={action.isPending} onClick={() => action.mutate('start')}>
          <Play />
          {t('actions.start')}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label={t('common.more')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem destructive disabled={state === 'stopped'} onSelect={() => setConfirmKill(true)}>
            <Zap />
            {t('actions.kill')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmKill}
        onOpenChange={setConfirmKill}
        title={t('actions.killConfirmTitle')}
        description={t('actions.killConfirmText')}
        confirmLabel={t('actions.kill')}
        onConfirm={async () => {
          await action.mutateAsync('kill');
        }}
      />
    </div>
  );
}

export function ServerLayout(): ReactElement {
  const { t } = useTranslation();
  const { serverId = '' } = useParams();
  const { data: server, error, isPending } = useQuery(serverQuery(serverId));

  if (isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-11" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error || !server) {
    const missing = error instanceof ApiError && [HTTP_NOT_FOUND, HTTP_FORBIDDEN].includes(error.status);
    return <EmptyState title={missing ? t('server.notFound') : t('errors.generic')} />;
  }

  const can = (permission: ServerPermission): boolean => server.permissions.includes(permission);
  const tabs = TABS.filter((tab) => tab.show(server) && (!tab.permission || can(tab.permission)));
  const contentTab = SOFTWARE[server.software].content === 'mods' ? 'mods' : 'plugins';
  const context: ServerOutletContext = { server, can };

  return (
    <>
      {/* Server head and tabs stay in place; only the page below them scrolls. */}
      <div className="sticky top-[65px] z-20 -mx-4 -mt-6 grid gap-[22px] border-b border-border bg-background px-4 pt-6 sm:-mx-8 sm:-mt-7 sm:px-8 sm:pt-7 lg:top-0">
        <div className="flex flex-wrap items-center gap-4">
          <ServerIcon
            id={server.id}
            software={server.software}
            hasIcon={server.hasIcon}
            className="size-[60px] rounded-[14px]"
          />
          <div className="min-w-[240px] flex-1">
            <h1 className="flex flex-wrap items-center gap-3 text-[26px] font-bold leading-tight tracking-[-0.02em]">
              {server.name}
              <StatePill state={server.live.state} />
            </h1>
            <p className="mt-1 text-muted-foreground">
              {t('server.meta', {
                software: SOFTWARE[server.software].label,
                version: server.version,
                edition: server.edition === 'java' ? 'Java' : 'Bedrock',
                port: server.port,
              })}
            </p>
          </div>
          <ServerActions {...context} />
        </div>
        <nav aria-label={server.name} className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.to === ''}
              className={({ isActive }) =>
                cn(
                  '-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 font-semibold text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4',
                  isActive && 'border-primary text-foreground',
                )
              }
            >
              <tab.icon aria-hidden />
              {t(`server.tabs.${tab.key === 'plugins' ? contentTab : tab.key}`)}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet context={context} />
    </>
  );
}
