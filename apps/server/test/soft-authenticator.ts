/* eslint-disable ts-patterns/no-magic-numbers -- byte layouts from the WebAuthn and CBOR specifications */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

/**
 * A tiny passkey device for tests: makes real P-256 keys and signs like a phone or security key
 * would, so the server's WebAuthn checks run for real. Attestation is "none", like most passkeys.
 */

type Cbor = number | string | Uint8Array | ReadonlyMap<Cbor, Cbor>;

function cborHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  const out = Buffer.alloc(3);
  out[0] = (major << 5) | 25;
  out.writeUInt16BE(length, 1);
  return out;
}

function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value);
    return Buffer.concat([cborHead(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([cborHead(2, value.length), value]);
  return Buffer.concat([
    cborHead(5, value.size),
    ...Array.from(value).flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}

const u16 = (n: number): Buffer => Buffer.from([n >> 8, n & 0xff]);
const u32 = (n: number): Buffer => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(n);
  return out;
};
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const sha256 = (data: string | Uint8Array): Buffer => createHash('sha256').update(data).digest();

/** User present + user verified, plus "attested credential data follows" when registering. */
const FLAGS_REGISTER = 0x45;
const FLAGS_LOGIN = 0x05;

export interface RegistrationOptions {
  readonly challenge: string;
  readonly rp: { readonly id?: string };
}
export interface LoginOptions {
  readonly challenge: string;
  readonly rpId?: string;
}

export function createSoftAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(16);
  const state = { counter: 0 };
  const clientData = (type: string, challenge: string, origin: string): Buffer =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    id: b64(credentialId),

    register(options: RegistrationOptions, origin: string) {
      const coseKey = cbor(
        new Map<Cbor, Cbor>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x ?? '', 'base64url')],
          [-3, Buffer.from(jwk.y ?? '', 'base64url')],
        ]),
      );
      const authData = Buffer.concat([
        sha256(options.rp.id ?? ''),
        Buffer.from([FLAGS_REGISTER]),
        u32(state.counter),
        Buffer.alloc(16),
        u16(credentialId.length),
        credentialId,
        coseKey,
      ]);
      const attestation = cbor(
        new Map<Cbor, Cbor>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]),
      );
      return {
        id: b64(credentialId),
        rawId: b64(credentialId),
        type: 'public-key' as const,
        response: {
          clientDataJSON: b64(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: b64(attestation),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },

    login(options: LoginOptions, origin: string) {
      state.counter += 1;
      const authData = Buffer.concat([
        sha256(options.rpId ?? ''),
        Buffer.from([FLAGS_LOGIN]),
        u32(state.counter),
      ]);
      const data = clientData('webauthn.get', options.challenge, origin);
      const signature = sign('sha256', Buffer.concat([authData, sha256(data)]), privateKey);
      return {
        id: b64(credentialId),
        rawId: b64(credentialId),
        type: 'public-key' as const,
        response: {
          clientDataJSON: b64(data),
          authenticatorData: b64(authData),
          signature: b64(signature),
        },
        clientExtensionResults: {},
      };
    },
  };
}
