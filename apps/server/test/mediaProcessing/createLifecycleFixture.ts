import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { createMediaDecodeCoordinator } from "../../src/mediaProcessing/createMediaDecodeCoordinator.ts";
import { createMediaProcessingJob } from "../../src/mediaProcessing/createMediaProcessingJob.ts";
import type { MediaProcessingRuntime } from "../../src/mediaProcessing/mediaProcessing.types.ts";
import { createFakeB2Client } from "../helpers/createFakeB2Client/createFakeB2Client.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";

type LifecycleFixture = {
  database: ReturnType<typeof createDatabase>;
  b2: ReturnType<typeof createFakeB2Client>;
  runtime: MediaProcessingRuntime;
  coordinator: ReturnType<typeof createMediaDecodeCoordinator>;
  clock: () => Date;
  shutdown: AbortController;
  makeJob: () => ReturnType<typeof createMediaProcessingJob>;
  itemId: string;
  sourceId: string;
  directory: string;
  advance: (milliseconds: number) => void;
};

async function _makeFixture(): Promise<LifecycleFixture> {
  const directory = await mkdtemp(join(tmpdir(), "processing-lifecycle-"));
  const database = createDatabase(join(directory, "catalog.db"));
  onTestFinished(async () => {
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  });
  const { itemId, sourceId } = await _seedCatalog(database);
  let instant = Date.now();
  const clock = () => {
    return new Date(instant);
  };
  const shutdown = new AbortController();
  const b2 = createFakeB2Client();
  const coordinator = createMediaDecodeCoordinator();
  const runtime = await _makeRuntime(directory);
  const logger = { info: () => {}, error: () => {} };
  const makeJob = () => {
    return createMediaProcessingJob({
      database,
      b2,
      clock,
      signal: shutdown.signal,
      coordinator,
      runtime,
      logger,
    });
  };
  return {
    database,
    b2,
    runtime,
    coordinator,
    clock,
    shutdown,
    makeJob,
    itemId,
    sourceId,
    directory,
    advance: (milliseconds: number) => {
      instant += milliseconds;
    },
  };
}

/**
 * Real catalog and output files; injected processor isolates orchestration
 * tests.
 */
export function createLifecycleFixture(): ReturnType<typeof _makeFixture> {
  return _makeFixture();
}

async function _makeRuntime(
  directory: string,
): Promise<MediaProcessingRuntime> {
  const path = join(directory, "encoded.jpg");
  await writeFile(path, "encoded");
  return {
    getCapabilities: async () => {
      return { available: true, reason: undefined };
    },
    processSource: async (options) => {
      await options.publish(
        (options.source.kind === "video"
          ? (["thumb", "poster", "video_mp4"] as const)
          : (["thumb", "display_small", "display"] as const)
        ).map((purpose) => {
          return {
            purpose,
            path,
            contentType: purpose === "video_mp4" ? "video/mp4" : "image/jpeg",
            byteSize: 7,
            width: 10,
            height: 10,
          };
        }),
      );
    },
    makeFingerprint: async () => {
      return undefined;
    },
  };
}

async function _seedCatalog(
  database: ReturnType<typeof createDatabase>,
): Promise<{ itemId: string; sourceId: string }> {
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceId = await insertRendition(database, {
    itemId,
    purpose: "original",
  });
  return { itemId, sourceId };
}
