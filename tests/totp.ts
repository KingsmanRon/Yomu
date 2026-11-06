import { createHmac } from "node:crypto";

/**
 * Time-based one-time password (RFC 6238: HMAC-SHA1, 30-second steps, six
 * digits), as an authenticator app computes it from the key Auth shows when a
 * staff member sets up two-step sign-in.
 */
export function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32Secret.replace(/[\s=]/g, "").toUpperCase()) {
    const v = alphabet.indexOf(c);
    if (v < 0) throw new Error(`not base32: ${c}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
