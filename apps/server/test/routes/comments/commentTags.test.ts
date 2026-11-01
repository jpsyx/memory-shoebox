import { expect, it } from "vitest";
import { sql } from "kysely";
import { createId } from "../../../src/db/createId.ts";
import { insertComment } from "../../helpers/seedHelpers/seedHelpers.ts";
import { createCommentTagFixture } from "./commentTagTestHelpers.ts";

it("persists selected repeated/self tags, shifted UTF-16 ranges, and plain typed text remains plain", async () => {
  const fixture = await createCommentTagFixture();
  try {
    const { post, memberId, author, database } = fixture;
    const response = await post({
      body: "  😀 @Ana @Ana @Author  ",
      commentTags: [
        { memberId, start: 5, end: 9 },
        { memberId, start: 10, end: 14 },
        { memberId: author.memberId, start: 15, end: 22 },
      ],
      atSeconds: 8,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().commentTags).toEqual([
      { tagId: expect.any(String), memberId, start: 3, end: 7, label: "Ana" },
      {
        tagId: expect.any(String),
        memberId,
        start: 8,
        end: 12,
        label: "Ana",
      },
      {
        tagId: expect.any(String),
        memberId: author.memberId,
        start: 13,
        end: 20,
        label: "Author",
      },
    ]);
    expect(
      await database.selectFrom("comment_tags").selectAll().execute(),
    ).toHaveLength(3);
    expect((await post({ body: "@Ana" })).json().commentTags).toEqual([]);
  } finally {
    await fixture.close();
  }
});

it("rejects stale labels and unavailable identities with recoverable indexed errors", async () => {
  const fixture = await createCommentTagFixture();
  try {
    const { database, memberId, post } = fixture;
    await database
      .updateTable("members")
      .set({ display_name: "Anita" })
      .where("id", "=", memberId)
      .execute();
    const stale = await post({
      body: "@Ana",
      commentTags: [{ memberId, start: 0, end: 4 }],
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toBe("comment_tag_stale");
    expect(stale.json().details.fieldErrors["commentTags.0"]).toBeDefined();
    await database
      .updateTable("members")
      .set({ status: "removed" })
      .where("id", "=", memberId)
      .execute();
    const removed = await post({
      body: "@Anita",
      commentTags: [{ memberId, start: 0, end: 6 }],
    });
    const missing = await post({
      body: "@Anita",
      commentTags: [{ memberId: createId(), start: 0, end: 6 }],
    });
    expect(removed.statusCode).toBe(409);
    expect(removed.json().error).toBe("comment_tag_unavailable");
    expect(removed.body).toBe(missing.body);
    expect(await database.selectFrom("comments").selectAll().execute()).toEqual(
      [],
    );
  } finally {
    await fixture.close();
  }
});

it("retains historical IDs and labels after rename/removal, rejects omission and new copies, and permits explicit removal", async () => {
  const fixture = await createCommentTagFixture();
  try {
    const { post, patch, database, memberId } = fixture;
    const created = (
      await post({
        body: "@Ana",
        commentTags: [{ memberId, start: 0, end: 4 }],
        atSeconds: 8,
      })
    ).json();
    expect(created.commentTags).toHaveLength(1);
    const tag = created.commentTags[0];
    await database
      .updateTable("members")
      .set({ display_name: "Anita", status: "removed" })
      .where("id", "=", memberId)
      .execute();
    const omitted = await patch(created.commentId, { body: "Hello @Ana" });
    expect(omitted.statusCode).toBe(409);
    expect(omitted.json().error).toBe("comment_tags_reload_required");
    const retained = await patch(created.commentId, {
      body: "Hello @Ana",
      commentTags: [{ ...tag, start: 6, end: 10 }],
      atSeconds: 20,
      parentCommentId: createId(),
    });
    expect(retained.statusCode).toBe(200);
    expect(retained.json().commentTags).toEqual([
      { ...tag, start: 6, end: 10 },
    ]);
    expect(retained.json().atSeconds).toBe(8);
    expect(retained.json().parentCommentId).toBeNull();
    const copied = await patch(created.commentId, {
      body: "@Ana @Ana",
      commentTags: [tag, { memberId, start: 5, end: 9 }],
    });
    expect(copied.json().error).toBe("comment_tag_unavailable");
    const removed = await patch(created.commentId, {
      body: "@Ana",
      commentTags: [],
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().commentTags).toEqual([]);
    expect(
      (await patch(created.commentId, { body: "Old client again" })).statusCode,
    ).toBe(200);
  } finally {
    await fixture.close();
  }
});

it("rejects forged occurrence identity, another comment's ID, changed snapshot text and retained IDs on create", async () => {
  const fixture = await createCommentTagFixture();
  try {
    const { post, patch, memberId, author } = fixture;
    const created = (
      await post({
        body: "@Ana",
        commentTags: [{ memberId, start: 0, end: 4 }],
      })
    ).json();
    expect(created.commentTags).toHaveLength(1);
    const tag = created.commentTags[0];
    const other = (await post({ body: "Other" })).json();
    for (const [commentId, body, commentTags] of [
      [created.commentId, "@Ana", [{ ...tag, memberId: author.memberId }]],
      [other.commentId, "@Ana", [tag]],
      [created.commentId, "@AnA", [tag]],
    ] as const) {
      const response = await patch(commentId, { body, commentTags });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe("comment_tag_stale");
    }
    expect((await post({ body: "@Ana", commentTags: [tag] })).statusCode).toBe(
      409,
    );
    const duplicate = await patch(created.commentId, {
      body: "@Ana @Ana",
      commentTags: [tag, { ...tag, start: 5, end: 9 }],
    });
    expect(duplicate.statusCode).toBe(400);
  } finally {
    await fixture.close();
  }
});

it("rolls back create and edit bodies, ranges, and ordinary queued mail after occurrence insertion fails", async () => {
  const fixture = await createCommentTagFixture();
  try {
    const { post, patch, database, memberId } = fixture;
    const created = (
      await post({
        body: "@Ana",
        commentTags: [{ memberId, start: 0, end: 4 }],
      })
    ).json();
    const storedTags = await database
      .selectFrom("comment_tags")
      .selectAll()
      .execute();
    const storedEmails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    await sql`create trigger fail_tag_write after insert on comment_tags begin select raise(abort, 'tag insertion failure'); end`.execute(
      database,
    );
    const payload = {
      body: "@Ana",
      commentTags: [{ memberId, start: 0, end: 4 }],
    };
    expect((await post(payload)).statusCode).toBe(500);
    expect(
      (
        await patch(created.commentId, {
          body: "Hello @Ana",
          commentTags: [{ ...created.commentTags[0], start: 6, end: 10 }],
        })
      ).statusCode,
    ).toBe(500);
    const comments = await database
      .selectFrom("comments")
      .selectAll()
      .execute();
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe("@Ana");
    expect(comments[0]?.edited_at).toBeNull();
    expect(
      await database.selectFrom("comment_tags").selectAll().execute(),
    ).toEqual(storedTags);
    expect(
      await database.selectFrom("outbound_emails").selectAll().execute(),
    ).toEqual(storedEmails);
  } finally {
    await fixture.close();
  }
});

it("preserves one-level reply anchors and refuses non-author edits with tags", async () => {
  const fixture = await createCommentTagFixture();
  try {
    const { post, patch, database, itemId, author, memberId } = fixture;
    const parentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
      at_seconds: 9,
    });
    const reply = await post({
      body: "@Ana",
      parentCommentId: parentId,
      atSeconds: 22,
      commentTags: [{ memberId, start: 0, end: 4 }],
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().atSeconds).toBe(9);
    expect(reply.json().commentTags).toHaveLength(1);
    expect(
      (
        await patch(parentId, {
          body: "@Author",
          commentTags: [{ memberId: author.memberId, start: 0, end: 7 }],
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post({
          body: "Nested",
          parentCommentId: reply.json().commentId,
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await fixture.close();
  }
});
