import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import {
  createRecordingMailSender,
  type RecordingMailSender,
} from "../helpers/createRecordingMailSender.ts";
import {
  NOW,
  insertInstanceSetting,
  insertMember,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

/** An app whose clock stands still and whose mail can be queued. */
async function _createSignInApp(): Promise<
  TestApp & { sender: RecordingMailSender }
> {
  const sender = createRecordingMailSender();
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
    mailSender: sender,
  });
  await insertInstanceSetting(testApp.database, {
    key: "public.base_url",
    value: "https://shoebox.example.com",
  });
  return { ...testApp, sender };
}

describe("POST /api/auth/sign-in-codes", () => {
  it("answers 202 with the normalised address and an expiry", async () => {
    const { app, close } = await _createSignInApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "  Abuela@Example.COM " },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      email: "abuela@example.com",
      expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
    });
    await close();
  });

  it("is byte-identical for an unknown address and a member's", async () => {
    // The form must not be usable to discover who is a member. The two
    // addresses are the same length deliberately: a different length would
    // make `content-length` differ for a reason that has nothing to do with
    // membership, and prove nothing either way.
    const { app, database, close } = await _createSignInApp();
    await insertMember(database, { email: "abuela@example.com" });

    const known = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela@example.com" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "nobody@example.com" },
    });

    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.headers["content-type"]).toBe(known.headers["content-type"]);
    expect(unknown.headers["content-length"]).toBe(
      known.headers["content-length"],
    );
    expect(Object.keys(unknown.json())).toEqual(Object.keys(known.json()));
    expect(unknown.json()).toEqual({
      email: "nobody@example.com",
      expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
    });

    // Both wrote a code row. Only one is mailed, and that difference is one
    // local INSERT rather than a branch anybody can see.
    const codes = await database
      .selectFrom("sign_in_codes")
      .select("email")
      .execute();
    expect(codes).toHaveLength(2);
    await close();
  });

  it("never calls the provider in band", async () => {
    // A provider timeout on one branch and not the other is the timing
    // difference `auth.md` refuses to allow. The queue is the whole defence:
    // nothing sends inside the request.
    const { app, database, sender, close } = await _createSignInApp();
    await insertMember(database, { email: "abuela@example.com" });

    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela@example.com" },
    });

    const email = await database
      .selectFrom("outbound_emails")
      .select(["state", "sent_at", "attempts"])
      .executeTakeFirstOrThrow();
    expect(email).toEqual({ state: "queued", sent_at: null, attempts: 0 });
    // The message is waiting, and separately, nobody has tried to send it.
    expect(sender.sent).toEqual([]);
    await close();
  });

  it("refuses a body that is not an address", async () => {
    const { app, close } = await _createSignInApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_request");
    expect(response.json().details.fieldErrors).toHaveProperty("email");
    await close();
  });

  it("stops at five an hour for one address, shared with the resend", async () => {
    const { app, close } = await _createSignInApp();
    const payload = { email: "abuela@example.com" };

    const responses = [];
    // Five mints, then a sixth on the *other* route: the bucket is shared, or
    // the resend is a way round the cap.
    for (let index = 0; index < 5; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/api/auth/sign-in-codes",
          payload,
        }),
      );
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload,
    });

    expect(
      responses.map((response) => {
        return response.statusCode;
      }),
    ).toEqual([202, 202, 202, 202, 202]);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error).toBe("rate_limited");
    expect(sixth.json().details.retryAfterSeconds).toBeGreaterThan(0);
    await close();
  });

  it("counts a non-member's attempts too, or the limiter is the oracle", async () => {
    const { app, close } = await _createSignInApp();
    const payload = { email: "nobody@example.com" };

    for (let index = 0; index < 5; index += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/sign-in-codes",
        payload,
      });
    }
    const sixth = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload,
    });

    expect(sixth.statusCode).toBe(429);
    await close();
  });
});

describe("POST /api/auth/sign-in-codes/resend", () => {
  it("mints, and says so in the same words", async () => {
    const { app, close } = await _createSignInApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload: { email: "abuela@example.com" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      email: "abuela@example.com",
      expiresAt: shiftMinutes({ instant: NOW, minutes: 10 }),
    });
    await close();
  });

  it("stops the old code working, which is what the copy promises", async () => {
    const { app, database, close } = await _createSignInApp();
    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes",
      payload: { email: "abuela@example.com" },
    });
    await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload: { email: "abuela@example.com" },
    });

    const rows = await database
      .selectFrom("sign_in_codes")
      .select("invalidated_at")
      .orderBy("created_at", "asc")
      .execute();
    expect(rows[0]?.invalidated_at).toBe(NOW);
    expect(rows[1]?.invalidated_at).toBeNull();
    await close();
  });

  it("works without the first route ever having been called", async () => {
    // Somebody reloads the page and presses "Send another".
    const { app, close } = await _createSignInApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in-codes/resend",
      payload: { email: "abuela@example.com" },
    });
    expect(response.statusCode).toBe(202);
    await close();
  });
});
