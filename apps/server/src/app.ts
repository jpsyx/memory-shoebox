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
import { createJobRegistry } from "./jobs/registry.ts";
import { createJobRunner, type JobRunner } from "./jobs/runner.ts";
import { createMailQueueJob } from "./mail/queueJob.ts";
import { createResendMailSender, type MailSender } from "./mail/sender.ts";
import { healthRoutes } from "./routes/health.ts";
import { API_PREFIX, registerStaticSpa } from "./web/staticSpa.ts";

// Everything decorated onto the instance is reachable from any route handler
// as `request.server.<name>`, which keeps handlers free of module-level state.
declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    database: Kysely<Database>;
    b2: B2Client;
    jobRunner: JobRunner;
    mailSender: MailSender | null;
  }
}

/** Everything the application needs from the outside world. */
export type AppDeps = {
  config: Config;
  database: Kysely<Database>;
  /** Overridable so tests can supply a fake instead of talking to Backblaze. */
  b2?: B2Client;
  /**
   * Overridable so a test substitutes a recording double. Null means the
   * instance has no `RESEND_API_KEY`, which is a state it runs in perfectly
   * well: mail waits.
   */
  mailSender?: MailSender | null;
  /**
   * `false` in tests to keep request logs out of the output, or Pino options
   * to capture them.
   *
   * **`serializers` is merged a level deeper than everything else**, so a
   * caller adding an unrelated serializer keeps the `req` one below rather
   * than replacing the whole object with a version Fastify fills in from its
   * default, which logs `remoteAddress`. That is the accident this shape
   * exists to prevent.
   *
   * Naming `req` itself still wins, and that is deliberate: overriding that
   * exact key is a choice somebody made on purpose, not a side effect of
   * wanting a different `err`.
   */
  logger?:
    | false
    | (Record<string, unknown> & { serializers?: Record<string, unknown> });
  /**
   * How a request resolves to a viewer. Step 3a supplies the session lookup;
   * until then every request is anonymous.
   */
  authenticate?: Authenticator;
  /** Overridable so a test can hold time still. Defaults to the real clock. */
  clock?: () => Date;
  /**
   * Whether to start the background jobs and the mail queue.
   *
   * False in tests, which call a job directly rather than waiting on an
   * interval. `index.ts` passes true.
   */
  startBackgroundWork?: boolean;
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
 * The sender this instance runs with, or null when it cannot send yet.
 *
 * A missing `RESEND_API_KEY` is not a refusal to start.
 * `docs/architecture.md` requires an existing session to survive a mail
 * outage, and an admin cannot configure mail without first reaching the
 * settings surface, so an unconfigured instance boots with a null sender and
 * the worker defers what is queued.
 */
function _resolveMailSender(deps: AppDeps): MailSender | null {
  if (deps.mailSender !== undefined) {
    return deps.mailSender;
  }
  if (deps.config.resendApiKey === undefined) {
    return null;
  }
  return createResendMailSender({ apiKey: deps.config.resendApiKey });
}

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
      : {
          logger: {
            ...LOGGER_OPTIONS,
            ...deps.logger,
            // One level deeper than the spread above, so an override that
            // names some other serializer does not take `req` with it.
            serializers: {
              ...LOGGER_OPTIONS.serializers,
              ...deps.logger?.serializers,
            },
          },
        },
  );

  registerErrorHandler(app);
  registerRequestContext(app, { authenticate: deps.authenticate });
  registerRateLimit(app, { database: deps.database, clock: deps.clock });

  app.decorate("config", deps.config);
  app.decorate("database", deps.database);
  const b2 = deps.b2 ?? createB2Client(deps.config.b2);
  app.decorate("b2", b2);

  const mailSender = _resolveMailSender(deps);
  app.decorate("mailSender", mailSender);

  const jobRunner = createJobRunner({
    jobs: [
      ...createJobRegistry({ database: deps.database, b2, clock: deps.clock }),
      createMailQueueJob({
        database: deps.database,
        sender: mailSender,
        clock: deps.clock,
      }),
    ],
    logger: app.log,
  });
  app.decorate("jobRunner", jobRunner);

  if (deps.startBackgroundWork === true) {
    jobRunner.start();
  }

  // Fly stops a machine with SIGTERM, and index.ts closes the app on it. The
  // schedule has to stop with the server, or a sweep runs against a database
  // that is being closed underneath it.
  app.addHook("onClose", async () => {
    await jobRunner.stop();
  });

  await app.register(
    async (api) => {
      await healthRoutes(api);
    },
    { prefix: API_PREFIX },
  );

  await registerStaticSpa(app, { distPath: deps.config.webDistPath });

  return app;
}
