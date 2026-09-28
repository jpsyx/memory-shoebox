import { describe, expect, it } from "vitest";
import { mintSignInCode } from "../../../src/auth/mintSignInCode.ts";
import { SESSION_COOKIE_NAME } from "../../../src/auth/sessionCookie.ts";
import { makeTokenHashFromToken } from "../../../src/auth/sessionToken.ts";
import { runInImmediateTransaction } from "../../../src/db/runInImmediateTransaction.ts";
import type { TestApp } from "../../helpers/createTestApp.ts";
import {
  NOW,
  insertItem,
  insertMember,
  shiftDays,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { createSessionApp } from "./sessionTestHelpers.ts";

/** The header a phone sends, from which the device label is read. */
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/**
 * Walks a parsed JSON value and collects every numeric leaf, at any depth
 * and under any key. The ids in the response are strings, so this cannot
 * collide with `memberId` or `sessionId`; only a genuine number is caught.
 */
function _collectNumbers(value: unknown): number[] {
  if (typeof value === "number") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      return _collectNumbers(entry);
    });
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((entry) => {
      return _collectNumbers(entry);
    });
  }
  return [];
}

/** Mints a code for an address and hands back its digits. */
async function _mintFor(options: {
  testApp: TestApp;
  email: string;
}): Promise<string> {
  const minted = await runInImmediateTransaction({
    database: options.testApp.database,
    callback: (transaction) => {
      return mintSignInCode({
        transaction,
        email: options.email,
        pepper: options.testApp.config.signInCodePepper,
        now: NOW,
      });
    },
  });
  return minted.digits;
}

describe("POST /api/auth/session", () => {
  it("answers 201 with the account, the device and the shell's settings", async () => {
    const testApp = await createSessionApp();
    const { app, close } = testApp;
    await insertMember(testApp.database, {
      email: "abuela@example.com",
      display_name: "Abuela Rosa",
      role: "uploader",
    });
    const code = await _mintFor({ testApp, email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      headers: { "user-agent": USER_AGENT },
      payload: { email: "abuela@example.com", code },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual([
      "isFirstSignIn",
      "me",
      "session",
      "settings",
    ]);
    expect(body.me.member.displayName).toBe("Abuela Rosa");
    expect(body.me.email).toBe("abuela@example.com");
    expect(body.me.role).toBe("uploader");
    expect(body.session).toMatchObject({
      deviceLabel: "iPhone, Safari",
      createdAt: NOW,
      lastUsedAt: NOW,
      expiresAt: shiftDays({ instant: NOW, days: 30 }),
      isCurrent: true,
    });
    expect(body.settings).toEqual({
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "UTC",
    });
    await close();
  });

  it("sets a cookie the browser will keep and script cannot read", async () => {
    const testApp = await createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });
    const code = await _mintFor({ testApp, email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code },
    });

    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");

    // The cookie value is not the row: only its SHA-256 is stored.
    const token = setCookie.split(";")[0]?.split("=")[1] ?? "";
    const row = await database
      .selectFrom("sessions")
      .select("token_hash")
      .executeTakeFirstOrThrow();
    expect(row.token_hash).toBe(makeTokenHashFromToken(token));
    await close();
  });

  it("says nothing about how many items were seeded", async () => {
    // The number is the size of the whole archive rather than a
    // viewer-filtered count, so publishing it would tell a brand-new viewer
    // exactly how much exists beyond what they can open.
    const testApp = await createSessionApp();
    const { app, database, close } = testApp;
    const adminId = await insertMember(database, {
      email: "papa@example.com",
      role: "admin",
    });
    await insertMember(database, {
      email: "ines@example.com",
      status: "invited",
      joined_at: null,
    });
    const seededItemCount = 3;
    await insertItem(database, { uploadedBy: adminId });
    await insertItem(database, { uploadedBy: adminId, seq: 1 });
    await insertItem(database, { uploadedBy: adminId, seq: 2 });

    const code = await _mintFor({ testApp, email: "ines@example.com" });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "ines@example.com", code },
    });

    const body = response.json();
    expect(body.isFirstSignIn).toBe(true);
    // Checked on the keys rather than on `response.payload` as raw text: the
    // envelope carries two random ids (`me.member.memberId`,
    // `session.sessionId`), and a literal "does the JSON contain the digit
    // 3" check is a coin flip against those, not a check on the contract.
    // `createSessionResponseSchema` (`packages/shared/src/auth.ts`) is the
    // actual guarantee: "no seededCount, no itemCount, and no array whose
    // length tracks one", so the shape is what this asserts against.
    expect(Object.keys(body).sort()).toEqual([
      "isFirstSignIn",
      "me",
      "session",
      "settings",
    ]);
    // The key-set check alone would miss a count smuggled a level down,
    // inside `me`, `session` or `settings`. Walk the whole body and confirm
    // the seeded total does not surface as a number anywhere in it.
    expect(_collectNumbers(body)).not.toContain(seededItemCount);
    await close();
  });

  it("answers 401 with the tries left on a wrong code", async () => {
    const testApp = await createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });
    await _mintFor({ testApp, email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "000000" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "sign_in_code_invalid",
      details: { attemptsRemaining: 2 },
    });
    await close();
  });

  it("answers 410 and promises a new code on the third wrong one", async () => {
    const testApp = await createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });
    await _mintFor({ testApp, email: "abuela@example.com" });

    const wrong = {
      method: "POST" as const,
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "000000" },
    };
    await app.inject(wrong);
    await app.inject(wrong);
    const third = await app.inject(wrong);

    expect(third.statusCode).toBe(410);
    expect(third.json().error).toBe("sign_in_code_attempts_exhausted");
    expect(third.json().message).toMatch(/on its way/);

    const emails = await database
      .selectFrom("outbound_emails")
      .select("id")
      .execute();
    expect(emails).toHaveLength(2);
    await close();
  });

  it("answers 410 when there is no live code", async () => {
    const testApp = await createSessionApp();
    const { app, database, close } = testApp;
    await insertMember(database, { email: "abuela@example.com" });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "410233" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().error).toBe("sign_in_code_expired");
    await close();
  });

  it("refuses a code that is not six digits", async () => {
    const testApp = await createSessionApp();
    const { app, close } = testApp;

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload: { email: "abuela@example.com", code: "4102" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details.fieldErrors).toHaveProperty("code");
    await close();
  });

  it("stops at ten submissions an hour for one address", async () => {
    const testApp = await createSessionApp();
    const { app, close } = testApp;
    const payload = { email: "abuela@example.com", code: "000000" };

    for (let index = 0; index < 10; index += 1) {
      await app.inject({ method: "POST", url: "/api/auth/session", payload });
    }
    const eleventh = await app.inject({
      method: "POST",
      url: "/api/auth/session",
      payload,
    });

    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json().error).toBe("rate_limited");
    await close();
  });
});
