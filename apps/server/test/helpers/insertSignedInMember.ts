import type { Kysely } from "kysely";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { insertMember, insertSession } from "./seedHelpers.ts";

/** A member holding one live device, and the header that device sends. */
export type SignedInMember = {
  memberId: string;
  sessionId: string;
  token: string;
  /** Ready for `app.inject({ headers: { cookie } })`. */
  cookie: string;
};

/**
 * Seeds a member with a live session, the way a real sign-in would leave them.
 *
 * The token is a plain string rather than a minted one, because what the
 * middleware looks up is its SHA-256 and a test reads better when it can name
 * the device's token.
 *
 * @param options.database The test database.
 * @param options.token The cookie value this device holds.
 * @param options.member Columns to override on the member.
 * @param options.session Columns to override on the session.
 */
export async function insertSignedInMember(options: {
  database: Kysely<Database>;
  token?: string;
  member?: Partial<Database["members"]>;
  session?: Partial<Database["sessions"]>;
}): Promise<SignedInMember> {
  const token = options.token ?? "a-token-somebody-is-holding";
  const memberId = await insertMember(options.database, options.member ?? {});
  const sessionId = await insertSession(options.database, {
    memberId,
    token_hash: makeTokenHashFromToken(token),
    ...options.session,
  });
  return {
    memberId,
    sessionId,
    token,
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
}
