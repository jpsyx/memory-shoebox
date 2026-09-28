import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import { createAuthenticator } from "../../src/auth/createAuthenticator.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { bumpVisibilityGeneration } from "../../src/visibility/bumpVisibilityGeneration.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertMember,
  insertSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const TOKEN = "a-token-somebody-is-holding";

/** A request presenting `TOKEN`, or whatever else a test wants. */
function _requestWith(token: string | undefined): FastifyRequest {
  return {
    headers:
      token === undefined ? {} : { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  } as unknown as FastifyRequest;
}

describe("createAuthenticator", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("is anonymous when no cookie was presented", async () => {
    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith(undefined))).toBeUndefined();
  });

  it("is anonymous for a token no row matches", async () => {
    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith("not-a-token"))).toBeUndefined();
  });

  it("resolves a live session to its member", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      role: "uploader",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });

    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(NOW);
      },
    });
    const viewer = await authenticate(_requestWith(TOKEN));

    expect(viewer).toMatchObject({
      memberId,
      sessionId,
      role: "uploader",
      isAdmin: false,
    });
    expect(viewer?.visibleRuleIds).toContain(EVERYONE_VISIBILITY_RULE_ID);
  });

  it("marks an admin, whose access cannot be restricted by anyone", async () => {
    const memberId = await insertMember(database, {
      email: "admin@example.com",
      role: "admin",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });

    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith(TOKEN))).toMatchObject({
      role: "admin",
      isAdmin: true,
    });
  });

  it("is anonymous for a session past its expiry", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(NOW);
      },
    });
    expect(await authenticate(_requestWith(TOKEN))).toBeUndefined();
  });

  it("is anonymous for a member who has been removed", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      status: "removed",
      removed_at: NOW,
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });

    const authenticate = createAuthenticator({ database });
    expect(await authenticate(_requestWith(TOKEN))).toBeUndefined();
  });

  it("does not slide a session used an hour ago", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
    });

    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(Date.parse(NOW) + 60 * 60 * 1000);
      },
    });
    await authenticate(_requestWith(TOKEN));

    const row = await database
      .selectFrom("sessions")
      .select(["last_used_at", "expires_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(row.last_used_at).toBe(NOW);
    expect(row.expires_at).toBe(shiftDays({ instant: NOW, days: 30 }));
  });

  it("slides a session used two days ago, and the member's last seen", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      last_seen_at: NOW,
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
    });

    const later = shiftDays({ instant: NOW, days: 2 });
    const authenticate = createAuthenticator({
      database,
      clock: () => {
        return new Date(later);
      },
    });
    await authenticate(_requestWith(TOKEN));

    const session = await database
      .selectFrom("sessions")
      .select(["last_used_at", "expires_at"])
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_used_at).toBe(later);
    expect(session.expires_at).toBe(shiftDays({ instant: later, days: 30 }));

    const member = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(member.last_seen_at).toBe(later);
  });

  it("sees a group added to a rule without anybody signing in again", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    const groupId = await insertGroup(database, { name: "Cousins" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    const authenticate = createAuthenticator({ database });
    const before = await authenticate(_requestWith(TOKEN));
    expect(before?.visibleRuleIds).not.toContain(ruleId);

    // An admin adds her to the group, in one transaction with the bump.
    await insertGroupMember(database, { groupId, memberId });
    await bumpVisibilityGeneration({ executor: database, now: NOW });

    const after = await authenticate(_requestWith(TOKEN));
    expect(after?.visibleRuleIds).toContain(ruleId);
  });

  it("serves a cached expansion while the generation stands still", async () => {
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, memberId });

    const authenticate = createAuthenticator({ database });
    const first = await authenticate(_requestWith(TOKEN));
    expect(first?.visibleRuleIds).toContain(ruleId);

    // The subject is removed and nothing bumps, which is the state this cache
    // is allowed to be wrong in and the reason every such write must bump.
    await database
      .deleteFrom("visibility_rule_subjects")
      .where("rule_id", "=", ruleId)
      .execute();

    const second = await authenticate(_requestWith(TOKEN));
    expect(second?.visibleRuleIds).toContain(ruleId);
  });
});
