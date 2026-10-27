import type { CrashInfo } from '@mornihosting/shared';
import { stripColours } from './log-parse.js';

/**
 * The crash helper: recognises typical failures in the last console lines and names
 * a rule the web app explains in plain words (crash.<ruleId>.title / .fix).
 */

export interface CrashContext {
  readonly lines: readonly string[];
  readonly oomKilled: boolean;
  readonly exitCode: number | null;
  readonly memoryMb: number;
  readonly javaTag: string | null;
}

interface CrashRule {
  readonly id: string;
  readonly detect: (ctx: CrashContext, text: string) => Record<string, string> | null;
}

const EXCERPT_LINES = 12;
/** Java class file version 52 is Java 8; each newer Java adds one. */
const CLASS_VERSION_JAVA8 = 52;
const JAVA8 = 8;

// Class version error: captures the needed class file version. "...compiled by a more recent version of the Java Runtime (class file version 65.0)..." → "65".
// https://regex101.com/?flavor=javascript&regex=class%20file%20version%20(%5Cd%2B)&flags=gm&testString=(class%20file%20version%2065.0)%2C%20this%20version%20only%20recognizes%20class%20file%20versions%20up%20to%2061.0%0Aclass%20file
const CLASS_VERSION = /class file version (\d+)/;
// Paper's Java check: captures the Java version it asks for. "You need Java 21 or newer" or "requires running the server with Java 21" → "21".
// https://regex101.com/?flavor=javascript&regex=(%3F%3Arequires%20running%20the%20server%20with%7Cneed%7Cuse)%20Java%20(%5Cd%2B)&flags=gim&testString=This%20version%20requires%20running%20the%20server%20with%20Java%2021%20or%20above%0AYou%20need%20Java%2021%20or%20newer%0AJava%20is%20fine
const NEEDS_JAVA = /(?:requires running the server with|need|use) Java (\d+)/i;
// Bukkit missing dependency: captures plugin file and missing names. "Could not load 'plugins/Shop.jar' in folder 'plugins'" + "Unknown/missing dependency plugins: [Vault]".
// https://regex101.com/?flavor=javascript&regex=Unknown%5C%2Fmissing%20dependency%20plugins%3A%20%5C%5B(%5B%5E%5C%5D%5D%2B)%5C%5D&flags=gm&testString=org.bukkit.plugin.UnknownDependencyException%3A%20Unknown%2Fmissing%20dependency%20plugins%3A%20%5BVault%5D.%20Please%20download%20and%20install%20these%20plugins%0Adependency
const BUKKIT_MISSING = /Unknown\/missing dependency plugins: \[([^\]]+)\]/;
// The plugin that failed to load: "Could not load 'plugins/Shop.jar' in folder 'plugins'" → "Shop.jar".
// https://regex101.com/?flavor=javascript&regex=Could%20not%20load%20'plugins%5C%2F(%5B%5E'%5D%2B)'&flags=gm&testString=Could%20not%20load%20'plugins%2FShop.jar'%20in%20folder%20'plugins'%0ACould%20not%20load
const BUKKIT_COULD_NOT_LOAD = /Could not load 'plugins\/([^']+)'/;
// Fabric/Quilt missing mod: captures mod and dependency. "Mod 'Sodium Extra' (sodium-extra) 0.5.4 requires any version of sodium, which is missing!" → ("Sodium Extra", "sodium").
// https://regex101.com/?flavor=javascript&regex=Mod%20'(%5B%5E'%5D%2B)'.*%3Frequires%20(%3F%3Aany%20version%20of%20%7Cversion%20%5CS%2B%20of%20)%3F(%5CS%2B)%2C%20which%20is%20missing&flags=gm&testString=Mod%20'Sodium%20Extra'%20(sodium-extra)%200.5.4%20requires%20any%20version%20of%20sodium%2C%20which%20is%20missing!%0AMod%20loaded
const FABRIC_MISSING = /Mod '([^']+)'.*?requires (?:any version of |version \S+ of )?(\S+), which is missing/;
// Forge/NeoForge missing mod: "Missing or unsupported mandatory dependencies:" matches; "dependencies resolved" does not.
// https://regex101.com/?flavor=javascript&regex=Missing%20or%20unsupported%20mandatory%20dependencies&flags=gm&testString=Missing%20or%20unsupported%20mandatory%20dependencies%3A%0Adependencies%20resolved
const FORGE_MISSING = /Missing or unsupported mandatory dependencies/;
// A plugin that threw while starting: "Error occurred while enabling Essentials v2.21.0 (Is it up to date?)" → "Essentials".
// https://regex101.com/?flavor=javascript&regex=Error%20occurred%20while%20enabling%20(%5CS%2B)&flags=gm&testString=Error%20occurred%20while%20enabling%20Essentials%20v2.21.0%20(Is%20it%20up%20to%20date%3F)%0AEnabling%20Essentials
const PLUGIN_ENABLE_ERROR = /Error occurred while enabling (\S+)/;
// Port taken: matches "**** FAILED TO BIND TO PORT!" and "java.net.BindException: Address already in use"; rejects "Starting Minecraft server on *:25565".
// https://regex101.com/?flavor=javascript&regex=FAILED%20TO%20BIND%20TO%20PORT%7CAddress%20already%20in%20use&flags=gm&testString=****%20FAILED%20TO%20BIND%20TO%20PORT!%0Ajava.net.BindException%3A%20Address%20already%20in%20use%0AStarting%20Minecraft%20server%20on%20*%3A25565
const PORT_IN_USE = /FAILED TO BIND TO PORT|Address already in use/;
// Out of memory inside Java: "java.lang.OutOfMemoryError: Java heap space" matches; "Memory: 2 GB" does not.
// https://regex101.com/?flavor=javascript&regex=OutOfMemoryError&flags=gm&testString=java.lang.OutOfMemoryError%3A%20Java%20heap%20space%0AMemory%3A%202%20GB
const OUT_OF_MEMORY = /OutOfMemoryError/;
// EULA not accepted: "You need to agree to the EULA in order to run the server" matches.
// https://regex101.com/?flavor=javascript&regex=agree%20to%20the%20EULA&flags=gim&testString=You%20need%20to%20agree%20to%20the%20EULA%20in%20order%20to%20run%20the%20server.%0AEULA%20accepted
const EULA = /agree to the EULA/i;
// Broken world files: "Failed to load level" or "Exception reading /data/world/level.dat" match; "Preparing level" does not.
// https://regex101.com/?flavor=javascript&regex=Failed%20to%20load%20level%7CException%20reading%20.*level%5C.dat%7CCorrupted%20chunk&flags=gm&testString=Failed%20to%20load%20level%0AException%20reading%20%2Fdata%2Fworld%2Flevel.dat%0APreparing%20level
const WORLD_BROKEN = /Failed to load level|Exception reading .*level\.dat|Corrupted chunk/;
// Mods for another game version: "requires minecraft 1.20.1" or "Incompatible mod set!" match.
// https://regex101.com/?flavor=javascript&regex=Incompatible%20mods%3F%20(%3Fset%7Cfound)%7Crequires%20(%3F%3Aversion%20%5CS%2B%20of%20)%3Fminecraft&flags=gim&testString=Incompatible%20mod%20set!%0AMod%20x%20requires%20version%201.20.1%20of%20minecraft%0Aminecraft%20started
const MOD_VERSION_MISMATCH = /Incompatible mods? (?:set|found)|requires (?:version \S+ of )?minecraft/i;
// Version download failed: "Could not find a version matching" or "No release found for version" match.
// https://regex101.com/?flavor=javascript&regex=Could%20not%20find%20a%20version%7CNo%20(%3F%3Arelease%7Cbuild)s%3F%20found%20for%7Cinvalid%20version&flags=gim&testString=Could%20not%20find%20a%20version%20matching%201.99%0ANo%20builds%20found%20for%20version%201.99%0AVersion%20ok
const VERSION_NOT_FOUND = /Could not find a version|No (?:release|build)s? found for|invalid version/i;

