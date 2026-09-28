import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * The one cookie in the product (`conventions.md` § The auth middleware).
 *
 * Read and written here rather than through `@fastify/cookie`, which would be
 * a dependency, a plugin registration and a signing facility this product must
 * not use, for the twenty lines below. The value is opaque: 256 bits of CSPRNG
 * output whose SHA-256 is a row in `sessions`, so there is nothing to sign.
 */

/** The cookie's name. */
export const SESSION_COOKIE_NAME = "shoebox_session";

/** Thirty days, which is what `conventions.md` fixes as its `Max-Age`. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 2_592_000;

/**
 * The attributes, written once.
 *
 * `Secure` is unconditional, including in development: browsers treat
 * `http://localhost` as a secure context, so the local flow works, and a
 * conditional attribute would mean development exercises a different cookie
 * from the one production sets. One origin serves both the app and the API
 * (`docs/architecture.md`), so `SameSite=Lax` costs nothing.
 */
const COOKIE_ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax";

/** The session cookie this request presented, or undefined. */
export function getSessionTokenFromRequest(
  request: FastifyRequest,
): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) {
    return undefined;
  }
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const pair = header
    .split(";")
    .map((part) => {
      return part.trim();
    })
    .find((part) => {
      return part.startsWith(prefix);
    });
  if (pair === undefined) {
    return undefined;
  }
  const value = decodeURIComponent(pair.slice(prefix.length));
  // An empty value is a cleared cookie a browser is still sending. It is not a
  // token, and treating it as one would send an empty string to the lookup.
  return value === "" ? undefined : value;
}

/**
 * Sets the session cookie for thirty days.
 *
 * @param options.reply The reply to write the header on.
 * @param options.token The cookie value, as `createSessionToken` minted it.
 */
export function setSessionCookie(options: {
  reply: FastifyReply;
  token: string;
}): void {
  void options.reply.header(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${options.token}; ${COOKIE_ATTRIBUTES}; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
  );
}

/**
 * Clears the session cookie.
 *
 * The attributes are repeated deliberately: a browser ignores a `Set-Cookie`
 * that does not match the original on `Path` and `Secure`, which would leave
 * the device holding a cookie the server has already deleted the row for.
 */
export function clearSessionCookie(reply: FastifyReply): void {
  void reply.header(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`,
  );
}
