import type { Kysely } from "kysely";
import { memberRoleSchema, type MemberRole } from "@memory-shoebox/shared";
import type { Database } from "../db/types/db.types.ts";
import type { Authenticator, Viewer } from "../http/requestContextHelpers.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { createVisibleRuleIdsCache } from "../visibility/createVisibleRuleIdsCache.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";
import { getSessionTokenFromRequest } from "./sessionCookie.ts";
import { makeTokenHashFromToken } from "./sessionToken.ts";
import {
  SESSION_LIFETIME_DAYS,
  SESSION_SLIDE_THRESHOLD_MS,
} from "./auth.constants.ts";

/** One day in milliseconds, written once for the two throttled writes. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The role on the row, failing closed.
 *
 * The column carries a `CHECK`, so this is belt and braces; the direction it
 * fails in is the point, because the alternative to a narrowing helper is a
 * cast that would let any string through as a role.
 */
function _getRoleFromColumn(value: string): MemberRole {
  const parsed = memberRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : "viewer";
}

/** Whether a throttled timestamp has moved by more than a day. */
function _isSlideDue(options: {
  lastAt: string | null;
  nowMs: number;
}): boolean {
  if (options.lastAt === null) {
    return true;
  }
  return (
    options.nowMs - Date.parse(options.lastAt) > SESSION_SLIDE_THRESHOLD_MS
  );
}

/**
 * Builds the `Authenticator` step 2's request context seam expects.
 *
 * **The session is looked up in the database on every request**
 * (`conventions.md` § The auth middleware). Both My account and Members
 * promise a signed-out device "stops working immediately, wherever it is",
 * which rules out a stateless token and any cache without an invalidation
 * channel. The only cache here is `visibleRuleIds`, and it has one:
 * `visibility.generation`.
 *
 * The generation itself is read per request rather than cached. It is one row
 * by primary key on a table holding at most nine, beside a lookup that is
 * already happening, and caching it is how "a group edit invalidates every
 * viewer's cache at once" quietly stops being true.
 *
 * @param options.database The Kysely handle.
 * @param options.clock Overridable so a test can hold time still.
 */
export function createAuthenticator(options: {
  database: Kysely<Database>;
  clock?: () => Date;
}): Authenticator {
  const { database } = options;
  const clock =
    options.clock ??
    (() => {
      return new Date();
    });
  const cache = createVisibleRuleIdsCache();

  return async (request) => {
    const token = getSessionTokenFromRequest(request);
    if (token === undefined) {
      return undefined;
    }

    const now = clock();
    const nowIso = now.toISOString();

    // The status filter is load-bearing: removing a member ends every device
    // they hold on its next request, without the removal path having to find
    // their session rows. An `invited` member cannot hold one at all, because
    // redeeming a code is what makes them `active`.
    const row = await database
      .selectFrom("sessions")
      .innerJoin("members", "members.id", "sessions.member_id")
      .select([
        "sessions.id as sessionId",
        "sessions.last_used_at as lastUsedAt",
        "members.id as memberId",
        "members.role as role",
        "members.last_seen_at as lastSeenAt",
      ])
      .where("sessions.token_hash", "=", makeTokenHashFromToken(token))
      .where("sessions.expires_at", ">", nowIso)
      .where("members.status", "=", "active")
      .executeTakeFirst();

    if (row === undefined) {
      return undefined;
    }

    const settings = await readInstanceSettings({
      database,
      keys: ["visibility.generation"],
    });
    const generation = settings["visibility.generation"];

    const cached = cache.get({ memberId: row.memberId, generation });
    const visibleRuleIds =
      cached ??
      (await getVisibleRuleIdsFromMemberId({
        database,
        memberId: row.memberId,
      }));
    if (cached === undefined) {
      cache.set({
        memberId: row.memberId,
        generation,
        ruleIds: visibleRuleIds,
      });
    }

    await _slideIfDue({
      database,
      nowIso,
      nowMs: now.getTime(),
      sessionId: row.sessionId,
      lastUsedAt: row.lastUsedAt,
      memberId: row.memberId,
      lastSeenAt: row.lastSeenAt,
    });

    const role = _getRoleFromColumn(row.role);
    const viewer: Viewer = {
      memberId: row.memberId,
      sessionId: row.sessionId,
      role,
      isAdmin: role === "admin",
      // The cache's frozen array, deliberately: `Viewer.visibleRuleIds` is
      // readonly because it is shared rather than copied.
      visibleRuleIds:
        cache.get({ memberId: row.memberId, generation }) ?? visibleRuleIds,
    };
    return viewer;
  };
}

/** What the request that arrived a day later is allowed to write. */
type SlideInput = {
  database: Kysely<Database>;
  nowIso: string;
  nowMs: number;
  sessionId: string;
  lastUsedAt: string;
  memberId: string;
  lastSeenAt: string | null;
};

/**
 * Slides the session and the member's "last seen", at most once a day each.
 *
 * Without the throttle one timeline page of thumbnails is dozens of writes
 * serialising on SQLite's single writer. The visible consequence is stated in
 * `auth.md` and is correct rather than stale: a device can read "29 days left"
 * immediately after being used.
 */
async function _slideIfDue(input: SlideInput): Promise<void> {
  if (_isSlideDue({ lastAt: input.lastUsedAt, nowMs: input.nowMs })) {
    await input.database
      .updateTable("sessions")
      .set({
        last_used_at: input.nowIso,
        expires_at: new Date(
          input.nowMs + SESSION_LIFETIME_DAYS * DAY_MS,
        ).toISOString(),
      })
      .where("id", "=", input.sessionId)
      .execute();
  }

  if (_isSlideDue({ lastAt: input.lastSeenAt, nowMs: input.nowMs })) {
    await input.database
      .updateTable("members")
      .set({ last_seen_at: input.nowIso })
      .where("id", "=", input.memberId)
      .execute();
  }
}