// Game files could not be downloaded: "[init] [ERROR] Failed to download paper", "UnknownHostException: fill.papermc.io" match; "Downloaded paper" does not.
// https://regex101.com/?flavor=javascript&regex=Failed%20to%20download%7CUnknownHostException%7Ccertification%20path%7CConnection%20timed%20out&flags=gm&testString=%5Binit%5D%20%5BERROR%5D%20Failed%20to%20download%20paper%0Ajava.net.UnknownHostException%3A%20fill.papermc.io%0ADownloaded%20paper
const DOWNLOAD_FAILED = /Failed to download|UnknownHostException|certification path|Connection timed out/;

function javaFromClassVersion(classVersion: number): string {
  return String(classVersion - CLASS_VERSION_JAVA8 + JAVA8);
}

const RULES: readonly CrashRule[] = [
  {
    id: 'out-of-memory',
    detect: (ctx, text) =>
      ctx.oomKilled || OUT_OF_MEMORY.test(text) ? { memoryMb: String(ctx.memoryMb) } : null,
  },
  {
    id: 'wrong-java',
    detect: (_ctx, text) => {
      const classVersion = text.match(CLASS_VERSION);
      if (classVersion?.[1]) return { java: javaFromClassVersion(Number(classVersion[1])) };
      const needs = text.match(NEEDS_JAVA);
      return needs?.[1] ? { java: needs[1] } : null;
    },
  },
  {
    id: 'missing-dependency',
    detect: (_ctx, text) => {
      const bukkit = text.match(BUKKIT_MISSING);
      if (bukkit?.[1]) return { dependency: bukkit[1], plugin: text.match(BUKKIT_COULD_NOT_LOAD)?.[1] ?? '' };
      const fabric = text.match(FABRIC_MISSING);
      if (fabric?.[1] && fabric[2]) return { plugin: fabric[1], dependency: fabric[2] };
      return FORGE_MISSING.test(text) ? { plugin: '', dependency: '' } : null;
    },
  },
  { id: 'port-in-use', detect: (_ctx, text) => (PORT_IN_USE.test(text) ? {} : null) },
  { id: 'eula', detect: (_ctx, text) => (EULA.test(text) ? {} : null) },
  { id: 'version-not-found', detect: (_ctx, text) => (VERSION_NOT_FOUND.test(text) ? {} : null) },
  { id: 'download-failed', detect: (_ctx, text) => (DOWNLOAD_FAILED.test(text) ? {} : null) },
  { id: 'mod-version-mismatch', detect: (_ctx, text) => (MOD_VERSION_MISMATCH.test(text) ? {} : null) },
  { id: 'world-broken', detect: (_ctx, text) => (WORLD_BROKEN.test(text) ? {} : null) },
  {
    id: 'plugin-error',
    detect: (_ctx, text) => {
      const m = text.match(PLUGIN_ENABLE_ERROR);
      return m?.[1] ? { plugin: m[1] } : null;
    },
  },
];

/** Picks the first rule that explains the crash, or "unknown" with the last lines as a hint. */
export function analyseCrash(ctx: CrashContext): CrashInfo {
  const lines = ctx.lines.map(stripColours);
  const text = lines.join('\n');
  const hit = RULES.map((rule) => [rule.id, rule.detect(ctx, text)] as const).find(
    ([, params]) => params !== null,
  );
  return {
    at: new Date().toISOString(),
    ruleId: hit?.[0] ?? 'unknown',
    params: hit?.[1] ?? { exitCode: String(ctx.exitCode ?? '') },
    excerpt: lines.slice(-EXCERPT_LINES),
  };
}
