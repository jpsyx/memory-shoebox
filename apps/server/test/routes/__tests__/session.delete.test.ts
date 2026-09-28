import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../../src/auth/sessionToken.ts";
import {
  NOW,
  insertMember,
  insertSession,
  shiftDays,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { createSessionApp } from "./sessionTestHelpers.ts";

describe("DELETE /api/auth/session", () => {
  it("signs the device out and clears the cookie", async () => {
    const { app, database, close } = await createSessionApp();
    const memberId = await insertMember(database, {
      email: "abuela@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("a-live-token"),
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=a-live-token` },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", sessionId)
      .execute();
    expect(rows).toEqual([]);
    await close();
  });

  it("answers 204 for a cookie that no longer resolves", async () => {
    // Signing out must never fail: somebody pressing "sign out" and being told
    // they are not signed in has been failed by the software.
    const { app, close } = await createSessionApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=already-gone` },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    await close();
  });

  it("answers 204 for a cookie whose session has expired", async () => {
    // A third state: the session row is really there, but its `expires_at`
    // has passed, and the middleware declines to resolve it. The delete keys
    // on the presented token rather than on a viewer, which is what makes
    // this the same path as a token no row matches.
    const { app, database, close } = await createSessionApp();
    const memberId = await insertMember(database, {
      email: "abuela@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("a-token-past-its-expiry"),
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=a-token-past-its-expiry` },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    // Expired is not the same as gone, and signing out takes the row rather
    // than leaving it for the sweep.
    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", sessionId)
      .execute();
    expect(rows).toEqual([]);
    await close();
  });

  it("answers 401 when no cookie was presented at all", async () => {
    const { app, close } = await createSessionApp();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("not_signed_in");
    await close();
  });

  it("does not touch last_seen_at, because signing out is not being seen", async () => {
    const { app, database, close } = await createSessionApp();
    // Seeded at NOW, not null: `createAuthenticator.test.ts` ("counts a
    // member who has never been seen as due") already fixes a null
    // `last_seen_at` as immediately due for the slide, on any authenticated
    // request. Starting from null here would make this case indistinguishable
    // from that one instead of from a genuine no-op.
    const memberId = await insertMember(database, {
      email: "abuela@example.com",
      last_seen_at: NOW,
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken("a-live-token"),
      last_used_at: NOW,
    });

    await app.inject({
      method: "DELETE",
      url: "/api/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=a-live-token` },
    });

    const row = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(row.last_seen_at).toBe(NOW);
    await close();
  });
});
