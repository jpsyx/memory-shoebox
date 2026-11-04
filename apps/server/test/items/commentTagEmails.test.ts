import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertMember,
  insertItem,
  insertInstanceSetting,
} from "../helpers/seedHelpers/seedHelpers.ts";

async function _fixture(tagMail = 1, genericMail = 1) {
  const context = await createTestApp();
  const author = await insertSignedInMember({
    database: context.database,
    member: { display_name: "Author" },
  });
  const recipientId = await insertMember(context.database, {
    notify_upload_frequency: "immediate",
    display_name: "Ana",
    notify_comment_tag_frequency: tagMail ? "immediate" : "off",
    notify_comment_frequency: genericMail ? "immediate" : "off",
  });
  const itemId = await insertItem(context.database, {
    uploadedBy: recipientId,
    kind: "video",
    duration_ms: 30000,
  });
  await insertInstanceSetting(context.database, {
    key: "public.base_url",
    value: "https://shoebox.example",
  });
  const post = (payload: object) => {
    return context.app.inject({
      method: "POST",
      url: `/api/items/${itemId}/comments`,
      headers: { cookie: author.cookie },
      payload,
    });
  };
  const patch = (commentId: string, payload: object) => {
    return context.app.inject({
      method: "PATCH",
      url: `/api/comments/${commentId}`,
      headers: { cookie: author.cookie },
      payload,
    });
  };
  const payload = {
    body: "@Ana @Ana @Author",
    commentTags: [
      { memberId: recipientId, start: 0, end: 4 },
      { memberId: recipientId, start: 5, end: 9 },
      { memberId: author.memberId, start: 10, end: 17 },
    ],
  };
  return { ...context, author, recipientId, itemId, post, patch, payload };
}

