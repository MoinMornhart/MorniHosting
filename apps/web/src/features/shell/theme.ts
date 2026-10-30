import { useSyncExternalStore } from 'react';
import type { Theme } from '@mornihosting/shared';

const media = window.matchMedia('(prefers-color-scheme: dark)');
const state: { theme: Theme } = { theme: 'dark' };

/** A page shown inside an app (the demo in Claude) may get the app's own choice as data-theme on <html>. */
function hostTheme(): 'dark' | 'light' | null {
  const own = document.documentElement.dataset['theme'];
  return own === 'dark' || own === 'light' ? own : null;
}

function resolve(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') return hostTheme() ?? (media.matches ? 'dark' : 'light');
  return theme;
}

function paint(): void {
  const mode = resolve(state.theme);
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? '#0e1512' : '#f2f6f4');
}

media.addEventListener('change', () => {
  if (state.theme === 'system') paint();
});
new MutationObserver(() => {
  if (state.theme === 'system') paint();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

export function applyTheme(theme: Theme): void {
  state.theme = theme;
  try {
    localStorage.setItem('mh-theme', theme);
  } catch {
    // Without storage the theme still applies for this visit.
  }
  paint();
}

export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem('mh-theme');
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    // Fall through to the default.
  }
  // The demo follows the app it is shown in; the panel starts dark.
  return import.meta.env.MODE === 'demo' ? 'system' : 'dark';
}

const themeListeners = new Set<() => void>();
new MutationObserver(() => themeListeners.forEach((l) => l())).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});

/** The theme actually shown right now ("system" resolved), for widgets that style themselves. */
export function useResolvedTheme(): 'dark' | 'light' {
  return useSyncExternalStore(
    (listener) => {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  );
}
