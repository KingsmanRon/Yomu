import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { requirePepper } from "./env";

/**
 * Staff MFA recovery codes: one-time codes of 12 characters from an alphabet
 * without look-alikes (60 bits each), shown to the staff member once and
 * stored only as keyed hashes (HMAC-SHA256 with the server secret), so a copy
 * of the database alone reveals no usable code.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 10;

export function newRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Case, spaces and dashes do not matter when a code is typed back. */
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function recoveryCodeHash(userId: string, code: string): string {
  return createHmac("sha256", requirePepper()).update(`staff-mfa-recovery:${userId}:${normaliseRecoveryCode(code)}`).digest("base64");
}
