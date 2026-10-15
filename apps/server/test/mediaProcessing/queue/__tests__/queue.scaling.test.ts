import { CompiledQuery, sql } from "kysely";

import { expect, it } from "vitest";

import { createMediaProcessingQueue } from "../../../../src/mediaProcessing/queue/createMediaProcessingQueue.ts";

import {
  START,
  claimProcessingJob,
  createQueueFixture,
} from "./queueTestHelpers.ts";

it("selects due work without per-item queries as the queue grows", async () => {
  const { database, queue, input, clock } = await createQueueFixture();
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
  const first = await claimProcessingJob(observedQueue);
  const numQueries = queries.length;
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
  expect((await claimProcessingJob(observedQueue)).recipe).toBe("recipe-99");
  expect(queries.length).toBe(numQueries);
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
  expect(numQueries).toBeLessThanOrEqual(5);
});

it.each(["reserved", "uploading", "uploaded", "published", "cleanup"] as const)(
  "retains %s output ownership when its item and job are deleted",
  async (state) => {
    const { database, queue, input } = await createQueueFixture();
    await queue.enqueue(input);
    const claim = await claimProcessingJob(queue);
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
