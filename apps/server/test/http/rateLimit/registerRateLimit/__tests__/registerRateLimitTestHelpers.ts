import Fastify, {
  type FastifyInstance,
  type LightMyRequestResponse,
} from "fastify";
import { expect } from "vitest";
import { createDatabase } from "../../../../../src/db/client.ts";
import { registerRateLimit } from "../../../../../src/http/rateLimit/registerRateLimit.ts";
import { registerErrorHandler } from "../../../../../src/http/registerErrorHandler.ts";
import {
  registerRequestContext,
  type Authenticator,
  type Viewer,
} from "../../../../../src/http/requestContextHelpers.ts";

/** Shared registerRateLimit test input. */
export const ROSA: Viewer = {
  memberId: "member-rosa",
  sessionId: "session-rosa",
  role: "uploader",
  isAdmin: false,
  visibleRuleIds: [],
};

/** Provides registerRateLimit catalog fixtures and request controls. */
export async function createLimitedApp(authenticate?: Authenticator): Promise<{
  app: FastifyInstance;
  /** Closes the app and database after the scenario. */
  close: () => Promise<void>;
}> {
  const database = createDatabase(":memory:");
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerRequestContext(app, { authenticate });
  registerRateLimit(app, { database });
  return {
    app,
    close: async () => {
      await app.close();
      await database.destroy();
    },
  };
}

/** Checks setup rate limit reset. */
export async function expectSetupRateLimitReset(
  options: Readonly<{ limited: LightMyRequestResponse; app: FastifyInstance }>,
): Promise<void> {
  const { limited, app } = options;
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
}
