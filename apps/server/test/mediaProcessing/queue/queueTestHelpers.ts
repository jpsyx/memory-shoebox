import { mkdtempSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";

import { join } from "node:path";

import { expect, onTestFinished } from "vitest";

import { createDatabase } from "../../../src/db/client.ts";

import { migrateToLatest } from "../../../src/db/migrate.ts";

import { createMediaProcessingQueue } from "../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import type { ProcessingClaim } from "../../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";

import {
  insertItem,
  insertMember,
  insertRendition,
} from "../../helpers/seedHelpers/seedHelpers.ts";
/** Shared scenario fixture. */
export const START = "2026-10-14T12:00:00.000Z";
/** Shared scenario fixture. */
export async function createQueueFixture(): Promise<{
  database: ReturnType<typeof createDatabase>;
  path: string;
  queue: ReturnType<typeof createMediaProcessingQueue>;
  input: {
    itemId: string;
    sourceRenditionId: string;
    recipe: string;
    priority: number;
  };
  clock: () => Date;
  advance: (seconds: number) => void;
}> {
  const directory = mkdtempSync(join(tmpdir(), "processing-queue-"));
  const path = join(directory, "catalog.db");
  const database = createDatabase(path);
  let milliseconds = Date.parse(START);
  const clock = () => {
    return new Date(milliseconds);
  };
  const queue = createMediaProcessingQueue({ database, clock });
  onTestFinished(async () => {
    await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });
  await migrateToLatest(database);
  const memberId = await insertMember(database);
  const itemId = await insertItem(database, { uploadedBy: memberId });
  const sourceRenditionId = await insertRendition(database, {
    itemId,
    purpose: "original",
  });
  const input = { itemId, sourceRenditionId, recipe: "photo-v1", priority: 10 };
  return {
    database,
    path,
    queue,
    input,
    clock,
    advance: (seconds: number) => {
      milliseconds += seconds * 1000;
    },
  };
}
/** Shared scenario fixture. */
export async function claimProcessingJob(
  queue: ReturnType<typeof createMediaProcessingQueue>,
): Promise<ProcessingClaim> {
  const claim = await queue.claim();
  expect(claim).toEqual(
    expect.objectContaining({
      attemptToken: expect.any(String),
      leaseExpiresAt: expect.any(String),
    }),
  );
  return claim!;
}
/** Shared scenario fixture. */
export async function observeResponsiveOperations<Result>(
  work: () => Promise<Result>,
): Promise<{ result: Result; heartbeatDelayMs: number }> {
  const startedAt = performance.now();
  const heartbeat = new Promise<number>((done) => {
    setTimeout(() => {
      done(performance.now() - startedAt);
    }, 0);
  });
  const result = await work();
  return { result, heartbeatDelayMs: await heartbeat };
}
