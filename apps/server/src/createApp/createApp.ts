import {
  makeReleaseStatusReaderFromDependencies,
  type ReleaseStatusReader,
} from "../settings/makeReleaseStatusReaderFromDependencies/makeReleaseStatusReaderFromDependencies.ts";
import { SHOEBOX_VERSION } from "../version.ts";
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import type { Kysely } from "kysely";
import { createAuthenticator } from "../auth/createAuthenticator.ts";
import { createB2Client } from "../b2/createB2Client/createB2Client.ts";
import { type B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { Config } from "../configHelpers.ts";
import type { Database } from "../db/types/db.types.ts";
import { registerErrorHandler } from "../http/registerErrorHandler.ts";
import { registerRateLimit } from "../http/rateLimit/registerRateLimit.ts";
import {
  registerRequestContext,
  type Authenticator,
} from "../http/requestContextHelpers.ts";
import type { JobRunner } from "../jobs/createJobRunner.ts";
import { registerAppBackgroundWork } from "./registerAppBackgroundWork.ts";
import { createMailDomainReader } from "../mail/createMailDomainReader.ts";
import type { MailDomainReader } from "../mail/mailDomainReader.types.ts";
import { registerObservationRoutes } from "../routes/registerObservationRoutes.ts";
import { registerGroupRoutes } from "../routes/registerGroupRoutes.ts";
import { registerMemberRoutes } from "../routes/registerMemberRoutes.ts";
import { registerSetupRoutes } from "../routes/registerSetupRoutes.ts";
import { registerSettingsRoutes } from "../routes/registerSettingsRoutes.ts";
import { registerMailHealthRoutes } from "../routes/registerMailHealthRoutes.ts";
import {
  createEmailService,
  getEmailServiceKind,
} from "../mail/EmailService/createEmailService.ts";
import type { EmailService } from "../mail/EmailService/EmailService.types.ts";
import { authRoutes } from "../routes/auth.ts";
import { burstsRoutes } from "../routes/bursts.ts";
import { commentsRoutes } from "../routes/comments.ts";
import { filtersRoutes } from "../routes/filters.ts";
import { healthRoutes } from "../routes/health.ts";
import { itemsRoutes } from "../routes/items/items.ts";
import { registerMilestoneRoutes } from "../routes/registerMilestoneRoutes/registerMilestoneRoutes.ts";
import { registerRemovalRoutes } from "../routes/removals/registerRemovalRoutes.ts";
import { bootstrapRoutes } from "../routes/bootstrapRoutes.ts";
import { meRoutes } from "../routes/me.ts";
import { peopleRoutes } from "../routes/people.ts";
import { publicSettingsRoutes } from "../routes/publicSettings.ts";
import { tagsRoutes } from "../routes/tags.ts";
import { mediaPreviewRoutes } from "../routes/mediaPreviewRoutes.ts";
import { timelineRoutes } from "../routes/timelineRoutes.ts";
import { uploadSessionsRoutes } from "../routes/uploadSessionsRoutes/uploadSessionsRoutes.ts";
import { visibilityRulesRoutes } from "../routes/visibilityRules.ts";
import { API_PREFIX, registerStaticSpa } from "../web/registerStaticSpa.ts";

// Everything decorated onto the instance is reachable from any route handler
// as `request.server.<name>`, which keeps handlers free of module-level state.
declare module "fastify" {
  interface FastifyInstance {
    /** Admin-only cached public release lookup. */
    releaseStatusReader: ReleaseStatusReader;
    config: Config;
    database: Kysely<Database>;
    b2: B2Client;
    jobRunner: JobRunner;
    emailService: EmailService | undefined;
    /** Read-only provider verification seam. */
    mailDomainReader: MailDomainReader | undefined;
    /** The clock every handler reads, so a test can hold time still. */
    clock: () => Date;
  }
}

/** Everything the application needs from the outside world. */
export type AppDeps = {
  /** Override the upstream release lookup in isolated tests. */
  releaseStatusReader?: ReleaseStatusReader;
  config: Config;
  database: Kysely<Database>;
  /** Overridable so tests can supply a fake instead of talking to Backblaze. */
  b2?: B2Client;
  /**
   * Overridable so a test substitutes a recording double.
   *
   * Three states, and the field has to keep telling them apart. Omitting it
   * means "decide from the environment", which is `createEmailService`'s
   * answer and may be the fake, Resend or nothing at all; a service means "use
   * this one"; and `"none"` means "deliberately do not send", which is a state
   * the instance runs in perfectly well: mail waits. The literal says at the
   * call site what a second boolean field could only say by agreeing with this
   * one.
   */
  emailService?: EmailService | "none";
  /** Override provider reads; "none" explicitly disables them. */
  mailDomainReader?: MailDomainReader | "none";
  /**
   * `false` in tests to keep request logs out of the output, or Pino options
   * to capture them.
   *
   * **Fastify's own option type, minus `true`.** This value is spread straight
   * into Fastify's `logger` a few lines below, so the type that belongs on it
   * is the one Fastify will read it as. The `Record<string, unknown>` that used
   * to stand here accepted any object at all, which meant a misspelled Pino
   * option or a wrongly-shaped serializer reached the framework with nothing
   * having checked it. `true` is excluded because it is not one of the three
   * states this field has: off, options, or omitted.
   *
   * **`serializers` is merged a level deeper than everything else**, so a
   * caller adding an unrelated serializer keeps the `req` one below rather
   * than replacing the whole object with a version Fastify fills in from its
   * default, which logs `remoteAddress`. That is the accident this shape
   * exists to prevent, and Fastify's type declares `serializers` statically,
   * so the deep merge needs no widening to reach it.
   *
   * Naming `req` itself still wins, and that is deliberate: overriding that
   * exact key is a choice somebody made on purpose, not a side effect of
   * wanting a different `err`.
   */
  logger?: Exclude<FastifyServerOptions["logger"], true>;
  /**
   * How a request resolves to a viewer. Defaults to the real session lookup;
   * a test may substitute its own.
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
} satisfies Exclude<FastifyServerOptions["logger"], boolean | undefined>;

/**
 * The service this instance sends through, or undefined when it sends nothing.
 *
 * A missing key is not a refusal to start. `docs/architecture.md` requires an
 * existing session to survive a mail outage, and an admin cannot configure mail
 * without first reaching the settings surface, so an unconfigured instance
 * boots with no service and the worker defers what is queued.
 *
 * Three states, and the field keeps telling them apart. Omitting it means
 * "decide from the environment", a service means "use this one", and `"none"`
 * means "deliberately do not send".
 */
function _buildEmailService(deps: AppDeps): EmailService | undefined {
  return deps.emailService === "none"
    ? undefined
    : (deps.emailService ?? createEmailService({ config: deps.config }));
}

function _decorateRuntimeDependencies(
  options: Readonly<{ app: FastifyInstance; deps: AppDeps }>,
): void {
  const { app, deps } = options;
  const clock =
    deps.clock ??
    (() => {
      return new Date();
    });
  app.decorate("clock", clock);
  app.decorate(
    "releaseStatusReader",
    deps.releaseStatusReader ??
      makeReleaseStatusReaderFromDependencies({
        currentVersion: SHOEBOX_VERSION,
        clock,
      }),
  );

  app.decorate("config", deps.config);
  app.decorate("database", deps.database);
  const b2 = deps.b2 ?? createB2Client(deps.config.b2);
  app.decorate("b2", b2);

  const emailService = _buildEmailService(deps);
  app.decorate("emailService", emailService);
  app.decorate(
    "mailDomainReader",
    deps.mailDomainReader === "none" || emailService === undefined
      ? typeof deps.mailDomainReader === "function"
        ? deps.mailDomainReader
        : undefined
      : (deps.mailDomainReader ?? createMailDomainReader(deps.config)),
  );
  // Said out loud once, because the three ways a message can go are otherwise
  // indistinguishable from outside: a `fake` instance looks exactly like a
  // working one to everybody except the person waiting for a code, and a
  // `none` instance looks exactly like one whose provider is down.
  //
  // This reads the environment rather than the service that was built, which
  // is only truthful because nothing in production passes `deps.emailService`.
  // Tests do, and they boot with `logger: false`, so the line never runs for
  // them. Give a real instance a way to inject one and this has to report what
  // was built instead.
  app.log.info(
    { emailService: getEmailServiceKind(deps.config) },
    "email delivery",
  );
}

// Both middlewares are registered in here rather than on the root instance,
// because the static SPA below is served from this same origin: a signed-in
// browser sends the session cookie with every script, stylesheet and font it
// fetches, and an authenticator on the root would answer each of those with a
// `sessions` join and a `visibility.generation` read. That is the exact
// per-request cost the slide is throttled to avoid, paid on requests that
// have no viewer to use. Fastify hooks are scoped to the instance they are
// added to, so putting them here is what confines them to the routes below.
//
// The order is the one `requestContextHelpers.ts` and `registerRateLimit.ts`
// describe: the context is an `onRequest` hook and the limiter a
// `preHandler`, so the limiter reads a viewer that is already attached. Both
// throw `ApiError`s, which the root's error handler, registered above, turns
// into the one envelope.
async function _registerApiRoutes(
  options: Readonly<{ app: FastifyInstance; deps: AppDeps }>,
): Promise<void> {
  const { app, deps } = options;
  await app.register(
    async (api) => {
      // Callers may replace the default catalog-backed session lookup.
      registerRequestContext(api, {
        authenticate:
          deps.authenticate ??
          createAuthenticator({ database: deps.database, clock: app.clock }),
      });
      registerRateLimit(api, { database: deps.database, clock: app.clock });

      await healthRoutes(api);
      await authRoutes(api);
      await registerSetupRoutes(api);
      await meRoutes(api);
      await bootstrapRoutes(api);
      await timelineRoutes(api);
      await mediaPreviewRoutes(api);
      await publicSettingsRoutes(api);
      await registerSettingsRoutes(api);
      await registerMemberRoutes(api);
      await registerGroupRoutes(api);
      await registerMailHealthRoutes(api);
      await registerObservationRoutes(api);
      await tagsRoutes(api);
      await registerMilestoneRoutes(api);
      await registerRemovalRoutes(api);

      await filtersRoutes(api);
      await peopleRoutes(api);
      await itemsRoutes(api);
      await burstsRoutes(api);
      await commentsRoutes(api);
      await visibilityRulesRoutes(api);
      await uploadSessionsRoutes(api);
    },
    { prefix: API_PREFIX },
  );
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
export async function createApp(
  deps: Readonly<AppDeps>,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : {
            ...LOGGER_OPTIONS,
            ...deps.logger,
            // One level deeper than the spread above, so an override that
            // names some other serializer does not take `req` with it.
            serializers: {
              ...LOGGER_OPTIONS.serializers,
              ...deps.logger?.serializers,
            },
          },
    // Fly contributes one trusted hop; earlier forwarded addresses are
    // untrusted.
    trustProxy: deps.config.isProduction
      ? (_address, hop) => {
          return hop === 0;
        }
      : false,
  });

  registerErrorHandler(app);
  _decorateRuntimeDependencies({ app, deps });
  registerAppBackgroundWork({ app, deps });

  await _registerApiRoutes({ app, deps });

  await registerStaticSpa({
    app,
    options: { distPath: deps.config.webDistPath },
  });

  return app;
}
