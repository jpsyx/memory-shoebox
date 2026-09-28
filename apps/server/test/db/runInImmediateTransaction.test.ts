import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { insertMember } from "../helpers/seedHelpers.ts";

describe("runInImmediateTransaction", () => {
  it("commits the writes and returns the callback's value", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const memberId = await runInImmediateTransaction({
      database,
      callback: async (transaction) => {
        return insertMember(transaction, { email: "rosa@example.com" });
      },
    });

    const rows = await database.selectFrom("members").select("id").execute();
    expect(rows).toEqual([{ id: memberId }]);
    await database.destroy();
  });

  it("rolls everything back when the callback throws", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await insertMember(transaction, { email: "rosa@example.com" });
          throw new Error("no");
        },
      }),
    ).rejects.toThrow("no");

    const rows = await database.selectFrom("members").select("id").execute();
    expect(rows).toEqual([]);
    await database.destroy();
  });

  it("leaves the handle usable afterwards", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    await runInImmediateTransaction({
      database,
      callback: async (transaction) => {
        return insertMember(transaction, { email: "one@example.com" });
      },
    });
    await runInImmediateTransaction({
      database,
      callback: async (transaction) => {
        return insertMember(transaction, { email: "two@example.com" });
      },
    });

    const rows = await database.selectFrom("members").select("id").execute();
    expect(rows).toHaveLength(2);
    await database.destroy();
  });
});
