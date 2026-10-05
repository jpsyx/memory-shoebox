import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { registerErrorHandler } from "../../../src/http/registerErrorHandler.ts";
import { registerRateLimit } from "../../../src/http/rateLimit/registerRateLimit.ts";
import { RATE_LIMIT_RULES } from "../../../src/http/rateLimit/rateLimit.constants.ts";
import {
  registerRequestContext,
  type Authenticator,
  type Viewer,
} from "../../../src/http/requestContextHelpers.ts";

const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: [],
};

/** An instance carrying the middleware, and whatever routes a test adds. */
type LimitedApp = {
  app: FastifyInstance;
  /** Closes the app and the database. Always call it, or vitest will hang. */
  close: () => Promise<void>;
};

/**
 * A bare instance carrying the error handler, the request context and the
 * limiter, in the order the application registers them.
 *
 * **Not the whole application**, although these are the same three
 * registrations. `createApp` installs the context and the limiter inside its
 * `/api` scope, so that a request for a static asset does no database work,
 * and a Fastify hook belongs to the instance it was added to. A route a test
 * adds to the root instance afterwards is outside that scope and would meet no
 * limiter at all, which every assertion below would then pass vacuously.
 *
 * The database is here because `registerRateLimit` asks for one. Only the
 * invitation rule reads it, and no test below names that rule, so it is never
 * queried and so never migrated.
 */
async function _createLimitedApp(
  options: { authenticate?: Authenticator } = {},
): Promise<LimitedApp> {
  const database = createDatabase(":memory:");
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerRequestContext(app, options);
  registerRateLimit(app, { database });
  return {
    app,
    close: async () => {
      await app.close();
      await database.destroy();
    },
  };
}

describe("the rate limit middleware", () => {
  it("answers 429 with retryAfterSeconds once a bucket is full", async () => {
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp();
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
    const context = await _createLimitedApp({
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
    const context = await _createLimitedApp();
    context.app.get("/api/health", () => {
      return { status: "ok" };
    });
    await context.app.ready();

    const response = await context.app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(context.app.rateLimiter.size()).toBe(0);
    await context.close();
  });
});

describe("publicReadPerIp", () => {
  it("allows a page reload far more often than a sign-in code", () => {
    expect(RATE_LIMIT_RULES.publicReadPerIp).toEqual({
      scope: "ip",
      windows: [{ limit: 120, windowSeconds: 60 }],
    });
  });
});

describe("setupCreatePerIp", () => {
  it("permits twenty hourly attempts per IP and resets after an hour", async () => {
    const database = createDatabase(":memory:");
    const app = Fastify({ logger: false });
    let now = new Date("2026-10-04T12:00:00.000Z");
    registerErrorHandler(app);
    registerRequestContext(app);
    registerRateLimit(app, {
      database,
      clock: () => {
        return now;
      },
    });
    app.post(
      "/api/setup",
      { config: { rateLimit: ["setupCreatePerIp"] } },
      () => {
        return { ok: true };
      },
    );
    try {
      await Array.from({ length: 20 }).reduce(async (previousAttempt) => {
        await previousAttempt;
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/setup",
              remoteAddress: "203.0.113.1",
            })
          ).statusCode,
        ).toBe(200);
      }, Promise.resolve());
      const limited = await app.inject({
        method: "POST",
        url: "/api/setup",
        remoteAddress: "203.0.113.1",
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json().details.retryAfterSeconds).toBe(3600);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/setup",
            remoteAddress: "203.0.113.2",
          })
        ).statusCode,
      ).toBe(200);
      now = new Date("2026-10-04T13:00:00.000Z");
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/setup",
            remoteAddress: "203.0.113.1",
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
      await database.destroy();
    }
  });
});
