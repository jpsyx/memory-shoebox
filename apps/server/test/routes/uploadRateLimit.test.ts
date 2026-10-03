import { describe, expect, it } from "vitest";
import { RATE_LIMIT_RULES } from "../../src/http/rateLimit/rateLimit.constants.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";

/** The one window the upload rule declares. */
const [UPLOAD_WINDOW] = RATE_LIMIT_RULES.uploadSessionPerSession.windows;

async function _setUp() {
  const testApp = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const { cookie } = await insertSignedInMember({
    database: testApp.database,
  });
  // The cheapest upload route: a member with no batch is answered 204.
  const readCurrent = () => {
    return testApp.app.inject({
      method: "GET",
      url: "/api/upload-sessions/current",
      headers: { cookie },
    });
  };
  return { ...testApp, cookie, readCurrent };
}

/** Sends `count` requests one after another and answers their statuses. */
async function _statusesOf(
  functionOptions: Readonly<{
    count: number;
    send: () => Promise<{ statusCode: number }>;
  }>,
): Promise<number[]> {
  const { count, send } = functionOptions;

  const statuses: number[] = [];
  for (let index = 0; index < count; index += 1) {
    statuses.push((await send()).statusCode);
  }
  return statuses;
}

describe("the upload routes' rate limit", () => {
  it("sizes the window for a large batch, well past the default", () => {
    // A 264-file batch makes about four calls a file: three presigns and a
    // complete. The window holds that whole batch more than twice over.
    expect(UPLOAD_WINDOW?.windowSeconds).toBe(60);
    expect(UPLOAD_WINDOW?.limit).toBeGreaterThan(264 * 4 * 2);
    expect(UPLOAD_WINDOW?.limit).toBeGreaterThan(
      RATE_LIMIT_RULES.authenticatedDefault.windows[0].limit,
    );
  });

  it("is not held to the default 600 a minute", async () => {
    const { readCurrent, close } = await _setUp();

    const statuses = await _statusesOf({ count: 601, send: readCurrent });

    expect(new Set(statuses)).toEqual(new Set([204]));
    await close();
  });

  it("draws on a bucket of its own, leaving the default one untouched", async () => {
    const { app, cookie, readCurrent, close } = await _setUp();
    await _statusesOf({ count: 600, send: readCurrent });

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });

    expect(me.statusCode).toBe(200);
    await close();
  });

  it("still has a cap, answered with retryAfterSeconds", async () => {
    const { readCurrent, close } = await _setUp();
    const limit = UPLOAD_WINDOW?.limit ?? 0;

    const statuses = await _statusesOf({ count: limit, send: readCurrent });
    const refused = await readCurrent();

    expect(new Set(statuses)).toEqual(new Set([204]));
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ error: "rate_limited" });
    expect(refused.json().details.retryAfterSeconds).toBeGreaterThan(0);
    await close();
  });
});
