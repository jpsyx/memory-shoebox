import { beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { readShellSettings } from "../../src/settings/readShellSettings.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers/seedHelpers.ts";

describe("readShellSettings", () => {
  let database: Kysely<Database>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    await migrateToLatest(database);
  });

  it("answers on a Shoebox holding zero settings rows", async () => {
    expect(await readShellSettings(database)).toEqual({
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "UTC",
    });
  });

  it("reads what an admin has set", async () => {
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "The Sarmiento Shoebox",
    });
    await insertInstanceSetting(database, {
      key: "pile.arrangement",
      value: "tidy",
    });
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Europe/Madrid",
    });

    expect(await readShellSettings(database)).toEqual({
      shoeboxName: "The Sarmiento Shoebox",
      pileArrangement: "tidy",
      timezone: "Europe/Madrid",
    });
  });
});
