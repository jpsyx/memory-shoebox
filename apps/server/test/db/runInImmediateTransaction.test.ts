import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SQLite from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { insertMember } from "../helpers/seedHelpers/seedHelpers.ts";

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

  it("keeps a concurrent connection locked out until the transaction commits", async () => {
    // A deferred `begin` would pass every other test in this file: they only
    // check commit, rollback and handle reuse, and a deferred transaction
    // satisfies all three. Only a lock taken at BEGIN, before the callback
    // does anything, can keep the second connection below locked out while
    // the callback is still running.
    const directory = mkdtempSync(join(tmpdir(), "run-in-immediate-tx-"));
    const path = join(directory, "test.sqlite");
    const database = createDatabase(path);
    const outsideConnection = new SQLite(path);
    outsideConnection.pragma("busy_timeout = 0");

    try {
      await migrateToLatest(database);

      const attemptOutsideWrite = () => {
        outsideConnection.pragma("user_version = 1");
      };

      let resolveStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        resolveStarted = resolve;
      });
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });

      const transactionPromise = runInImmediateTransaction({
        database,
        callback: async () => {
          resolveStarted();
          await released;
          return null;
        },
      });

      try {
        await started;

        let lockedOutError: unknown;
        try {
          attemptOutsideWrite();
        } catch (error) {
          lockedOutError = error;
        }

        expect(lockedOutError).toBeInstanceOf(Error);
        expect((lockedOutError as { code?: string }).code).toBe("SQLITE_BUSY");
      } finally {
        // Resolved here, not just after the assertions above, so a failed
        // assertion can never leave the callback (and this test) hanging.
        release();
        await transactionPromise;
      }

      expect(attemptOutsideWrite).not.toThrow();
    } finally {
      outsideConnection.close();
      await database.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
