import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { LoginResponse, PasskeyEntry } from '@mornihosting/shared';
import { api } from '@/lib/api';

/** Passkeys need WebAuthn and a secure page (HTTPS or localhost). */
export function passkeysInBrowser(): boolean {
  return window.isSecureContext && browserSupportsWebAuthn();
}

export async function signInWithPasskey(): Promise<LoginResponse> {
  const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>('/api/auth/passkey/options', {
    method: 'POST',
  });
  const response = await startAuthentication({ optionsJSON });
  return api<LoginResponse>('/api/auth/passkey/login', { method: 'POST', body: { response } });
}

export async function addPasskey(name: string): Promise<PasskeyEntry[]> {
  const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>('/api/account/passkeys/options', {
    method: 'POST',
  });
  const response = await startRegistration({ optionsJSON });
  return api<PasskeyEntry[]>('/api/account/passkeys', { method: 'POST', body: { name, response } });
}

const DEVICE_HINTS: readonly (readonly [string, string])[] = [
  ['iPhone', 'iPhone'],
  ['iPad', 'iPad'],
  ['Android', 'Android'],
  ['Macintosh', 'Mac'],
  ['Windows', 'Windows'],
  ['Linux', 'Linux'],
];

/** A friendly default name for a new passkey, from the browser's description of the device. */
export function deviceName(userAgent: string = navigator.userAgent): string | null {
  return DEVICE_HINTS.find(([needle]) => userAgent.includes(needle))?.[1] ?? null;
}
