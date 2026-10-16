import { type Selectable, type QueryId } from "kysely";
import type { Database } from "../../../../src/db/types/db.types.ts";
import { expect, onTestFinished } from "vitest";

import { createDatabase } from "../../../../src/db/client.ts";

import { migrateToLatest } from "../../../../src/db/migrate.ts";

import { createMediaProcessingQueue } from "../../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import { reserveMediaOutputs } from "../../../../src/mediaProcessing/output/reserveMediaOutputs.ts";

import { publishMediaRenditions } from "../../../../src/mediaProcessing/output/publishMediaRenditions.ts";

import type { ProcessingClaim } from "../../../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";

import type { ProcessedRendition } from "../../../../src/mediaProcessing/recipes/mediaRecipes.types.ts";

import {
  insertItem,
  insertMember,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
type PublicationState = {
  renditions: Array<Selectable<Database["item_renditions"]>>;
  outputs: Array<Selectable<Database["media_processing_outputs"]>>;
  jobs: Array<Selectable<Database["media_processing_jobs"]>>;
  deletions: Array<Selectable<Database["pending_object_deletions"]>>;
};

type PublicationFixture = {
  database: ReturnType<typeof createDatabase>;
  queue: ReturnType<typeof createMediaProcessingQueue>;
  claim: ProcessingClaim;
  outputs: Awaited<ReturnType<typeof seedOutputs>>;
  itemId: string;
  sourceRenditionId: string;
  clock: () => Date;
  shutdown: AbortController;
  signal: AbortSignal;
  advance: () => void;
  publish: () => ReturnType<typeof publishMediaRenditions>;
};

/** Fixed initial clock for publication claims and uploaded output rows. */
export const NOW = "2026-10-14T12:00:00.000Z";
/**
 * Creates a migrated in-memory catalog, claimed photo job and uploaded outputs
 * with controlled clock/cancellation; registers database cleanup.
 */
export async function createPublicationFixture(): Promise<PublicationFixture> {
  const database = createDatabase(":memory:");
  onTestFinished(() => {
    return database.destroy();
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceRenditionId = await seedRenditions({ database, itemId });
  let now = NOW;
  const clock = () => {
    return new Date(now);
  };
  const shutdown = new AbortController();
  const queue = createMediaProcessingQueue({ database, clock });
  await queue.enqueue({
    itemId,
    sourceRenditionId,
    recipe: "photo-v1",
    priority: 100,
  });
  const claim = (await queue.claim())!;
  const outputs = await seedOutputs({ database: database, claim: claim });
  return {
    database,
    queue,
    claim,
    outputs,
    itemId,
    sourceRenditionId,
    clock,
    shutdown,
    signal: shutdown.signal,
    advance: () => {
      now = "2026-10-14T12:02:00.000Z";
    },
    publish: () => {
      return publishMediaRenditions({
        database,
        claim,
        outputs,
        clock,
        signal: shutdown.signal,
      });
    },
  };
}
/**
 * Seeds the original and an older display rendition, returning the original
 * source ID for fencing tests.
 */
export async function seedRenditions({
  database,
  itemId,
}: Readonly<{
  database: ReturnType<typeof createDatabase>;
  itemId: string;
}>): Promise<string> {
  const sourceRenditionId = await insertRendition(database, {
    itemId,
    purpose: "original",
    storage_key: "original",
  });
  await insertRendition(database, {
    itemId,
    purpose: "display",
    storage_key: "old-display",
  });
  return sourceRenditionId;
}
/**
 * Seeds three uploaded derivative ownership rows for the claim and returns
 * their rendition descriptors.
 */
export async function seedOutputs({
  database,
  claim,
}: Readonly<{
  database: ReturnType<typeof createDatabase>;
  claim: Readonly<ProcessingClaim>;
}>): Promise<Array<{ outputId: string; rendition: ProcessedRendition }>> {
  const outputs = ["thumb", "display_small", "display"].map((purpose) => {
    return {
      outputId: `new-${purpose}`,
      rendition: {
        purpose,
        path: `/owned/${purpose}`,
        contentType: "image/jpeg",
        byteSize: 10,
        width: 10,
        height: 10,
      } as ProcessedRendition,
    };
  });
  await database
    .insertInto("media_processing_outputs")
    .values(
      outputs.map(({ outputId, rendition }) => {
        return {
          id: outputId,
          job_id: claim.jobId,
          item_id: claim.itemId,
          attempt_token: claim.attemptToken,
          storage_key: `derived/${outputId}`,
          purpose: rendition.purpose as "display",
          state: "uploaded" as const,
          multipart_upload_id: null,
          created_at: NOW,
          updated_at: NOW,
        };
      }),
    )
    .execute();
  return outputs;
}
/**
 * Owned publication context returned by the fixture, including clock,
 * cancellation and output state.
 */
export type Fixture = Awaited<ReturnType<typeof createPublicationFixture>>;
/**
 * Reads deterministically ordered rendition, output, job and pending-deletion
 * rows for atomicity comparisons.
 */
export async function readPublicationState(
  database: Fixture["database"],
): Promise<PublicationState> {
  return {
    renditions: await database
      .selectFrom("item_renditions")
      .selectAll()
      .orderBy("id")
      .execute(),
    outputs: await database
      .selectFrom("media_processing_outputs")
      .selectAll()
      .orderBy("id")
      .execute(),
    jobs: await database
      .selectFrom("media_processing_jobs")
      .selectAll()
      .orderBy("id")
      .execute(),
    deletions: await database
      .selectFrom("pending_object_deletions")
      .selectAll()
      .orderBy("id")
      .execute(),
  };
}
/**
 * Runs publication or reservation with the same claim, outputs and cancellation
 * against the selected database.
 */
export function runOutputTransition({
  fixture,
  operation,
  database = fixture.database,
}: Readonly<{
  fixture: Fixture;
  operation: "publish" | "reserve";
  database?: import("kysely").Kysely<Database>;
}>):
  | ReturnType<typeof publishMediaRenditions>
  | ReturnType<typeof reserveMediaOutputs> {
  const options = { ...fixture, database };
  return operation === "publish"
    ? publishMediaRenditions(options)
    : reserveMediaOutputs({
        ...options,
        renditions: fixture.outputs.map((output) => {
          return output.rendition;
        }),
      });
}
/**
 * Invalidates the fixture attempt by advancing past its lease or aborting its
 * shutdown signal.
 */
export function interruptAttempt({
  fixture,
  interruption,
}: Readonly<{ fixture: Fixture; interruption: "expire" | "abort" }>): void {
  if (interruption === "expire") {
    fixture.advance();
  } else {
    fixture.shutdown.abort(new Error("shutdown"));
  }
}
/**
 * Checks the operation-specific refusal contract: false publication or
 * ownership-lost reservation failure.
 */
export async function expectRefused({
  work,
  operation,
}: Readonly<{
  work: ReturnType<typeof runOutputTransition>;
  operation: "publish" | "reserve";
}>): Promise<void> {
  if (operation === "publish") {
    expect(await work).toBe(false);
  } else {
    await expect(work).rejects.toThrow("processing_output_ownership_lost");
  }
}
/**
 * Wraps the fixture database with a plugin that invalidates the attempt
 * immediately after a matching write and reports whether it fired.
 */
export function makeInterruptedDatabaseFromFixture({
  fixture,
  target,
  interruption,
}: Readonly<{
  fixture: Fixture;
  target: string;
  interruption: "expire" | "abort";
}>): { database: Fixture["database"]; didInterrupt: () => boolean } {
  const writes = new Set<QueryId>();
  let interrupted = false;
  const database = fixture.database.withPlugin({
    transformQuery: (args) => {
      const compiled = fixture.database
        .getExecutor()
        .compileQuery(args.node, args.queryId);
      if (compiled.sql.startsWith(target)) {
        writes.add(args.queryId);
      }
      return args.node;
    },
    transformResult: async (args) => {
      if (writes.delete(args.queryId)) {
        interrupted = true;
        interruptAttempt({ fixture, interruption });
      }
      return args.result;
    },
  });
  return {
    database,
    didInterrupt: () => {
      return interrupted;
    },
  };
}
