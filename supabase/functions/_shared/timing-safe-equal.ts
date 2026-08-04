/**
 * Constant-time string comparison for shared-secret checks (e.g. CRON_SECRET).
 *
 * `a !== b` short-circuits on the first mismatching character, which lets a
 * network-timing attacker learn the secret one byte at a time. This compares
 * every byte of both inputs regardless of where they first differ, and never
 * branches on the *content* of either string — only on their length, which is
 * not secret.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);

  // Length differences are not secret-dependent, so it's safe to branch here.
  // We still compare `bytesA` against itself for the same number of rounds as
  // a real comparison would take, so callers can't distinguish "wrong length"
  // from "right length, wrong content" by timing alone.
  const length = Math.max(bytesA.length, bytesB.length);
  let mismatch = bytesA.length === bytesB.length ? 0 : 1;

  for (let i = 0; i < length; i++) {
    const byteA = i < bytesA.length ? bytesA[i] : 0;
    const byteB = i < bytesB.length ? bytesB[i] : 0;
    mismatch |= byteA ^ byteB;
  }

  return mismatch === 0;
}
