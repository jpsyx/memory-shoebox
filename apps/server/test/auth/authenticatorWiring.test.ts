import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../src/auth/sessionToken.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
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

  it("does no database work for a request the API does not own", async () => {
    // The SPA is served from this same origin, so a signed-in browser sends
    // the session cookie with every script, stylesheet and font it fetches.
    // Resolving a viewer for each of those would be a `sessions` join and a
    // `visibility.generation` read on a request with no viewer to use, which
    // is why both middlewares live inside the `/api` scope (`app.ts`).
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    let queries = 0;
    const counted = database.withPlugin({
      transformQuery: (args) => {
        queries += 1;
        return args.node;
      },
      transformResult: async (args) => {
        return args.result;
      },
    });

    const { app, close } = await createTestApp({ database: counted });
    const memberId = await insertMember(database, {
      email: "rosa@example.com",
    });
    await insertSession(database, {
      memberId,
      token_hash: makeTokenHashFromToken(TOKEN),
    });
    // Building the app migrated through the counted handle. The count that
    // matters starts at the request.
    queries = 0;

    await app.inject({
      method: "GET",
      url: "/assets/app.js",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${TOKEN}` },
    });

    // Nothing is asserted about the answer: whether it is the built file, the
    // SPA fallback or a JSON 404 depends on whether `apps/web/dist` happens to
    // exist on the machine running the suite, and none of the three is what
    // this pins. What it pins is that the cookie cost nothing either way.
    expect(queries).toBe(0);

    await close();
  });
});
