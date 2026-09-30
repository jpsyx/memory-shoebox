import { describe, expect, it } from "vitest";
import { createId } from "../../src/db/createId.ts";
import { createTestApp } from "../helpers/createTestApp.ts";
import { insertSignedInMember } from "../helpers/insertSignedInMember.ts";
import {
  insertComment,
  insertItem,
  insertMember,
  insertOutboundEmail,
  insertVisibilityRule,
  NOW,
} from "../helpers/seedHelpers/seedHelpers.ts";

const makeApp = async () => {
  return createTestApp({
    clock: () => {
      return new Date(NOW);
    },
  });
};

describe("PATCH /api/comments/:commentId", () => {
  it("edits the body and leaves an edited mark", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
      at_seconds: 12.5,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/comments/${commentId}`,
      headers: { cookie },
      payload: { body: "Edited", atSeconds: 90 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().body).toBe("Edited");
    expect(response.json().editedAt).toBe(NOW);
    // A pin is fixed at creation: moving it would slide a mark under
    // everybody else reading the same transport bar.
    expect(response.json().atSeconds).toBe(12.5);
    await close();
  });

  it("refuses everybody but the author, admins included", async () => {
    const { app, database, close } = await makeApp();
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin-token",
      member: { role: "admin" },
    });
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: authorId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: authorId,
    });

    const response = await app.inject({
      method: "PATCH",
      url: `/api/comments/${commentId}`,
      headers: { cookie: adminCookie },
      payload: { body: "Let me fix that for you" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("comment_edit_forbidden");
    await close();
  });

  it("is a 404 naming the comment when the item is invisible", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const otherMemberId = await insertMember(database);
    const hiddenRuleId = await insertVisibilityRule(database, { mode: "only" });
    const itemId = await insertItem(database, {
      uploadedBy: otherMemberId,
      visibility_rule_id: hiddenRuleId,
    });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: otherMemberId,
    });

    const hidden = await app.inject({
      method: "PATCH",
      url: `/api/comments/${commentId}`,
      headers: { cookie },
      payload: { body: "Edited" },
    });
    const nothing = await app.inject({
      method: "PATCH",
      url: `/api/comments/${createId()}`,
      headers: { cookie },
      payload: { body: "Edited" },
    });

    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error).toBe("comment_not_found");
    expect(hidden.body).toBe(nothing.body);
    await close();
  });
});

describe("DELETE /api/comments/:commentId", () => {
  it("takes the comment and its reactions down, and answers 204", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
    });
    await database
      .insertInto("comment_reactions")
      .values({
        id: createId(),
        comment_id: commentId,
        member_id: memberId,
        kind: "love",
        created_at: NOW,
      })
      .execute();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/comments/${commentId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(
      await database.selectFrom("comment_reactions").selectAll().execute(),
    ).toEqual([]);
    await close();
  });

  it("writes no audit row for an author, and one for an admin", async () => {
    const { app, database, close } = await makeApp();
    const { cookie: authorCookie, memberId: authorId } =
      await insertSignedInMember({
        database,
      });
    const { cookie: adminCookie } = await insertSignedInMember({
      database,
      token: "admin-token",
      member: { role: "admin", display_name: "Mamá" },
    });
    const itemId = await insertItem(database, { uploadedBy: authorId });
    const ownId = await insertComment(database, {
      itemId,
      authorMemberId: authorId,
    });
    const othersId = await insertComment(database, {
      itemId,
      authorMemberId: authorId,
      body: "Original",
    });

    await app.inject({
      method: "DELETE",
      url: `/api/comments/${ownId}`,
      headers: { cookie: authorCookie },
    });
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);

    await app.inject({
      method: "DELETE",
      url: `/api/comments/${othersId}`,
      headers: { cookie: adminCookie },
    });

    const row = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.kind).toBe("comment_deleted");
    expect(row.subject_kind).toBe("comment");
    expect(row.subject_id).toBe(othersId);
    // The body as it stood, because nothing else will ever hold it again.
    expect(row.subject_label).toContain("Original");
    expect(row.actor_label).toBe("Mamá");
    await close();
  });

  it("cancels a queued notification and leaves one already sending", async () => {
    const { app, database, close } = await makeApp();
    const { cookie, memberId } = await insertSignedInMember({ database });
    const itemId = await insertItem(database, { uploadedBy: memberId });
    const queuedCommentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
    });
    const sendingCommentId = await insertComment(database, {
      itemId,
      authorMemberId: memberId,
    });
    const queuedEmailId = await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      trigger_id: queuedCommentId,
      state: "queued",
      idempotency_key: `comment:${queuedCommentId}:${memberId}`,
    });
    const sendingEmailId = await insertOutboundEmail(database, {
      kind: "comment",
      trigger_kind: "comment",
      trigger_id: sendingCommentId,
      state: "sending",
      idempotency_key: `comment:${sendingCommentId}:${memberId}`,
    });

    await app.inject({
      method: "DELETE",
      url: `/api/comments/${queuedCommentId}`,
      headers: { cookie },
    });
    await app.inject({
      method: "DELETE",
      url: `/api/comments/${sendingCommentId}`,
      headers: { cookie },
    });

    const states = await database
      .selectFrom("outbound_emails")
      .select(["id", "state"])
      .execute();

    expect(
      states.find((row) => {
        return row.id === queuedEmailId;
      })?.state,
    ).toBe("cancelled");
    // A message already handed to the provider cannot be recalled, and
    // cancelling it would make the delivered-or-not boundary a race.
    expect(
      states.find((row) => {
        return row.id === sendingEmailId;
      })?.state,
    ).toBe("sending");
    await close();
  });

  it("refuses somebody who is neither the author nor an admin", async () => {
    const { app, database, close } = await makeApp();
    const { cookie } = await insertSignedInMember({ database });
    const authorId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: authorId });
    const commentId = await insertComment(database, {
      itemId,
      authorMemberId: authorId,
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/comments/${commentId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("comment_delete_forbidden");
    await close();
  });
});
