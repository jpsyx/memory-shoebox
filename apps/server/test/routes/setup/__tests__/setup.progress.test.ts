import { describe, expect, it } from "vitest";
import type { Database } from "../../../../src/db/types/db.types.ts";
import type { TestApp } from "../../../helpers/createTestApp.ts";
import { createTestApp } from "../../../helpers/createTestApp.ts";
import type { SignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertSignedInMember } from "../../../helpers/insertSignedInMember.ts";
import { insertInstanceSetting } from "../../../helpers/seedHelpers/miscSeedHelpers.ts";

async function _expectPendingSetupAdminProgress(
  options: Readonly<{
    context: TestApp;
    owner: SignedInMember;
    other: SignedInMember;
  }>,
): Promise<void> {
  const { context, owner, other } = options;
  expect(
    (
      await context.app.inject({
        url: "/api/setup/progress",
        headers: { cookie: owner.cookie },
      })
    ).json(),
  ).toEqual({ needsInvitations: true });
  expect(
    (
      await context.app.inject({
        url: "/api/setup/progress",
        headers: { cookie: other.cookie },
      })
    ).json(),
  ).toEqual({ needsInvitations: false });
  expect(
    (
      await context.app.inject({
        method: "POST",
        url: "/api/setup/complete",
        headers: { cookie: other.cookie },
      })
    ).statusCode,
  ).toBe(204);
}

type ExpectCompletedSetupProgressOptions = {
  events: Array<Database["activity_events"]>;
  other: SignedInMember;
  context: TestApp;
  owner: SignedInMember;
};

async function _expectCompletedSetupProgress(
  options: Readonly<ExpectCompletedSetupProgressOptions>,
): Promise<void> {
  const { events, other, context, owner } = options;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    kind: "setting_changed",
    subject_id: "setup.pending_member_id",
    actor_member_id: other.memberId,
  });
  expect(
    (
      await context.app.inject({
        method: "POST",
        url: "/api/setup/complete",
        headers: { cookie: other.cookie },
      })
    ).statusCode,
  ).toBe(204);
  expect(
    await context.database.selectFrom("activity_events").selectAll().execute(),
  ).toEqual(events);
  expect(
    (
      await context.app.inject({
        url: "/api/setup/progress",
        headers: { cookie: owner.cookie },
      })
    ).json(),
  ).toEqual({ needsInvitations: false });
}

describe("first-run setup", () => {
  it("lets any active admin complete progress idempotently while only its named admin resumes", async () => {
    const context = await createTestApp();
    try {
      const owner = await insertSignedInMember({
        database: context.database,
        token: "owner",
        member: { role: "admin" },
      });
      const other = await insertSignedInMember({
        database: context.database,
        token: "other",
        member: { role: "admin" },
      });
      await insertInstanceSetting(context.database, {
        key: "setup.pending_member_id",
        value: owner.memberId,
      });
      await _expectPendingSetupAdminProgress({ context, owner, other });
      const stored = await context.database
        .selectFrom("settings")
        .selectAll()
        .where("key", "=", "setup.pending_member_id")
        .executeTakeFirstOrThrow();
      expect(stored.value).toBe("null");
      expect(stored.updated_by_member_id).toBe(other.memberId);
      const events = await context.database
        .selectFrom("activity_events")
        .selectAll()
        .execute();
      await _expectCompletedSetupProgress({ events, other, context, owner });
    } finally {
      await context.close();
    }
  });

  it("treats existing members without progress as already configured", async () => {
    const context = await createTestApp();
    try {
      const admin = await insertSignedInMember({
        database: context.database,
        member: { role: "admin" },
      });
      expect(
        (
          await context.app.inject({
            url: "/api/setup/progress",
            headers: { cookie: admin.cookie },
          })
        ).json(),
      ).toEqual({ needsInvitations: false });
      expect(
        (
          await context.app.inject({
            method: "POST",
            url: "/api/setup/complete",
            headers: { cookie: admin.cookie },
          })
        ).statusCode,
      ).toBe(204);
      expect(
        await context.database.selectFrom("settings").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
