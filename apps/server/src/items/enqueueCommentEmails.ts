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
  const [candidates, settings, members] = await Promise.all([
    _readCandidates({
      transaction: options.transaction,
      item: options.item,
      authorMemberId: options.viewer.memberId,
    }),
    readInstanceSettings({
      database: options.transaction,
      keys: ["public.base_url"],
    }),
    options.transaction
      .selectFrom("members")
      .select([
        "members.id as memberId",
        "members.email as email",
        "members.display_name as storedDisplayName",
      ])
      .where("members.id", "in", [
        options.viewer.memberId,
        options.item.uploadedBy,
      ])
      .execute(),
  ]);

  const nameFor = (memberId: string): string => {
    const row = members.find((member) => {
      return member.memberId === memberId;
    });
    return row === undefined
      ? ""
      : getDisplayNameFromMember({
          storedDisplayName: row.storedDisplayName ?? undefined,
          email: row.email,
        });
  };

  const recipients = candidates
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

  const itemUrl = `${settings["public.base_url"] ?? ""}/item/${options.item.itemId}`;

  await Promise.all(
    recipients.map(async (recipient) => {
      if (
        !(await _canSeeItem({
          transaction: options.transaction,
          candidate: recipient.candidate,
          item: options.item,
        }))
      ) {
        return;
      }

      await enqueueEmail({
        executor: options.transaction,
        now: options.now,
        input: {
          kind: "comment",
          toAddress: recipient.email,
          toMemberId: recipient.memberId,
          toDisplayName: recipient.displayName,
          // Verbatim from the recipe table, and the only thing standing
          // between a retried handler and two hundred duplicates.
          idempotencyKey: `comment:${options.commentId}:${recipient.memberId}`,
          triggerKind: "comment",
          triggerId: options.commentId,
          payload: {
            authorDisplayName: nameFor(options.viewer.memberId),
            body: options.body,
            atSeconds: options.atSeconds,
            itemCapturedOn: options.item.capturedOn,
            itemUrl,
            relation: recipient.relation,
            uploaderDisplayName: nameFor(options.item.uploadedBy),
          },
        },
      });
    }),
  );
}
