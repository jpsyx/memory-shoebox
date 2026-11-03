import { expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import { insertMember, NOW } from "../helpers/seedHelpers/seedHelpers.ts";

it("resets existing opt-outs once and moves only unattempted activity into digests", async () => {
  const database = createDatabase(":memory:");
  try {
    const sources = await getMigrationSourcesFromFiles();
    await migrateToLatest(database, {
      sources: Object.fromEntries(
        Object.entries(sources).filter(([name]) => name < "0022"),
      ),
    });
    const memberId = await insertMember(database, {
      notify_on_upload: 0,
      notify_on_comment: 0,
      notify_on_reply: 0,
      notify_on_comment_tag: 0,
      notify_on_removal: 0,
    });
    for (const [id, kind, state, attempts] of [
      ["upload", "upload_session", "queued", 0],
      ["comment", "comment", "queued", 0],
      ["tag", "comment_tag", "queued", 0],
      ["retry", "comment", "queued", 1],
      ["sent", "comment", "sent", 1],
      ["sending", "comment", "sending", 0],
    ] as const) {
      await sql`insert into outbound_emails (id,kind,to_address,to_member_id,subject,payload_json,trigger_kind,trigger_id,idempotency_key,state,attempts,send_after,created_at) values (${id},${kind},'delivered@resend.dev',${memberId},'Subject','{}',${kind === "upload_session" ? "upload_session" : "comment"},${id},${id},${state},${attempts},${NOW},${NOW})`.execute(
        database,
      );
    }
    await migrateToLatest(database);
    const member = (
      await sql<
        Record<string, unknown>
      >`select * from members where id=${memberId}`.execute(database)
    ).rows[0]!;
    expect([
      member.notify_upload_frequency,
      member.notify_comment_frequency,
      member.notify_comment_tag_frequency,
    ]).toEqual(["daily", "daily", "immediate"]);
    expect(member.notify_on_removal).toBe(0);
    expect(
      (
        await sql`select deduplication_key from notification_digest_events order by deduplication_key`.execute(
          database,
        )
      ).rows,
    ).toEqual([
      { deduplication_key: "comment" },
      { deduplication_key: "upload" },
    ]);
    expect(
      (
        await sql`select id,state from outbound_emails order by id`.execute(
          database,
        )
      ).rows,
    ).toEqual([
      { id: "comment", state: "cancelled" },
      { id: "retry", state: "queued" },
      { id: "sending", state: "sending" },
      { id: "sent", state: "sent" },
      { id: "tag", state: "queued" },
      { id: "upload", state: "cancelled" },
    ]);
    await sql`update members set notify_upload_frequency='off' where id=${memberId}`.execute(
      database,
    );
    await migrateToLatest(database);
    expect(
      (
        await sql`select notify_upload_frequency from members where id=${memberId}`.execute(
          database,
        )
      ).rows,
    ).toEqual([{ notify_upload_frequency: "off" }]);
    await expect(
      sql`update members set notify_upload_frequency='weekly'`.execute(
        database,
      ),
    ).rejects.toThrow();
    expect(
      (await sql`pragma foreign_key_check`.execute(database)).rows,
    ).toEqual([]);
    expect((await sql`pragma integrity_check`.execute(database)).rows).toEqual([
      { integrity_check: "ok" },
    ]);
  } finally {
    await database.destroy();
  }
});

it("enforces unique digest ownership and coherent source and batch states", async () => {
  const database = createDatabase(":memory:");
  try {
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    await sql`insert into notification_digest_batches(id,member_id,send_date,timezone,cutoff_local_date,prepared_at) values ('batch',${memberId},'2026-11-03','UTC','2026-11-03',${NOW})`.execute(
      database,
    );
    await expect(
      sql`insert into notification_digest_batches(id,member_id,send_date,timezone,cutoff_local_date,prepared_at) values ('duplicate',${memberId},'2026-11-03','UTC','2026-11-03',${NOW})`.execute(
        database,
      ),
    ).rejects.toThrow();
    await sql`insert into notification_digest_events(id,member_id,category,source_kind,source_id,occurred_at,deduplication_key,state) values ('event',${memberId},'comment','comment','source',${NOW},'key','pending')`.execute(
      database,
    );
    await expect(
      sql`update notification_digest_events set state='included'`.execute(
        database,
      ),
    ).rejects.toThrow();
    await expect(
      sql`update notification_digest_events set category='upload'`.execute(
        database,
      ),
    ).rejects.toThrow();
    await sql`update notification_digest_events set state='included',batch_id='batch'`.execute(
      database,
    );
    await expect(
      sql`delete from notification_digest_batches where id='batch'`.execute(
        database,
      ),
    ).rejects.toThrow();
    await sql`insert into outbound_emails(id,kind,to_address,subject,payload_json,trigger_kind,trigger_id,idempotency_key,state,send_after,created_at) values ('digest','daily_digest','delivered@resend.dev','Digest','{}','daily_digest','batch','digest-key','queued',${NOW},${NOW})`.execute(
      database,
    );
    await sql`update notification_digest_batches set outbound_email_id='digest'`.execute(
      database,
    );
    await sql`delete from outbound_emails where id='digest'`.execute(database);
    expect(
      (
        await sql`select outbound_email_id from notification_digest_batches`.execute(
          database,
        )
      ).rows,
    ).toEqual([{ outbound_email_id: null }]);
  } finally {
    await database.destroy();
  }
});
