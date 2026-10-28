import { useQuery } from '@tanstack/react-query';
import type { NetbirdStatus } from '@mornihosting/shared';
import { api } from '@/lib/api';
import { useSession } from '@/features/auth/session';

export const netbirdStatusQuery = {
  queryKey: ['netbird'],
  queryFn: () => api<NetbirdStatus>('/api/netbird'),
} as const;

const NAME_MAX = 40;
const FALLBACK_NAME = 'minecraft';
const UMLAUTS: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
// German umlauts and ß, written out before the rest is cleaned: "Bärenhöhle" → "baerenhoehle".
// https://regex101.com/?flavor=javascript&regex=%5B%C3%A4%C3%B6%C3%BC%C3%9F%5D&flags=g&testString=b%C3%A4renh%C3%B6hle%20stra%C3%9Fe
const UMLAUT = /[äöüß]/g;
// Everything that is not a letter or digit becomes a dash: "survival mit freunden!" → "survival-mit-freunden-".
// https://regex101.com/?flavor=javascript&regex=%5B%5Ea-z0-9%5D%2B&flags=g&testString=survival%20mit%20freunden!
const NOT_NAME = /[^a-z0-9]+/g;
// Dashes at the start or end: "-survival-" loses both, "sur-vival" keeps its dash.
// https://regex101.com/?flavor=javascript&regex=%5E-%2B%7C-%2B%24&flags=g&testString=-survival-%0Asur-vival
const EDGE_DASHES = /^-+|-+$/g;

/** A server name as an address part: "Survival mit Freunden!" → "survival-mit-freunden". */
export function toNetbirdName(text: string, fallback = FALLBACK_NAME): string {
  const name = text
    .toLowerCase()
    .replace(UMLAUT, (c) => UMLAUTS[c] ?? '')
    .replace(NOT_NAME, '-')
    .slice(0, NAME_MAX)
    .replace(EDGE_DASHES, '');
  return name || fallback;
}

/** NetBird automation as far as this user may use it: set up and an admin, otherwise null. */
export function useNetbird(): NetbirdStatus | null {
  const { me } = useSession();
  const { data } = useQuery({ ...netbirdStatusQuery, enabled: me.user.isAdmin });
  return me.user.isAdmin && data?.configured ? data : null;
}
