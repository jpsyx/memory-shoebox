import { describe, expect, it } from "vitest";
import type { Viewer } from "../../../src/http/requestContextHelpers.ts";
import { createTestApp } from "../../helpers/testApp.ts";

const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: [],
};

describe("the rate limit middleware", () => {
  it("answers 429 with retryAfterSeconds once a bucket is full", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    const send = () => {
      return context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "Rosa@Example.com " },
      });
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await send()).statusCode).toBe(200);
    }
    const refused = await send();

    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ error: "rate_limited" });
    expect(refused.json().details.retryAfterSeconds).toBeGreaterThan(0);
    await context.close();
  });

  it("shares one bucket between the request and the resend path", async () => {
    const context = await createTestApp();
    const config = { rateLimit: ["signInCodeRequestPerAddress"] } as const;
    context.app.post("/api/sign-in-codes", { config }, () => {
      return { ok: true };
    });
    context.app.post("/api/sign-in-codes/resend", { config }, () => {
      return { ok: true };
    });
    await context.app.ready();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "rosa@example.com" },
      });
    }

    const resend = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes/resend",
      payload: { email: "rosa@example.com" },
    });

    expect(resend.statusCode).toBe(429);
    await context.close();
  });

  it("counts different addresses separately", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "rosa@example.com" },
      });
    }

    const other = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes",
      payload: { email: "ines@example.com" },
    });

    expect(other.statusCode).toBe(200);
    await context.close();
  });

  it("normalises the address the way the row is, so one bucket holds them all", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    const spellings = [
      "rosa@example.com",
      "Rosa@Example.com",
      " rosa@example.com ",
      "ROSA@EXAMPLE.COM",
      "\trosa@Example.COM\n",
    ];
    for (const email of spellings) {
      const allowed = await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email },
      });
      expect(allowed.statusCode).toBe(200);
    }

    const refused = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes",
      payload: { email: "rosa@example.com" },
    });

    expect(refused.statusCode).toBe(429);
    // One counter, not five: every spelling landed on the same key.
    expect(context.app.rateLimiter.size()).toBe(1);
    await context.close();
  });

  it("keeps each rule's allowance separate, even when both key on an address", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    context.app.post(
      "/api/session",
      { config: { rateLimit: ["sessionCreatePerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: { email: "rosa@example.com" },
      });
    }

    // The sixth code request was refused. The session attempts are untouched.
    const attempt = await context.app.inject({
      method: "POST",
      url: "/api/session",
      payload: { email: "rosa@example.com" },
    });

    expect(attempt.statusCode).toBe(200);
    await context.close();
  });

  it("skips a rule whose scope value the request does not carry", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      { config: { rateLimit: ["signInCodeRequestPerAddress"] } },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    // No address to count, so the handler's own 400 is the right answer and
    // the limiter stands aside rather than inventing a bucket.
    const response = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(context.app.rateLimiter.size()).toBe(0);
    await context.close();
  });

  it("counts a body with no address against the per-IP rule regardless", async () => {
    const context = await createTestApp();
    context.app.post(
      "/api/sign-in-codes",
      {
        config: {
          rateLimit: ["signInCodeRequestPerAddress", "signInCodeRequestPerIp"],
        },
      },
      () => {
        return { ok: true };
      },
    );
    await context.app.ready();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await context.app.inject({
        method: "POST",
        url: "/api/sign-in-codes",
        payload: {},
      });
    }

    // Omitting the address skips its rule; it does not skip the IP's.
    const refused = await context.app.inject({
      method: "POST",
      url: "/api/sign-in-codes",
      payload: {},
    });

    expect(refused.statusCode).toBe(429);
    await context.close();
  });

  it("applies the default rule to an authenticated route that names none", async () => {
    const context = await createTestApp({
      authenticate: () => {
        return Promise.resolve(ROSA);
      },
    });
    context.app.get("/api/anything", () => {
      return { ok: true };
    });
    await context.app.ready();

    // 600 a minute: this asserts the rule is attached, not that it is slow.
    const first = await context.app.inject({
      method: "GET",
      url: "/api/anything",
    });

    expect(first.statusCode).toBe(200);
    expect(context.app.rateLimiter.size()).toBeGreaterThan(0);
    await context.close();
  });

  it("leaves an anonymous route with no rule alone", async () => {
    const context = await createTestApp();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(context.app.rateLimiter.size()).toBe(0);
    await context.close();
  });
});
