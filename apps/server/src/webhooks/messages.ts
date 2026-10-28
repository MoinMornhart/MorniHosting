import type { Locale, WebhookEvent, WebhookKind } from '@mornihosting/shared';

/** What a webhook says, in the panel's language, and how each chat service wants it packed. */

export interface Message {
  readonly event: WebhookEvent | 'test';
  readonly serverId: string | null;
  readonly serverName: string;
  readonly title: string;
  readonly text: string;
  readonly colour: number;
  readonly data: Readonly<Record<string, unknown>>;
}

const GREEN = 0x10b981;
const GREY = 0x64748b;
const RED = 0xef4444;
const BLUE = 0x3b82f6;
const AMBER = 0xf59e0b;
const HEX = 16;
const COLOUR_DIGITS = 6;

type Texts = Readonly<
  Record<
    WebhookEvent | 'test',
    { title: string; text: (v: Record<string, string>) => string; colour: number }
  >
>;

const TEXTS: Readonly<Record<Locale, Texts>> = {
  de: {
    'server.started': {
      title: '🟢 Server gestartet',
      text: (v) => `**${v.server}** ist online.`,
      colour: GREEN,
    },
    'server.stopped': {
      title: '⚪ Server gestoppt',
      text: (v) => `**${v.server}** wurde gestoppt.`,
      colour: GREY,
    },
    'server.crashed': {
      title: '🔴 Server abgestürzt',
      text: (v) => `**${v.server}** ist abgestürzt. Grund laut Absturz-Helfer: ${v.reason}.`,
      colour: RED,
    },
    'backup.done': {
      title: '💾 Backup fertig',
      text: (v) => `Backup von **${v.server}** erstellt (${v.size}).`,
      colour: BLUE,
    },
    'backup.failed': {
      title: '⚠️ Backup fehlgeschlagen',
      text: (v) => `Das Backup von **${v.server}** hat nicht geklappt: ${v.error}`,
      colour: AMBER,
    },
    'player.joined': {
      title: '👋 Spieler beigetreten',
      text: (v) => `**${v.player}** spielt jetzt auf **${v.server}**.`,
      colour: GREEN,
    },
    'player.left': {
      title: '🚪 Spieler gegangen',
      text: (v) => `**${v.player}** hat **${v.server}** verlassen.`,
      colour: GREY,
    },
    test: {
      title: '✅ Test von MorniHosting',
      text: () => 'Wenn du das liest, kommen die Benachrichtigungen an.',
      colour: GREEN,
    },
  },
  en: {
    'server.started': {
      title: '🟢 Server started',
      text: (v) => `**${v.server}** is online.`,
      colour: GREEN,
    },
    'server.stopped': {
      title: '⚪ Server stopped',
      text: (v) => `**${v.server}** was stopped.`,
      colour: GREY,
    },
    'server.crashed': {
      title: '🔴 Server crashed',
      text: (v) => `**${v.server}** crashed. Reason according to the crash helper: ${v.reason}.`,
      colour: RED,
    },
    'backup.done': {
      title: '💾 Backup done',
      text: (v) => `Backup of **${v.server}** created (${v.size}).`,
      colour: BLUE,
    },
    'backup.failed': {
      title: '⚠️ Backup failed',
      text: (v) => `The backup of **${v.server}** did not work: ${v.error}`,
      colour: AMBER,
    },
    'player.joined': {
      title: '👋 Player joined',
      text: (v) => `**${v.player}** is now playing on **${v.server}**.`,
      colour: GREEN,
    },
    'player.left': {
      title: '🚪 Player left',
      text: (v) => `**${v.player}** left **${v.server}**.`,
      colour: GREY,
    },
    test: {
      title: '✅ Test from MorniHosting',
      text: () => 'If you can read this, notifications arrive.',
      colour: GREEN,
    },
  },
};

/** Short names for the crash helper's rules, used in the crash message. */
export const CRASH_REASONS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  de: {
    'out-of-memory': 'zu wenig Arbeitsspeicher',
    'wrong-java': 'falsche Java-Version',
    'missing-dependency': 'fehlende Abhängigkeit',
    'port-in-use': 'Port belegt',
    eula: 'EULA nicht akzeptiert',
    'version-not-found': 'Version nicht gefunden',
    'download-failed': 'Download fehlgeschlagen',
    'mod-version-mismatch': 'Mod passt nicht zur Version',
    'world-broken': 'Welt beschädigt',
    'plugin-error': 'Fehler in einem Plugin',
    'start-failed': 'Start fehlgeschlagen',
    unknown: 'unbekannt',
  },
  en: {
    'out-of-memory': 'not enough memory',
    'wrong-java': 'wrong Java version',
    'missing-dependency': 'missing dependency',
    'port-in-use': 'port in use',
    eula: 'EULA not accepted',
    'version-not-found': 'version not found',
    'download-failed': 'download failed',
    'mod-version-mismatch': 'mod does not fit the version',
    'world-broken': 'world damaged',
    'plugin-error': 'error in a plugin',
    'start-failed': 'start failed',
    unknown: 'unknown',
  },
};

export function buildMessage(
  locale: Locale,
  event: Message['event'],
  server: { id: string | null; name: string },
  values: Readonly<Record<string, string>>,
): Message {
  const entry = TEXTS[locale][event];
  return {
    event,
    serverId: server.id,
    serverName: server.name,
    title: entry.title,
    text: entry.text({ ...values, server: server.name }),
    colour: entry.colour,
    data: values,
  };
}

const plain = (text: string): string => text.replaceAll('**', '');

/** The JSON body each service expects. */
export const PAYLOADS: Readonly<Record<WebhookKind, (m: Message) => unknown>> = {
  discord: (m) => ({
    username: 'MorniHosting',
    embeds: [
      {
        title: m.title,
        description: m.text,
        color: m.colour,
        footer: { text: m.serverName },
        timestamp: new Date().toISOString(),
      },
    ],
  }),
  slack: (m) => ({ text: `*${m.title}*\n${m.text.replaceAll('**', '*')}` }),
  teams: (m) => ({
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          body: [
            { type: 'TextBlock', text: m.title, weight: 'Bolder', size: 'Medium' },
            { type: 'TextBlock', text: plain(m.text), wrap: true },
          ],
        },
      },
    ],
  }),
  generic: (m) => ({
    event: m.event,
    server: m.serverId ? { id: m.serverId, name: m.serverName } : null,
    title: plain(m.title),
    text: plain(m.text),
    colour: `#${m.colour.toString(HEX).padStart(COLOUR_DIGITS, '0')}`,
    data: m.data,
    at: new Date().toISOString(),
  }),
};
