import {
  REACTION_ORDER,
  type MemberRef,
  type ReactionKind,
  type ReactionSummary,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/** One reaction row, whichever of the two tables it came from. */
export type ReactionRow = {
  /** The item id or the comment id, depending on the table. */
  targetId: string;
  memberId: string;
  kind: string;
  createdAt: string;
};

/**
 * A fresh `ReactionSummary` for a thing nobody has reacted to.
 *
 * A factory rather than a shared constant. Four separate call sites need an
 * empty summary, and a single frozen instance handed to all of them would
 * need an `as unknown as` cast to satisfy the mutable `kinds` array, purely
 * to stop one caller's mutation from poisoning every sibling that shares the
 * reference. A fresh object each call has nothing shared to poison, so it
 * needs no freeze and no cast, and the allocation is irrelevant at this
 * scale.
 */
export function makeEmptyReactionSummary(): ReactionSummary {
  return { kinds: [], myKind: null };
}

/**
 * The column is `CHECK IN (the six)`, so this cannot see a seventh from the
 * product. It throws rather than falling back, because a value this function
 * cannot place is a bug worth failing loudly for, not a reaction worth
 * showing under the wrong name.
 */
function _getReactionKindFromStoredValue(value: string): ReactionKind {
  const found = REACTION_ORDER.find((kind) => {
    return kind === value;
  });
  if (found === undefined) {
    throw new Error(`Stored reaction kind is outside the six: "${value}"`);
  }
  return found;
}

/** Where a kind sits in the canonical order, which is the tiebreak. */
function _canonicalPosition(kind: ReactionKind): number {
  return REACTION_ORDER.indexOf(kind);
}

/** One target's rows, grouped by kind and ordered the way the row prints. */
function _makeSummaryFromRows(options: {
  rows: readonly ReactionRow[];
  members: ReadonlyMap<string, MemberRef>;
  viewerMemberId: string;
}): ReactionSummary {
  const byKind = options.rows.reduce<Map<ReactionKind, ReactionRow[]>>(
    (grouped, row) => {
      const kind = _getReactionKindFromStoredValue(row.kind);
      const existing = grouped.get(kind) ?? [];
      existing.push(row);
      grouped.set(kind, existing);
      return grouped;
    },
    new Map(),
  );

  const kinds = [...byKind.entries()]
    .map(([kind, rows]) => {
      return {
        kind,
        count: rows.length,
        members: [...rows]
          // `created_at` is never touched on a change, so the moment somebody
          // first said something stands and this order is stable when
          // somebody changes their mind.
          .sort((left, right) => {
            return left.createdAt.localeCompare(right.createdAt);
          })
          .map((row) => {
            return (
              options.members.get(row.memberId) ?? {
                memberId: row.memberId,
                displayName: "",
              }
            );
          }),
      };
    })
    .sort((left, right) => {
      return (
        right.count - left.count ||
        _canonicalPosition(left.kind) - _canonicalPosition(right.kind)
      );
    });

  const mine = options.rows.find((row) => {
    return row.memberId === options.viewerMemberId;
  });

  return {
    kinds,
    myKind:
      mine === undefined ? null : _getReactionKindFromStoredValue(mine.kind),
  };
}

/**
 * Rows to summaries, one summary per target.
 *
 * **Rows rather than aggregates**, because the popover needs the names anyway
 * and at family scale the list is smaller than the aggregate that would
 * summarise it (`data-models.md` § Reactions: two tables, not one).
 *
 * Kinds are ordered `(count DESC, canonical position ASC)`. The client sorts
 * by count with no tiebreak, so without the second key four loves and four
 * cares would swap places between page loads.
 *
 * @param options.rows Every reaction row for every target.
 * @param options.members The per-request member map.
 * @param options.viewerMemberId Whose `myKind` this is.
 */
export function makeReactionSummariesFromRows(options: {
  rows: readonly ReactionRow[];
  members: ReadonlyMap<string, MemberRef>;
  viewerMemberId: string;
}): Map<string, ReactionSummary> {
  const byTarget = options.rows.reduce<Map<string, ReactionRow[]>>(
    (grouped, row) => {
      const existing = grouped.get(row.targetId) ?? [];
      existing.push(row);
      grouped.set(row.targetId, existing);
      return grouped;
    },
    new Map(),
  );

  return new Map(
    [...byTarget.entries()].map(([targetId, rows]) => {
      return [
        targetId,
        _makeSummaryFromRows({
          rows,
          members: options.members,
          viewerMemberId: options.viewerMemberId,
        }),
      ];
    }),
  );
}

/**
 * Every reaction on one item.
 *
 * @param options.database The Kysely handle.
 * @param options.itemId The item.
 */
export async function readItemReactionRows(options: {
  database: DatabaseExecutor;
  itemId: string;
}): Promise<ReactionRow[]> {
  return options.database
    .selectFrom("item_reactions")
    .select([
      "item_reactions.item_id as targetId",
      "item_reactions.member_id as memberId",
      "item_reactions.kind as kind",
      "item_reactions.created_at as createdAt",
    ])
    .where("item_reactions.item_id", "=", options.itemId)
    .execute();
}

/**
 * Every reaction on a batch of comments, in **one** query.
 *
 * This is the N+1 the data model calls out by name: one query per comment is
 * "the easiest mistake in the item viewer", and sixteen comments must be one
 * probe on `comment_id IN (...)`.
 *
 * @param options.database The Kysely handle.
 * @param options.commentIds Every comment in the thread.
 */
export async function readCommentReactionRows(options: {
  database: DatabaseExecutor;
  commentIds: readonly string[];
}): Promise<ReactionRow[]> {
  if (options.commentIds.length === 0) {
    return [];
  }

  return options.database
    .selectFrom("comment_reactions")
    .select([
      "comment_reactions.comment_id as targetId",
      "comment_reactions.member_id as memberId",
      "comment_reactions.kind as kind",
      "comment_reactions.created_at as createdAt",
    ])
    .where("comment_reactions.comment_id", "in", [...options.commentIds])
    .execute();
}
