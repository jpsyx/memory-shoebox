import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import { createRecordingEmailService } from "../helpers/createRecordingEmailService.ts";
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

it("combines overdue activity once after nine, leaving today's activity pending", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const author = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    await insertInstanceSetting(database, {
      key: "public.base_url",
      value: "https://shoebox.example",
    });
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
    await insertInstanceSetting(database, {
      key: "mail.from_address",
      value: "family@shoebox.example",
    });
    await database.deleteFrom("comments").execute();
    const sender = createRecordingEmailService();
    await runMailQueueOnce({
      database,
      sender,
      now: "2026-11-03T10:00:00.000Z",
    });
    expect(sender.sent).toHaveLength(0);
    expect(
      (
        await database.selectFrom("outbound_emails").select("state").execute()
      )[0]!.state,
    ).toBe("cancelled");
  } finally {
    await database.destroy();
  }
});
