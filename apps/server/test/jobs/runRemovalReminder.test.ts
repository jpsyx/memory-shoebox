import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import type { Database } from "../../src/db/types/db.types.ts";
import { runRemovalReminder } from "../../src/jobs/runRemovalReminder.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
  insertInstanceSetting,
  shiftDays,
} from "../helpers/seedHelpers/seedHelpers.ts";

type OpenRequestContext = {
  requestOverrides?: Partial<Database["removal_requests"]>;
  uploaderOverrides?: Partial<Database["members"]>;
  requesterOverrides?: Partial<Database["members"]>;
};

async function _createContextWithOpenRequest(options: OpenRequestContext = {}) {
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
    created_at: shiftDays({ instant: NOW, days: -8 }),
    ...options.requestOverrides,
  });
  return { database, uploaderId, adminId, requesterId, itemId, requestId };
}

describe("removal-reminder", () => {
  it("finds nothing against empty tables", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("is due for the snapshot uploader and every admin, minus the requester", async () => {
    const { database, uploaderId, adminId, requesterId, requestId } =
      await _createContextWithOpenRequest();

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
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("names the uploader once when the uploader is also an admin", async () => {
    const { database, uploaderId, adminId } =
      await _createContextWithOpenRequest({
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
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("never chases the requester with their own request, even as an admin", async () => {
    const { database, requesterId } = await _createContextWithOpenRequest({
      requesterOverrides: { role: "admin" },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(
      summary.due.map((due) => {
        return due.memberId;
      }),
    ).not.toContain(requesterId);
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("reads the snapshot uploader, never the item's current one", async () => {
    // `item_id` is SET NULL, so the job may not join to `items` at all. The
    // two columns are pulled apart here so that a job which did join would
    // name the wrong person and fail.
    const { database, uploaderId, itemId } =
      await _createContextWithOpenRequest({});
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
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("is not due in week zero, so nothing chases within the hour of asking", async () => {
    const { database } = await _createContextWithOpenRequest({
      requestOverrides: { created_at: shiftDays({ instant: NOW, days: -2 }) },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("is not due once the request is resolved", async () => {
    const { database } = await _createContextWithOpenRequest({
      requestOverrides: { state: "withdrawn", resolved_at: NOW },
    });

    const summary = await runRemovalReminder({ database, now: NOW });

    expect(summary.due).toEqual([]);
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("skips somebody who has turned the removal conversation off", async () => {
    const { database, adminId } = await _createContextWithOpenRequest();
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
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("skips an admin who has left the family", async () => {
    const { database, adminId } = await _createContextWithOpenRequest();
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
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        summary.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("returns the same due set while enqueueing each weekly key only once", async () => {
    const { database } = await _createContextWithOpenRequest();

    const first = await runRemovalReminder({ database, now: NOW });
    const second = await runRemovalReminder({ database, now: NOW });

    expect(second.due).toEqual(first.due);
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toHaveLength(2);
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.idempotency_key;
        }),
      ),
    ).toEqual(
      new Set(
        first.due.map((due) => {
          return due.idempotencyKey;
        }),
      ),
    );
    await database.destroy();
  });

  it("enqueues one copy per current recipient per week and recomputes admins", async () => {
    const { database, adminId, uploaderId, requestId } =
      await _createContextWithOpenRequest();
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
      const { database, requestId } = await _createContextWithOpenRequest();
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
      const { database } = await _createContextWithOpenRequest({
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
    const { database } = await _createContextWithOpenRequest();
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
