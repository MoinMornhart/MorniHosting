import type { Locale } from '@mornihosting/shared';

/**
 * The mails the panel sends. Every dynamic value is escaped for HTML and stripped of line breaks, no images are
 * loaded from outside, and the colours are the panel's emerald.
 */

export interface MailMessage {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

interface Body {
  readonly subject: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly rows?: readonly (readonly [label: string, value: string])[];
  readonly button?: { readonly label: string; readonly url: string };
  readonly note?: string;
}

export interface MailVars {
  readonly name: string;
  readonly link: string | null;
  readonly host: string | null;
  readonly [key: string]: string | null | undefined;
}

export type MailKind =
  | 'test'
  | 'welcome'
  | 'register'
  | 'already_registered'
  | 'email_change'
  | 'password_reset'
  | 'server_ordered'
  | 'server_crashed';

const EMERALD = '#10b981';
const EMERALD_DARK = '#047857';
const INK = '#0f1f1a';
const MUTED = '#5b6b65';
const PAPER = '#f2f6f4';
const LINE = '#dbe5e0';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
// Characters that matter in HTML text and attributes. Matches "&", "<", "'"; rejects "a".
// https://regex101.com/?flavor=javascript&regex=%5B%26%3C%3E%22'%5D&flags=gm&testString=%26%0A%3C%0A'%0Aa
const HTML_SPECIAL = /[&<>"']/g;
// Control characters including line breaks: they never belong into a subject or a name. Matches "a\nb"; rejects "ab".
// https://regex101.com/?flavor=javascript&regex=%5B%5Cx00-%5Cx1f%5Cx7f%5D%2B&flags=gm&testString=ab%0Aa%09b
const CONTROL = /[\x00-\x1f\x7f]+/g; // eslint-disable-line no-control-regex -- the point is to strip them

export const escapeHtml = (value: string): string => value.replace(HTML_SPECIAL, (c) => ESCAPES[c] ?? c);
/** One line of plain text: no line breaks, so a name can never add a header. */
export const oneLine = (value: string): string => value.replace(CONTROL, ' ').trim();

const dateFormat = (locale: Locale): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
export const formatWhen = (locale: Locale, date: Date): string => dateFormat(locale).format(date);

const shell = (body: Body, locale: Locale, host: string | null): MailMessage => {
  const footer: Readonly<Record<Locale, string>> = {
    de: 'Diese Mail hat dein MorniHosting-Panel automatisch verschickt.',
    en: 'Your MorniHosting panel sent this mail automatically.',
  };
  const rows = (body.rows ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:${MUTED};font-size:14px;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  const button = body.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(body.button.url)}" style="display:inline-block;background:${EMERALD};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:10px">${escapeHtml(body.button.label)}</a></p><p style="margin:0 0 8px;color:${MUTED};font-size:12px;word-break:break-all">${escapeHtml(body.button.url)}</p>`
    : '';
  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(body.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
<tr><td style="background:${EMERALD_DARK};padding:18px 28px"><span style="display:inline-block;width:14px;height:14px;background:${EMERALD};border-radius:4px;vertical-align:-1px;margin-right:10px"></span><span style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:.2px">MorniHosting</span></td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 14px;color:${INK};font-size:22px;line-height:1.3">${escapeHtml(body.heading)}</h1>
${body.paragraphs.map((p) => `<p style="margin:0 0 12px;color:${INK};font-size:15px;line-height:1.6">${escapeHtml(p)}</p>`).join('\n')}
${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};width:100%">${rows}</table>` : ''}
${button}
${body.note ? `<p style="margin:12px 0 0;color:${MUTED};font-size:13px;line-height:1.5">${escapeHtml(body.note)}</p>` : ''}
</td></tr>
<tr><td style="padding:20px 28px 26px;color:${MUTED};font-size:12px;line-height:1.5;border-top:1px solid ${LINE}">${escapeHtml(footer[locale])}${host ? `<br>${escapeHtml(host)}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    body.heading,
    '',
    ...body.paragraphs,
    ...(body.rows ?? []).map(([label, value]) => `${label}: ${value}`),
    ...(body.button ? ['', `${body.button.label}: ${body.button.url}`] : []),
    ...(body.note ? ['', body.note] : []),
    '',
    '-- ',
    footer[locale] + (host ? ` (${host})` : ''),
  ].join('\n');
  return { subject: oneLine(body.subject), html, text };
};

type Copy = (vars: MailVars) => Body;

const hi: Readonly<Record<Locale, (name: string) => string>> = {
  de: (name) => `Hallo ${name},`,
  en: (name) => `Hi ${name},`,
};

const COPY: Readonly<Record<Locale, Readonly<Record<MailKind, Copy>>>> = {
  de: {
    test: () => ({
      subject: 'Test-Mail von MorniHosting',
      heading: 'Es funktioniert! 🎉',
      paragraphs: ['Diese Test-Mail ist angekommen. Dein Panel kann ab jetzt E-Mails verschicken.'],
    }),
    welcome: (v) => ({
      subject: 'Willkommen bei MorniHosting',
      heading: 'Willkommen bei MorniHosting',
      paragraphs: [
        hi.de(v.name),
        'für dich wurde ein Zugang angelegt. Deinen Benutzernamen und das Passwort bekommst du von der Person, die ihn angelegt hat – aus Sicherheitsgründen steht kein Passwort in dieser Mail.',
      ],
      rows: [['Benutzername', v['username'] ?? '']],
      ...(v.link ? { button: { label: 'Zum Panel', url: v.link } } : {}),
    }),
    register: (v) => ({
      subject: 'Bitte bestätige deine E-Mail-Adresse',
      heading: 'Noch ein Klick, dann bist du dabei',
      paragraphs: [
        hi.de(v.name),
        'danke für deine Anmeldung bei MorniHosting. Bestätige bitte kurz deine E-Mail-Adresse, damit du dich anmelden kannst. Der Link gilt 24 Stunden.',
      ],
      ...(v.link ? { button: { label: 'E-Mail bestätigen', url: v.link } } : {}),
      note: 'Wenn du dich nicht angemeldet hast, kannst du diese Mail einfach löschen. Ohne Klick passiert nichts.',
    }),
    already_registered: (v) => ({
      subject: 'Du hast schon einen Zugang',
      heading: 'Zu dieser Adresse gibt es schon ein Konto',
      paragraphs: [
        hi.de(v.name),
        'jemand (vielleicht du) wollte sich mit dieser E-Mail-Adresse bei MorniHosting anmelden. Sie gehört aber schon zu einem Konto. Wenn du dein Passwort vergessen hast, kannst du dir auf der Anmeldeseite einen Link zum Zurücksetzen schicken lassen.',
      ],
      ...(v.link ? { button: { label: 'Zur Anmeldung', url: v.link } } : {}),
    }),
    email_change: (v) => ({
      subject: 'Bestätige deine neue E-Mail-Adresse',
      heading: 'Neue E-Mail-Adresse bestätigen',
      paragraphs: [
        hi.de(v.name),
        'du möchtest diese Adresse für dein MorniHosting-Konto verwenden. Bestätige das bitte mit einem Klick. Der Link gilt 24 Stunden.',
      ],
      ...(v.link ? { button: { label: 'Adresse bestätigen', url: v.link } } : {}),
      note: 'Wenn du das nicht warst, ignoriere diese Mail. Deine bisherige Adresse bleibt dann bestehen.',
    }),
    password_reset: (v) => ({
      subject: 'Passwort zurücksetzen',
      heading: 'Neues Passwort festlegen',
      paragraphs: [
        hi.de(v.name),
        'wir haben eine Anfrage bekommen, dein Passwort zurückzusetzen. Mit dem Knopf legst du ein neues fest. Der Link gilt 1 Stunde und lässt sich nur einmal benutzen.',
      ],
      ...(v.link ? { button: { label: 'Neues Passwort festlegen', url: v.link } } : {}),
      note: 'Wenn du das nicht warst, kannst du diese Mail löschen – dein Passwort bleibt, wie es ist.',
    }),
    server_ordered: (v) => ({
      subject: `Dein Server „${v['server'] ?? ''}“ ist bestellt`,
      heading: 'Dein Server ist bereit 🎮',
      paragraphs: [
        hi.de(v.name),
        'danke für deine Bestellung! So sieht dein neuer Server aus. Die Adresse gibst du deinen Freunden, damit sie beitreten können.',
      ],
      rows: [
        ['Name', v['server'] ?? ''],
        ['Paket', v['plan'] ?? ''],
        ['Software', v['software'] ?? ''],
        ['Adresse', v['address'] ?? 'noch nicht festgelegt'],
        ['Bestellt am', v['when'] ?? ''],
      ],
      ...(v.link ? { button: { label: 'Server öffnen', url: v.link } } : {}),
    }),
    server_crashed: (v) => ({
      subject: `Server „${v['server'] ?? ''}“ ist abgestürzt`,
      heading: 'Ein Server ist abgestürzt',
      paragraphs: [
        hi.de(v.name),
        `Der Server „${v['server'] ?? ''}“ ist abgestürzt.`,
        v['reason'] ?? '',
      ].filter(Boolean),
      rows: [['Zeitpunkt', v['when'] ?? '']],
      ...(v.link ? { button: { label: 'Server ansehen', url: v.link } } : {}),
    }),
  },
  en: {
    test: () => ({
      subject: 'Test mail from MorniHosting',
      heading: 'It works! 🎉',
      paragraphs: ['This test mail arrived. Your panel can send e-mails from now on.'],
    }),
    welcome: (v) => ({
      subject: 'Welcome to MorniHosting',
      heading: 'Welcome to MorniHosting',
      paragraphs: [
        hi.en(v.name),
        'an account was created for you. You get your username and password from the person who created it – for safety there is no password in this mail.',
      ],
      rows: [['Username', v['username'] ?? '']],
      ...(v.link ? { button: { label: 'Open the panel', url: v.link } } : {}),
    }),
    register: (v) => ({
      subject: 'Please confirm your e-mail address',
      heading: 'One more click and you are in',
      paragraphs: [
        hi.en(v.name),
        'thanks for signing up at MorniHosting. Please confirm your e-mail address so you can log in. The link is valid for 24 hours.',
      ],
      ...(v.link ? { button: { label: 'Confirm e-mail', url: v.link } } : {}),
      note: 'If you did not sign up, just delete this mail. Nothing happens without the click.',
    }),
    already_registered: (v) => ({
      subject: 'You already have an account',
      heading: 'This address already has an account',
      paragraphs: [
        hi.en(v.name),
        'someone (maybe you) tried to sign up at MorniHosting with this e-mail address, but it already belongs to an account. If you forgot your password, you can get a reset link on the login page.',
      ],
      ...(v.link ? { button: { label: 'Go to login', url: v.link } } : {}),
    }),
    email_change: (v) => ({
      subject: 'Confirm your new e-mail address',
      heading: 'Confirm your new e-mail address',
      paragraphs: [
        hi.en(v.name),
        'you want to use this address for your MorniHosting account. Please confirm with one click. The link is valid for 24 hours.',
      ],
      ...(v.link ? { button: { label: 'Confirm address', url: v.link } } : {}),
      note: 'If this was not you, ignore this mail. Your current address stays as it is.',
    }),
    password_reset: (v) => ({
      subject: 'Reset your password',
      heading: 'Choose a new password',
      paragraphs: [
        hi.en(v.name),
        'we got a request to reset your password. Use the button to choose a new one. The link is valid for 1 hour and works only once.',
      ],
      ...(v.link ? { button: { label: 'Choose a new password', url: v.link } } : {}),
      note: 'If this was not you, delete this mail – your password stays as it is.',
    }),
    server_ordered: (v) => ({
      subject: `Your server “${v['server'] ?? ''}” is ordered`,
      heading: 'Your server is ready 🎮',
      paragraphs: [
        hi.en(v.name),
        'thanks for your order! This is your new server. Give the address to your friends so they can join.',
      ],
      rows: [
        ['Name', v['server'] ?? ''],
        ['Plan', v['plan'] ?? ''],
        ['Software', v['software'] ?? ''],
        ['Address', v['address'] ?? 'not set yet'],
        ['Ordered on', v['when'] ?? ''],
      ],
      ...(v.link ? { button: { label: 'Open server', url: v.link } } : {}),
    }),
    server_crashed: (v) => ({
      subject: `Server “${v['server'] ?? ''}” crashed`,
      heading: 'A server crashed',
      paragraphs: [hi.en(v.name), `The server “${v['server'] ?? ''}” crashed.`, v['reason'] ?? ''].filter(
        Boolean,
      ),
      rows: [['Time', v['when'] ?? '']],
      ...(v.link ? { button: { label: 'View server', url: v.link } } : {}),
    }),
  },
};

/** Renders one mail. Values from users are made single-line first; HTML escaping happens in the shell. */
export function renderMail(kind: MailKind, locale: Locale, vars: MailVars): MailMessage {
  const clean = Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, typeof value === 'string' ? oneLine(value) : value]),
  ) as MailVars;
  return shell(COPY[locale][kind](clean), locale, clean.host);
}
