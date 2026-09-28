import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types.ts";
import {
  buildRemovalReminderKey,
  computeWeekIndex,
  runRemovalReminder,
} from "../../src/jobs/removalReminder.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
  shiftDays,
} from "../helpers/seed.ts";

type OpenRequestContext = {
  requestOverrides?: Partial<Database["removal_requests"]>;
  uploaderOverrides?: Partial<Database["members"]>;
  requesterOverrides?: Partial<Database["members"]>;
};

async function createContextWithOpenRequest(options: OpenRequestContext = {}) {
  const database = createDatabase(":memory:");
  await migrateToLatest(database);
  const uploaderId = await insertMember(database, {
    role: "uploader",
    ...options.uploaderOverrides,
  });
  const adminId = await insertMember(database, { role: "admin" });
  const requesterId = await insertMember(database, {
    role: "viewer",
    ...options.requesterOverrides,
  });
  const itemId = await insertItem(database, { uploadedBy: uploaderId });
  const requestId = await insertRemovalRequest(database, {
    requestedByMemberId: requesterId,
    itemUploaderMemberId: uploaderId,
    item_id: itemId,
    state: "open",
    decline_reason: null,
    resolved_at: null,
    resolved_by_member_id: null,
    created_at: shiftDays(NOW, -8),
    ...options.requestOverrides,
  });
  return { database, uploaderId, adminId, requesterId, itemId, requestId };
}

describe("computeWeekIndex", () => {
  it("is zero in the week of the request", () => {
    expect(
      computeWeekIndex({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-20T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(0);
  });

  it("is one from the seventh day", () => {
    expect(
      computeWeekIndex({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-21T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(1);
  });

  it("is two a fortnight later", () => {
    expect(
      computeWeekIndex({
        createdAt: "2026-09-14T09:00:00.000Z",
        now: "2026-09-28T09:00:00.000Z",
        timezone: "Europe/Madrid",
      }),
    ).toBe(2);
  });

  it("counts calendar days in the zone, not elapsed hours", () => {
    // Madrid springs forward on 2026-03-29, so the same local hour one week
    // later is 167 hours away and an elapsed-milliseconds division would
    // answer zero. The week is seven local midnights, so it is one.
    const createdAt = "2026-03-25T08:00:00.000Z";
    const now = "2026-04-01T07:00:00.000Z";
    expect(Date.parse(now) - Date.parse(createdAt)).toBeLessThan(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(
      computeWeekIndex({ createdAt, now, timezone: "Europe/Madrid" }),
    ).toBe(1);
  });
});

describe("buildRemovalReminderKey", () => {
  it("is the recipe from notifications.md", () => {
    expect(
      buildRemovalReminderKey({
        requestId: "request-1",
        memberId: "member-2",
        weekIndex: 1,
      }),
    ).toBe("removal-reminder:request-1:member-2:1");
  });

  it("makes two reminders in one week arithmetically impossible", () => {
    const createdAt = "2026-09-14T09:00:00.000Z";
    const keyFor = (now: string) => {
      return buildRemovalReminderKey({
        requestId: "request-1",
        memberId: "member-2",
        weekIndex: computeWeekIndex({ createdAt, now, timezone: "UTC" }),
      });
    };

    // Every hour of one week produces one key, so the unique index on
    // outbound_emails.idempotency_key rejects all but the first.
    expect(keyFor("2026-09-21T09:00:00.000Z")).toBe(
      keyFor("2026-09-27T23:00:00.000Z"),
    );
    // The next week is a different key, so exactly one more goes out.
    expect(keyFor("2026-09-28T09:00:00.000Z")).not.toBe(
      keyFor("2026-09-27T23:00:00.000Z"),
    );
  });
});

describe("removal-reminder", () => {
  it("finds nothing against empty tables", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await database.destroy();
  });

  it("is due for the snapshot uploader and every admin, minus the requester", async () => {
    const { database, uploaderId, adminId, requesterId, requestId } =
      await createContextWithOpenRequest();

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
    await database.destroy();
  });

  it("names the uploader once when the uploader is also an admin", async () => {
    const { database, uploaderId, adminId } =
      await createContextWithOpenRequest({
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
    await database.destroy();
  });

  it("never chases the requester with their own request, even as an admin", async () => {
    const { database, requesterId } = await createContextWithOpenRequest({
      requesterOverrides: { role: "admin" },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(requesterId);
    await database.destroy();
  });

  it("reads the snapshot uploader, never the item's current one", async () => {
    // `item_id` is SET NULL, so the job may not join to `items` at all. The
    // two columns are pulled apart here so that a job which did join would
    // name the wrong person and fail.
    const { database, uploaderId, itemId } = await createContextWithOpenRequest(
      {},
    );
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
    await database.destroy();
  });

  it("is not due in week zero, so nothing chases within the hour of asking", async () => {
    const { database } = await createContextWithOpenRequest({
      requestOverrides: { created_at: shiftDays(NOW, -2) },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await database.destroy();
  });

  it("is not due once the request is resolved", async () => {
    const { database } = await createContextWithOpenRequest({
      requestOverrides: { state: "withdrawn", resolved_at: NOW },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    await database.destroy();
  });

  it("skips somebody who has turned the removal conversation off", async () => {
    const { database, adminId } = await createContextWithOpenRequest();
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
    await database.destroy();
  });

  it("skips an admin who has left the family", async () => {
    const { database, adminId } = await createContextWithOpenRequest();
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
    await database.destroy();
  });

  it("returns the same set twice, because it writes nothing yet", async () => {
    const { database } = await createContextWithOpenRequest();

    const first = await runRemovalReminder({ database, now: NOW });
    const second = await runRemovalReminder({ database, now: NOW });

    expect(second.due).toEqual(first.due);
    await database.destroy();
  });
});
