import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CompiledQuery, sql } from "kysely";
import { expect, it, onTestFinished } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { createMediaProcessingQueue } from "../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";
import type { ProcessingClaim } from "../../src/mediaProcessing/queue/mediaProcessingQueue.types.ts";
import {
  insertItem,
  insertMember,
  insertRendition,
} from "../helpers/seedHelpers/seedHelpers.ts";

const START = "2026-10-14T12:00:00.000Z";
async function _fixture() {
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
async function _claim(
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

it("deduplicates enqueue without resetting running or terminal work", async () => {
  const { database, queue, input } = await _fixture();
  await Promise.all([queue.enqueue(input), queue.enqueue(input)]);
  const claim = await _claim(queue);
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
  expect((await _claim(queue)).recipe).toBe("photo-v2");
});

it("fences an old live attempt after reclamation", async () => {
  const { database, queue, input, advance } = await _fixture();
  await queue.enqueue(input);
  const oldAttempt = await _claim(queue);
  advance(120);
  const current = await _claim(queue);
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
  const { database, queue, input, advance } = await _fixture();
  await queue.enqueue(input);
  const claim = await _claim(queue);
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
  const { database, queue, input, advance } = await _fixture();
  await queue.enqueue(input);
  const claim = await _claim(queue);
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
  const { database, path, queue, input, clock, advance } = await _fixture();
  await queue.enqueue(input);
  await queue.enqueue({ ...input, recipe: "urgent", priority: 50 });
  const urgent = await _claim(queue);
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
  const normal = await _claim(queue);
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
  expect((await _claim(recoveredQueue)).jobId).toBe(urgent.jobId);
  expect(
    await reopened
      .selectFrom("media_processing_jobs")
      .select(["attempts", "error_code"])
      .where("id", "=", urgent.jobId)
      .executeTakeFirst(),
  ).toEqual({ attempts: 2, error_code: null });
});

it("recovers an expired attempt after closing and reopening the catalog", async () => {
  const { database, path, queue, input, clock, advance } = await _fixture();
  await queue.enqueue(input);
  const previous = await _claim(queue);
  await database.destroy();
  const reopened = createDatabase(path);
  onTestFinished(() => {
    return reopened.destroy();
  });
  const recovered = createMediaProcessingQueue({ database: reopened, clock });
  expect(await recovered.claim()).toBeUndefined();
  advance(120);
  const claim = await _claim(recovered);
  expect(claim.jobId).toBe(previous.jobId);
  expect(claim.attemptToken).not.toBe(previous.attemptToken);
  expect(await recovered.finish({ claim: previous, state: "complete" })).toBe(
    false,
  );
});

it("atomically grants only one global claim to independent processes", async () => {
  const { database, path, queue, input } = await _fixture();
  await queue.enqueue(input);
  await queue.enqueue({ ...input, recipe: "video-v1" });
  const script = `
    import { createDatabase } from ${JSON.stringify(new URL("../../src/db/client.ts", import.meta.url).href)};
    import { createMediaProcessingQueue } from ${JSON.stringify(new URL("../../src/mediaProcessing/queue/createMediaProcessingQueue.ts", import.meta.url).href)};
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

it("selects due work without per-item queries as the queue grows", async () => {
  const { database, queue, input, clock } = await _fixture();
  await queue.enqueue(input);
  const queries: CompiledQuery[] = [];
  const observed = database.withPlugin({
    transformQuery: (args) => {
      queries.push(
        database.getExecutor().compileQuery(args.node, args.queryId),
      );
      return args.node;
    },
    transformResult: async (args) => {
      return args.result;
    },
  });
  const observedQueue = createMediaProcessingQueue({
    database: observed,
    clock,
  });
  const first = await _claim(observedQueue);
  const count = queries.length;
  await queue.finish({ claim: first, state: "complete" });
  await Promise.all(
    Array.from({ length: 100 }, (_, index) => {
      return queue.enqueue({
        ...input,
        recipe: `recipe-${index}`,
        priority: index,
      });
    }),
  );
  queries.length = 0;
  expect((await _claim(observedQueue)).recipe).toBe("recipe-99");
  expect(queries.length).toBe(count);
  const claimQuery = queries.find((query) => {
    return query.sql.startsWith("update media_processing_jobs");
  })!;
  const plan = await database.executeQuery<{ detail: string }>(
    CompiledQuery.raw(`explain query plan ${claimQuery.sql}`, [
      ...claimQuery.parameters,
    ]),
  );
  const details = plan.rows
    .map((row) => {
      return row.detail;
    })
    .join("\n");
  expect(details).toContain("media_processing_jobs_due");
  expect(details).toContain("media_processing_jobs_lease");
  expect(details).not.toMatch(/SCAN media_processing_jobs/);
  expect(count).toBeLessThanOrEqual(5);
});

it.each(["reserved", "uploading", "uploaded", "published", "cleanup"] as const)(
  "retains %s output ownership when its item and job are deleted",
  async (state) => {
    const { database, queue, input } = await _fixture();
    await queue.enqueue(input);
    const claim = await _claim(queue);
    await database
      .insertInto("media_processing_outputs")
      .values({
        id: "output",
        job_id: claim.jobId,
        item_id: input.itemId,
        attempt_token: claim.attemptToken,
        storage_key: "derived/unique-output",
        purpose: "display_small",
        state,
        multipart_upload_id: "multipart-1",
        created_at: START,
        updated_at: START,
      })
      .execute();
    await database.deleteFrom("items").where("id", "=", input.itemId).execute();
    expect(await queue.finish({ claim, state: "complete" })).toBe(false);
    expect(
      await database.selectFrom("media_processing_jobs").selectAll().execute(),
    ).toEqual([]);
    expect(
      await database
        .selectFrom("media_processing_outputs")
        .selectAll()
        .execute(),
    ).toEqual([
      {
        id: "output",
        job_id: null,
        item_id: null,
        attempt_token: claim.attemptToken,
        storage_key: "derived/unique-output",
        purpose: "display_small",
        state,
        multipart_upload_id: "multipart-1",
        created_at: START,
        updated_at: START,
      },
    ]);
    expect(
      (await sql`pragma foreign_key_check`.execute(database)).rows,
    ).toEqual([]);
  },
);

async function _observeResponsiveOperations<Result>(
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

it("keeps the event loop responsive when independent local handles compete for claims", async () => {
  const { database, path, queue, input, clock } = await _fixture();
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
  const { result, heartbeatDelayMs } = await _observeResponsiveOperations(
    () => {
      return Promise.allSettled([queue.claim(), secondQueue.claim()]);
    },
  );
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
  const { database, path, queue, input, clock, advance } = await _fixture();
  await queue.enqueue(input);
  const claim = await _claim(queue);
  advance(30);
  const secondDatabase = createDatabase(path);
  onTestFinished(() => {
    return secondDatabase.destroy();
  });
  const secondQueue = createMediaProcessingQueue({
    database: secondDatabase,
    clock,
  });
  const { result, heartbeatDelayMs } = await _observeResponsiveOperations(
    () => {
      return Promise.allSettled([
        queue.renew(claim),
        secondQueue.finish({ claim, state: "complete" }),
      ]);
    },
  );
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
  const { path, queue, input, clock } = await _fixture();
  await queue.enqueue(input);
  const claim = await _claim(queue);
  await queue.enqueue({ ...input, recipe: "next-recipe" });
  const secondDatabase = createDatabase(path);
  onTestFinished(() => {
    return secondDatabase.destroy();
  });
  const secondQueue = createMediaProcessingQueue({
    database: secondDatabase,
    clock,
  });
  const { result, heartbeatDelayMs } = await _observeResponsiveOperations(
    () => {
      return Promise.allSettled([
        queue.finish({ claim, state: "complete" }),
        secondQueue.claim(),
      ]);
    },
  );
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
  const { database, path, queue, input, clock } = await _fixture();
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
  const { result, heartbeatDelayMs } = await _observeResponsiveOperations(
    () => {
      return Promise.allSettled([failingQueue.claim(), secondQueue.claim()]);
    },
  );
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
  const { database, queue, input, clock } = await _fixture();
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
