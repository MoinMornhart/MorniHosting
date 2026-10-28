import type { InstalledContent, MarketSource } from '@mornihosting/shared';

/** Display names of the marketplaces; brand names stay the same in every language. */
export const SOURCE_LABELS: Readonly<Record<InstalledContent['source'], string>> = {
  modrinth: 'Modrinth',
  hangar: 'Hangar',
  spiget: 'SpigotMC',
  curseforge: 'CurseForge',
  geysermc: 'GeyserMC',
  upload: '',
};

export const SOURCE_ORDER: readonly MarketSource[] = ['modrinth', 'hangar', 'spiget', 'curseforge'];