describe("comment tag email lifecycle", () => {
  it.each([
    [1, 1, ["comment_tag"]],
    [1, 0, ["comment_tag"]],
    [0, 1, ["comment"]],
    [0, 0, []],
  ] as const)(
    "arbitrates tag=%s generic=%s once per recipient, excluding self",
    async (tag, generic, kinds) => {
      const fixture = await _fixture(tag, generic);
      try {
        const created = await fixture.post(fixture.payload);
        expect(created.statusCode).toBe(201);
        const rows = await fixture.database
          .selectFrom("outbound_emails")
          .selectAll()
          .execute();
        expect(
          rows.map((row) => {
            return row.kind;
          }),
        ).toEqual(kinds);
        expect(
          rows.every((row) => {
            return row.to_member_id === fixture.recipientId;
          }),
        ).toBe(true);
        if (tag) {
          expect(JSON.parse(rows[0]!.payload_json)).toMatchObject({
            itemKind: "video",
            itemUrl: `https://shoebox.example/items/${fixture.itemId}?comment=${created.json().commentId}`,
            preferencesUrl: "https://shoebox.example/account?email=comment-tag",
          });
        }
      } finally {
        await fixture.close();
      }
    },
  );

  it("new tags on edit get one lifetime message even after generic mail and outbox deletion", async () => {
    const fixture = await _fixture();
    try {
      const created = (await fixture.post({ body: "Before" })).json();
      expect(
        (await fixture.patch(created.commentId, fixture.payload)).statusCode,
      ).toBe(200);
      const rows = await fixture.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute();
      expect(
        rows.map((row) => {
          return row.kind;
        }),
      ).toEqual(["comment", "comment_tag"]);
      const snapshot = rows[1]!.payload_json;
      const edited = (
        await fixture.patch(created.commentId, {
          body: "@Ana @Ana @Author!",
          commentTags: (
            await fixture.patch(created.commentId, fixture.payload)
          ).json().commentTags,
        })
      ).json();
      expect(edited.body).toBe("@Ana @Ana @Author!");
      expect(
        (
          await fixture.database
            .selectFrom("outbound_emails")
            .selectAll()
            .where("kind", "=", "comment_tag")
            .executeTakeFirstOrThrow()
        ).payload_json,
      ).toBe(snapshot);
      await fixture.patch(created.commentId, {
        body: "Removed",
        commentTags: [],
      });
      expect(
        (
          await fixture.database
            .selectFrom("outbound_emails")
            .selectAll()
            .where("kind", "=", "comment_tag")
            .executeTakeFirstOrThrow()
        ).state,
      ).toBe("cancelled");
      await fixture.database.deleteFrom("outbound_emails").execute();
      await fixture.patch(created.commentId, fixture.payload);
      expect(
        await fixture.database
          .selectFrom("outbound_emails")
          .selectAll()
          .execute(),
      ).toEqual([]);
      expect(
        await fixture.database
          .selectFrom("comment_tag_notifications")
          .selectAll()
          .execute(),
      ).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });

  it("cancels parent and cascading reply tag and generic messages", async () => {
    const fixture = await _fixture();
    try {
      const parent = (await fixture.post(fixture.payload)).json();
      await fixture.post({
        ...fixture.payload,
        parentCommentId: parent.commentId,
      });
      await fixture.post({
        body: "Plain reply",
        parentCommentId: parent.commentId,
      });
      await fixture.app.inject({
        method: "DELETE",
        url: `/api/comments/${parent.commentId}`,
        headers: { cookie: fixture.author.cookie },
      });
      const rows = await fixture.database
        .selectFrom("outbound_emails")
        .selectAll()
        .execute();
      expect(rows).toHaveLength(3);
      expect(
        rows.every((row) => {
          return row.state === "cancelled";
        }),
      ).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("rolls back comment, tags and scheduling ledger if enqueue fails", async () => {
    const fixture = await _fixture();
    try {
      await sql`create trigger fail_tag_mail before insert on outbound_emails when new.kind = 'comment_tag' begin select raise(abort, 'enqueue failed'); end`.execute(
        fixture.database,
      );
      expect((await fixture.post(fixture.payload)).statusCode).toBe(500);
      expect(
        await fixture.database.selectFrom("comments").selectAll().execute(),
      ).toEqual([]);
      expect(
        await fixture.database.selectFrom("comment_tags").selectAll().execute(),
      ).toEqual([]);
      expect(
        await fixture.database
          .selectFrom("comment_tag_notifications")
          .selectAll()
          .execute(),
      ).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
});

it("uses canonical links when the configured origin has a trailing slash", async () => {
  const fixture = await _fixture();
  try {
    await fixture.database
      .updateTable("settings")
      .set({ value: JSON.stringify("https://shoebox.example/") })
      .where("key", "=", "public.base_url")
      .execute();
    const created = (await fixture.post(fixture.payload)).json();
    const row = await fixture.database
      .selectFrom("outbound_emails")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(JSON.parse(row.payload_json)).toMatchObject({
      itemUrl: `https://shoebox.example/items/${fixture.itemId}?comment=${created.commentId}`,
      preferencesUrl: "https://shoebox.example/account?email=comment-tag",
    });
  } finally {
    await fixture.close();
  }
});

it("cancels pending daily parent and reply events when the thread is deleted", async () => {
  const fixture = await _fixture();
  try {
    await fixture.database
      .updateTable("members")
      .set({
        notify_comment_frequency: "daily",
        notify_comment_tag_frequency: "daily",
      })
      .where("id", "=", fixture.recipientId)
      .execute();
    const parent = (await fixture.post(fixture.payload)).json();
    await fixture.post({ body: "Reply", parentCommentId: parent.commentId });
    expect(
      await fixture.database
        .selectFrom("notification_digest_events")
        .selectAll()
        .execute(),
    ).toHaveLength(2);
    await fixture.app.inject({
      method: "DELETE",
      url: `/api/comments/${parent.commentId}`,
      headers: { cookie: fixture.author.cookie },
    });
    const events = await fixture.database
      .selectFrom("notification_digest_events")
      .select("state")
      .execute();
    expect(events).toEqual([{ state: "cancelled" }, { state: "cancelled" }]);
  } finally {
    await fixture.close();
  }
});

it.each(["off", "immediate", "daily"] as const)(
  "arbitrates each generic frequency against %s tag delivery",
  async (tagFrequency) => {
    const fixture = await _fixture();
    try {
      for (const genericFrequency of ["off", "immediate", "daily"] as const) {
        await fixture.database
          .updateTable("members")
          .set({
            notify_comment_frequency: genericFrequency,
            notify_comment_tag_frequency: tagFrequency,
          })
          .where("id", "=", fixture.recipientId)
          .execute();
        const commentId = (await fixture.post(fixture.payload)).json()
          .commentId;
        const outbox = await fixture.database
          .selectFrom("outbound_emails")
          .selectAll()
          .where("trigger_id", "=", commentId)
          .execute();
        const events = await fixture.database
          .selectFrom("notification_digest_events")
          .selectAll()
          .where("source_id", "=", commentId)
          .execute();
        const selected =
          tagFrequency === "off" ? genericFrequency : tagFrequency;
        expect(outbox).toHaveLength(selected === "immediate" ? 1 : 0);
        expect(events).toHaveLength(selected === "daily" ? 1 : 0);
        if (selected !== "off") {
          expect(outbox[0]?.kind ?? events[0]?.category).toBe(
            tagFrequency === "off" ? "comment" : "comment_tag",
          );
        }
      }
    } finally {
      await fixture.close();
    }
  },
);

it("never resurrects a daily tag after removal and re-addition", async () => {
  const fixture = await _fixture();
  try {
    await fixture.database
      .updateTable("members")
      .set({ notify_comment_tag_frequency: "daily" })
      .where("id", "=", fixture.recipientId)
      .execute();
    const commentId = (await fixture.post(fixture.payload)).json().commentId;
    await fixture.patch(commentId, { body: "No tags", commentTags: [] });
    await fixture.patch(commentId, fixture.payload);
    expect(
      await fixture.database
        .selectFrom("notification_digest_events")
        .select("state")
        .execute(),
    ).toEqual([{ state: "cancelled" }]);
  } finally {
    await fixture.close();
  }
});
