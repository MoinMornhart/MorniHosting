import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Like React.lazy, but after a panel update the old page chunks are gone: then the page reloads once
 * to fetch the new version instead of showing an error. A second failure in a row is a real error.
 */

const RELOAD_KEY = 'mh-chunk-reload';
const RELOAD_WINDOW_MS = 30_000;

function reloadedJustNow(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    return true;
  }
}

function markReload(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage we cannot tell a loop from a one-off; the reload still helps once.
  }
}

export function lazyPage<TProps extends object>(
  load: () => Promise<{ default: ComponentType<TProps> }>,
): LazyExoticComponent<ComponentType<TProps>> {
  return lazy(async () => {
    try {
      return await load();
    } catch (err) {
      if (reloadedJustNow()) throw err;
      markReload();
      window.location.reload();
      // Keep showing the loading state until the reload takes over.
      return new Promise<never>(() => undefined);
    }
  });
}
