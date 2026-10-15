import { execFile } from "node:child_process";

import { promisify } from "node:util";

import { expect, it, onTestFinished } from "vitest";

import { createDatabase } from "../../../src/db/client.ts";

import { runInImmediateTransaction } from "../../../src/db/runInImmediateTransaction.ts";

import { createMediaProcessingQueue } from "../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import type { ProcessingClaim } from "../../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";

import {
  START,
  claimProcessingJob,
  createQueueFixture,
  observeResponsiveOperations,
} from "./queueTestHelpers.ts";

it("atomically grants only one global claim to independent processes", async () => {
  const { database, path, queue, input } = await createQueueFixture();
  await queue.enqueue(input);
  await queue.enqueue({ ...input, recipe: "video-v1" });
  const script = `
    import { createDatabase } from ${JSON.stringify(new URL("../../../src/db/client.ts", import.meta.url).href)};
    import { createMediaProcessingQueue } from ${JSON.stringify(new URL("../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts", import.meta.url).href)};
    const database = createDatabase(process.argv[1]);
    const queue = createMediaProcessingQueue({ database, clock: () => new Date(${JSON.stringify(START)}) });
    const claim = await queue.claim();
    console.log(JSON.stringify(claim ?? null));
    await database.destroy();
  `;
  const results = await Promise.all(
    [1, 2].map(() => {
      return promisify(execFile)(process.execPath, [
        "--input-type=module",
        "--eval",
        script,
        path,
      ]);
    }),
  );
  expect(
    results
      .map((result) => {
        return JSON.parse(result.stdout);
      })
      .filter(Boolean),
  ).toHaveLength(1);
  expect(
    await database
      .selectFrom("media_processing_jobs")
      .select("id")
      .where("state", "=", "running")
      .execute(),
  ).toHaveLength(1);
});

it("keeps the event loop responsive when independent local handles compete for claims", async () => {
  const { database, path, queue, input, clock } = await createQueueFixture();
  await queue.enqueue(input);
  await queue.enqueue({ ...input, recipe: "video-v1" });
  const secondDatabase = createDatabase(path);
  onTestFinished(() => {
    return secondDatabase.destroy();
  });
  const secondQueue = createMediaProcessingQueue({
    database: secondDatabase,
    clock,
  });
  const { result, heartbeatDelayMs } = await observeResponsiveOperations(() => {
    return Promise.allSettled([queue.claim(), secondQueue.claim()]);
  });
  expect(heartbeatDelayMs).toBeLessThan(1000);
  expect(
    result.map((outcome) => {
      return outcome.status;
    }),
  ).toEqual(["fulfilled", "fulfilled"]);
  const claims = result.flatMap((outcome) => {
    return outcome.status === "fulfilled" && outcome.value
      ? [outcome.value]
      : [];
  });
  expect(claims).toHaveLength(1);
  expect(
    await database
      .selectFrom("media_processing_jobs")
      .select("id")
      .where("state", "=", "running")
      .execute(),
  ).toEqual([{ id: claims[0]!.jobId }]);
}, 15_000);

it("renews and finishes through independent local handles without a blocking lock wait", async () => {
  const { database, path, queue, input, clock, advance } =
    await createQueueFixture();
  await queue.enqueue(input);
  const claim = await claimProcessingJob(queue);
  advance(30);
  const secondDatabase = createDatabase(path);
  onTestFinished(() => {
    return secondDatabase.destroy();
  });
  const secondQueue = createMediaProcessingQueue({
    database: secondDatabase,
    clock,
  });
  const { result, heartbeatDelayMs } = await observeResponsiveOperations(() => {
    return Promise.allSettled([
      queue.renew(claim),
      secondQueue.finish({ claim, state: "complete" }),
    ]);
  });
  expect(heartbeatDelayMs).toBeLessThan(1000);
  expect(result).toEqual([
    { status: "fulfilled", value: true },
    { status: "fulfilled", value: true },
  ]);
  expect(
    await database
      .selectFrom("media_processing_jobs")
      .select(["state", "lease_token", "lease_expires_at"])
      .where("id", "=", claim.jobId)
      .executeTakeFirst(),
  ).toEqual({ state: "complete", lease_token: null, lease_expires_at: null });
}, 15_000);

it("finishes and advances the queue through independent local handles without stalling", async () => {
  const { path, queue, input, clock } = await createQueueFixture();
  await queue.enqueue(input);
  const claim = await claimProcessingJob(queue);
  await queue.enqueue({ ...input, recipe: "next-recipe" });
  const secondDatabase = createDatabase(path);
  onTestFinished(() => {
    return secondDatabase.destroy();
  });
  const secondQueue = createMediaProcessingQueue({
    database: secondDatabase,
    clock,
  });
  const { result, heartbeatDelayMs } = await observeResponsiveOperations(() => {
    return Promise.allSettled([
      queue.finish({ claim, state: "complete" }),
      secondQueue.claim(),
    ]);
  });
  expect(heartbeatDelayMs).toBeLessThan(1000);
  expect(result).toEqual([
    { status: "fulfilled", value: true },
    {
      status: "fulfilled",
      value: expect.objectContaining({ recipe: "next-recipe" }),
    },
  ]);
}, 15_000);

it("allows waiting local operations to proceed after a transaction fails", async () => {
  const { database, path, queue, input, clock } = await createQueueFixture();
  await queue.enqueue(input);
  const secondDatabase = createDatabase(path);
  onTestFinished(() => {
    return secondDatabase.destroy();
  });
  const failingQueue = createMediaProcessingQueue({
    database,
    clock: () => {
      throw new Error("clock unavailable");
    },
  });
  const secondQueue = createMediaProcessingQueue({
    database: secondDatabase,
    clock,
  });
  const { result, heartbeatDelayMs } = await observeResponsiveOperations(() => {
    return Promise.allSettled([failingQueue.claim(), secondQueue.claim()]);
  });
  expect(heartbeatDelayMs).toBeLessThan(1000);
  expect(result).toEqual([
    {
      status: "rejected",
      reason: expect.objectContaining({ message: "clock unavailable" }),
    },
    {
      status: "fulfilled",
      value: expect.objectContaining({ recipe: "photo-v1" }),
    },
  ]);
}, 15_000);

it("enqueues inside an ingest transaction while a gated claim awaits its connection", async () => {
  const { database, queue, input, clock } = await createQueueFixture();
  let waitingClaim: Promise<ProcessingClaim | undefined> | undefined;
  await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      waitingClaim = queue.claim();
      const transactionQueue = createMediaProcessingQueue({
        database: transaction,
        clock,
      });
      await transactionQueue.enqueue(input);
    },
  });
  expect(await waitingClaim).toEqual(
    expect.objectContaining({ itemId: input.itemId, recipe: "photo-v1" }),
  );
});
