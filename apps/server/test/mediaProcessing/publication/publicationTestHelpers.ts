import { type Selectable, type QueryId } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { expect, onTestFinished } from "vitest";

import { createDatabase } from "../../../src/db/client.ts";

import { migrateToLatest } from "../../../src/db/migrate.ts";

import { createMediaProcessingQueue } from "../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import { reserveMediaOutputs } from "../../../src/mediaProcessing/output/reserveMediaOutputs.ts";

import { publishMediaRenditions } from "../../../src/mediaProcessing/output/publishMediaRenditions.ts";

import type { ProcessingClaim } from "../../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";

import type { ProcessedRendition } from "../../../src/mediaProcessing/recipes/mediaRecipes.types.ts";

import {
  insertItem,
  insertMember,
  insertRendition,
} from "../../helpers/seedHelpers/seedHelpers.ts";
/** Shared scenario fixture. */
export const NOW = "2026-10-14T12:00:00.000Z";
/** Shared scenario fixture. */
export async function createPublicationFixture(): Promise<{
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
}> {
  const database = createDatabase(":memory:");
  onTestFinished(() => {
    return database.destroy();
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceRenditionId = await seedRenditions(database, itemId);
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
  const outputs = await seedOutputs(database, claim);
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
/** Shared scenario fixture. */
export async function seedRenditions(
  database: ReturnType<typeof createDatabase>,
  itemId: string,
): Promise<string> {
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
/** Shared scenario fixture. */
export async function seedOutputs(
  database: ReturnType<typeof createDatabase>,
  claim: ProcessingClaim,
): Promise<Array<{ outputId: string; rendition: ProcessedRendition }>> {
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
/** Shared scenario fixture. */
export type Fixture = Awaited<ReturnType<typeof createPublicationFixture>>;
/** Shared scenario fixture. */
export async function readPublicationState(
  database: Fixture["database"],
): Promise<{
  renditions: Array<Selectable<Database["item_renditions"]>>;
  outputs: Array<Selectable<Database["media_processing_outputs"]>>;
  jobs: Array<Selectable<Database["media_processing_jobs"]>>;
  deletions: Array<Selectable<Database["pending_object_deletions"]>>;
}> {
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
/** Shared scenario fixture. */
export function runOutputTransition(
  fixture: Fixture,
  operation: "publish" | "reserve",
  database = fixture.database,
):
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
/** Shared scenario fixture. */
export function interruptAttempt(
  fixture: Fixture,
  interruption: "expire" | "abort",
): void {
  if (interruption === "expire") {
    fixture.advance();
  } else {
    fixture.shutdown.abort(new Error("shutdown"));
  }
}
/** Shared scenario fixture. */
export async function expectRefused(
  work: ReturnType<typeof runOutputTransition>,
  operation: "publish" | "reserve",
): Promise<void> {
  if (operation === "publish") {
    expect(await work).toBe(false);
  } else {
    await expect(work).rejects.toThrow("processing_output_ownership_lost");
  }
}
/** Shared scenario fixture. */
export function makeInterruptedDatabase(
  fixture: Fixture,
  target: string,
  interruption: "expire" | "abort",
): { database: Fixture["database"]; didInterrupt: () => boolean } {
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
        interruptAttempt(fixture, interruption);
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
