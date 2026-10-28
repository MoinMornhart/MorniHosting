import { eq } from 'drizzle-orm';
import type { Locale, PanelSettings } from '@mornihosting/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { settings } from '../db/schema.js';
import type { SecretBox } from '../lib/crypto.js';

export interface StoredSettings {
  panelDomain: string;
  publicAddress: string;
  lanIp: string;
  publicIpLookup: boolean;
  reachabilityCheck: boolean;
  curseforgeApiKey: string;
  timezone: string;
  defaultLocale: Locale;
  checkUpdates: boolean;
}

export interface SettingsService {
  readonly get: () => StoredSettings;
  readonly update: (patch: Partial<StoredSettings>) => StoredSettings;
  readonly publicView: () => PanelSettings;
  readonly curseforgeKey: () => string | null;
  readonly getValue: <TValue>(key: string) => TValue | undefined;
  readonly setValue: (key: string, value: unknown) => void;
}

const SETTINGS_KEY = 'panel';
const ENCRYPTED_FIELDS: readonly (keyof StoredSettings)[] = ['curseforgeApiKey'];

export function createSettingsService(db: Db, config: Config, secrets: SecretBox): SettingsService {
  const defaults: StoredSettings = {
    panelDomain: '',
    publicAddress: config.publicAddress ?? '',
    lanIp: config.lanIp ?? '',
    publicIpLookup: true,
    reachabilityCheck: true,
    curseforgeApiKey: '',
    timezone: config.timezone,
    defaultLocale: 'de',
    checkUpdates: true,
  };

  const getValue = <TValue>(key: string): TValue | undefined => {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    // Values are written only through setValue below, so the stored shape is the one the caller asks for.
    return row?.value as TValue | undefined;
  };
  const setValue = (key: string, value: unknown): void => {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  };

  const get = (): StoredSettings => ({
    ...defaults,
    ...(getValue<Partial<StoredSettings>>(SETTINGS_KEY) ?? {}),
  });

  const update = (patch: Partial<StoredSettings>): StoredSettings => {
    const sealed = Object.fromEntries(
      Object.entries(patch)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [
          key,
          ENCRYPTED_FIELDS.includes(key as keyof StoredSettings) && typeof value === 'string' && value
            ? secrets.encrypt(value)
            : value,
        ]),
    );
    setValue(SETTINGS_KEY, { ...(getValue<Partial<StoredSettings>>(SETTINGS_KEY) ?? {}), ...sealed });
    return get();
  };

  const curseforgeKey = (): string | null => {
    const sealed = get().curseforgeApiKey;
    return sealed ? secrets.decrypt(sealed) : null;
  };

  const publicView = (): PanelSettings => {
    const s = get();
    return {
      panelDomain: s.panelDomain,
      publicAddress: s.publicAddress,
      lanIp: s.lanIp,
      publicIpLookup: s.publicIpLookup,
      reachabilityCheck: s.reachabilityCheck,
      curseforgeConfigured: Boolean(s.curseforgeApiKey),
      timezone: s.timezone,
      defaultLocale: s.defaultLocale,
      checkUpdates: s.checkUpdates,
    };
  };

  return { get, update, publicView, curseforgeKey, getValue, setValue };
}
