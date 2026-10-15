import type { Job } from "../jobs/createJobRunner.ts";
import type { MediaProcessingJobOptions } from "./mediaProcessing.types.ts";
import { recoverProcessingOutputs } from "./output/recoverProcessingOutputs.ts";
import { createMediaProcessingQueue } from "./queue/createMediaProcessingQueue.ts";
import { discoverMediaProcessingWork } from "./queue/discoverMediaProcessingWork.ts";
import { processMediaClaim } from "./processMediaClaim.ts";

type DiagnosticState = { lastDiagnostic: string | null | undefined };

async function _processDueWork(
  options: Readonly<MediaProcessingJobOptions>,
  state: DiagnosticState,
): Promise<void> {
  const capability = await options.runtime.getCapabilities(options.signal);
  if (!capability.available) {
    if (state.lastDiagnostic !== capability.reason) {
      options.logger.info(
        { reason: capability.reason },
        "automatic media processing disabled",
      );
      state.lastDiagnostic = capability.reason;
    }
    return;
  }
  const claim = await createMediaProcessingQueue(options).claim();
  if (claim !== undefined) {
    await processMediaClaim({ ...options, claim });
  }
}

async function _runTick(
  options: Readonly<MediaProcessingJobOptions>,
  state: DiagnosticState,
): Promise<void> {
  if (options.signal.aborted) {
    return;
  }
  await recoverProcessingOutputs({
    ...options,
    now: options.clock().toISOString(),
  });
  await discoverMediaProcessingWork({
    ...options,
    now: options.clock().toISOString(),
    limit: 100,
  });
  try {
    await options.coordinator.run(() => {
      return _processDueWork(options, state);
    }, options.signal);
  } catch (error) {
    if (!options.signal.aborted) {
      throw error;
    }
  }
  await recoverProcessingOutputs({
    ...options,
    now: options.clock().toISOString(),
  });
}

/** Joins the existing scheduler; construction never scans or fetches media. */
export function createMediaProcessingJob(
  options: Readonly<MediaProcessingJobOptions>,
): Job {
  const state: DiagnosticState = { lastDiagnostic: undefined };
  return {
    name: "media-processing",
    intervalMs: 30_000,
    run: () => {
      return _runTick(options, state);
    },
  };
}
