import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertMember,
  insertItem,
  insertComment,
} from "../helpers/seedHelpers/seedHelpers.ts";

function _worker(databasePath: string) {
  const worker = new Worker(
    `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { createDatabase } = await import(workerData.clientUrl);
      const { runDailyDigests } = await import(workerData.jobUrl);
      const database = createDatabase(workerData.databasePath);
      try {
        await new Promise((resolve) => { parentPort.once('message', resolve); parentPort.postMessage('ready'); });
        const result = await runDailyDigests({ database, now: '2026-11-03T10:00:00.000Z' });
        parentPort.postMessage(result);
      } finally { await database.destroy(); }
    })().catch((error) => { throw error; });
  `,
    {
      eval: true,
      workerData: {
        databasePath,
        clientUrl: pathToFileURL(resolvePath("src/db/client.ts")).href,
        jobUrl: pathToFileURL(
          resolvePath("src/mail/digests/runDailyDigests.ts"),
        ).href,
      },
    },
  );
  const ready = new Promise<void>((resolve, reject) => {
    worker.on("message", (message) => {
      if (message === "ready") {
        resolve();
      }
    });
    worker.once("error", reject);
  });
  const done = new Promise<{ preparedCount: number }>((resolve, reject) => {
    worker.on("message", (message) => {
      if (message !== "ready") {
        resolve(message);
      }
    });
    worker.once("error", reject);
  });
  return { worker, ready, done };
}

it("reserves one digest when independent SQLite connections race", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shoebox-digest-race-"));
  const databasePath = join(directory, "catalog.db");
  const database = createDatabase(databasePath);
  const workers: Array<ReturnType<typeof _worker>> = [];
  try {
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: authorId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: authorId,
    });
    await database
      .insertInto("notification_digest_events")
      .values({
        id: "race",
        member_id: memberId,
        category: "comment",
        source_kind: "comment",
        source_id: commentId,
        occurred_at: "2026-11-02T12:00:00.000Z",
        deduplication_key: "race",
        state: "pending",
        batch_id: null,
      })
      .execute();
    workers.push(_worker(databasePath), _worker(databasePath));
    await Promise.all(
      workers.map((entry) => {
        return entry.ready;
      }),
    );
    workers.forEach((entry) => {
      entry.worker.postMessage("go");
    });
    const results = await Promise.all(
      workers.map((entry) => {
        return entry.done;
      }),
    );
    expect(
      results
        .map((result) => {
          return result.preparedCount;
        })
        .sort(),
    ).toEqual([0, 1]);
    expect(
      await database
        .selectFrom("notification_digest_batches")
        .selectAll()
        .execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toHaveLength(1);
  } finally {
    await Promise.all(
      workers.map((entry) => {
        return entry.worker.terminate();
      }),
    );
    await database.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});
