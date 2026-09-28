import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readMailQueueHealth } from "../../src/mail/readMailQueueHealth.ts";
import {
  NOW,
  insertOutboundEmail,
  shiftDays,
  shiftMinutes,
} from "../helpers/seedHelpers.ts";

async function createEmptyDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("readMailQueueHealth", () => {
  it("answers on a fresh Shoebox with nothing in the table", async () => {
    const database = await createEmptyDatabase();

    const health = await readMailQueueHealth({ database, now: NOW });

    expect(health).toEqual({
      queuedCount: 0,
      failedCount: 0,
      suppressedCount: 0,
      sentLast24hCount: 0,
      oldestQueuedAt: null,
      lastSentAt: null,
      lastFailedAt: null,
    });
    await database.destroy();
  });

  it("counts each state and finds the oldest queued row", async () => {
    const database = await createEmptyDatabase();
    await insertOutboundEmail(database, {
      idempotency_key: "a",
      state: "queued",
      created_at: shiftMinutes(NOW, -180),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "b",
      state: "queued",
      created_at: shiftMinutes(NOW, -10),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "c",
      state: "failed",
      created_at: shiftMinutes(NOW, -30),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "d",
      state: "suppressed",
    });
    await insertOutboundEmail(database, {
      idempotency_key: "e",
      state: "sent",
      sent_at: shiftMinutes(NOW, -5),
    });
    await insertOutboundEmail(database, {
      idempotency_key: "f",
      state: "sent",
      sent_at: shiftDays(NOW, -3),
    });

    const health = await readMailQueueHealth({ database, now: NOW });

    expect(health).toEqual({
      queuedCount: 2,
      failedCount: 1,
      suppressedCount: 1,
      sentLast24hCount: 1,
      oldestQueuedAt: shiftMinutes(NOW, -180),
      lastSentAt: shiftMinutes(NOW, -5),
      lastFailedAt: shiftMinutes(NOW, -30),
    });
    await database.destroy();
  });
});
