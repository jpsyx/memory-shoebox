import { expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import {
  insertMember,
  insertItem,
  insertComment,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

it("upgrades 0020 without losing outbox history or its delivery references", async () => {
  const database = createDatabase(":memory:");
  try {
    const sources = await getMigrationSourcesFromFiles();
    await migrateToLatest(database, {
      sources: Object.fromEntries(
        Object.entries(sources).filter(([name]) => {
          return name < "0021";
        }),
      ),
    });
    const memberId = await insertMember(database);
    await sql`insert into outbound_emails (id, kind, to_address, to_member_id, from_address, sender_snapshot_json, subject, payload_json, trigger_kind, trigger_id, idempotency_key, state, send_after, created_at) values ('old-mail', 'comment', 'delivered@resend.dev', ${memberId}, 'sender@example.com', '{"frozen":true}', 'Old subject', '{"old":true}', 'comment', 'historical-comment', 'old-key', 'sent', ${NOW}, ${NOW})`.execute(
      database,
    );
    await sql`insert into email_delivery_events (id,email_id,event,occurred_at,received_at) values ('event','old-mail','delivered',${NOW},${NOW})`.execute(
      database,
    );
    const emails = (await sql`select * from outbound_emails`.execute(database))
      .rows;
    const indexes = (
      await sql`select name,sql from sqlite_master where type='index' and tbl_name='outbound_emails' order by name`.execute(
        database,
      )
    ).rows;
    await migrateToLatest(database);
    expect(
      (await sql`select * from outbound_emails`.execute(database)).rows,
    ).toEqual(emails);
    expect(
      (
        await sql`select name,sql from sqlite_master where type='index' and tbl_name='outbound_emails' order by name`.execute(
          database,
        )
      ).rows,
    ).toEqual(indexes);
    expect(
      (await sql`select * from email_delivery_events`.execute(database)).rows,
    ).toHaveLength(1);
    expect(
      (
        await sql<{
          notify_on_comment_tag: number;
        }>`select notify_on_comment_tag from members`.execute(database)
      ).rows[0]?.notify_on_comment_tag,
    ).toBe(1);
    await sql`insert into outbound_emails (id,kind,to_address,subject,payload_json,trigger_kind,trigger_id,idempotency_key,state,send_after,created_at) values ('tag-mail','comment_tag','delivered@resend.dev','Tag','{}','comment','c','tag-key','queued',${NOW},${NOW})`.execute(
      database,
    );
    expect(
      (await sql`pragma foreign_key_check`.execute(database)).rows,
    ).toEqual([]);
    expect(
      (
        await sql<{ integrity_check: string }>`pragma integrity_check`.execute(
          database,
        )
      ).rows,
    ).toEqual([{ integrity_check: "ok" }]);
  } finally {
    await database.destroy();
  }
});

it("enforces occurrence constraints and retains scheduling history until comment deletion", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
      body: "@Rosa",
    });
    const insertTag = (
      id: string,
      start: number,
      end: number,
      target = memberId,
    ) => {
      return sql`insert into comment_tags values (${id},${commentId},${target},${start},${end},'Rosa')`.execute(
        database,
      );
    };
    await insertTag("tag", 0, 5);
    await expect(insertTag("duplicate", 0, 5)).rejects.toThrow();
    await expect(insertTag("negative", -1, 5)).rejects.toThrow();
    await expect(insertTag("empty", 2, 2)).rejects.toThrow();
    await expect(insertTag("fraction", 1.5, 5)).rejects.toThrow();
    await expect(
      insertTag("missing-member", 2, 5, "missing"),
    ).rejects.toThrow();
    await sql`insert into comment_tag_notifications values (${commentId},${memberId},${NOW})`.execute(
      database,
    );
    await expect(
      sql`insert into comment_tag_notifications values (${commentId},${memberId},${NOW})`.execute(
        database,
      ),
    ).rejects.toThrow();
    await sql`delete from comment_tags`.execute(database);
    expect(
      (await sql`select * from comment_tag_notifications`.execute(database))
        .rows,
    ).toHaveLength(1);
    await insertTag("replacement", 0, 5);
    await database.deleteFrom("comments").where("id", "=", commentId).execute();
    expect(
      (await sql`select * from comment_tags`.execute(database)).rows,
    ).toEqual([]);
    expect(
      (await sql`select * from comment_tag_notifications`.execute(database))
        .rows,
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});
