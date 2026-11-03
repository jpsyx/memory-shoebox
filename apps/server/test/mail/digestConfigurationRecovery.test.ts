import { requeueBaseUrlFailures } from "../../src/mail/requeueBaseUrlFailures.ts";
import { expect, it } from "vitest";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import {
  insertMember,
  insertItem,
  insertComment,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { runDailyDigests } from "../../src/mail/digests/runDailyDigests.ts";

it("recovers the same failed daily digest after base URL configuration", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const author = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });

    for (const [id, occurredAt] of [
      ["old", "2026-11-01T12:00:00.000Z"],
      ["yesterday", "2026-11-02T12:00:00.000Z"],
      ["today", "2026-11-03T00:00:00.000Z"],
    ]) {
      const sourceId = await insertComment(database, {
        itemId,
        authorMemberId: author,
      });
      await database
        .insertInto("notification_digest_events")
        .values({
          id: id!,
          member_id: memberId,
          category: "comment",
          source_kind: "comment",
          source_id: sourceId,
          occurred_at: occurredAt!,
          deduplication_key: id!,
          state: "pending",
          batch_id: null,
        })
        .execute();
    }
    await runDailyDigests({ database, now: "2026-11-03T08:59:00.000Z" });
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toHaveLength(0);
    await runDailyDigests({ database, now: "2026-11-03T09:00:00.000Z" });
    await runDailyDigests({ database, now: "2026-11-03T10:00:00.000Z" });
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(emails).toHaveLength(1);
    expect(JSON.parse(emails[0]!.payload_json).comments.totalEvents).toBe(2);
    expect(
      await database
        .selectFrom("notification_digest_events")
        .select("id")
        .where("state", "=", "pending")
        .execute(),
    ).toEqual([{ id: "today" }]);
    expect(emails[0]!.state).toBe("failed");
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
    const recovered = await requeueBaseUrlFailures({
      transaction: database,
      baseUrl: "https://shoebox.example",
      now: "2026-11-03T10:00:00.000Z",
    });
    expect(recovered).toBe(1);
    const restored = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.state).toBe("queued");
    expect(restored[0]!.payload_json).not.toContain("digest.invalid");
  } finally {
    await database.destroy();
  }
});

it.each(["daily", "off"] as const)(
  "routes unattempted individual failures to current %s preference without duplicates",
  async (frequency) => {
    const database = createDatabase(":memory:");
    try {
      await migrateToLatest(database);
      const memberId = await insertMember(database, {
        notify_comment_frequency: "immediate",
      });
      const author = await insertMember(database);
      const itemId = await insertItem(database, { uploadedBy: memberId });
      const commentId = await insertComment(database, {
        itemId,
        authorMemberId: author,
      });
      const { enqueueEmail } =
        await import("../../src/mail/enqueueEmail/enqueueEmail.ts");
      await enqueueEmail({
        executor: database,
        now: "2026-11-03T08:00:00.000Z",
        input: {
          kind: "comment",
          toMemberId: memberId,
          toAddress: "member@example.com",
          toDisplayName: undefined,
          triggerKind: "comment",
          triggerId: commentId,
          idempotencyKey: `comment:${commentId}:${memberId}`,
          payload: {
            authorDisplayName: "Author",
            body: "Hello",
            itemCapturedOn: "2026-11-02",
            uploaderDisplayName: "Uploader",
            relation: "uploader",
            atSeconds: null,
            itemUrl: `/item/${itemId}`,
          },
        },
      });
      await database
        .updateTable("members")
        .set({ notify_comment_frequency: frequency })
        .where("id", "=", memberId)
        .execute();
      await insertInstanceSetting(database, {
        key: "public.base_url",
        value: "https://shoebox.example",
      });
      for (let pass = 0; pass < 2; pass += 1)
        await requeueBaseUrlFailures({
          transaction: database,
          baseUrl: "https://shoebox.example",
          now: "2026-11-03T10:00:00.000Z",
        });
      expect(
        (
          await database.selectFrom("outbound_emails").select("state").execute()
        )[0]!.state,
      ).toBe("cancelled");
      expect(
        await database
          .selectFrom("notification_digest_events")
          .selectAll()
          .execute(),
      ).toHaveLength(frequency === "daily" ? 1 : 0);
    } finally {
      await database.destroy();
    }
  },
);

it("never rewrites an already-attempted individual request during recovery", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
    });
    const { insertOutboundEmail } =
      await import("../helpers/seedHelpers/seedHelpers.ts");
    const payload = JSON.stringify({
      shoeboxName: "Original",
      timezone: "UTC",
      baseUrl: "https://old.example",
      preferencesUrl: "https://old.example/account",
      toDisplayName: null,
      authorDisplayName: "Author",
      uploaderDisplayName: "Uploader",
      body: "Original",
      atSeconds: null,
      itemCapturedOn: "2026-11-02",
      itemUrl: `https://old.example/item/${itemId}`,
      relation: "uploader",
    });
    const id = await insertOutboundEmail(database, {
      kind: "comment",
      to_member_id: memberId,
      trigger_kind: "comment",
      trigger_id: commentId,
      state: "failed",
      attempts: 1,
      sender_snapshot_json: JSON.stringify({
        from: "old@example.com",
        address: "old@example.com",
      }),
      payload_json: payload,
      last_error_code: "base_url_unset",
      created_at: "2026-11-03T08:00:00.000Z",
    });
    await requeueBaseUrlFailures({
      transaction: database,
      baseUrl: "https://new.example",
      now: "2026-11-03T10:00:00.000Z",
    });
    const restored = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(restored.payload_json).toBe(payload);
    expect(restored.attempts).toBe(1);
    expect(restored.state).toBe("queued");
    expect(
      await database
        .selectFrom("notification_digest_events")
        .selectAll()
        .execute(),
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});
