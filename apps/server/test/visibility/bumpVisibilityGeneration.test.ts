import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { readInstanceSettings } from "../../src/settings/readInstanceSettings.ts";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { bumpVisibilityGeneration } from "../../src/visibility/bumpVisibilityGeneration.ts";
import {
  NOW,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";

/** The generation as the middleware would read it. */
async function _readGeneration(database: Kysely<Database>): Promise<number> {
  const settings = await readInstanceSettings({
    database,
    keys: ["visibility.generation"],
  });
  return settings["visibility.generation"];
}

describe("bumpVisibilityGeneration", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("writes 1 on a fresh Shoebox, which holds no settings rows", async () => {
    expect(await _readGeneration(database)).toBe(0);
    expect(
      await bumpVisibilityGeneration({ executor: database, now: NOW }),
    ).toBe(1);
    expect(await _readGeneration(database)).toBe(1);
  });

  it("moves one at a time from whatever is stored", async () => {
    await insertInstanceSetting(database, {
      key: "visibility.generation",
      value: 41,
    });
    expect(
      await bumpVisibilityGeneration({ executor: database, now: NOW }),
    ).toBe(42);
    expect(await _readGeneration(database)).toBe(42);
  });

  it("leaves exactly one row, which the partial unique index requires", async () => {
    await bumpVisibilityGeneration({ executor: database, now: NOW });
    await bumpVisibilityGeneration({ executor: database, now: NOW });
    const rows = await database
      .selectFrom("settings")
      .select("id")
      .where("key", "=", "visibility.generation")
      .execute();
    expect(rows).toHaveLength(1);
    expect(await _readGeneration(database)).toBe(2);
  });

  it("commits with the caller's transaction, or not at all", async () => {
    await expect(
      runInImmediateTransaction({
        database,
        callback: async (transaction) => {
          await bumpVisibilityGeneration({ executor: transaction, now: NOW });
          throw new Error("the group edit failed");
        },
      }),
    ).rejects.toThrow("the group edit failed");

    expect(await _readGeneration(database)).toBe(0);
  });
});
