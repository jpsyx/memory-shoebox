import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { GetSettingsResponse } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../src/db/types/db.types.ts";
import { describe, expect, it } from "vitest";
import { getSettingsResponseSchema } from "@memory-shoebox/shared";
import { createOwnedTestApp } from "../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import {
  insertMember,
  insertInstanceSetting,
  insertItem,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { saveInstanceSetting } from "../../src/settings/saveInstanceSetting.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";

const ADMIN = {
  memberId: "admin",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const satisfies Viewer;

type ExpectSettingProvenanceAndStorageOptions = {
  settings: GetSettingsResponse;
  response: LightMyRequestResponse;
  database: DatabaseExecutor;
  memberId: string;
};

async function _expectSettingProvenanceAndStorage(
  options: Readonly<ExpectSettingProvenanceAndStorageOptions>,
): Promise<void> {
  const { settings, response, database, memberId } = options;
  expect(settings.shoebox.name).toBe("Family");
  expect(settings.defaultedKeys).toHaveLength(5);
  expect(settings.storage).toEqual({ itemCount: 2, byteSize: 579 });
  expect(settings.changedBy).toEqual([
    {
      key: "shoebox.name",
      updatedAt: NOW,
      updatedBy: { memberId, displayName: "Rosa" },
    },
  ]);
  expect(response.payload).not.toContain("visibility.generation");
  expect(
    await database
      .selectFrom("settings")
      .select("id")
      .where("key", "=", "shoebox.name")
      .execute(),
  ).toHaveLength(1);
}

type SettingStorageFixtureResult = {
  database: DatabaseExecutor;
  memberId: string;
  app: FastifyInstance;
  close: () => Promise<void>;
};

async function _prepareSettingStorageFixture(): Promise<SettingStorageFixtureResult> {
  const { app, database, close } = await createOwnedTestApp({
    authenticate: async () => {
      return ADMIN;
    },
  });
  const memberId = await insertMember(database, {
    role: "admin",
    display_name: "Rosa",
  });
  await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      await saveInstanceSetting({
        transaction,
        key: "shoebox.name",
        value: "First",
        memberId,
        now: NOW,
      });
      await saveInstanceSetting({
        transaction,
        key: "shoebox.name",
        value: "Family",
        memberId,
        now: NOW,
      });
    },
  });
  await insertInstanceSetting(database, {
    key: "visibility.generation",
    value: 7,
  });
  await insertItem(database, { uploadedBy: memberId, byte_size: 123 });
  return { database, memberId, app, close };
}

describe("GET /api/settings", () => {
  it("returns defaults and zero storage without seeding rows", async () => {
    const { app, database, close } = await createOwnedTestApp({
      authenticate: async () => {
        return ADMIN;
      },
    });
    const response = await app.inject("/api/settings");
    expect(response.statusCode).toBe(200);
    const settings = getSettingsResponseSchema.parse(response.json());
    expect(settings.defaultedKeys).toHaveLength(6);
    expect(settings.storage).toEqual({ itemCount: 0, byteSize: 0 });
    expect(settings.shoebox).toEqual({ name: "My Shoebox", timezone: "UTC" });
    expect(settings.changedBy).toEqual([]);
    expect(await database.selectFrom("settings").selectAll().execute()).toEqual(
      [],
    );
    await close();
  });

  it("upserts the same instance row and reads provenance and indexed media totals", async () => {
    const { database, memberId, app, close } =
      await _prepareSettingStorageFixture();
    await insertItem(database, {
      uploadedBy: memberId,
      byte_size: 456,
      seq: 1,
    });
    const response = await app.inject("/api/settings");
    expect(response.statusCode).toBe(200);
    const settings = getSettingsResponseSchema.parse(response.json());
    await _expectSettingProvenanceAndStorage({
      settings,
      response,
      database,
      memberId,
    });
    await database.deleteFrom("items").execute();
    await database.deleteFrom("members").where("id", "=", memberId).execute();
    expect(
      (await app.inject("/api/settings")).json().changedBy[0].updatedBy,
    ).toBeNull();
    await close();
  });

  it.each(["uploader", "viewer"] as const)("refuses %s", async (role) => {
    const { app, close } = await createOwnedTestApp({
      authenticate: async () => {
        return { ...ADMIN, role, isAdmin: false };
      },
    });
    const response = await app.inject("/api/settings");
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("settings_forbidden");
    await close();
  });

  it("requires a session", async () => {
    const { app, close } = await createOwnedTestApp();
    expect((await app.inject("/api/settings")).statusCode).toBe(401);
    await close();
  });
});
