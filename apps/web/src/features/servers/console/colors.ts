/** Turns Minecraft colour codes (§a) and log levels into ANSI colours for the terminal. */

const SECTION = '§';
const ESC = '\u001b[';
const RESET = `${ESC}0m`;

const SECTION_CODES: Readonly<Record<string, string>> = {
  '0': '30',
  '1': '34',
  '2': '32',
  '3': '36',
  '4': '31',
  '5': '35',
  '6': '33',
  '7': '37',
  '8': '90',
  '9': '94',
  a: '92',
  b: '96',
  c: '91',
  d: '95',
  e: '93',
  f: '97',
  l: '1',
  m: '9',
  n: '4',
  o: '3',
  r: '0',
};

// A section sign and one code character: "§aHi" → code "a"; "§" alone does not match.
// https://regex101.com/?flavor=javascript&regex=%C2%A7(%5B0-9a-fk-or%5D)&flags=gi&testString=%C2%A7aHi%C2%A7rthere%0A%C2%A7
const SECTION_PATTERN = /§([0-9a-fk-or])/gi;
// A log prefix such as "[23:48:02 INFO]:" or "[12:00:01] [Server thread/WARN]:" at the start of a line.
// https://regex101.com/?flavor=javascript&regex=%5E(%5C%5B%5B%5E%5C%5D%5D*%5C%5D(%3F%3A%20%5C%5B%5B%5E%5C%5D%5D*%5C%5D)%3F%3A%3F)&flags=gm&testString=%5B23%3A48%3A02%20INFO%5D%3A%20Done%0A%5B12%3A00%3A01%5D%20%5BServer%20thread%2FWARN%5D%3A%20Can%27t%20keep%20up%0Aplain%20line
const PREFIX = /^(\[[^\]]*\](?: \[[^\]]*\])?:?)/;
// Warning and error lines: "[Server thread/WARN]" or "SEVERE" or "ERROR" match; "Werror" does not.
// https://regex101.com/?flavor=javascript&regex=%5Cb(WARN%7CWARNING)%5Cb&flags=gm&testString=%5BServer%20thread%2FWARN%5D%3A%20slow%0Ano%20warnings
const WARN = /\b(WARN|WARNING)\b/;
// Error lines: "[Server thread/ERROR]: boom", "java.lang.IllegalStateException" and stack lines "\tat x.y" match; "fine" does not.
// https://regex101.com/?flavor=javascript&regex=%5Cb(ERROR%7CSEVERE%7CFATAL)%5Cb%7CException%5Cb%7C%5E%5Cs%2Bat%20&flags=gm&testString=%5BServer%20thread%2FERROR%5D%3A%20boom%0Ajava.lang.IllegalStateException%0A%09at%20x.y%0Afine
const ERROR = /\b(ERROR|SEVERE|FATAL)\b|Exception\b|^\s+at /;
// Join and leave messages: "Lena joined the game" and "Lena left the game" match.
// https://regex101.com/?flavor=javascript&regex=(joined%7Cleft)%20the%20game%24&flags=gm&testString=Lena%20joined%20the%20game%0ALena%20left%20the%20game%0Agame
const JOIN_LEAVE = /(joined|left) the game$/;

function sectionToAnsi(line: string): string {
  if (!line.includes(SECTION)) return line;
  return (
    line.replace(
      SECTION_PATTERN,
      (_m, code: string) => `${ESC}${SECTION_CODES[code.toLowerCase()] ?? '0'}m`,
    ) + RESET
  );
}

const LINE_COLOURS: readonly (readonly [RegExp, string])[] = [
  [ERROR, '91'],
  [WARN, '93'],
  [JOIN_LEAVE, '92'],
];

export function colourLine(raw: string): string {
  if (raw.includes(ESC)) return sectionToAnsi(raw);
  const line = sectionToAnsi(raw);
  const colour = LINE_COLOURS.find(([pattern]) => pattern.test(raw))?.[1];
  const prefix = line.match(PREFIX)?.[1];
  const dimmed = prefix ? `${ESC}90m${prefix}${RESET}${line.slice(prefix.length)}` : line;
  return colour ? `${ESC}${colour}m${raw}${RESET}` : dimmed;
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- ANSI escapes start with the ESC control character
  return text.replace(/\u001b\[[0-9;]*m|§[0-9a-fk-or]/gi, ''); // eslint-disable-line ts-patterns/require-regex-example -- removes colour codes: "\u001b[92mHi" → "Hi"
}
