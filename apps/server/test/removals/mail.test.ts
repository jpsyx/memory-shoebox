import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import {
  insertMember,
  insertItem,
  insertRemovalRequest,
  insertInstanceSetting,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { enqueueRemovalEmails } from "../../src/removals/enqueueRemovalEmails.ts";
import { removalRequestEmailPayloadSchema } from "@memory-shoebox/shared";

describe("removal mail recipients", () => {
  it("deduplicates uploader-admin, skips inactive recipients and freezes request snapshots including legacy capture", async () => {
    const { database, close } = await createTestApp();
    try {
      const requester = await insertMember(database, {
        role: "admin",
        display_name: "Requester",
      });
      const uploader = await insertMember(database, {
        role: "admin",
        display_name: "Uploader",
      });
      const admin = await insertMember(database, { role: "admin" });
      await insertMember(database, { role: "admin", status: "invited" });
      await insertMember(database, { role: "admin", status: "removed" });
      await insertMember(database, { role: "admin", notify_on_removal: 0 });
      const itemId = await insertItem(database, {
        uploadedBy: uploader,
        captured_at: "2025-01-02T12:00:00.000Z",
        created_at: "2026-01-03T12:00:00.000Z",
      });
      await insertInstanceSetting(database, {
        key: "public.base_url",
        value: "https://family.example",
      });
      await insertRemovalRequest(database, {
        requestedByMemberId: requester,
        itemUploaderMemberId: uploader,
        item_id: itemId,
        item_captured_at: null,
        state: "open",
        resolved_at: null,
        resolved_by_member_id: null,
        decline_reason: null,
      });
      const requests = await database
        .selectFrom("removal_requests")
        .selectAll()
        .execute();
      expect(
        await enqueueRemovalEmails({
          transaction: database,
          requests,
          event: "requested",
          actorMemberId: requester,
          now: NOW,
        }),
      ).toEqual({ recipientCount: 2 });
      const emails = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute();
      expect(
        new Set(
          emails.map((email) => {
            return email.to_member_id;
          }),
        ),
      ).toEqual(new Set([uploader, admin]));
      const payload = removalRequestEmailPayloadSchema.parse(
        JSON.parse(emails[0]!.payload_json),
      );
      expect(payload).toMatchObject({
        requesterDisplayName: "Requester",
        uploaderDisplayName: "Uploader",
        itemCapturedOn: "2025-01-02",
        itemUploadedOn: "2026-01-03",
        baseUrl: "https://family.example",
      });
      expect(
        new Set(
          emails.map((email) => {
            return email.idempotency_key;
          }),
        ).size,
      ).toBe(2);
      expect(
        await enqueueRemovalEmails({
          transaction: database,
          requests,
          event: "requested",
          actorMemberId: requester,
          now: NOW,
        }),
      ).toEqual({ recipientCount: 0 });
    } finally {
      await close();
    }
  });

  it.each(["declined", "deleted"] as const)(
    "sends %s requester answers despite preferences and fails terminally without base URL",
    async (event) => {
      const { database, close } = await createTestApp();
      try {
        const requester = await insertMember(database, {
          notify_on_removal: 0,
        });
        const uploader = await insertMember(database, { notify_on_removal: 0 });
        await insertRemovalRequest(database, {
          requestedByMemberId: requester,
          itemUploaderMemberId: uploader,
          state: event,
          decline_reason: event === "declined" ? "actual words" : null,
        });
        const requests = await database
          .selectFrom("removal_requests")
          .selectAll()
          .execute();
        expect(
          await enqueueRemovalEmails({
            transaction: database,
            requests,
            event,
            actorMemberId: uploader,
            now: NOW,
          }),
        ).toEqual({ recipientCount: 1 });
        const email = await database
          .selectFrom("outbound_emails")
          .selectAll()
          .executeTakeFirstOrThrow();
        expect(email).toMatchObject({
          to_member_id: requester,
          state: "failed",
          last_error_code: "base_url_unset",
        });
        expect(JSON.parse(email.payload_json).preferencesUrl).toBeNull();
      } finally {
        await close();
      }
    },
  );

  it("honors withdrawal preferences and excludes the actor", async () => {
    const { database, close } = await createTestApp();
    try {
      const requester = await insertMember(database, { role: "admin" });
      const uploader = await insertMember(database, { notify_on_removal: 0 });
      await insertRemovalRequest(database, {
        requestedByMemberId: requester,
        itemUploaderMemberId: uploader,
        state: "withdrawn",
        decline_reason: null,
      });
      const requests = await database
        .selectFrom("removal_requests")
        .selectAll()
        .execute();
      expect(
        await enqueueRemovalEmails({
          transaction: database,
          requests,
          event: "withdrawn",
          actorMemberId: requester,
          now: NOW,
        }),
      ).toEqual({ recipientCount: 0 });
      expect(
        await database.selectFrom("outbound_emails").selectAll().execute(),
      ).toEqual([]);
    } finally {
      await close();
    }
  });
});
