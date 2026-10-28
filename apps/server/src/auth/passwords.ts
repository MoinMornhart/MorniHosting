import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// OWASP recommendation for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
const MEMORY_COST_KIB = 19456;
const TIME_COST = 2;
const PARALLELISM = 1;
const ARGON2ID = 2;

const OPTIONS = {
  memoryCost: MEMORY_COST_KIB,
  timeCost: TIME_COST,
  parallelism: PARALLELISM,
  algorithm: ARGON2ID,
};

/** 12 random bytes give a 16-character password, well above the minimum of 10. */
const RANDOM_PASSWORD_BYTES = 12;

/** A fresh password for resets; shown once and then only its hash is kept. */
export function randomPassword(): string {
  return randomBytes(RANDOM_PASSWORD_BYTES).toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash can never match; treat it like a wrong password.
    return false;
  }
}

/** Used when the username does not exist, so a failed login takes as long as a real check. */
let dummyHash: string | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await hashPassword('mornihosting-timing-equaliser');
  await verifyPassword(dummyHash, password);
}
