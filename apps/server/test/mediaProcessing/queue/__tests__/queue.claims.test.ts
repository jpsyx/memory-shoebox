import { expect, it, onTestFinished } from "vitest";

import { createDatabase } from "../../../../src/db/client.ts";

import { createMediaProcessingQueue } from "../../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import { claimProcessingJob, createQueueFixture } from "./queueTestHelpers.ts";

it("deduplicates enqueue without resetting running or terminal work", async () => {
  const { database, queue, input } = await createQueueFixture();
  await Promise.all([queue.enqueue(input), queue.enqueue(input)]);
  const claim = await claimProcessingJob(queue);
  const running = await database
    .selectFrom("media_processing_jobs")
    .selectAll()
    .execute();
  expect(running).toHaveLength(1);
  expect(running[0]).toMatchObject({
    attempts: 1,
    state: "running",
    priority: 10,
  });
  await queue.enqueue({ ...input, priority: 100 });
  expect(
    await database.selectFrom("media_processing_jobs").selectAll().execute(),
  ).toEqual(running);
  expect(
    await queue.finish({
      claim,
      state: "unavailable",
      errorCode: "unsupported",
    }),
  ).toBe(true);
  await queue.enqueue(input);
  expect(await queue.claim()).toBeUndefined();
  await queue.enqueue({ ...input, recipe: "photo-v2" });
  expect((await claimProcessingJob(queue)).recipe).toBe("photo-v2");
});

it("fences an old live attempt after reclamation", async () => {
  const { database, queue, input, advance } = await createQueueFixture();
  await queue.enqueue(input);
  const oldAttempt = await claimProcessingJob(queue);
  advance(120);
  const current = await claimProcessingJob(queue);
  expect(current.jobId).toBe(oldAttempt.jobId);
  expect(current.attemptToken).not.toBe(oldAttempt.attemptToken);
  const before = await database
    .selectFrom("media_processing_jobs")
    .selectAll()
    .execute();
  expect(await queue.finish({ claim: oldAttempt, state: "complete" })).toBe(
    false,
  );
  expect(await queue.renew(oldAttempt)).toBe(false);
  expect(
    await database.selectFrom("media_processing_jobs").selectAll().execute(),
  ).toEqual(before);
  expect(before[0]).toMatchObject({
    attempts: 2,
    lease_token: current.attemptToken,
  });
});

it("renews at 30 seconds and finishes using the database lease rather than the old claim expiry", async () => {
  const { database, queue, input, advance } = await createQueueFixture();
  await queue.enqueue(input);
  const claim = await claimProcessingJob(queue);
  expect(claim.leaseExpiresAt).toBe("2026-10-14T12:02:00.000Z");
  advance(30);
  expect(await queue.renew(claim)).toBe(true);
  expect(
    await database
      .selectFrom("media_processing_jobs")
      .select("lease_expires_at")
      .executeTakeFirst(),
  ).toEqual({ lease_expires_at: "2026-10-14T12:02:30.000Z" });
  advance(91);
  expect(await queue.finish({ claim, state: "complete" })).toBe(true);
  expect(await queue.renew(claim)).toBe(false);
  expect(await queue.finish({ claim, state: "pending" })).toBe(false);
  await queue.enqueue(input);
  expect(await queue.claim()).toBeUndefined();
});

it("refuses expired and forged claims without changing a job", async () => {
  const { database, queue, input, advance } = await createQueueFixture();
  await queue.enqueue(input);
  const claim = await claimProcessingJob(queue);
  const forged = { ...claim, attemptToken: "wrong" };
  expect(await queue.renew(forged)).toBe(false);
  expect(await queue.finish({ claim: forged, state: "complete" })).toBe(false);
  advance(120);
  const before = await database
    .selectFrom("media_processing_jobs")
    .selectAll()
    .execute();
  expect(await queue.renew(claim)).toBe(false);
  expect(await queue.finish({ claim, state: "complete" })).toBe(false);
  expect(
    await database.selectFrom("media_processing_jobs").selectAll().execute(),
  ).toEqual(before);
});

it("orders due work by priority and persists scheduled retries across reopen", async () => {
  const { database, path, queue, input, clock, advance } =
    await createQueueFixture();
  await queue.enqueue(input);
  await queue.enqueue({ ...input, recipe: "urgent", priority: 50 });
  const urgent = await claimProcessingJob(queue);
  expect(urgent.recipe).toBe("urgent");
  expect(await queue.claim()).toBeUndefined();
  expect(
    await queue.finish({
      claim: urgent,
      state: "pending",
      errorCode: "network",
      nextAttemptAt: "2026-10-14T12:05:00.000Z",
    }),
  ).toBe(true);
  const normal = await claimProcessingJob(queue);
  expect(normal.recipe).toBe("photo-v1");
  await queue.finish({ claim: normal, state: "complete" });
  await database.destroy();
  const reopened = createDatabase(path);
  onTestFinished(() => {
    return reopened.destroy();
  });
  const recoveredQueue = createMediaProcessingQueue({
    database: reopened,
    clock,
  });
  expect(await recoveredQueue.claim()).toBeUndefined();
  advance(300);
  expect((await claimProcessingJob(recoveredQueue)).jobId).toBe(urgent.jobId);
  expect(
    await reopened
      .selectFrom("media_processing_jobs")
      .select(["attempts", "error_code"])
      .where("id", "=", urgent.jobId)
      .executeTakeFirst(),
  ).toEqual({ attempts: 2, error_code: null });
});

it("recovers an expired attempt after closing and reopening the catalog", async () => {
  const { database, path, queue, input, clock, advance } =
    await createQueueFixture();
  await queue.enqueue(input);
  const previous = await claimProcessingJob(queue);
  await database.destroy();
  const reopened = createDatabase(path);
  onTestFinished(() => {
    return reopened.destroy();
  });
  const recovered = createMediaProcessingQueue({ database: reopened, clock });
  expect(await recovered.claim()).toBeUndefined();
  advance(120);
  const claim = await claimProcessingJob(recovered);
  expect(claim.jobId).toBe(previous.jobId);
  expect(claim.attemptToken).not.toBe(previous.attemptToken);
  expect(await recovered.finish({ claim: previous, state: "complete" })).toBe(
    false,
  );
});
