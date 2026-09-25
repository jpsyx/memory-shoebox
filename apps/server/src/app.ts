import Fastify, { type FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import { createB2Client, type B2Client } from "./b2/client.ts";
import type { Config } from "./config.ts";
import type { Database } from "./db/types.ts";
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
  /** Set false in tests to keep request logs out of the output. */
  logger?: boolean;
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
  const app = Fastify({ logger: deps.logger ?? true });

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
