import type { Database } from "../../src/db/types/db.types.ts";
import type { LightMyRequestResponse } from "fastify";
import type { TestApp } from "../helpers/createTestApp.ts";
import type { CreateSetupRequest } from "@memory-shoebox/shared";
import { sql } from "kysely";
import { expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertInstanceSetting } from "../helpers/seedHelpers/miscSeedHelpers.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";

const BODY = {
  admin: { displayName: "Rosa", email: "rosa@example.com" },
  shoebox: { name: "My Shoebox", timezone: "UTC" },
  public: { baseUrl: "https://photos.example.com" },
} as const satisfies CreateSetupRequest;

async function _expectRolledBackSetupCatalog(
  options: Readonly<{
    refused: LightMyRequestResponse;
    context: TestApp;
    before: Array<Database["settings"]>;
  }>,
): Promise<void> {
  const { refused, context, before } = options;
  expect(refused.statusCode).toBe(500);
  expect(refused.json().error).toBe("internal_error");
  expect(refused.headers["set-cookie"]).toBeUndefined();
  expect(
    await context.database.selectFrom("members").selectAll().execute(),
  ).toEqual([]);
  expect(
    await context.database.selectFrom("sessions").selectAll().execute(),
  ).toEqual([]);
  expect(
    await context.database.selectFrom("activity_events").selectAll().execute(),
  ).toEqual([]);
  expect(
    await context.database.selectFrom("settings").selectAll().execute(),
  ).toEqual(before);
  expect((await context.app.inject({ url: "/api/setup" })).json()).toEqual({
    isRequired: true,
  });
}

it("rolls back admin, settings, progress, session and audit when the late audit write aborts", async () => {
  const context = await createTestApp();
  try {
    await insertInstanceSetting(context.database, {
      key: "shoebox.name",
      value: "Existing override",
    });
    const before = await context.database
      .selectFrom("settings")
      .selectAll()
      .execute();
    await sql`create trigger tr__activity_events__abort_setup before insert on activity_events begin select raise(abort, 'test rollback'); end`.execute(
      context.database,
    );
    const refused = await context.app.inject({
      method: "POST",
      url: "/api/setup",
      payload: BODY,
    });
    await _expectRolledBackSetupCatalog({ refused, context, before });
    await sql`drop trigger tr__activity_events__abort_setup`.execute(
      context.database,
    );
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/setup",
          payload: BODY,
        })
      ).statusCode,
    ).toBe(201);
  } finally {
    await context.close();
  }
});

it("rolls back completion when its audit fails", async () => {
  const context = await createTestApp();
  try {
    const admin = await insertSignedInMember({
      database: context.database,
      member: { role: "admin" },
    });
    await insertInstanceSetting(context.database, {
      key: "setup.pending_member_id",
      value: admin.memberId,
    });
    const before = await context.database
      .selectFrom("settings")
      .selectAll()
      .execute();
    await sql`create trigger tr__activity_events__abort_setup before insert on activity_events begin select raise(abort, 'test rollback'); end`.execute(
      context.database,
    );
    expect(
      (
        await context.app.inject({
          method: "POST",
          url: "/api/setup/complete",
          headers: { cookie: admin.cookie },
        })
      ).statusCode,
    ).toBe(500);
    expect(
      await context.database.selectFrom("settings").selectAll().execute(),
    ).toEqual(before);
    expect(
      (
        await context.app.inject({
          url: "/api/setup/progress",
          headers: { cookie: admin.cookie },
        })
      ).json(),
    ).toEqual({ needsInvitations: true });
  } finally {
    await context.close();
  }
});
