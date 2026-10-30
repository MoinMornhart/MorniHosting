import { z } from 'zod';
import { emailSchema, passwordSchema, usernameSchema } from './api.js';

/** Mail settings, sign-up, "password forgotten" and address confirmation. */

export const MAIL_SECURITY = ['tls', 'starttls', 'none'] as const;
export type MailSecurity = (typeof MAIL_SECURITY)[number];

const HOST_MAX = 253;
const PORT_MAX = 65535;
const CREDENTIAL_MAX = 200;
const FROM_MAX = 200;
const TOKEN_MAX = 200;
const LOCALES = ['de', 'en'] as const;
// Sender: a bare address or "Name <address>". Matches "noreply@mornihosting.de", "MorniHosting <noreply@mornihosting.de>";
// rejects line breaks (header injection) and "no at sign".
// https://regex101.com/?flavor=javascript&regex=%5E%28%5B%5E%3C%3E%22%5Cr%5Cn%5D%2B%20%3C%5B%5E%20%40%3C%3E%22%5Cr%5Cn%5D%2B%40%5B%5E%20%40%3C%3E%22%5Cr%5Cn%5D%2B%3E%7C%5B%5E%20%40%3C%3E%22%5Cr%5Cn%5D%2B%40%5B%5E%20%40%3C%3E%22%5Cr%5Cn%5D%2B%29%24&flags=gm&testString=noreply%40mornihosting.de%0AMorniHosting%20%3Cnoreply%40mornihosting.de%3E%0Ano%20at%20sign%0Aa%40b.de%0D%0ABcc%3A%20x%40y.de
const SENDER_PATTERN = /^([^<>"\r\n]+ <[^ @<>"\r\n]+@[^ @<>"\r\n]+>|[^ @<>"\r\n]+@[^ @<>"\r\n]+)$/;

export const mailSettingsSchema = z.object({
  host: z.string().trim().min(1).max(HOST_MAX),
  port: z.number().int().min(1).max(PORT_MAX),
  security: z.enum(MAIL_SECURITY),
  user: z.string().trim().max(CREDENTIAL_MAX),
  /** Empty or missing keeps the saved password. */
  password: z.string().max(CREDENTIAL_MAX).optional(),
  from: z.string().trim().max(FROM_MAX).regex(SENDER_PATTERN),
  registration: z.boolean().default(false),
  /** Self-registered people may order servers right away (otherwise an admin must allow it). */
  registrationOrders: z.boolean().default(false),
  crashMails: z.boolean().default(false),
});
export type MailSettingsInput = z.infer<typeof mailSettingsSchema>;

export interface MailSettingsView extends Omit<MailSettingsInput, 'password'> {
  readonly configured: boolean;
  /** The password is never sent back; this only says that one is saved. */
  readonly passwordSet: boolean;
  /** Links in mails need the panel's domain from the admin area. */
  readonly linksPossible: boolean;
}

export const mailTestSchema = z.object({ to: emailSchema.optional() });
export interface MailTestResult {
  readonly sentTo: string;
}

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: z.enum(LOCALES).default('de'),
});
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(1).max(TOKEN_MAX), password: passwordSchema });
export const confirmSchema = z.object({ token: z.string().min(1).max(TOKEN_MAX) });
export type ConfirmKind = 'register' | 'email_change';
export interface ConfirmResult {
  readonly kind: ConfirmKind;
}
export const emailChangeSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(CREDENTIAL_MAX),
});
