import { expect, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";

it("reads the new defaults and saves frequencies while rejecting legacy writes", async () => {
  const { app, database, close } = await createTestApp();
  try {
    const { cookie } = await insertSignedInMember({ database });
    const read = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie },
    });
    expect(read.json().me.notify).toEqual({
      onUpload: "daily" as const,
      onComment: "daily" as const,
      onCommentTag: "immediate" as const,
      onRemoval: true,
    });
    const notify = {
      onUpload: "off" as const,
      onComment: "immediate" as const,
      onCommentTag: "daily" as const,
      onRemoval: false,
    };
    const write = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { notify },
    });
    expect(write.statusCode).toBe(200);
    expect(write.json().me.notify).toEqual(notify);
    const stale = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie },
      payload: { notify: { ...notify, onReply: true } },
    });
    expect(stale.statusCode).toBe(400);
  } finally {
    await close();
  }
});

it("cancels only the member's pending categories and rolls cancellation back with a failed save", async () => {
  const { sql } = await import("kysely");
  const { app, database, close } = await createTestApp();
  try {
    const first = await insertSignedInMember({ database });
    const second = await insertSignedInMember({ database, token: "other" });
    for (const memberId of [first.memberId, second.memberId]) {
      for (const category of ["upload", "comment", "comment_tag"] as const) {
        const id = `${memberId}:${category}`;
        await database
          .insertInto("notification_digest_events")
          .values({
            id,
            member_id: memberId,
            category,
            source_kind: category === "upload" ? "upload_session" : "comment",
            source_id: id,
            occurred_at: "2026-11-02T12:00:00.000Z",
            deduplication_key: id,
            state: "pending",
            batch_id: null,
          })
          .execute();
      }
    }
    const notify = {
      onUpload: "off",
      onComment: "immediate",
      onCommentTag: "daily",
      onRemoval: true,
    };
    await sql`create trigger fail_cancel before update on notification_digest_events begin select raise(abort, 'cancel failed'); end`.execute(
      database,
    );
    const failed = await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie: first.cookie },
      payload: { notify },
    });
    expect(failed.statusCode).toBe(500);
    expect(
      (
        await database
          .selectFrom("members")
          .select("notify_upload_frequency")
          .where("id", "=", first.memberId)
          .executeTakeFirstOrThrow()
      ).notify_upload_frequency,
    ).toBe("daily");
    await sql`drop trigger fail_cancel`.execute(database);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/me",
          headers: { cookie: first.cookie },
          payload: { notify },
        })
      ).statusCode,
    ).toBe(200);
    const events = await database
      .selectFrom("notification_digest_events")
      .selectAll()
      .execute();
    expect(
      events
        .filter((event) => {
          return event.state === "cancelled";
        })
        .map((event) => {
          return event.id;
        })
        .sort(),
    ).toEqual([`${first.memberId}:comment`, `${first.memberId}:upload`]);
    await app.inject({
      method: "PATCH",
      url: "/api/me",
      headers: { cookie: first.cookie },
      payload: { notify: { ...notify, onUpload: "daily", onComment: "daily" } },
    });
    expect(
      await database
        .selectFrom("notification_digest_events")
        .select("id")
        .where("state", "=", "cancelled")
        .execute(),
    ).toHaveLength(2);
  } finally {
    await close();
  }
});
