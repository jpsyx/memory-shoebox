import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commentDtoSchema } from "@memory-shoebox/shared";
import { createId } from "../../../src/db/createId.ts";
import { createTestApp, type TestApp } from "../../helpers/createTestApp.ts";
import {
  insertSignedInMember,
  type SignedInMember,
} from "../../helpers/insertSignedInMember.ts";
import {
  insertItem,
  insertRendition,
  insertInstanceSetting,
  insertVisibilityRule,
  NOW,
} from "../../helpers/seedHelpers/seedHelpers.ts";

let context: TestApp;
let author: SignedInMember;
let itemId: string;

beforeEach(async () => {
  context = await createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
  author = await insertSignedInMember({ database: context.database });
  itemId = await insertItem(context.database, {
    uploadedBy: author.memberId,
    kind: "video",
    duration_ms: 30_000,
  });
  await insertRendition(context.database, { itemId });
});

afterEach(async () => {
  await context.close();
});

function _postComment(
  payload: object,
  targetId = itemId,
  cookie = author.cookie,
) {
  return context.app.inject({
    method: "POST",
    url: `/api/items/${targetId}/comments`,
    headers: { cookie },
    payload,
  });
}

describe("video comment replies", () => {
  it.each([12.5, null])(
    "inherits a parent's %s moment and persists the relationship through reads and edits",
    async (atSeconds) => {
      const parent = await _postComment({ body: "The first step", atSeconds });
      const parentCommentId = parent.json().commentId;
      const reply = await _postComment({
        body: "I saw it too",
        parentCommentId,
        atSeconds: 29,
      });
      expect(reply.statusCode).toBe(201);
      const comment = commentDtoSchema.parse(reply.json());
      expect(comment.parentCommentId).toBe(parentCommentId);
      expect(comment.atSeconds).toBe(atSeconds);
      const read = await context.app.inject({
        method: "GET",
        url: `/api/items/${itemId}`,
        headers: { cookie: author.cookie },
      });
      expect(read.statusCode).toBe(200);
      expect(
        read.json().comments.find((entry: { commentId: string }) => {
          return entry.commentId === comment.commentId;
        }),
      ).toMatchObject({ parentCommentId, atSeconds });
      const edited = await context.app.inject({
        method: "PATCH",
        url: `/api/comments/${comment.commentId}`,
        headers: { cookie: author.cookie },
        payload: { body: "We both saw it" },
      });
      expect(edited.json()).toMatchObject({
        parentCommentId,
        atSeconds,
        body: "We both saw it",
      });
    },
  );

  it("rejects a parent from a different item, a missing parent, and a reply as parent", async () => {
    const parent = await _postComment({ body: "Parent", atSeconds: 4 });
    const reply = await _postComment({
      body: "Reply",
      parentCommentId: parent.json().commentId,
    });
    const otherItemId = await insertItem(context.database, {
      seq: 2,
      uploadedBy: author.memberId,
      kind: "video",
      duration_ms: 30_000,
    });
    const invalid = [
      { parentCommentId: parent.json().commentId, targetId: otherItemId },
      { parentCommentId: createId(), targetId: itemId },
      { parentCommentId: reply.json().commentId, targetId: itemId },
    ];
    for (const entry of invalid) {
      const response = await _postComment(
        { body: "Invalid reply", parentCommentId: entry.parentCommentId },
        entry.targetId,
      );
      expect(response.statusCode).toBe(400);
      expect(response.json().details.fieldErrors.parentCommentId).toBeDefined();
    }
    expect(
      await context.database.selectFrom("comments").selectAll().execute(),
    ).toHaveLength(2);
  });

  it("rejects replies to photographs while keeping their top-level comments", async () => {
    const photoId = await insertItem(context.database, {
      seq: 2,
      uploadedBy: author.memberId,
    });
    const parent = await _postComment({ body: "A photo comment" }, photoId);
    const reply = await _postComment(
      { body: "A reply", parentCommentId: parent.json().commentId },
      photoId,
    );
    expect(parent.statusCode).toBe(201);
    expect(parent.json().parentCommentId).toBeNull();
    expect(reply.statusCode).toBe(400);
  });

  it("promotes other members' replies and preserves their moment when their parent is removed", async () => {
    const parent = await _postComment({ body: "Parent", atSeconds: 4 });
    const other = await insertSignedInMember({
      database: context.database,
      token: "reply-author",
    });
    const reply = await _postComment(
      { body: "Keep these words", parentCommentId: parent.json().commentId },
      itemId,
      other.cookie,
    );
    const removed = await context.app.inject({
      method: "DELETE",
      url: `/api/comments/${parent.json().commentId}`,
      headers: { cookie: author.cookie },
    });
    expect(removed.statusCode).toBe(204);
    const read = await context.app.inject({
      method: "GET",
      url: `/api/items/${itemId}`,
      headers: { cookie: other.cookie },
    });
    expect(read.json().comments).toEqual([
      expect.objectContaining({
        commentId: reply.json().commentId,
        body: "Keep these words",
        atSeconds: 4,
        parentCommentId: null,
      }),
    ]);
  });

  it("keeps existing notification recipients and inherits the parent's moment in mail", async () => {
    await insertInstanceSetting(context.database, {
      key: "public.base_url",
      value: "https://shoebox.example.com",
    });
    const parent = await _postComment({ body: "Parent", atSeconds: 4 });
    const other = await insertSignedInMember({
      database: context.database,
      token: "mail-reply-author",
    });
    const reply = await _postComment(
      {
        body: "A reply worth keeping",
        parentCommentId: parent.json().commentId,
        atSeconds: 20,
      },
      itemId,
      other.cookie,
    );
    expect(reply.statusCode).toBe(201);
    const mail = await context.database
      .selectFrom("outbound_emails")
      .selectAll()
      .where("trigger_id", "=", reply.json().commentId)
      .execute();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({
      to_member_id: author.memberId,
      state: "queued",
    });
    expect(JSON.parse(mail[0]?.payload_json ?? "{}")).toMatchObject({
      body: "A reply worth keeping",
      atSeconds: 4,
      relation: "uploader",
    });
  });

  it("checks item visibility before revealing whether the requested parent exists", async () => {
    const parent = await _postComment({ body: "Private parent", atSeconds: 4 });
    const visibilityRuleId = await insertVisibilityRule(context.database, {
      mode: "only",
    });
    await context.database
      .updateTable("items")
      .set({ visibility_rule_id: visibilityRuleId })
      .where("id", "=", itemId)
      .execute();
    const other = await insertSignedInMember({
      database: context.database,
      token: "excluded-reply-author",
    });
    const hidden = await _postComment(
      { body: "Probe", parentCommentId: parent.json().commentId },
      itemId,
      other.cookie,
    );
    const missing = await _postComment(
      { body: "Probe", parentCommentId: parent.json().commentId },
      createId(),
      other.cookie,
    );
    expect(hidden.statusCode).toBe(404);
    expect(hidden.body).toBe(missing.body);
    expect(
      await context.database.selectFrom("comments").selectAll().execute(),
    ).toHaveLength(1);
  });
});
