import type { CommentTag } from "@memory-shoebox/shared";
import { readEligibleCommentTagMembers } from "../commentTags/readCommentTagCandidates.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { enqueueEmail } from "../mail/enqueueEmail/enqueueEmail.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { enqueueCommentEmails } from "./enqueueCommentEmails.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

type Options = Readonly<{
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  commentId: string;
  body: string;
  atSeconds: number | null;
  previousTags: readonly CommentTag[];
  tags: readonly CommentTag[];
  isCreate: boolean;
  now: string;
}>;

async function _cancelRemovedRecipients(options: Options): Promise<void> {
  const memberIds = [
    ...new Set(
      options.tags.map((tag) => {
        return tag.memberId;
      }),
    ),
  ];
  let query = options.transaction
    .updateTable("outbound_emails")
    .set({ state: "cancelled" })
    .where("kind", "=", "comment_tag")
    .where("trigger_kind", "=", "comment")
    .where("trigger_id", "=", options.commentId)
    .where("state", "=", "queued");
  if (memberIds.length > 0) {
    query = query.where("to_member_id", "not in", memberIds);
  }
  await query.execute();
}

async function _getRecipientsFromTags(options: Options) {
  const previousIds = new Set(
    options.previousTags.map((tag) => {
      return tag.memberId;
    }),
  );
  const memberIds = [
    ...new Set(
      options.tags.map((tag) => {
        return tag.memberId;
      }),
    ),
  ].filter((memberId) => {
    return (
      memberId !== options.viewer.memberId &&
      (options.isCreate || !previousIds.has(memberId))
    );
  });
  const eligible = await readEligibleCommentTagMembers({
    database: options.transaction,
    itemId: options.item.itemId,
    memberIds,
  });
  if (eligible.length === 0) {
    return [];
  }
  return options.transaction
    .selectFrom("members")
    .select(["id", "email", "display_name"])
    .where(
      "id",
      "in",
      eligible.map((member) => {
        return member.memberId;
      }),
    )
    .where("notify_on_comment_tag", "=", 1)
    .execute();
}

async function _makePayloadFromComment(options: Options) {
  const settings = await readInstanceSettings({
    database: options.transaction,
    keys: ["public.base_url"],
  });
  const author = await options.transaction
    .selectFrom("members")
    .select("display_name")
    .where("id", "=", options.viewer.memberId)
    .executeTakeFirstOrThrow();
  return {
    authorDisplayName: author.display_name ?? "",
    body: options.body,
    atSeconds: options.atSeconds,
    itemKind: options.item.kind,
    itemCapturedOn: options.item.capturedOn,
    itemUrl: `${(settings["public.base_url"] ?? "").replace(/\/$/, "")}/items/${options.item.itemId}?comment=${options.commentId}`,
  };
}

async function _scheduleRecipient(
  options: Options,
  member: Readonly<{ id: string; email: string; display_name: string | null }>,
): Promise<void> {
  const inserted = await options.transaction
    .insertInto("comment_tag_notifications")
    .values({
      comment_id: options.commentId,
      member_id: member.id,
      scheduled_at: options.now,
    })
    .onConflict((conflict) => {
      return conflict.columns(["comment_id", "member_id"]).doNothing();
    })
    .executeTakeFirst();
  if (Number(inserted.numInsertedOrUpdatedRows) === 0) {
    return;
  }
  await enqueueEmail({
    executor: options.transaction,
    now: options.now,
    input: {
      kind: "comment_tag",
      toAddress: member.email,
      toMemberId: member.id,
      toDisplayName: member.display_name ?? undefined,
      idempotencyKey: `comment-tag:${options.commentId}:${member.id}`,
      triggerKind: "comment",
      triggerId: options.commentId,
      payload: await _makePayloadFromComment(options),
    },
  });
}

/** Reconciles lifetime tag scheduling, cancellation and create-time generic arbitration. */
export async function reconcileCommentTagEmails(
  options: Options,
): Promise<void> {
  await _cancelRemovedRecipients(options);
  const recipients = await _getRecipientsFromTags(options);
  await Promise.all(
    recipients.map((member) => {
      return _scheduleRecipient(options, member);
    }),
  );
  if (options.isCreate) {
    await enqueueCommentEmails({
      ...options,
      excludedMemberIds: recipients.map((member) => {
        return member.id;
      }),
    });
  }
}
