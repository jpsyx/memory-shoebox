import { expect, it, vi } from "vitest";
import { sql } from "kysely";
import { createMailContext } from "./__tests__/runMailQueueOnceTestHelpers.ts";
import {
  insertMember,
  insertItem,
  insertComment,
  insertVisibilityRule,
  NOW,
  shiftMinutes,
} from "../helpers/seedHelpers/seedHelpers.ts";
import { enqueueEmail } from "../../src/mail/enqueueEmail/enqueueEmail.ts";
import { deliverQueuedEmail } from "../../src/mail/deliverQueuedEmail.ts";
import { runMailQueueOnce } from "../../src/mail/runMailQueueOnce.ts";
import { MailSendError } from "../../src/mail/MailSendError.ts";
import { createId } from "../../src/db/createId.ts";

async function _fixture() {
  const context = await createMailContext();
  const authorId = await insertMember(context.database);
  const memberId = await insertMember(context.database);
  const itemId = await insertItem(context.database, { uploadedBy: authorId });
  const commentId = await insertComment(context.database, {
    itemId,
    authorMemberId: authorId,
  });
  await context.database
    .insertInto("comment_tags")
    .values({
      id: createId(),
      comment_id: commentId,
      member_id: memberId,
      start_offset: 0,
      end_offset: 4,
      label_snapshot: "Ana",
    })
    .execute();
  await enqueueEmail({
    executor: context.database,
    now: NOW,
    input: {
      kind: "comment_tag",
      toAddress: "delivered@resend.dev",
      toMemberId: memberId,
      toDisplayName: "Ana",
      idempotencyKey: `comment-tag:${commentId}:${memberId}`,
      triggerKind: "comment",
      triggerId: commentId,
      payload: {
        authorDisplayName: "Author",
        body: "@Ana",
        atSeconds: null,
        itemKind: "photo",
        itemCapturedOn: "2026-09-27",
        itemUrl: `https://shoebox.example/items/${itemId}?comment=${commentId}`,
      },
    },
  });
  return { ...context, memberId, itemId, commentId };
}

it.each([
  "preference",
  "status",
  "completion",
  "tag",
  "comment",
  "item",
  "visibility",
] as const)(
  "checks current %s after rendering and sender freezing",
  async (change) => {
    const fixture = await _fixture();
    const { database, memberId, itemId, commentId, sender } = fixture;
    try {
      await database
        .updateTable("outbound_emails")
        .set({ state: "sending" })
        .execute();
      const row = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow();
      const rendered = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      const pending = deliverQueuedEmail({
        context: {
          database,
          sender,
          now: NOW,
          fromAddress: "local@example.com",
          fromName: undefined,
        },
        row,
        sender,
        fromAddress: "local@example.com",
        render: async () => {
          rendered.resolve();
          await resume.promise;
          return { html: "<p>Tag</p>", text: "Tag" };
        },
      });
      await rendered.promise;
      if (change === "preference") {
        await database
          .updateTable("members")
          .set({ notify_comment_tag_frequency: "off" })
          .where("id", "=", memberId)
          .execute();
      }
      if (change === "status") {
        await database
          .updateTable("members")
          .set({ status: "removed" })
          .where("id", "=", memberId)
          .execute();
      }
      if (change === "completion") {
        await database
          .updateTable("members")
          .set({ profile_completed_at: null })
          .where("id", "=", memberId)
          .execute();
      }
      if (change === "tag") {
        await database.deleteFrom("comment_tags").execute();
      }
      if (change === "comment") {
        await database
          .deleteFrom("comments")
          .where("id", "=", commentId)
          .execute();
      }
      if (change === "item") {
        await database.deleteFrom("items").where("id", "=", itemId).execute();
      }
      if (change === "visibility") {
        const ruleId = await insertVisibilityRule(database, { mode: "only" });
        await database
          .updateTable("items")
          .set({ visibility_rule_id: ruleId })
          .where("id", "=", itemId)
          .execute();
      }
      resume.resolve();
      await pending;
      expect(sender.sent).toHaveLength(0);
      const final = await database
        .selectFrom("outbound_emails")
        .selectAll()
        .executeTakeFirstOrThrow();
      expect(final.state).toBe("cancelled");
      expect(final.sender_snapshot_json).not.toBeNull();
    } finally {
      await database.destroy();
    }
  },
);

it("rechecks an opted-out recipient on every provider retry", async () => {
  const fixture = await _fixture();
  try {
    const send = vi
      .fn()
      .mockRejectedValue(
        new MailSendError({ code: "network_error", message: "Lost response" }),
      );
    await runMailQueueOnce({
      database: fixture.database,
      sender: { send },
      now: NOW,
    });
    expect(send).toHaveBeenCalledTimes(1);
    await fixture.database
      .updateTable("members")
      .set({ notify_comment_tag_frequency: "off" })
      .where("id", "=", fixture.memberId)
      .execute();
    await runMailQueueOnce({
      database: fixture.database,
      sender: { send },
      now: shiftMinutes({ instant: NOW, minutes: 1 }),
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await fixture.database
          .selectFrom("outbound_emails")
          .selectAll()
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe("cancelled");
  } finally {
    await fixture.database.destroy();
  }
});

it("delivers an eligible current tag through the recording sender", async () => {
  const fixture = await _fixture();
  try {
    const result = await runMailQueueOnce({
      database: fixture.database,
      sender: fixture.sender,
      now: NOW,
    });
    expect(result.sentCount).toBe(1);
    expect(fixture.sender.sent[0]?.text).toContain(
      `/items/${fixture.itemId}?comment=${fixture.commentId}`,
    );
  } finally {
    await fixture.database.destroy();
  }
});

it("checks a preference revoked by the sender-freezing write", async () => {
  const fixture = await _fixture();
  try {
    await sql`create trigger revoke_during_freeze after update of sender_snapshot_json on outbound_emails begin update members set notify_comment_tag_frequency = 'off' where id = new.to_member_id; end`.execute(
      fixture.database,
    );
    await runMailQueueOnce({
      database: fixture.database,
      sender: fixture.sender,
      now: NOW,
    });
    expect(fixture.sender.sent).toHaveLength(0);
    expect(
      (
        await fixture.database
          .selectFrom("outbound_emails")
          .selectAll()
          .executeTakeFirstOrThrow()
      ).state,
    ).toBe("cancelled");
  } finally {
    await fixture.database.destroy();
  }
});
