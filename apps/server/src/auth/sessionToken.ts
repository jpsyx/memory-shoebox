import { createHash, randomBytes } from "node:crypto";

/**
 * Mints a session cookie value: 256 bits of CSPRNG output.
 *
 * `base64url` because the value travels in a cookie, where the alphabet
 * matters and percent-encoding a `+` or a `/` is one more thing to get wrong.
 */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The `sessions.token_hash` for a cookie value.
 *
 * A fast hash is correct here, and deliberately different from what
 * `sign_in_codes` does: the token has real entropy, so there is nothing to
 * enumerate, whereas six digits is a space of a million and needs the pepper
 * (`data-models.md` § `sessions`).
 */
export function makeTokenHashFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
