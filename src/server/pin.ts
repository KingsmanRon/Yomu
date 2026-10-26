import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { requirePepper } from "./env";

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/**
 * Picture PINs are four taps on a 3x3 grid (digits 1-9). That is a small
 * space, so the server stores a salted, peppered scrypt hash and limits
 * attempts (see learner_credentials.retry_after). The pepper lives only in the
 * server environment, so a database copy alone cannot be brute-forced.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^[1-9]{4}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(`${pin}:${requirePepper()}`, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(`${pin}:${requirePepper()}`, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Wait time after repeated wrong PINs: none for the first 4, then growing, capped at 15 minutes. */
export function pinRetryDelaySeconds(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  return Math.min(15 * 60, 30 * 2 ** (failedAttempts - 5));
}
