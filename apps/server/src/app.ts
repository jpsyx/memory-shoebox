import Fastify, { type FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { createB2Client, type B2Client } from "./b2/client.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/types.ts";
import { registerErrorHandler } from "./http/errorHandler.ts";
import { registerRateLimit } from "./http/rateLimit/plugin.ts";
import {
  registerRequestContext,
  type Authenticator,
} from "./http/requestContext.ts";
import { healthRoutes } from "./routes/health.ts";
import { API_PREFIX, registerStaticSpa } from "./web/staticSpa.ts";

// Everything decorated onto the instance is reachable from any route handler
// as `request.server.<name>`, which keeps handlers free of module-level state.
declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    database: Kysely<Database>;
    b2: B2Client;
  }
}

/** Everything the application needs from the outside world. */
export type AppDeps = {
  config: Config;
  database: Kysely<Database>;
  /** Overridable so tests can supply a fake instead of talking to Backblaze. */
  b2?: B2Client;
  /**
   * `false` in tests to keep request logs out of the output, or Pino options
   * to capture them. Anything passed here is merged over `LOGGER_OPTIONS`, so
   * the address-free serializer cannot be dropped by accident.
   */
  logger?: false | Record<string, unknown>;
  /**
   * How a request resolves to a viewer. Step 3a supplies the session lookup;
   * until then every request is anonymous.
   */
  authenticate?: Authenticator;
  /** Overridable so a test can hold time still. Defaults to the real clock. */
  clock?: () => Date;
};

/**
 * Request log fields, minus the caller's address.
 *
 * Fastify's default serializer logs `remoteAddress` and `remotePort`.
 * `data-models.md` § Privacy forbids an IP address reaching the database or
 * the application logs "in any form, coarse or otherwise", so the serializer
 * is replaced rather than the line being filtered later.
 */
const LOGGER_OPTIONS = {
  serializers: {
    req: (request: { method: string; url: string; id: string }) => {
      return { id: request.id, method: request.method, url: request.url };
    },
  },
};

/**
 * Builds the Fastify application.
 *
 * Returns an instance ready for `listen()` in production or `inject()` in
 * tests. Nothing here reads `process.env` or opens a database: the caller owns
 * those, so a test can wire up an in-memory database and a fake B2 client.
 *
 * @param deps The application's dependencies.
 * @returns The configured Fastify instance.
 */
export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify(
    deps.logger === false
      ? { logger: false }
      : { logger: { ...LOGGER_OPTIONS, ...(deps.logger ?? {}) } },
  );

  registerErrorHandler(app);
  registerRequestContext(app, { authenticate: deps.authenticate });
  registerRateLimit(app, { database: deps.database, clock: deps.clock });

  app.decorate("config", deps.config);
  app.decorate("database", deps.database);
  app.decorate("b2", deps.b2 ?? createB2Client(deps.config.b2));

  await app.register(
    async (api) => {
      await healthRoutes(api);
    },
    { prefix: API_PREFIX },
  );

  await registerStaticSpa(app, { distPath: deps.config.webDistPath });

  return app;
}
