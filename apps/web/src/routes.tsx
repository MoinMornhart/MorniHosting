import { lazy, Suspense, type ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import { Skeleton } from '@/components/ui/misc';
import { CreateServerPage } from '@/features/servers/create/CreateServerPage';
import { ImportServerPage } from '@/features/servers/create/ImportServerPage';
import { OverviewTab } from '@/features/servers/OverviewTab';
import { ServerLayout } from '@/features/servers/ServerLayout';

const ConsoleTab = lazy(() => import('@/features/servers/ConsoleTab'));
const FilesTab = lazy(() => import('@/features/servers/files/FilesTab'));
const PlayersTab = lazy(() => import('@/features/servers/players/PlayersTab'));
const SettingsTab = lazy(() => import('@/features/servers/settings/SettingsTab'));

function Lazy({ children }: { children: ReactElement }): ReactElement {
  return <Suspense fallback={<Skeleton className="h-96 rounded-[16px]" />}>{children}</Suspense>;
}

/** Feature pages inside the app shell. */
export const appRoutes: RouteObject[] = [
  { path: 'servers/new', element: <CreateServerPage /> },
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
        path: 'files',
        element: (
          <Lazy>
            <FilesTab />
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
