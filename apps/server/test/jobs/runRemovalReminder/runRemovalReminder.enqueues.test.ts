import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { runRemovalReminder } from "../../../src/jobs/runRemovalReminder.ts";
import {
  NOW,
  insertMember,
  insertInstanceSetting,
  shiftDays,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { createReminderContextWithOpenRequest } from "./runRemovalReminderTestHelpers.ts";

describe("removal-reminder enqueues", () => {
  it("enqueues one copy per current recipient per week and recomputes admins", async () => {
    const { database, adminId, uploaderId, requestId } =
      await createReminderContextWithOpenRequest();
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://family.example",
    });
    try {
      await runRemovalReminder({ database, now: NOW });
      const before = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute();
      await runRemovalReminder({
        database,
        now: shiftDays({ instant: NOW, days: 1 }),
      });
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toEqual(before);
      await database
        .updateTable("members")
        .set({ status: "removed", removed_at: NOW })
        .where("id", "=", adminId)
        .execute();
      const newAdminId = await insertMember(database, { role: "admin" });
      await runRemovalReminder({ database, now: NOW });
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toHaveLength(3);
      await runRemovalReminder({
        database,
        now: shiftDays({ instant: NOW, days: 7 }),
      });
      const rows = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute();
      expect(
        new Set(
          rows.map((row) => {
            return row.idempotency_key;
          }),
        ),
      ).toEqual(
        new Set([
          `removal-reminder:${requestId}:${uploaderId}:1`,
          `removal-reminder:${requestId}:${adminId}:1`,
          `removal-reminder:${requestId}:${newAdminId}:1`,
          `removal-reminder:${requestId}:${uploaderId}:2`,
          `removal-reminder:${requestId}:${newAdminId}:2`,
        ]),
      );
      expect(
        JSON.parse(
          rows.find((row) => {
            return row.idempotency_key.endsWith(":2");
          })!.payload_json,
        ).weekIndex,
      ).toBe(2);
    } finally {
      await database.destroy();
    }
  });

  it.each(["deleted", "declined", "withdrawn"] as const)(
    "stops future enqueues after %s but preserves already queued mail",
    async (state) => {
      const { database, requestId } =
        await createReminderContextWithOpenRequest();
      try {
        await runRemovalReminder({ database, now: NOW });
        const before = await database
          .selectFrom("outbound_emails")
          .selectAll()
          .execute();
        expect(before).toHaveLength(2);
        await database
          .updateTable("removal_requests")
          .set({
            state,
            resolved_at: NOW,
            decline_reason: state === "declined" ? "Own words" : null,
          })
          .where("id", "=", requestId)
          .execute();
        expect(
          (
            await runRemovalReminder({
              database,
              now: shiftDays({ instant: NOW, days: 14 }),
            })
          ).due,
        ).toEqual([]);
        expect(
          await database.selectFrom("outbound_emails").selectAll().execute(),
        ).toEqual(before);
      } finally {
        await database.destroy();
      }
    },
  );

  it.each([
    {
      timezone: "America/New_York",
      createdAt: "2026-03-02T17:00:00.000Z",
      before: "2026-03-09T03:59:59.000Z",
      boundary: "2026-03-09T04:00:00.000Z",
    },
    {
      timezone: "America/New_York",
      createdAt: "2026-10-26T16:00:00.000Z",
      before: "2026-11-02T04:59:59.000Z",
      boundary: "2026-11-02T05:00:00.000Z",
    },
    {
      timezone: "Asia/Tokyo",
      createdAt: "2026-09-01T00:00:00.000Z",
      before: "2026-09-07T14:59:59.000Z",
      boundary: "2026-09-07T15:00:00.000Z",
    },
  ])(
    "uses local midnight across timezone/DST: $boundary",
    async ({ timezone, createdAt, before, boundary }) => {
      const { database } = await createReminderContextWithOpenRequest({
        requestOverrides: { created_at: createdAt },
      });
      try {
        await insertInstanceSetting(database, {
          key: "shoebox.timezone",
          value: timezone,
        });
        await runRemovalReminder({ database, now: before });
        expect(
          await database.selectFrom("outbound_emails").selectAll().execute(),
        ).toEqual([]);
        await runRemovalReminder({ database, now: boundary });
        expect(
          await database.selectFrom("outbound_emails").selectAll().execute(),
        ).toHaveLength(2);
        await runRemovalReminder({ database, now: boundary });
        expect(
          await database.selectFrom("outbound_emails").selectAll().execute(),
        ).toHaveLength(2);
      } finally {
        await database.destroy();
      }
    },
  );

  it("rolls back earlier reminder inserts if a later recipient fails", async () => {
    const { database } = await createReminderContextWithOpenRequest();
    try {
      await sql`CREATE TRIGGER tr__outbound_emails__reminder_failure BEFORE INSERT ON outbound_emails WHEN (SELECT COUNT(*) FROM outbound_emails) = 1 BEGIN SELECT RAISE(ABORT, 'late reminder failure'); END`.execute(
        database,
      );
      await expect(runRemovalReminder({ database, now: NOW })).rejects.toThrow(
        "late reminder failure",
      );
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await database.destroy();
    }
  });
});
