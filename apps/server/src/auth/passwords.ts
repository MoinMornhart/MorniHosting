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
