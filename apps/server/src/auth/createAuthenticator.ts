import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { Authenticator, Viewer } from "../http/requestContextHelpers.ts";
import { getMemberRoleFromStoredValue } from "../members/getMemberRoleFromStoredValue.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import {
  createVisibleRuleIdsCache,
  type VisibleRuleIdsCache,
} from "../visibility/createVisibleRuleIdsCache.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";
import { getSessionTokenFromRequest } from "./sessionCookie.ts";
import { makeTokenHashFromToken } from "./sessionToken.ts";
import {
  SESSION_LIFETIME_MS,
  SESSION_SLIDE_THRESHOLD_MS,
} from "./auth.constants.ts";

/** A live session and the active member holding it, as one request sees them. */
type ActiveSessionRow = {
  sessionId: string;
  lastUsedAt: string;
  memberId: string;
  role: string;
  lastSeenAt: string | null;
};

/**
 * Whether a throttled timestamp has moved by more than a day.
 *
 * A corrupt timestamp parses to `NaN` and every comparison with `NaN` is
 * false, so it freezes the slide instead of repairing itself. That is the
 * chosen direction rather than an oversight: the columns are ISO text we write
 * ourselves, and freezing means writing nothing, which is the safe failure.
 */
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
    const row = await _getActiveSessionFromTokenHash({
      database,
      tokenHash: makeTokenHashFromToken(token),
      nowIso,
    });
    if (row === undefined) {
      return undefined;
    }

    const visibleRuleIds = await _getVisibleRuleIdsFromCache({
      database,
      cache,
      memberId: row.memberId,
    });

    await _slideIfDue({ database, row, nowIso, nowMs: now.getTime() });

    return _getViewerFromSessionRow({ row, visibleRuleIds });
  };
}

/**
 * The session this token hash names, if it is live and its member is active.
 *
 * The status filter is load-bearing: removing a member ends every device they
 * hold on its next request, without the removal path having to find their
 * session rows. An `invited` member cannot hold one at all, because redeeming
 * a code is what makes them `active`.
 *
 * @param options.database The Kysely handle.
 * @param options.tokenHash The hash of the token the request presented.
 * @param options.nowIso The instant the expiry is judged against.
 */
async function _getActiveSessionFromTokenHash(options: {
  database: Kysely<Database>;
  tokenHash: string;
  nowIso: string;
}): Promise<ActiveSessionRow | undefined> {
  return options.database
    .selectFrom("sessions")
    .innerJoin("members", "members.id", "sessions.member_id")
    .select([
      "sessions.id as sessionId",
      "sessions.last_used_at as lastUsedAt",
      "members.id as memberId",
      "members.role as role",
      "members.last_seen_at as lastSeenAt",
    ])
    .where("sessions.token_hash", "=", options.tokenHash)
    .where("sessions.expires_at", ">", options.nowIso)
    .where("members.status", "=", "active")
    .executeTakeFirst();
}

/**
 * The member's expansion, recomputed only when its generation has moved.
 *
 * **The generation is read before the expansion query, and that order is what
 * makes a racing bump fail safe.** A bump landing between the two stores rows
 * that are too fresh under the older generation, which the next request's
 * fresh read misses. Reversed, it would store rows read before the bump under
 * the new generation, and that entry is access somebody was meant to lose.
 *
 * @param options.database The Kysely handle.
 * @param options.cache The process-local cache.
 * @param options.memberId The viewer.
 * @returns The cache's frozen array, which the viewer shares rather than
 * copies.
 */
async function _getVisibleRuleIdsFromCache(options: {
  database: Kysely<Database>;
  cache: VisibleRuleIdsCache;
  memberId: string;
}): Promise<readonly string[]> {
  const { database, cache, memberId } = options;
  const settings = await readInstanceSettings({
    database,
    keys: ["visibility.generation"],
  });
  const generation = settings["visibility.generation"];

  return (
    cache.get({ memberId, generation }) ??
    cache.set({
      memberId,
      generation,
      ruleIds: await getVisibleRuleIdsFromMemberId({ database, memberId }),
    })
  );
}

/**
 * The viewer every route reads, from the row and the expansion behind it.
 *
 * @param options.row The joined session and member.
 * @param options.visibleRuleIds The cache's frozen array.
 */
function _getViewerFromSessionRow(options: {
  row: ActiveSessionRow;
  visibleRuleIds: readonly string[];
}): Viewer {
  const role = getMemberRoleFromStoredValue(options.row.role);
  return {
    memberId: options.row.memberId,
    sessionId: options.row.sessionId,
    role,
    isAdmin: role === "admin",
    // The cache's frozen array, deliberately: `Viewer.visibleRuleIds` is
    // readonly because it is shared rather than copied.
    visibleRuleIds: options.visibleRuleIds,
  };
}

/** The row to slide and the instant to slide it to, in both spellings. */
type SlideOptions = {
  database: Kysely<Database>;
  row: ActiveSessionRow;
  nowIso: string;
  nowMs: number;
};

/**
 * Slides the session and the member's "last seen", at most once a day each.
 *
 * Without the throttle one timeline page of thumbnails is dozens of writes
 * serialising on SQLite's single writer. The visible consequence is stated in
 * `auth.md` and is correct rather than stale: a device can read "29 days left"
 * immediately after being used.
 */
async function _slideIfDue(options: SlideOptions): Promise<void> {
  const { database, row, nowIso, nowMs } = options;

  if (_isSlideDue({ lastAt: row.lastUsedAt, nowMs })) {
    await database
      .updateTable("sessions")
      .set({
        last_used_at: nowIso,
        expires_at: new Date(nowMs + SESSION_LIFETIME_MS).toISOString(),
      })
      .where("id", "=", row.sessionId)
      .execute();
  }

  if (_isSlideDue({ lastAt: row.lastSeenAt, nowMs })) {
    await database
      .updateTable("members")
      .set({ last_seen_at: nowIso })
      .where("id", "=", row.memberId)
      .execute();
  }
}
