import fs from 'node:fs';
import path from 'node:path';
import {
  MANAGED_PROPERTY_KEYS,
  PROPERTY_FIELDS,
  type Edition,
  type PropertyField,
} from '@mornihosting/shared';
import { badRequest } from '../lib/errors.js';

/**
 * Reads and writes server.properties without losing comments or order.
 * Values are Java properties: "\:" and "\=" are escaped, non-ASCII becomes "\uXXXX".
 */

type Line =
  | { readonly kind: 'raw'; readonly text: string }
  | { readonly kind: 'pair'; readonly key: string; readonly value: string };

const HEX = 16;
const UNICODE_ESCAPE_LENGTH = 4;
const MAX_ASCII = 0x7e;
const MIN_PRINTABLE = 0x20;
const COMMENT_MARKS: readonly string[] = ['#', '!'];

// Java properties escapes: "§" → "§", "\:" → ":", "\\" → "\".
// https://regex101.com/?flavor=javascript&regex=%5C%5C(u%5B0-9a-fA-F%5D%7B4%7D%7C.)&flags=g&testString=%5Cu00a7aHallo%5C%3Awelt%5C%5Cx
const ESCAPE = /\\(u[0-9a-fA-F]{4}|.)/g;
// The first unescaped "=" or ":" splits key and value: "motd=A\:B" → ("motd", "A\:B"); "server-port" has no value.
// https://regex101.com/?flavor=javascript&regex=%5E((%3F%3A%5C%5C.%7C%5B%5E%3D%3A%5Cs%5C%5C%5D)*)%5Cs*%5B%3D%3A%5D%3F%5Cs*(.*)%24&flags=gm&testString=motd%3DA%5C%3AB%0Aserver-port%0Alevel-name%20%3A%20world
const PAIR = /^((?:\\.|[^=:\s\\])*)\s*[=:]?\s*(.*)$/;

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = { t: '\t', n: '\n', r: '\r', f: '\f' };

function unescape(text: string): string {
  return text.replace(ESCAPE, (_m, code: string) => {
    if (code.length > 1) return String.fromCharCode(Number.parseInt(code.slice(1), HEX));
    return SIMPLE_ESCAPES[code] ?? code;
  });
}

function escapeChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (ch === '\\') return '\\\\';
  if (ch === ':' || ch === '=') return `\\${ch}`;
  if (code < MIN_PRINTABLE || code > MAX_ASCII)
    return `\\u${code.toString(HEX).padStart(UNICODE_ESCAPE_LENGTH, '0')}`;
  return ch;
}

// Line break, Unix or Windows style: matches "\n" and "\r\n", not a lone "\r".
// https://regex101.com/?regex=%5Cr%3F%5Cn&testString=a%5Cr%5Cnb%5Cnc
const LINE_BREAK = /\r?\n/;

function escapeValue(value: string): string {
  return [...value].map(escapeChar).join('');
}

export function parseProperties(text: string): Line[] {
  if (!text.trim()) return [];
  return text.split(LINE_BREAK).map((raw): Line => {
    const trimmed = raw.trimStart();
    if (!trimmed || COMMENT_MARKS.some((m) => trimmed.startsWith(m))) return { kind: 'raw', text: raw };
    const m = trimmed.match(PAIR);
    return m
      ? { kind: 'pair', key: unescape(m[1] ?? ''), value: unescape(m[2] ?? '') }
      : { kind: 'raw', text: raw };
  });
}

export function propertiesToMap(lines: readonly Line[]): Record<string, string> {
  return Object.fromEntries(lines.flatMap((l) => (l.kind === 'pair' ? [[l.key, l.value]] : [])));
}

export function serialiseProperties(
  lines: readonly Line[],
  updates: Readonly<Record<string, string>>,
): string {
  const seen = new Set<string>();
  const updated = lines.map((l) => {
    if (l.kind !== 'pair') return l.text;
    seen.add(l.key);
    const value = l.key in updates ? (updates[l.key] ?? '') : l.value;
    return `${l.key}=${escapeValue(value)}`;
  });
  const added = Object.entries(updates)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => `${key}=${escapeValue(value)}`);
  const lastUsed = updated.findLastIndex((text) => text.trim() !== '');
  return `${[...updated.slice(0, lastUsed + 1), ...added].join('\n')}\n`;
}

const VALIDATORS: Readonly<Record<PropertyField['type'], (field: PropertyField, value: string) => boolean>> =
  {
    string: () => true,
    motd: () => true,
    bool: (_f, v) => v === 'true' || v === 'false',
    enum: (f, v) => (f.options ?? []).includes(v),
    int: (f, v) => {
      const n = Number(v);
      return (
        Number.isInteger(n) && (f.min === undefined || n >= f.min) && (f.max === undefined || n <= f.max)
      );
    },
  };

const MAX_VALUE_LENGTH = 512;
/** The server list shows two MOTD lines. */
const MOTD_MAX_LINES = 2;

/** Checks every change against the known fields; unknown keys pass as plain text, panel-managed keys never. */
export function validateUpdates(edition: Edition, updates: Readonly<Record<string, string>>): void {
  Object.entries(updates).forEach(([key, value]) => {
    if (MANAGED_PROPERTY_KEYS.includes(key)) throw badRequest('managed_property', { key });
    const field = PROPERTY_FIELDS.find((f) => f.key === key && f.editions.includes(edition));
    const maxLines = field?.type === 'motd' ? MOTD_MAX_LINES : 1;
    if (value.length > MAX_VALUE_LENGTH || value.split('\n').length > maxLines)
      throw badRequest('invalid_property', { key });
    if (field && !VALIDATORS[field.type](field, value)) throw badRequest('invalid_property', { key });
  });
}

/** Minecraft writes ASCII with \u escapes, other tools sometimes raw UTF-8; read whichever it is. */
function decode(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return bytes.toString('latin1');
  }
}

function propertiesPath(serverDir: string): string {
  return path.join(serverDir, 'server.properties');
}

export function readPropertiesFile(serverDir: string): { lines: Line[]; values: Record<string, string> } {
  const file = propertiesPath(serverDir);
  const text = fs.existsSync(file) ? decode(fs.readFileSync(file)) : '';
  const lines = parseProperties(text);
  return { lines, values: propertiesToMap(lines) };
}

export function writePropertiesFile(
  serverDir: string,
  updates: Readonly<Record<string, string>>,
): Record<string, string> {
  const { lines } = readPropertiesFile(serverDir);
  const text = serialiseProperties(lines, updates);
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(propertiesPath(serverDir), text, 'ascii');
  return propertiesToMap(parseProperties(text));
}
