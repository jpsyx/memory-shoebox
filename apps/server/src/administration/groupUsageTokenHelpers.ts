import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

type TokenOptions = { snapshot: string; secret: string; now: string };

function _makeSignatureFromSnapshot(
  options: Readonly<TokenOptions & { issuedAt: string }>,
): Buffer {
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      options.secret,
      "",
      "memory-shoebox:group-deletion-confirmation:v1",
      32,
    ),
  );
  return createHmac("sha256", key)
    .update(`${options.issuedAt}\n${options.snapshot}`)
    .digest();
}

/** Signs the canonical usage snapshot with a separate deletion key. */
export function makeGroupUsageTokenFromSnapshot(
  options: Readonly<TokenOptions>,
): string {
  const issuedAt = String(Date.parse(options.now));
  return `${issuedAt}.${_makeSignatureFromSnapshot({ ...options, issuedAt }).toString("base64url")}`;
}

/** Requires unchanged usage and a valid signature younger than ten minutes. */
export function isGroupUsageTokenValid(
  options: Readonly<TokenOptions & { token: string }>,
): boolean {
  const [issuedAt, signature, extra] = options.token.split(".");
  if (
    issuedAt === undefined ||
    signature === undefined ||
    extra !== undefined ||
    !/^\d+$/.test(issuedAt) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return false;
  }
  const age = Date.parse(options.now) - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age >= 600_000) {
    return false;
  }
  const supplied = Buffer.from(signature, "base64url");
  const expected = _makeSignatureFromSnapshot({ ...options, issuedAt });
  return (
    supplied.toString("base64url") === signature &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}
