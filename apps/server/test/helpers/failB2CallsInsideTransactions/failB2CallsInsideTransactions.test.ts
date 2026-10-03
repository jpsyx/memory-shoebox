import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../../src/db/runInImmediateTransaction.ts";
import { createFakeB2Client } from "../createFakeB2Client/createFakeB2Client.ts";
import { failB2CallsInsideTransactions } from "./failB2CallsInsideTransactions.ts";

describe("failB2CallsInsideTransactions", () => {
  it("catches a call made while a transaction is open, and allows one after", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const b2 = createFakeB2Client();
    const watch = failB2CallsInsideTransactions({ database, b2 });

    await expect(
      runInImmediateTransaction({
        database: watch.database,
        callback: async () => {
          await b2.abortMultipart({ key: "a", uploadId: "b" });
        },
      }),
    ).rejects.toThrow("inside a SQLite transaction");
    await b2.abortMultipart({ key: "a", uploadId: "b" });

    // The throw rolled the transaction back, so the second call is outside.
    expect(watch.callsInsideTransactions).toEqual(["abortMultipart"]);
    await database.destroy();
  });
});
