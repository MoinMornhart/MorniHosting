import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

const ISSUER = 'MorniHosting';
const DIGITS = 6;
const PERIOD_SECONDS = 30;
const SECRET_BYTES = 20;
/** Accept the previous and next 30-second window to tolerate clock drift. */
const WINDOW = 1;
const QR_SIZE_PX = 220;

function totpFor(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function newTotpSecret(): string {
  return new Secret({ size: SECRET_BYTES }).base32;
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  return totpFor(secretBase32, 'check').validate({ token: code, window: WINDOW }) !== null;
}

export async function totpSetupData(
  secretBase32: string,
  username: string,
): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
  const otpauthUrl = totpFor(secretBase32, username).toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: QR_SIZE_PX });
  return { secret: secretBase32, otpauthUrl, qrDataUrl };
}
