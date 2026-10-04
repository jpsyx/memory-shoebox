import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../src/db/client.ts";
import { migrateToLatest } from "../../../src/db/migrate.ts";
import { runRemovalReminder } from "../../../src/jobs/runRemovalReminder.ts";
import {
  NOW,
  insertMember,
  insertRemovalRequest,
  shiftDays,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import {
  createReminderContextWithOpenRequest,
  expectPersistedReminderKeys,
} from "./runRemovalReminderTestHelpers.ts";

describe("removal-reminder", () => {
  it("finds nothing against empty tables", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("is due for the snapshot uploader and every admin, minus the requester", async () => {
    const { database, uploaderId, adminId, requesterId, requestId } =
      await createReminderContextWithOpenRequest();

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toHaveLength(2);
    expect(
      summary.due
        .map((due) => {
          return due.memberId;
        })
        .sort(),
    ).toEqual([uploaderId, adminId].sort());
    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(requesterId);
    expect(summary.due[0]?.weekIndex).toBe(1);
    expect(
      summary.due
        .map((due) => {
          return due.idempotencyKey;
        })
        .every((key) => {
          return key.startsWith(`removal-reminder:${requestId}:`);
        }),
    ).toBe(true);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("names the uploader once when the uploader is also an admin", async () => {
    const { database, uploaderId, adminId } =
      await createReminderContextWithOpenRequest({
        uploaderOverrides: { role: "admin" },
      });

    const summary = await runRemovalReminder({ database, now: NOW });

    // The join's OR matches the one member row once, so there is nothing to
    // de-duplicate: the uploader gets one reminder, not two.
    expect(
      summary.due
        .map((due) => {
          return due.memberId;
        })
        .sort(),
    ).toEqual([uploaderId, adminId].sort());
    const uploaderDue = summary.due.filter((due) => {
      return due.memberId === uploaderId;
    });
    expect(uploaderDue).toHaveLength(1);
    expect(uploaderDue[0]?.relation).toBe("uploader");
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("never chases the requester with their own request, even as an admin", async () => {
    const { database, requesterId } =
      await createReminderContextWithOpenRequest({
        requesterOverrides: { role: "admin" },
      });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(requesterId);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("excludes requester-admins only from their own ask across multiple requesters", async () => {
    const { database, uploaderId, adminId, requesterId, requestId, itemId } =
      await createReminderContextWithOpenRequest({
        requesterOverrides: { role: "admin" },
      });
    try {
      const secondRequestId = await insertRemovalRequest(database, {
        requestedByMemberId: adminId,
        itemUploaderMemberId: uploaderId,
        item_id: itemId,
        state: "open",
        decline_reason: null,
        resolved_at: null,
        resolved_by_member_id: null,
        created_at: shiftDays({ instant: NOW, days: -8 }),
      });
      const summary = await runRemovalReminder({ database, now: NOW });
      const expectedPairs = new Set([
        `${requestId}:${uploaderId}`,
        `${requestId}:${adminId}`,
        `${secondRequestId}:${uploaderId}`,
        `${secondRequestId}:${requesterId}`,
      ]);
      expect(
        new Set(
          summary.due.map((due) => {
            return `${due.requestId}:${due.memberId}`;
          }),
        ),
      ).toEqual(expectedPairs);
      const emails = await database
        .selectFrom("outbound_emails")
        .select(["to_member_id", "idempotency_key"])
        .execute();
      expect(emails).toHaveLength(4);
      expect(
        new Set(
          emails.map((email) => {
            return `${email.idempotency_key}:${email.to_member_id}`;
          }),
        ),
      ).toEqual(
        new Set([
          `removal-reminder:${requestId}:${uploaderId}:1:${uploaderId}`,
          `removal-reminder:${requestId}:${adminId}:1:${adminId}`,
          `removal-reminder:${secondRequestId}:${uploaderId}:1:${uploaderId}`,
          `removal-reminder:${secondRequestId}:${requesterId}:1:${requesterId}`,
        ]),
      );
    } finally {
      await database.destroy();
    }
  });

  it("reads the snapshot uploader, never the item's current one", async () => {
    // `item_id` is SET NULL, so the job may not join to `items` at all. The
    // two columns are pulled apart here so that a job which did join would
    // name the wrong person and fail.
    const { database, uploaderId, itemId } =
      await createReminderContextWithOpenRequest({});
    const otherUploaderId = await insertMember(database, { role: "uploader" });
    await database
      .updateTable("items")
      .set({ uploaded_by: otherUploaderId })
      .where("id", "=", itemId)
      .execute();

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).toContain(uploaderId);
    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(otherUploaderId);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("is not due in week zero, so nothing chases within the hour of asking", async () => {
    const { database } = await createReminderContextWithOpenRequest({
      requestOverrides: { created_at: shiftDays({ instant: NOW, days: -2 }) },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("is not due once the request is resolved", async () => {
    const { database } = await createReminderContextWithOpenRequest({
      requestOverrides: { state: "withdrawn", resolved_at: NOW },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("skips somebody who has turned the removal conversation off", async () => {
    const { database, adminId } = await createReminderContextWithOpenRequest();
    await database
      .updateTable("members")
      .set({ notify_on_removal: 0 })
      .where("id", "=", adminId)
      .execute();

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(adminId);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("skips an admin who has left the family", async () => {
    const { database, adminId } = await createReminderContextWithOpenRequest();
    await database
      .updateTable("members")
      .set({ status: "removed", removed_at: NOW })
      .where("id", "=", adminId)
      .execute();

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(adminId);
    await expectPersistedReminderKeys({ database, due: summary.due });
    await database.destroy();
  });

  it("returns the same due set while enqueueing each weekly key only once", async () => {
    const { database } = await createReminderContextWithOpenRequest();

    const first = await runRemovalReminder({ database, now: NOW });
    const second = await runRemovalReminder({ database, now: NOW });

    expect(second.due).toEqual(first.due);
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toHaveLength(2);
    await expectPersistedReminderKeys({ database, due: first.due });
    await database.destroy();
  });
});
