import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { createAuthenticator } from "../../src/auth/createAuthenticator.ts";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runSessionSweep } from "../../src/jobs/runSessionSweep.ts";
import { runSignInCodeSweep } from "../../src/jobs/runSignInCodeSweep.ts";
import { bumpVisibilityGeneration } from "../../src/visibility/bumpVisibilityGeneration.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertGroup,
  insertGroupMember,
  insertMember,
  insertSession,
  insertVisibilityRule,
  insertVisibilityRuleSubject,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

describe("a signed-out device stops working", () => {
  it("fails on its very next request", async () => {
    // "Lost a phone, or handed one on? Sign it out here and it stops working
    // immediately, wherever it is." That promise is what rules out a stateless
    // token and any cache without invalidation.
    const { app, database, close } = await createTestApp();
    const phone = await insertSignedInMember({
      database,
      token: "the-lost-phone",
      member: { email: "abuela@example.com" },
    });
    await insertSession(database, {
      memberId: phone.memberId,
      token_hash: makeTokenHashFromToken("the-laptop-at-home"),
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: phone.cookie },
    });
    expect(before.statusCode).toBe(200);

    const signOut = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${phone.sessionId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=the-laptop-at-home` },
    });
    expect(signOut.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: phone.cookie },
    });
    expect(after.statusCode).toBe(401);
    await close();
  });
});

describe("the session slide", () => {
  it("writes at most once a day under a hundred requests", async () => {
    // Without the throttle, one page of thumbnails is dozens of writes
    // serialising on SQLite's single writer.
    const twoDaysOn = shiftDays({ instant: NOW, days: 2 });
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(twoDaysOn);
      },
    });
    const signedIn = await insertSignedInMember({
      database,
      session: {
        last_used_at: NOW,
        expires_at: shiftDays({ instant: NOW, days: 30 }),
      },
      member: { last_seen_at: NOW },
    });

    // The first request is due, and slides.
    await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { cookie: signedIn.cookie },
    });

    // A marker no code would ever write. Any later slide overwrites it, so the
    // assertion below counts writes without needing to watch the driver.
    const MARKER = "2099-01-01T00:00:00.000Z";
    await database
      .updateTable("sessions")
      .set({ expires_at: MARKER })
      .where("id", "=", signedIn.sessionId)
      .execute();
    await database
      .updateTable("members")
      .set({ last_seen_at: MARKER })
      .where("id", "=", signedIn.memberId)
      .execute();

    for (let index = 0; index < 99; index += 1) {
      await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { cookie: signedIn.cookie },
      });
    }

    const session = await database
      .selectFrom("sessions")
      .select(["last_used_at", "expires_at"])
      .where("id", "=", signedIn.sessionId)
      .executeTakeFirstOrThrow();
    expect(session.last_used_at).toBe(twoDaysOn);
    expect(session.expires_at).toBe(MARKER);

    const member = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", signedIn.memberId)
      .executeTakeFirstOrThrow();
    expect(member.last_seen_at).toBe(MARKER);

    await close();
  });
});

describe("a group edit reaches everybody", () => {
  it("changes B's rule set without B signing in, and clears A's cache", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    // One authenticator, as the app holds one: the cache is shared between
    // every viewer, which is the whole reason the generation is the key.
    const authenticate = createAuthenticator({ database });

    const requestFor = (token: string): FastifyRequest => {
      return {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      } as FastifyRequest;
    };

    const memberA = await insertMember(database, { email: "a@example.com" });
    const memberB = await insertMember(database, { email: "b@example.com" });
    await insertSession(database, {
      memberId: memberA,
      token_hash: makeTokenHashFromToken("token-a"),
    });
    await insertSession(database, {
      memberId: memberB,
      token_hash: makeTokenHashFromToken("token-b"),
    });

    const groupId = await insertGroup(database, { name: "Cousins" });
    const ruleId = await insertVisibilityRule(database, { mode: "only" });
    await insertVisibilityRuleSubject(database, { ruleId, groupId });

    // Both are seen once, so both are in the cache.
    expect(
      (await authenticate(requestFor("token-a")))?.visibleRuleIds,
    ).not.toContain(ruleId);
    expect(
      (await authenticate(requestFor("token-b")))?.visibleRuleIds,
    ).not.toContain(ruleId);

    // An admin adds them both to the group, in one transaction with the bump.
    await insertGroupMember(database, { groupId, memberId: memberA });
    await insertGroupMember(database, { groupId, memberId: memberB });
    await bumpVisibilityGeneration({ executor: database, now: NOW });

    // Neither has signed in again, and both see it.
    //
    // **B is read first on purpose, and swapping these two halves the test.**
    // Reading B re-seeds the map under the new generation, so A's entry is the
    // one a cache that evicted per key rather than emptying would leave stale.
    // Read in the other order, this still catches a cache that ignored the
    // generation, and stops catching that subtler bug.
    expect(
      (await authenticate(requestFor("token-b")))?.visibleRuleIds,
    ).toContain(ruleId);
    expect(
      (await authenticate(requestFor("token-a")))?.visibleRuleIds,
    ).toContain(ruleId);

    await database.destroy();
  });
});

describe("the two sweeps this slice fills the tables of", () => {
  it("clears a consumed code and an expired device", async () => {
    // Both are housekeeping rather than security: a consumed code is already
    // dead, and a session is looked up per request, so an expired row is too.
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({ database });
    await insertSession(database, {
      memberId: signedIn.memberId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    await database
      .insertInto("sign_in_codes")
      .values({
        id: "0192f2a0-7d3c-7000-8000-0000000000aa",
        email: "abuela@example.com",
        member_id: signedIn.memberId,
        code_hash: "deadbeef",
        attempts: 0,
        max_attempts: 3,
        expires_at: shiftMinutes({ instant: NOW, minutes: 10 }),
        consumed_at: NOW,
        invalidated_at: null,
        created_at: NOW,
      })
      .execute();

    // The expired device is already invisible before any sweep runs.
    const listed = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });
    expect(listed.json().sessions).toHaveLength(1);

    expect(await runSessionSweep({ database, now: NOW })).toEqual({
      deletedCount: 1,
    });
    expect(await runSignInCodeSweep({ database, now: NOW })).toEqual({
      deletedCount: 1,
    });

    const sessions = await database
      .selectFrom("sessions")
      .select("id")
      .execute();
    expect(sessions).toEqual([{ id: signedIn.sessionId }]);
    await close();
  });
});
