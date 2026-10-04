import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
  insertRendition,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { runDelete } from "../items/__tests__/deleteItemTestHelpers.ts";

type DeletionContext = TestApp & {
  uploaderId: string;
  itemId: string;
  actor: Awaited<ReturnType<typeof insertSignedInMember>>;
};

async function _context(): Promise<DeletionContext> {
  const context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  const uploaderId = await insertMember(context.database, {
    display_name: "Uploader",
  });
  const actor = await insertSignedInMember({
    database: context.database,
    member: { role: "admin", display_name: "Actor" },
  });
  const itemId = await insertItem(context.database, { uploadedBy: uploaderId });
  await insertInstanceSetting(context.database, {
    key: "public.base_url",
    value: "https://family.example",
  });
  return { ...context, uploaderId, actor, itemId };
}

async function _ask(
  context: Readonly<DeletionContext>,
  requesterId: string,
): Promise<string> {
  return insertRemovalRequest(context.database, {
    requestedByMemberId: requesterId,
    itemUploaderMemberId: context.uploaderId,
    item_id: context.itemId,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
}

describe("deletion resolution mail", () => {
  it("answers every open request using facts before SET NULL and preserves settled history", async () => {
    const context = await _context();
    const { database, uploaderId, actor, itemId, close } = context;
    try {
      const requesterId = await insertMember(database, {
        notify_on_removal: 0,
      });
      const otherRequesterId = await insertMember(database);
      const requestId = await _ask(context, requesterId);
      const otherRequestId = await _ask(context, otherRequesterId);
      const settledId = await insertRemovalRequest(database, {
        requestedByMemberId: requesterId,
        itemUploaderMemberId: uploaderId,
        item_id: itemId,
        resolved_by_member_id: uploaderId,
      });
      const settledBefore = await database
        .selectFrom("removal_requests")
        .selectAll()
        .where("id", "=", settledId)
        .executeTakeFirstOrThrow();
      const response = await context.app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}`,
        headers: { cookie: actor.cookie },
      });
      expect(response.statusCode).toBe(204);
      const rows = await database
        .selectFrom("removal_requests")
        .selectAll()
        .execute();
      expect(
        rows.find((row) => {
          return row.id === settledId;
        }),
      ).toEqual({ ...settledBefore, item_id: null });
      [requestId, otherRequestId].forEach((id) => {
        expect(
          rows.find((row) => {
            return row.id === id;
          }),
        ).toMatchObject({
          state: "deleted",
          resolved_at: NOW,
          resolved_by_member_id: actor.memberId,
          item_id: null,
        });
      });
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
        new Set([
          `removal-resolved:${requestId}:${requesterId}`,
          `removal-resolved:${requestId}:${uploaderId}`,
          `removal-resolved:${otherRequestId}:${otherRequesterId}`,
          `removal-resolved:${otherRequestId}:${uploaderId}`,
        ]),
      );
      emails.forEach((email) => {
        const payload = JSON.parse(email.payload_json);
        expect(payload).toMatchObject({
          outcome: "deleted",
          resolvedByDisplayName: "Actor",
          resolvedAt: NOW,
        });
        expect(payload.itemUrl).toBeUndefined();
        expect(payload.preferencesUrl === null).toBe(
          email.to_member_id !== uploaderId,
        );
      });
      expect(context.b2.calls).toEqual([]);
    } finally {
      await close();
    }
  });

  it.each([
    "uploader-actor",
    "requester-actor",
    "same-requester-uploader",
    "uploader-opted-out",
  ])("applies deleted identity and preference rules: %s", async (scenario) => {
    const context = await _context();
    const { database, uploaderId, itemId, close } = context;
    try {
      const requesterId =
        scenario === "same-requester-uploader"
          ? uploaderId
          : await insertMember(database, { notify_on_removal: 0 });
      const requestId = await _ask(context, requesterId);
      if (scenario === "uploader-opted-out") {
        await database
          .updateTable("members")
          .set({ notify_on_removal: 0 })
          .where("id", "=", uploaderId)
          .execute();
      }
      const memberId =
        scenario === "uploader-actor"
          ? uploaderId
          : scenario === "requester-actor"
            ? requesterId
            : context.actor.memberId;
      await runDelete({ database, itemId, memberId });
      const emails = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute();
      const expectedRecipient =
        scenario === "requester-actor" || scenario === "same-requester-uploader"
          ? uploaderId
          : requesterId;
      expect(emails).toHaveLength(1);
      expect(emails[0]).toMatchObject({
        to_member_id: expectedRecipient,
        idempotency_key: `removal-resolved:${requestId}:${expectedRecipient}`,
      });
    } finally {
      await close();
    }
  });

  it("does not enqueue removal mail when no request is open", async () => {
    const context = await _context();
    try {
      await runDelete({
        database: context.database,
        itemId: context.itemId,
        memberId: context.uploaderId,
      });
      expect(
        await context.database
          .selectFrom("outbound_emails")
          .selectAll()
          .execute(),
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it("rolls back a late outbound failure, settlement, item, objects, and activity without B2 I/O", async () => {
    const context = await _context();
    const { database, itemId, actor, close } = context;
    try {
      await _ask(context, await insertMember(database));
      await _ask(context, await insertMember(database));
      await insertRendition(database, { itemId, purpose: "original" });
      await insertRendition(database, { itemId, purpose: "thumb" });
      const requestsBefore = await database
        .selectFrom("removal_requests")
        .selectAll()
        .execute();
      await sql`CREATE TRIGGER tr__outbound_emails__late_failure BEFORE INSERT ON outbound_emails WHEN (SELECT COUNT(*) FROM outbound_emails) = 2 BEGIN SELECT RAISE(ABORT, 'late outbound failure'); END`.execute(
        database,
      );
      const response = await context.app.inject({
        method: "DELETE",
        url: `/api/items/${itemId}`,
        headers: { cookie: actor.cookie },
      });
      expect(response.statusCode).toBe(500);
      expect(
        await database.selectFrom("removal_requests").selectAll().execute(),
      ).toEqual(requestsBefore);
      expect(
        await database.selectFrom("items").selectAll().execute(),
      ).toHaveLength(1);
      expect(
        await database.selectFrom("item_renditions").selectAll().execute(),
      ).toHaveLength(2);
      expect(
        await database
          .selectFrom("pending_object_deletions")
          .selectAll()
          .execute(),
      ).toEqual([]);
      expect(
        await database.selectFrom("activity_events").selectAll().execute(),
      ).toEqual([]);
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toEqual([]);
      expect(context.b2.calls).toEqual([]);
    } finally {
      await close();
    }
  });
});
