import { sql, type UpdateQueryBuilder, type UpdateResult } from "kysely";
import { createId } from "../../db/createId.ts";
import type { Database } from "../../db/types/db.types.ts";
import type {
  MediaProcessingEnqueueInput,
  MediaProcessingFinishInput,
  MediaProcessingQueue,
  MediaProcessingQueueOptions,
  ProcessingClaim,
} from "./mediaProcessingQueue.types.ts";
import { runMediaProcessingQueueTransition } from "./runMediaProcessingQueueTransition.ts";

const LEASE_DURATION_MS = 120_000;

async function _enqueue({
  options,
  input,
}: Readonly<{
  options: Readonly<MediaProcessingQueueOptions>;
  input: Readonly<MediaProcessingEnqueueInput>;
}>): Promise<void> {
  const now = options.clock().toISOString();
  await options.database
    .insertInto("media_processing_jobs")
    .values({
      id: createId(),
      item_id: input.itemId,
      source_rendition_id: input.sourceRenditionId,
      recipe: input.recipe,
      state: "pending",
      priority: input.priority,
      attempts: 0,
      next_attempt_at: now,
      lease_token: null,
      lease_expires_at: null,
      error_code: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((conflict) => {
      return conflict
        .columns(["item_id", "source_rendition_id", "recipe"])
        .doNothing();
    })
    .execute();
}

async function _claim(
  options: Readonly<MediaProcessingQueueOptions>,
): Promise<ProcessingClaim | undefined> {
  return runMediaProcessingQueueTransition({
    database: options.database,
    callback: async (database) => {
      const now = options.clock();
      const timestamp = now.toISOString();
      const expiry = new Date(now.getTime() + LEASE_DURATION_MS).toISOString();
      const result = await sql<ProcessingClaim>`update media_processing_jobs
      set state = 'running', attempts = attempts + 1,
        lease_token = ${createId()}, lease_expires_at = ${expiry},
        error_code = null, updated_at = ${timestamp}
      where id = (
        select id from media_processing_jobs
        where ((state = 'pending' and next_attempt_at <= ${timestamp})
          or (state = 'running' and lease_expires_at <= ${timestamp}))
        and not exists (
          select 1 from media_processing_jobs
          where state = 'running' and lease_expires_at > ${timestamp}
        )
        order by priority desc, next_attempt_at, created_at, id limit 1
      )
      returning id as "jobId", item_id as "itemId",
        source_rendition_id as "sourceRenditionId", recipe,
        lease_token as "attemptToken", lease_expires_at as "leaseExpiresAt"`.execute(
        database,
      );
      return result.rows[0];
    },
  });
}

function _getOwnedUpdate(
  options: Readonly<{
    database: MediaProcessingQueueOptions["database"];
    claim: Readonly<ProcessingClaim>;
    now: string;
  }>,
): UpdateQueryBuilder<
  Database,
  "media_processing_jobs",
  "media_processing_jobs",
  UpdateResult
> {
  return options.database
    .updateTable("media_processing_jobs")
    .where("id", "=", options.claim.jobId)
    .where("item_id", "=", options.claim.itemId)
    .where("source_rendition_id", "=", options.claim.sourceRenditionId)
    .where("recipe", "=", options.claim.recipe)
    .where("state", "=", "running")
    .where("lease_token", "=", options.claim.attemptToken)
    .where("lease_expires_at", ">", options.now);
}

async function _renew({
  options,
  claim,
}: Readonly<{
  options: Readonly<MediaProcessingQueueOptions>;
  claim: Readonly<ProcessingClaim>;
}>): Promise<boolean> {
  return runMediaProcessingQueueTransition({
    database: options.database,
    callback: async (database) => {
      const now = options.clock();
      const result = await _getOwnedUpdate({
        database,
        claim,
        now: now.toISOString(),
      })
        .set({
          lease_expires_at: new Date(
            now.getTime() + LEASE_DURATION_MS,
          ).toISOString(),
          updated_at: now.toISOString(),
        })
        .executeTakeFirst();
      return result.numUpdatedRows === 1n;
    },
  });
}

async function _finish({
  options,
  input,
}: Readonly<{
  options: Readonly<MediaProcessingQueueOptions>;
  input: Readonly<MediaProcessingFinishInput>;
}>): Promise<boolean> {
  return runMediaProcessingQueueTransition({
    database: options.database,
    callback: async (database) => {
      const now = options.clock().toISOString();
      const result = await _getOwnedUpdate({
        database,
        claim: input.claim,
        now,
      })
        .set({
          state: input.state,
          error_code: input.errorCode ?? null,
          next_attempt_at: input.nextAttemptAt ?? now,
          lease_token: null,
          lease_expires_at: null,
          updated_at: now,
        })
        .executeTakeFirst();
      return result.numUpdatedRows === 1n;
    },
  });
}

/** Constructs a durable queue without scheduling workers, timers or media I/O. */
export function createMediaProcessingQueue(
  options: Readonly<MediaProcessingQueueOptions>,
): MediaProcessingQueue {
  return {
    enqueue: (input) => {
      return _enqueue({ options, input });
    },
    claim: () => {
      return _claim(options);
    },
    renew: (claim) => {
      return _renew({ options, claim });
    },
    finish: (input) => {
      return _finish({ options, input });
    },
  };
}
