import type {
  MediaProcessingEnqueueInput,
  ProcessingClaim,
} from "../../../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";
import { mkdtempSync, rmSync } from "node:fs";

import { tmpdir } from "node:os";

import { join } from "node:path";

import { expect, onTestFinished } from "vitest";

import { createDatabase } from "../../../../src/db/client.ts";

import { migrateToLatest } from "../../../../src/db/migrate.ts";

import { createMediaProcessingQueue } from "../../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import {
  insertItem,
  insertMember,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
type QueueFixture = {
  database: ReturnType<typeof createDatabase>;
  path: string;
  queue: ReturnType<typeof createMediaProcessingQueue>;
  input: MediaProcessingEnqueueInput;
  clock: () => Date;
  advance: (seconds: number) => void;
};

/** Fixed initial clock for queue leases and retry scheduling. */
export const START = "2026-10-14T12:00:00.000Z";
/**
 * Creates an owned migrated disk catalog, source and queue with an advanceable
 * clock; registers database and directory cleanup.
 */
export async function createQueueFixture(): Promise<QueueFixture> {
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
/**
 * Claims one job, asserts its lease/token identity and returns the non-null
 * claim.
 */
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
/**
 * Runs work alongside a zero-delay timer and returns both its result and
 * observed event-loop heartbeat delay.
 */
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
