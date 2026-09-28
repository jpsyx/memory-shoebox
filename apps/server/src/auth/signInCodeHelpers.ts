import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Six digits from a CSPRNG, zero-padded so 42 is `000042`. */
export function createSignInCodeDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * The `sign_in_codes.code_hash` for six digits.
 *
 * `HMAC-SHA256(digits, pepper)` rather than a bare digest: six digits is a
 * space of 10^6, so a leaked table of plain SHA-256 hashes is reversed
 * instantly with a rainbow table of a million entries. The pepper lives in the
 * app config, so a read-only database leak yields nothing during the ten
 * minutes a code is alive (`data-models.md` § `sign_in_codes`).
 *
 * @param options.digits The six digits, as typed or as minted.
 * @param options.pepper `config.signInCodePepper`.
 */
export function makeCodeHashFromDigits(options: {
  digits: string;
  pepper: Buffer;
}): string {
  return createHmac("sha256", options.pepper)
    .update(options.digits)
    .digest("hex");
}

/**
 * Compares two hex hashes in constant time.
 *
 * The comparison is length-independent because both sides are hashes of the
 * same width, which is the reason the submitted digits are hashed before
 * anything is compared rather than after.
 *
 * A stored value that is not hex returns false rather than throwing: a corrupt
 * row must refuse a sign-in, not crash the route.
 */
export function isMatchingCodeHash(options: {
  leftHash: string;
  rightHash: string;
}): boolean {
  const leftHash = Buffer.from(options.leftHash, "hex");
  const rightHash = Buffer.from(options.rightHash, "hex");
  if (leftHash.length === 0 || leftHash.length !== rightHash.length) {
    return false;
  }
  return timingSafeEqual(leftHash, rightHash);
}
