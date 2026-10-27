import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_TOKEN_BYTES = 32;
const VERSION_PREFIX = 'v1:';
const CIPHER = 'aes-256-gcm';

export interface SecretBox {
  readonly encrypt: (plain: string) => string;
  readonly decrypt: (sealed: string) => string;
}

export class DecryptError extends Error {
  override readonly name = 'DecryptError';
}

/** Encrypts small secrets (TOTP keys, webhook URLs, API keys) at rest with a key derived from MH_SECRET. */
export function createSecretBox(secret: string): SecretBox {
  const key = Buffer.from(hkdfSync('sha256', secret, 'mornihosting', 'secret-box', KEY_BYTES));
  return {
    encrypt: (plain) => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(CIPHER, key, iv);
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return VERSION_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    },
    decrypt: (sealed) => {
      if (!sealed.startsWith(VERSION_PREFIX)) throw new DecryptError('unknown format');
      const raw = Buffer.from(sealed.slice(VERSION_PREFIX.length), 'base64');
      const iv = raw.subarray(0, IV_BYTES);
      const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const body = raw.subarray(IV_BYTES + TAG_BYTES);
      try {
        const decipher = createDecipheriv(CIPHER, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      } catch (err) {
        throw new DecryptError('decryption failed', { cause: err });
      }
    },
  };
}

export function randomToken(bytes = DEFAULT_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
