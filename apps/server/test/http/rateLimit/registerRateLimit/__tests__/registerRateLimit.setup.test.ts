import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../../../src/db/client.ts";
import { registerRateLimit } from "../../../../../src/http/rateLimit/registerRateLimit.ts";
import { registerErrorHandler } from "../../../../../src/http/registerErrorHandler.ts";
import { registerRequestContext } from "../../../../../src/http/requestContextHelpers.ts";
import { expectSetupRateLimitReset } from "./registerRateLimitTestHelpers.ts";

async function _expectPermittedSetupAttempts(
  app: FastifyInstance,
): Promise<void> {
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
}

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
      await _expectPermittedSetupAttempts(app);
      const limited = await app.inject({
        method: "POST",
        url: "/api/setup",
        remoteAddress: "203.0.113.1",
      });
      await expectSetupRateLimitReset({ limited, app });
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
