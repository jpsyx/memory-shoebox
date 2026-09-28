import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertMember,
  insertSession,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)";

describe("GET /api/me/sessions", () => {
  it("lists the member's own live devices, newest use first", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({
      database,
      member: { email: "abuela@example.com" },
      session: { device_label: "iPhone, Safari", last_used_at: NOW },
    });
    const olderId = await insertSession(database, {
      memberId: signedIn.memberId,
      device_label: "Mac, Safari",
      last_used_at: shiftDays({ instant: NOW, days: -3 }),
      expires_at: shiftDays({ instant: NOW, days: 27 }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.nextCursor).toBeNull();
    expect(
      body.sessions.map((session: { sessionId: string }) => {
        return session.sessionId;
      }),
    ).toEqual([signedIn.sessionId, olderId]);
    expect(body.sessions[0]).toEqual({
      sessionId: signedIn.sessionId,
      deviceLabel: "iPhone, Safari",
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: shiftDays({ instant: NOW, days: 30 }),
      isCurrent: true,
    });
    expect(body.sessions[1].isCurrent).toBe(false);
    await close();
  });

  it("never serves the raw user agent", async () => {
    // A device row is a label and two timestamps, and that is the whole of it
    // (`conventions.md` § Forbidden in any payload).
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({
      database,
      session: { user_agent: USER_AGENT },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.payload).not.toContain("Mozilla");
    await close();
  });

  it("leaves out an expired row, which no job has swept yet", async () => {
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

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.json().sessions).toHaveLength(1);
    await close();
  });

  it("never lists somebody else's device", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    await insertSession(database, { memberId: otherId });

    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.json().sessions).toHaveLength(1);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/me/sessions",
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});

describe("DELETE /api/me/sessions/:sessionId", () => {
  it("signs another device out and leaves this one alone", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherDeviceId = await insertSession(database, {
      memberId: signedIn.memberId,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${otherDeviceId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const rows = await database.selectFrom("sessions").select("id").execute();
    expect(rows).toEqual([{ id: signedIn.sessionId }]);
    await close();
  });

  it("clears the cookie when the device is this one", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${signedIn.sessionId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
    await close();
  });

  it("answers 404 for another member's device, never 403", async () => {
    // A 403 would confirm that a session exists at that id, which is exactly
    // what the rule exists to prevent (`conventions.md` § Errors).
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const theirDeviceId = await insertSession(database, {
      memberId: otherId,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${theirDeviceId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("session_not_found");

    const rows = await database
      .selectFrom("sessions")
      .select("id")
      .where("id", "=", theirDeviceId)
      .execute();
    expect(rows).toHaveLength(1);
    await close();
  });

  it("answers an identical 404 for an id that never existed", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });
    const otherId = await insertMember(database, {
      email: "ines@example.com",
    });
    const theirDeviceId = await insertSession(database, { memberId: otherId });

    const theirs = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${theirDeviceId}`,
      headers: { cookie: signedIn.cookie },
    });
    const nobodys = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${createId()}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(nobodys.statusCode).toBe(theirs.statusCode);
    expect(nobodys.payload).toBe(theirs.payload);
    await close();
  });

  it("answers 404 for a device that has already fallen out", async () => {
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    const signedIn = await insertSignedInMember({ database });
    const expiredId = await insertSession(database, {
      memberId: signedIn.memberId,
      expires_at: shiftDays({ instant: NOW, days: -1 }),
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${expiredId}`,
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(404);
    await close();
  });

  it("refuses an id that is not a uuid", async () => {
    const { app, database, close } = await createTestApp();
    const signedIn = await insertSignedInMember({ database });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/me/sessions/not-a-uuid",
      headers: { cookie: signedIn.cookie },
    });

    expect(response.statusCode).toBe(400);
    await close();
  });

  it("answers 401 with no session", async () => {
    const { app, close } = await createTestApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/me/sessions/${createId()}`,
    });
    expect(response.statusCode).toBe(401);
    await close();
  });
});
