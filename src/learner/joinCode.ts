/** Extract a 6-digit class code from typed digits or a scanned QR code (a URL ending in #/join/123456). */
export function parseJoinCode(raw: string): string | null {
  const m = /(?:^|\/join\/|\D)(\d{6})(?:\D|$)/.exec(raw.trim());
  return m ? m[1] : null;
}
