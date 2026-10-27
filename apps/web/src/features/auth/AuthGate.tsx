import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/misc';
import { SessionProvider, meQuery, statusQuery } from './session';

/** Sends visitors to setup or login as needed; everything inside knows who is signed in. */
export function AuthGate(): ReactElement {
  const location = useLocation();
  const status = useQuery(statusQuery);
  const me = useQuery(meQuery);
  if (status.isPending || me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }
  if (status.data?.setupRequired) return <Navigate to="/setup" replace />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <SessionProvider me={me.data}>
      <Outlet />
    </SessionProvider>
  );
}
