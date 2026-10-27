/* eslint-disable ts-patterns/no-magic-numbers -- tests compare against literal expected values */
import { describe, expect, test } from 'vitest';
import { analyseCrash } from '../src/servers/crash.js';

const base = { oomKilled: false, exitCode: 1, memoryMb: 2048, javaTag: 'java21' };

describe('crash helper', () => {
  test.each([
    { lines: ['java.lang.OutOfMemoryError: Java heap space'], rule: 'out-of-memory' },
    {
      lines: [
        'Unsupported class file major version: (class file version 65.0), this version only recognizes up to 61.0',
      ],
      rule: 'wrong-java',
      params: { java: '21' },
    },
    {
      lines: [
        "Could not load 'plugins/Shop.jar' in folder 'plugins'",
        'org.bukkit.plugin.UnknownDependencyException: Unknown/missing dependency plugins: [Vault]. Please download and install these plugins',
      ],
      rule: 'missing-dependency',
      params: { plugin: 'Shop.jar', dependency: 'Vault' },
    },
    {
      lines: ["Mod 'Sodium Extra' (sodium-extra) 0.5.4 requires any version of sodium, which is missing!"],
      rule: 'missing-dependency',
      params: { plugin: 'Sodium Extra', dependency: 'sodium' },
    },
    { lines: ['**** FAILED TO BIND TO PORT!'], rule: 'port-in-use' },
    { lines: ['You need to agree to the EULA in order to run the server.'], rule: 'eula' },
    { lines: ['[init] [ERROR] Failed to download paper'], rule: 'download-failed' },
    { lines: ['Failed to load level'], rule: 'world-broken' },
    {
      lines: ['Error occurred while enabling Essentials v2.21.0 (Is it up to date?)'],
      rule: 'plugin-error',
      params: { plugin: 'Essentials' },
    },
    { lines: ['something unusual happened'], rule: 'unknown' },
  ])('$rule', ({ lines, rule, params }) => {
    const crash = analyseCrash({ ...base, lines });
    expect(crash.ruleId).toBe(rule);
    if (params) expect(crash.params).toMatchObject(params);
  });

  test('a container killed for memory counts as out of memory even without a Java error', () => {
    expect(analyseCrash({ ...base, oomKilled: true, lines: ['Killed'] }).ruleId).toBe('out-of-memory');
  });
});
