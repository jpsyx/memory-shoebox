import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { enqueueEmail } from "../mail/enqueueEmail.ts";
import { getDisplayNameFromMember } from "../members/getDisplayNameFromMember.ts";
import { readInstanceSettings } from "../settings/readInstanceSettings.ts";
import { getVisibleRuleIdsFromMemberId } from "../visibility/getVisibleRuleIdsFromMemberId.ts";
import type { VisibleItem } from "./getVisibleItemOr404.ts";

/** One candidate row, before the two filters. */
type CandidateRow = {
  memberId: string;
  email: string;
  storedDisplayName: string | null;
  role: string;
  status: string;
  notifyOnComment: number;
  notifyOnReply: number;
};

/**
 * One member who may hear about this comment, and why they would.
 *
 * Carries its own `candidate` rather than making a caller look one back up
 * by id: the row is already in hand from `_readCandidates`, and carrying it
 * removes both a cast and a second pass over that array.
 */
type CommentRecipient = {
  memberId: string;
  email: string;
  displayName: string;
  /** Their strongest relationship to the item, uploader first. */
  relation: "uploader" | "commenter";
  wantsIt: boolean;
  candidate: CandidateRow;
};

/**
 * The uploader, plus everybody who has already written on this item.
 *
 * One query, never a loop over members: two `IN` sets against `members`,
 * which is tens of rows. The author is excluded here rather than filtered
 * later, so the de-duplication below cannot reintroduce them.
 */
async function _readCandidates(options: {
  transaction: DatabaseExecutor;
  item: VisibleItem;
  authorMemberId: string;
}): Promise<CandidateRow[]> {
  return options.transaction
    .selectFrom("members")
    .select([
      "members.id as memberId",
      "members.email as email",
      "members.display_name as storedDisplayName",
      "members.role as role",
      "members.status as status",
      "members.notify_on_comment as notifyOnComment",
      "members.notify_on_reply as notifyOnReply",
    ])
    .where("members.id", "!=", options.authorMemberId)
    .where((eb) => {
      return eb.or([
        eb("members.id", "=", options.item.uploadedBy),
        eb(
          "members.id",
          "in",
          eb
            .selectFrom("comments")
            .select("comments.author_member_id")
            .where("comments.item_id", "=", options.item.itemId),
        ),
      ]);
    })
    .execute();
}

/**
 * Whether this member can still see the item, under the standard predicate.
 *
 * Somebody who has lost access is not told there is new conversation on a
 * photograph they can no longer open. The predicate is the same one every
 * read uses, evaluated per recipient: their own uploads, an admin's
 * everything, and the rules they see through. **A people tag is never
 * consulted here either** (Decision 7).
 */
async function _canSeeItem(options: {
  transaction: DatabaseExecutor;
  candidate: CandidateRow;
  item: VisibleItem;
}): Promise<boolean> {
  if (
    options.candidate.role === "admin" ||
    options.item.uploadedBy === options.candidate.memberId
  ) {
    return true;
  }

  const ruleIds = await getVisibleRuleIdsFromMemberId({
    database: options.transaction,
    memberId: options.candidate.memberId,
  });
  return ruleIds.includes(options.item.visibilityRuleId);
}

/**
 * The display names the message quotes, by member id.
 *
 * Two ids, read once and looked up twice, rather than a closure that scans an
 * array per recipient: the author and the uploader are the same two people for
 * every copy of the message.
 *
 * @param options.transaction The comment's own transaction.
 * @param options.memberIds The author and the uploader, in either order.
 */
async function _readDisplayNamesByMemberId(options: {
  transaction: DatabaseExecutor;
  memberIds: readonly string[];
}): Promise<Map<string, string>> {
  const rows = await options.transaction
    .selectFrom("members")
    .select([
      "members.id as memberId",
      "members.email as email",
      "members.display_name as storedDisplayName",
    ])
    .where("members.id", "in", [...options.memberIds])
    .execute();

  return new Map(
    rows.map((row) => {
      return [
        row.memberId,
        getDisplayNameFromMember({
          storedDisplayName: row.storedDisplayName ?? undefined,
          email: row.email,
        }),
      ];
    }),
  );
}

/** A candidate as a recipient: their relation, and whether they want it. */
function _makeRecipientFromCandidate(options: {
  candidate: CandidateRow;
  item: VisibleItem;
}): CommentRecipient {
  const relation =
    options.candidate.memberId === options.item.uploadedBy
      ? "uploader"
      : "commenter";

  return {
    memberId: options.candidate.memberId,
    email: options.candidate.email,
    displayName: getDisplayNameFromMember({
      storedDisplayName: options.candidate.storedDisplayName ?? undefined,
      email: options.candidate.email,
    }),
    relation,
    // Chosen by their strongest relationship to the item: the uploader's
    // copy is governed by `notify_on_comment`, a prior commenter's by
    // `notify_on_reply`. There is no threading; a "reply" is another
    // top-level comment on the same item.
    wantsIt:
      relation === "uploader"
        ? options.candidate.notifyOnComment === 1
        : options.candidate.notifyOnReply === 1,
    candidate: options.candidate,
  };
}

