/** Commands offered by Tab completion in the console. Player names are added from the live list. */

export const JAVA_COMMANDS: readonly string[] = [
  'help',
  'list',
  'say ',
  'tell ',
  'msg ',
  'me ',
  'op ',
  'deop ',
  'kick ',
  'ban ',
  'ban-ip ',
  'pardon ',
  'pardon-ip ',
  'whitelist add ',
  'whitelist remove ',
  'whitelist on',
  'whitelist off',
  'whitelist list',
  'whitelist reload',
  'gamemode survival ',
  'gamemode creative ',
  'gamemode adventure ',
  'gamemode spectator ',
  'defaultgamemode ',
  'difficulty peaceful',
  'difficulty easy',
  'difficulty normal',
  'difficulty hard',
  'time set day',
  'time set night',
  'time set noon',
  'time set midnight',
  'time add ',
  'weather clear',
  'weather rain',
  'weather thunder',
  'tp ',
  'teleport ',
  'give ',
  'clear ',
  'kill ',
  'effect give ',
  'effect clear ',
  'enchant ',
  'xp add ',
  'experience add ',
  'gamerule keepInventory true',
  'gamerule keepInventory false',
  'gamerule doDaylightCycle ',
  'gamerule doWeatherCycle ',
  'gamerule doMobSpawning ',
  'gamerule playersSleepingPercentage ',
  'gamerule mobGriefing ',
  'gamerule doFireTick ',
  'locate structure ',
  'locate biome ',
  'setworldspawn',
  'spawnpoint ',
  'worldborder set ',
  'worldborder center ',
  'seed',
  'save-all',
  'save-on',
  'save-off',
  'title @a title ',
  'playsound ',
  'summon ',
  'plugins',
  'version',
  'tps',
  'mspt',
  'stop',
];

export const BEDROCK_COMMANDS: readonly string[] = [
  'help',
  'list',
  'say ',
  'tell ',
  'op ',
  'deop ',
  'kick ',
  'allowlist add ',
  'allowlist remove ',
  'allowlist on',
  'allowlist off',
  'allowlist list',
  'gamemode survival ',
  'gamemode creative ',
  'gamemode adventure ',
  'difficulty peaceful',
  'difficulty easy',
  'difficulty normal',
  'difficulty hard',
  'time set day',
  'time set night',
  'weather clear',
  'weather rain',
  'tp ',
  'give ',
  'gamerule keepinventory true',
  'gamerule keepinventory false',
  'setworldspawn',
  'stop',
];

const PLAYER_COMMANDS: readonly string[] = [
  'op',
  'deop',
  'kick',
  'ban',
  'pardon',
  'tp',
  'tell',
  'msg',
  'give',
  'kill',
  'clear',
  'gamemode',
];

/** Completions for what the user has typed so far, shortest first. */
export function completions(
  input: string,
  commands: readonly string[],
  players: readonly string[],
): string[] {
  const lower = input.toLowerCase();
  const parts = input.split(' ');
  const last = parts[parts.length - 1] ?? '';
  const base = parts.slice(0, -1).join(' ');
  const wantsPlayer =
    parts.length > 1 &&
    PLAYER_COMMANDS.some((c) => parts[0]?.toLowerCase() === c || base.toLowerCase().endsWith(c));
  const playerHits = wantsPlayer
    ? players
        .filter((p) => p.toLowerCase().startsWith(last.toLowerCase()))
        .map((p) => `${base} ${p}`.trimStart())
    : [];
  const commandHits = commands.filter((c) => c.toLowerCase().startsWith(lower) && c.toLowerCase() !== lower);
  return [...playerHits, ...commandHits].sort((a, b) => a.length - b.length);
}
