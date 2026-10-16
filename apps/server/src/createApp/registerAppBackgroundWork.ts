import type { FastifyInstance } from "fastify";
import type { AppDeps } from "./createApp.ts";
import { createMediaDecodeCoordinator } from "../mediaProcessing/createMediaDecodeCoordinator.ts";
import { createMediaProcessingRuntime } from "../mediaProcessing/createMediaProcessingRuntime.ts";
import { createMediaProcessingJob } from "../mediaProcessing/createMediaProcessingJob.ts";
import { createJobRegistry } from "../jobs/createJobRegistry.ts";
import { createMailQueueJob } from "../mail/createMailQueueJob.ts";
import { createVisualFingerprintBackfillJob } from "../maintenance/visualFingerprintBackfill/createVisualFingerprintBackfillJob.ts";
import { createJobRunner } from "../jobs/createJobRunner.ts";

/** Registers owned jobs and stops them before the application closes. */
export function registerAppBackgroundWork(
  options: Readonly<{ app: FastifyInstance; deps: AppDeps }>,
): void {
  const { app, deps } = options;
  const backgroundShutdown = new AbortController();
  const processingDependencies = {
    database: deps.database,
    b2: app.b2,
    clock: app.clock,
    logger: app.log,
    signal: backgroundShutdown.signal,
    coordinator: createMediaDecodeCoordinator(),
    runtime: createMediaProcessingRuntime(deps.config.mediaProcessing),
  };
  const jobRunner = createJobRunner({
    jobs: [
      createMediaProcessingJob(processingDependencies),
      createVisualFingerprintBackfillJob(processingDependencies),
      ...createJobRegistry({
        database: deps.database,
        b2: app.b2,
        clock: app.clock,
      }),
      createMailQueueJob({
        database: deps.database,
        sender: app.emailService,
        clock: app.clock,
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
    backgroundShutdown.abort();
    await jobRunner.stop();
  });
}
