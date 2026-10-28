import { Suspense, type ReactElement } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { Skeleton } from '@/components/ui/misc';
import { lazyPage } from '@/lib/lazy-page';
import { AccountPage } from '@/features/admin/AccountPage';
import { ApiAccessPage } from '@/features/admin/ApiAccessPage';
import { AuditPage } from '@/features/admin/AuditPage';
import { NotificationsPage } from '@/features/admin/NotificationsPage';
import { PanelSettingsPage } from '@/features/admin/PanelSettingsPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { CreateServerPage } from '@/features/servers/create/CreateServerPage';
import { ImportServerPage } from '@/features/servers/create/ImportServerPage';
import { OverviewTab } from '@/features/servers/OverviewTab';
import { ServerLayout } from '@/features/servers/ServerLayout';

const ConsoleTab = lazyPage(() => import('@/features/servers/ConsoleTab'));
const ContentTab = lazyPage(() => import('@/features/servers/content/ContentTab'));
const BackupsTab = lazyPage(() => import('@/features/servers/backups/BackupsTab'));
const SchedulesTab = lazyPage(() => import('@/features/servers/schedules/SchedulesTab'));
const FilesTab = lazyPage(() => import('@/features/servers/files/FilesTab'));
const PlayersTab = lazyPage(() => import('@/features/servers/players/PlayersTab'));
const SettingsTab = lazyPage(() => import('@/features/servers/settings/SettingsTab'));

function Lazy({ children }: { children: ReactElement }): ReactElement {
  return <Suspense fallback={<Skeleton className="h-96 rounded-[16px]" />}>{children}</Suspense>;
}

/** Feature pages inside the app shell. */
export const appRoutes: RouteObject[] = [
  { path: 'servers/new', element: <CreateServerPage /> },
  { path: 'notifications', element: <NotificationsPage /> },
  { path: 'users', element: <UsersPage /> },
  { path: 'api-access', element: <ApiAccessPage /> },
  { path: 'settings', element: <PanelSettingsPage /> },
  { path: 'admin', element: <Navigate to="/settings" replace /> },
  { path: 'audit', element: <AuditPage /> },
  { path: 'account', element: <AccountPage /> },
  { path: 'servers/import', element: <ImportServerPage /> },
  {
    path: 'servers/:serverId',
    element: <ServerLayout />,
    children: [
      { index: true, element: <OverviewTab /> },
      {
        path: 'console',
        element: (
          <Lazy>
            <ConsoleTab />
          </Lazy>
        ),
      },
      {
        path: 'content',
        element: (
          <Lazy>
            <ContentTab />
          </Lazy>
        ),
      },
      {
        path: 'files',
        element: (
          <Lazy>
            <FilesTab />
          </Lazy>
        ),
      },
      {
        path: 'backups',
        element: (
          <Lazy>
            <BackupsTab />
          </Lazy>
        ),
      },
      {
        path: 'schedules',
        element: (
          <Lazy>
            <SchedulesTab />
          </Lazy>
        ),
      },
      {
        path: 'players',
        element: (
          <Lazy>
            <PlayersTab />
          </Lazy>
        ),
      },
      {
        path: 'settings',
        element: (
          <Lazy>
            <SettingsTab />
          </Lazy>
        ),
      },
    ],
  },
];
