import type { Kysely } from "kysely";
import { createId } from "../db/createId.ts";
import type { Database } from "../db/types/db.types.ts";
import { SESSION_LIFETIME_MS } from "./auth.constants.ts";
import { getDeviceLabelFromUserAgent } from "./getDeviceLabelFromUserAgent.ts";
import { createSessionToken, makeTokenHashFromToken } from "./sessionToken.ts";

/** The row that was written, and the token only the cookie will carry. */
export type CreatedSession = {
  sessionId: string;
  /** In the clear, for the `Set-Cookie`. Only its SHA-256 is stored. */
  token: string;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
};

/**
 * Writes one `sessions` row and returns the cookie value for it.
 *
 * `device_label` is parsed once here and stored, so a later parser upgrade
 * never relabels a device somebody already recognises. `user_agent` is kept
 * raw as the fallback and is never returned in any payload
 * (`conventions.md` § Forbidden in any payload).
 *
 * @param options.transaction The redemption's transaction.
 * @param options.memberId Whose device this is.
 * @param options.userAgent The request header, or undefined.
 * @param options.now The redemption instant.
 */
export async function createSessionForMember(options: {
  transaction: Kysely<Database>;
  memberId: string;
  userAgent: string | undefined;
  now: string;
}): Promise<CreatedSession> {
  const sessionId = createId();
  const token = createSessionToken();
  const deviceLabel = getDeviceLabelFromUserAgent(options.userAgent);
  const expiresAt = new Date(
    Date.parse(options.now) + SESSION_LIFETIME_MS,
  ).toISOString();

  await options.transaction
    .insertInto("sessions")
    .values({
      id: sessionId,
      member_id: options.memberId,
      token_hash: makeTokenHashFromToken(token),
      device_label: deviceLabel,
      user_agent: options.userAgent ?? null,
      created_at: options.now,
      last_used_at: options.now,
      expires_at: expiresAt,
    })
    .execute();

  return {
    sessionId,
    token,
    deviceLabel,
    createdAt: options.now,
    lastUsedAt: options.now,
    expiresAt,
  };
}
