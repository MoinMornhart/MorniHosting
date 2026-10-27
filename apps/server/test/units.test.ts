/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import { compareMcVersions, javaTagFor, scheduleToCron, type ScheduleSpec } from '@mornihosting/shared';
import { decodePackets } from '../src/docker/rcon.js';
import { minecraftVersionForNeoForge } from '../src/servers/versions.js';
import { createSecretBox } from '../src/lib/crypto.js';

describe('versions', () => {
  test.each([
    { software: 'paper', version: '1.21.4', tag: 'java21' },
    { software: 'paper', version: '1.20.4', tag: 'java17' },
    { software: 'paper', version: '1.20.5', tag: 'java21' },
    { software: 'forge', version: '1.16.5', tag: 'java8' },
    { software: 'fabric', version: '1.18.2', tag: 'java17' },
    { software: 'paper', version: '26.3', tag: 'java25' },
    { software: 'velocity', version: '3.4.0', tag: 'java21' },
  ] as const)('$software $version needs $tag', ({ software, version, tag }) => {
    expect(javaTagFor(software, version)).toBe(tag);
  });

  test.each([
    { a: '1.21.4', b: '1.21.10', sign: -1 },
    { a: '26.1', b: '1.21.11', sign: 1 },
    { a: '1.20', b: '1.20.0', sign: 0 },
  ])('compare $a with $b', ({ a, b, sign }) => {
    expect(Math.sign(compareMcVersions(a, b))).toBe(sign);
  });

  test.each([
    { neo: '21.1.77', mc: '1.21.1' },
    { neo: '21.0.167', mc: '1.21' },
    { neo: '20.4.237', mc: '1.20.4' },
    { neo: '26.3.0.99', mc: '26.3' },
  ])('NeoForge $neo is for Minecraft $mc', ({ neo, mc }) => {
    expect(minecraftVersionForNeoForge(neo)).toBe(mc);
  });
});

describe('schedules', () => {
  test.each<{ spec: ScheduleSpec; cron: string }>([
    { spec: { kind: 'daily', time: '04:00' }, cron: '0 4 * * *' },
    { spec: { kind: 'interval', unit: 'minutes', every: 15 }, cron: '*/15 * * * *' },
    { spec: { kind: 'interval', unit: 'hours', every: 6 }, cron: '0 */6 * * *' },
    { spec: { kind: 'weekly', days: [5, 1, 1], time: '22:30' }, cron: '30 22 * * 1,5' },
    { spec: { kind: 'monthly', day: 1, time: '03:15' }, cron: '15 3 1 * *' },
  ])('$cron', ({ spec, cron }) => {
    expect(scheduleToCron(spec)).toBe(cron);
  });
});

describe('rcon framing', () => {
  test('splits complete packets and keeps the rest', () => {
    const packet = (id: number, body: string): Buffer => {
      const payload = Buffer.from(body);
      const buf = Buffer.alloc(14 + payload.length);
      buf.writeInt32LE(10 + payload.length, 0);
      buf.writeInt32LE(id, 4);
      buf.writeInt32LE(0, 8);
      payload.copy(buf, 12);
      return buf;
    };
    const both = Buffer.concat([packet(1, 'hello'), packet(2, 'world')]);
    const partial = both.subarray(0, both.length - 3);
    const first = decodePackets(partial);
    expect(first.packets.map((p) => p.body)).toEqual(['hello']);
    const second = decodePackets(Buffer.concat([first.rest, both.subarray(both.length - 3)]));
    expect(second.packets.map((p) => [p.id, p.body])).toEqual([[2, 'world']]);
  });
});

describe('secret box', () => {
  test('round trip and tamper detection', () => {
    const box = createSecretBox('a'.repeat(40));
    const sealed = box.encrypt('discord-webhook-url');
    expect(sealed).not.toContain('discord');
    expect(box.decrypt(sealed)).toBe('discord-webhook-url');
    expect(() => createSecretBox('b'.repeat(40)).decrypt(sealed)).toThrow();
  });
});
