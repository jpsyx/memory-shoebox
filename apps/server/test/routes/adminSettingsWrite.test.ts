import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import type {
  UpdateSettingsRequest,
  UpdateSettingsResponse,
} from "@memory-shoebox/shared";
import type {
  Database,
  DatabaseExecutor,
} from "../../src/db/types/db.types.ts";
import type { FastifyInstance } from "fastify";
import type { TestApp } from "../helpers/createTestApp.ts";

import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { updateSettingsResponseSchema } from "@memory-shoebox/shared";
import { createOwnedTestApp } from "../helpers/createOwnedTestApp/createOwnedTestApp.ts";
import {
  insertMember,
  insertInstanceSetting,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const ADMIN = {
  memberId: "019f1234-0000-7000-8000-000000000001",
  sessionId: "session",
  role: "admin",
  isAdmin: true,
  visibleRuleIds: [],
} as const satisfies Viewer;
async function _makeApp(): Promise<TestApp> {
  const context = await createOwnedTestApp({
    authenticate: async () => {
      return ADMIN;
    },
    clock: () => {
      return new Date(NOW);
    },
  });
  await insertMember(context.database, { id: ADMIN.memberId, role: "admin" });
  return context;
}

function _expectNormalizedSettingValues(
  options: Readonly<{ settings: UpdateSettingsResponse }>,
): void {
  const { settings } = options;
  expect(settings.isPreview).toBe(false);
  expect(settings.shoebox).toEqual({
    name: "Family",
    timezone: "Europe/Madrid",
  });
  expect(settings.changedBy).toHaveLength(6);
  expect(
    settings.changedBy.every((row) => {
      return row.updatedBy?.memberId === ADMIN.memberId;
    }),
  ).toBe(true);
}

type ExpectSettingAuditAndNoopOptions = {
  audits: Array<Database["activity_events"]>;
  app: FastifyInstance;
  database: DatabaseExecutor;
  payload: UpdateSettingsRequest;
};

async function _expectSettingAuditAndNoop(
  options: Readonly<ExpectSettingAuditAndNoopOptions>,
): Promise<void> {
  const { audits, app, database, payload } = options;
  expect(audits).toHaveLength(6);
  expect(
    audits.every((row) => {
      return row.kind === "setting_changed" && row.subject_kind === "setting";
    }),
  ).toBe(true);
  expect(
    JSON.parse(
      audits.find((row) => {
        return row.subject_id === "shoebox.name";
      })!.detail_json!,
    ),
  ).toEqual({ fromValue: "My Shoebox", toValue: "Family" });
  expect(
    (await app.inject({ method: "PATCH", url: "/api/settings", payload }))
      .statusCode,
  ).toBe(200);
  expect(
    await database.selectFrom("activity_events").selectAll().execute(),
  ).toEqual(audits);
  expect(
    (
      await database
        .selectFrom("settings")
        .select("value")
        .where("key", "=", "visibility.generation")
        .executeTakeFirstOrThrow()
    ).value,
  ).toBe("9");
}

describe("PATCH /api/settings", () => {
  it.each([true, false])(
    "retains deployed version in the preview=%s snapshot",
    async (isPreview) => {
      const { app, close } = await _makeApp();
      try {
        const current = (await app.inject("/api/settings")).json();
        const response = await app.inject({
          method: "PATCH",
          url: `/api/settings?preview=${isPreview}`,
          payload: { shoebox: { name: "Family" } },
        });
        expect(response.statusCode).toBe(200);
        expect(current.version).toEqual(expect.any(String));
        expect(response.json().version).toBe(current.version);
      } finally {
        await close();
      }
    },
  );

  it("saves all six registry keys with attribution, audits only changes and leaves generation alone", async () => {
    const { app, database, close } = await _makeApp();
    await insertInstanceSetting(database, {
      key: "visibility.generation",
      value: 9,
    });
    const payload = {
      shoebox: { name: "  Family  ", timezone: "Europe/Madrid" },
      pile: { arrangement: "tidy" },
      mail: { fromAddress: "family@example.com", fromName: "Family" },
      public: { baseUrl: "https://family.example" },
    } as const satisfies UpdateSettingsRequest;
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload,
    });
    expect(response.statusCode).toBe(200);
    const settings = updateSettingsResponseSchema.parse(response.json());
    _expectNormalizedSettingValues({ settings });
    const audits = await database
      .selectFrom("activity_events")
      .selectAll()
      .execute();
    await _expectSettingAuditAndNoop({ audits, app, database, payload });
    await close();
  });

  it.each([
    { unknown: true },
    { preview: true },
    { shoebox: { timezone: "Mars/Base" } },
    { shoebox: { name: "" } },
    { pile: { arrangement: "private" } },
    { mail: { fromAddress: "invalid" } },
    { public: { baseUrl: null } },
    { public: { baseUrl: "/relative" } },
    { shoebox: { extra: "x" } },
  ])(
    "rejects unknown or invalid body fields before any writes: %j",
    async (payload) => {
      const { app, database, close } = await _makeApp();
      const response = await app.inject({
        method: "PATCH",
        url: "/api/settings",
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("invalid_request");
      expect(
        await database.selectFrom("settings").selectAll().execute(),
      ).toEqual([]);
      await close();
    },
  );

  it.each([
    { mail: { domainVerifiedAt: NOW } },
    { mail: { domainLastCheckError: "secret" } },
    { "visibility.generation": 1 },
    { "setup.pending_member_id": "admin" },
  ])("refuses internal settings: %j", async (payload) => {
    const { app, close } = await _makeApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("settings_not_writable");
    await close();
  });

  it.each(["bad", "1"])(
    "rejects an invalid preview query: %s",
    async (preview) => {
      const { app, close } = await _makeApp();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/settings?preview=${preview}`,
            payload: {},
          })
        ).statusCode,
      ).toBe(400);
      await close();
    },
  );

  it("rolls back all keys and audits if a later setting write fails", async () => {
    const { app, database, close } = await _makeApp();
    await sql`create trigger reject_pile before insert on settings when new.key = 'pile.arrangement' begin select raise(abort, 'test refusal'); end`.execute(
      database,
    );
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/settings",
          payload: {
            shoebox: { name: "Changed" },
            pile: { arrangement: "tidy" },
          },
        })
      ).statusCode,
    ).toBe(500);
    expect(await database.selectFrom("settings").selectAll().execute()).toEqual(
      [],
    );
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it.each([false, true])(
    "resets stale provider facts only when the sender domain changes (%s)",
    async (changesDomain) => {
      const { app, database, close } = await _makeApp();
      await insertInstanceSetting(database, {
        key: "mail.from_address",
        value: "old@example.com",
      });
      await insertInstanceSetting(database, {
        key: "mail.domain_verified_at",
        value: NOW,
      });
      await insertInstanceSetting(database, {
        key: "mail.domain_last_check_error",
        value: "unavailable",
      });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/settings",
        payload: {
          mail: {
            fromAddress: changesDomain
              ? "new@elsewhere.example"
              : "new@example.com",
          },
        },
      });
      expect(response.statusCode).toBe(200);
      const facts = await database
        .selectFrom("settings")
        .select(["key", "value"])
        .where("key", "in", [
          "mail.domain_verified_at",
          "mail.domain_last_check_error",
        ])
        .execute();
      expect(
        facts.map((row) => {
          return JSON.parse(row.value);
        }),
      ).toEqual(changesDomain ? [null, null] : [NOW, "unavailable"]);
      await close();
    },
  );

  it.each([undefined, "viewer", "uploader"])(
    "checks authorization before validating body for %s",
    async (role) => {
      const { app, close } = await createOwnedTestApp({
        authenticate: async () => {
          return role === undefined
            ? undefined
            : { ...ADMIN, role: role as "viewer" | "uploader", isAdmin: false };
        },
      });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/settings",
        payload: { invalid: true },
      });
      expect(response.statusCode).toBe(role === undefined ? 401 : 403);
      expect(response.json().error).toBe(
        role === undefined ? "not_signed_in" : "settings_forbidden",
      );
      await close();
    },
  );
});
