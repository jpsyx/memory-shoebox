import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { readInstanceSettings } from "../../src/settings/instanceSettings.ts";
import { insertInstanceSetting } from "../helpers/seed.ts";

async function createEmptyDatabase() {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  return database;
}

describe("readInstanceSettings", () => {
  it("answers from SETTING_DEFINITIONS when the instance holds no rows", async () => {
    const database = await createEmptyDatabase();

    const settings = await readInstanceSettings(database, [
      "shoebox.name",
      "shoebox.timezone",
      "public.base_url",
    ]);

    expect(settings).toEqual({
      "shoebox.name": "My Shoebox",
      "shoebox.timezone": "UTC",
      "public.base_url": null,
    });
    await database.destroy();
  });

  it("prefers a stored override", async () => {
    const database = await createEmptyDatabase();
    await insertInstanceSetting(database, {
      key: "shoebox.name",
      value: "Casa Mateo",
    });

    const settings = await readInstanceSettings(database, ["shoebox.name"]);

    expect(settings["shoebox.name"]).toBe("Casa Mateo");
    await database.destroy();
  });

  it("falls back to the default rather than throwing on a corrupt row", async () => {
    const database = await createEmptyDatabase();
    await insertInstanceSetting(database, {
      key: "shoebox.timezone",
      value: "Mars/Olympus_Mons",
    });

    const settings = await readInstanceSettings(database, ["shoebox.timezone"]);

    expect(settings["shoebox.timezone"]).toBe("UTC");
    await database.destroy();
  });

  it("reads every requested key in one query", async () => {
    const database = await createEmptyDatabase();

    const settings = await readInstanceSettings(database, [
      "shoebox.name",
      "mail.from_address",
      "mail.from_name",
    ]);

    expect(Object.keys(settings)).toHaveLength(3);
    await database.destroy();
  });
});
