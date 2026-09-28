import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  NOW,
  insertMember,
  insertSession,
  shiftDays,
} from "../helpers/seedHelpers.ts";

const TOKEN = "a-token-somebody-is-holding";

describe("the authenticator, wired into the app", () => {
  it("runs on a real request, sliding a session last used two days ago", async () => {
    const twoDaysOn = shiftDays({ instant: NOW, days: 2 });
    const { app, database, close } = await createTestApp({
      clock: () => {
        return new Date(twoDaysOn);
      },
    });
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    const sessionId = await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
      expires_at: shiftDays({ instant: NOW, days: 30 }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${TOKEN}` },
    });
    expect(response.statusCode).toBe(200);

    const row = await database
      .selectFrom("sessions")
      .select("last_used_at")
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(row.last_used_at).toBe(twoDaysOn);

    await close();
  });

  it("writes nothing for a request carrying no cookie", async () => {
    const { app, database, close } = await createTestApp();
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
      last_seen_at: NOW,
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
      last_used_at: NOW,
    });

    await app.inject({ method: "GET", url: "/api/health" });

    const member = await database
      .selectFrom("members")
      .select("last_seen_at")
      .where("id", "=", memberId)
      .executeTakeFirstOrThrow();
    expect(member.last_seen_at).toBe(NOW);

    await close();
  });
});