/** The candidates who are still here and still want to hear about it. */
function _makeRecipientsFromCandidates(options: {
  candidates: readonly CandidateRow[];
  item: VisibleItem;
}): CommentRecipient[] {
  return options.candidates
    .filter((candidate) => {
      // A removed member keeps their comments and stops getting mail.
      return candidate.status === "active";
    })
    .map((candidate) => {
      return _makeRecipientFromCandidate({ candidate, item: options.item });
    })
    .filter((recipient) => {
      return recipient.wantsIt;
    });
}

/** Everything about the comment that every copy of the message shares. */
type CommentEmailContext = {
  item: VisibleItem;
  commentId: string;
  body: string;
  atSeconds: number | null;
  authorDisplayName: string;
  uploaderDisplayName: string;
  itemUrl: string;
  now: string;
};

/**
 * One recipient's copy, queued unless they have lost sight of the item.
 *
 * The visibility check is per recipient and belongs here rather than in the
 * filter above, because it is the one gate that costs a query.
 *
 * @param options.transaction The comment's own transaction.
 * @param options.recipient Who the copy is for.
 * @param options.context What every copy of the message says.
 */
async function _enqueueCommentEmailForRecipient(options: {
  transaction: DatabaseExecutor;
  recipient: Readonly<CommentRecipient>;
  context: Readonly<CommentEmailContext>;
}): Promise<void> {
  const { recipient, context } = options;

  const canSee = await _canSeeItem({
    transaction: options.transaction,
    candidate: recipient.candidate,
    item: context.item,
  });
  if (!canSee) {
    return;
  }

  await enqueueEmail({
    executor: options.transaction,
    now: context.now,
    input: {
      kind: "comment",
      toAddress: recipient.email,
      toMemberId: recipient.memberId,
      toDisplayName: recipient.displayName,
      // Verbatim from the recipe table, and the only thing standing
      // between a retried handler and two hundred duplicates.
      idempotencyKey: `comment:${context.commentId}:${recipient.memberId}`,
      triggerKind: "comment",
      triggerId: context.commentId,
      payload: {
        authorDisplayName: context.authorDisplayName,
        body: context.body,
        atSeconds: context.atSeconds,
        itemCapturedOn: context.item.capturedOn,
        itemUrl: context.itemUrl,
        relation: recipient.relation,
        uploaderDisplayName: context.uploaderDisplayName,
      },
    },
  });
}

/**
 * Queues the `comment` message for everybody who should hear about it.
 *
 * **In the same transaction as the comment insert**, so a message is never
 * queued for a comment that did not land, and the comment never lands
 * without its message.
 *
 * It does not throw on a mail problem: `enqueueEmail` writes a `failed` row
 * when `public.base_url` is unset rather than failing the transaction the
 * comment is in.
 *
 * @param options.transaction The comment's own transaction.
 * @param options.viewer The comment's author.
 * @param options.item The item, already resolved under the predicate.
 * @param options.commentId The comment just written.
 * @param options.body The comment exactly as it was sent.
 * @param options.atSeconds Where it is pinned, or null.
 * @param options.now The instant the comment was written.
 */
export async function enqueueCommentEmails(options: {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  commentId: string;
  body: string;
  atSeconds: number | null;
  now: string;
}): Promise<void> {
  const [candidates, settings, displayNames] = await Promise.all([
    _readCandidates({
      transaction: options.transaction,
      item: options.item,
      authorMemberId: options.viewer.memberId,
    }),
    readInstanceSettings({
      database: options.transaction,
      keys: ["public.base_url"],
    }),
    _readDisplayNamesByMemberId({
      transaction: options.transaction,
      memberIds: [options.viewer.memberId, options.item.uploadedBy],
    }),
  ]);

  const context: CommentEmailContext = {
    item: options.item,
    commentId: options.commentId,
    body: options.body,
    atSeconds: options.atSeconds,
    authorDisplayName: displayNames.get(options.viewer.memberId) ?? "",
    uploaderDisplayName: displayNames.get(options.item.uploadedBy) ?? "",
    itemUrl: `${settings["public.base_url"] ?? ""}/item/${options.item.itemId}`,
    now: options.now,
  };

  await Promise.all(
    _makeRecipientsFromCandidates({
      candidates,
      item: options.item,
    }).map((recipient) => {
      return _enqueueCommentEmailForRecipient({
        transaction: options.transaction,
        recipient,
        context,
      });
    }),
  );
}
