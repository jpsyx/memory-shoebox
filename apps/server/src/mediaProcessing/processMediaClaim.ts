import type { MediaProcessingJobOptions } from "./mediaProcessing.types.ts";
import type { ProcessingClaim } from "./queue/mediaProcessingQueue.types.ts";
import { createMediaProcessingQueue } from "./queue/createMediaProcessingQueue.ts";
import { getMediaRecipeFromKind } from "./queue/getMediaRecipeFromKind.ts";
import { reserveMediaOutputs } from "./output/reserveMediaOutputs.ts";
import { uploadProcessingOutput } from "./output/uploadProcessingOutput.ts";
import { publishMediaRenditions } from "./output/publishMediaRenditions.ts";
import type { ProcessedRendition } from "./recipes/mediaRecipes.types.ts";

type AttemptOptions = MediaProcessingJobOptions & { claim: ProcessingClaim };
const TRANSIENT_ERRORS = new Set([
  "processing_upstream_timeout",
  "processing_upstream_unavailable",
  "processing_source_truncated",
  "processing_upload_unavailable",
  "processing_probe_input_unavailable",
]);

async function _publish(
  options: Readonly<AttemptOptions>,
  renditions: readonly ProcessedRendition[],
): Promise<void> {
  options.signal.throwIfAborted();
  const outputs = await reserveMediaOutputs({
    ...options,
    renditions,
    now: options.clock().toISOString(),
  });
  await outputs.reduce(async (previous, output) => {
    await previous;
    try {
      await uploadProcessingOutput({
        ...options,
        outputId: output.outputId,
        ...output.rendition,
      });
    } catch (error) {
      if (
        options.signal.aborted ||
        (error instanceof Error &&
          error.message === "processing_output_ownership_lost")
      ) {
        throw error;
      }
      throw new Error("processing_upload_unavailable");
    }
  }, Promise.resolve());
  options.signal.throwIfAborted();
  if (
    !(await publishMediaRenditions({
      ...options,
      outputs,
      now: options.clock().toISOString(),
    }))
  ) {
    throw new Error("processing_output_ownership_lost");
  }
}

async function _process(options: Readonly<AttemptOptions>): Promise<void> {
  const source = await options.database
    .selectFrom("item_renditions as rendition")
    .innerJoin("items", "items.id", "rendition.item_id")
    .select(["rendition.storage_key", "rendition.byte_size", "items.kind"])
    .where("rendition.id", "=", options.claim.sourceRenditionId)
    .where("rendition.item_id", "=", options.claim.itemId)
    .where("rendition.purpose", "=", "original")
    .executeTakeFirst();
  if (source === undefined) {
    throw new Error("processing_source_changed");
  }
  if (options.claim.recipe !== getMediaRecipeFromKind(source.kind)) {
    throw new Error("processing_recipe_changed");
  }
  await options.runtime.processSource({
    b2: options.b2,
    signal: options.signal,
    source: {
      key: source.storage_key,
      byteSize: source.byte_size,
      kind: source.kind === "video" ? "video" : "photo",
    },
    publish: (outputs) => {
      return _publish(options, outputs);
    },
  });
}

async function _finishFailure(
  options: Readonly<AttemptOptions>,
  error: unknown,
): Promise<void> {
  const code = options.signal.aborted
    ? "processing_cancelled"
    : error instanceof Error && /^processing_[a-z_]+$/.test(error.message)
      ? error.message
      : "processing_failed";
  const job = await options.database
    .selectFrom("media_processing_jobs")
    .select("attempts")
    .where("id", "=", options.claim.jobId)
    .executeTakeFirst();
  const retry = TRANSIENT_ERRORS.has(code) || code === "processing_cancelled";
  const delay =
    code === "processing_cancelled"
      ? 0
      : Math.min(
          3_600_000,
          60_000 * 2 ** Math.min(6, Math.max(0, (job?.attempts ?? 1) - 1)),
        );
  await createMediaProcessingQueue(options).finish({
    claim: options.claim,
    state: retry ? "pending" : "unavailable",
    errorCode: code,
    nextAttemptAt: new Date(options.clock().getTime() + delay).toISOString(),
  });
  options.logger.info(
    { jobId: options.claim.jobId, code, retry },
    "media processing deferred",
  );
}

/** Renews every 30 seconds and drains all active work before relinquishing a lease. */
export async function processMediaClaim(
  options: Readonly<AttemptOptions>,
): Promise<void> {
  const lostLease = new AbortController();
  const bounded = {
    ...options,
    signal: AbortSignal.any([options.signal, lostLease.signal]),
  };
  const queue = createMediaProcessingQueue(options);
  let renewal = Promise.resolve();
  const heartbeat = setInterval(() => {
    renewal = renewal
      .then(async () => {
        if (!(await queue.renew(options.claim))) {
          lostLease.abort();
        }
      })
      .catch(() => {
        lostLease.abort();
      });
  }, 30_000);
  heartbeat.unref();
  try {
    await _process(bounded);
  } catch (error) {
    await _finishFailure(bounded, error);
  } finally {
    clearInterval(heartbeat);
    await renewal;
  }
}
