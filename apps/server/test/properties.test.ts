/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import {
  parseProperties,
  propertiesToMap,
  serialiseProperties,
  validateUpdates,
} from '../src/servers/properties-file.js';

const SAMPLE = [
  '#Minecraft server properties',
  '#Mon Oct 27 12:00:00 CET 2026',
  'motd=A Minecraft Server',
  'server-port=25565',
  'difficulty=easy',
  '',
  'level-seed=',
].join('\n');

describe('server.properties', () => {
  test('reads values and keeps comments when writing', () => {
    const lines = parseProperties(SAMPLE);
    expect(propertiesToMap(lines)).toMatchObject({
      motd: 'A Minecraft Server',
      difficulty: 'easy',
      'level-seed': '',
    });
    const text = serialiseProperties(lines, { difficulty: 'hard', pvp: 'false' });
    expect(text).toContain('#Minecraft server properties');
    expect(text).toContain('difficulty=hard');
    expect(text).toContain('pvp=false');
    expect(text.indexOf('difficulty=hard')).toBeLessThan(text.indexOf('pvp=false'));
    expect(text).not.toContain('\n\npvp');
    expect(text.endsWith('pvp=false\n')).toBe(true);
  });

  test('escapes special characters and umlauts so Java reads them back', () => {
    const text = serialiseProperties(parseProperties(''), { motd: 'Grüße: a=b \\ §aGrün' });
    expect(text).toContain('motd=Gr\\u00fc\\u00dfe\\: a\\=b \\\\ \\u00a7aGr\\u00fcn');
    expect(propertiesToMap(parseProperties(text)).motd).toBe('Grüße: a=b \\ §aGrün');
  });

  test.each<{ values: Record<string, string>; error: string }>([
    { values: { 'server-port': '25570' }, error: 'managed_property' },
    { values: { 'rcon.password': 'x' }, error: 'managed_property' },
    { values: { 'max-players': 'zehn' }, error: 'invalid_property' },
    { values: { difficulty: 'nightmare' }, error: 'invalid_property' },
    { values: { pvp: 'ja' }, error: 'invalid_property' },
    { values: { motd: 'eins\nzwei\ndrei' }, error: 'invalid_property' },
    { values: { 'level-name': 'eins\nzwei' }, error: 'invalid_property' },
  ])('rejects $values', ({ values, error }) => {
    expect(() => validateUpdates('java', values)).toThrow(error);
  });

  test('a two-line MOTD is stored with an escaped line break', () => {
    expect(() => validateUpdates('java', { motd: 'Oben\nUnten' })).not.toThrow();
    expect(serialiseProperties([], { motd: 'Oben\nUnten' })).toBe('motd=Oben\\u000aUnten\n');
  });

  test('accepts valid values and unknown keys from plugins', () => {
    expect(() =>
      validateUpdates('java', {
        'max-players': '30',
        difficulty: 'hard',
        pvp: 'true',
        'my-plugin-flag': 'on',
      }),
    ).not.toThrow();
  });
});
