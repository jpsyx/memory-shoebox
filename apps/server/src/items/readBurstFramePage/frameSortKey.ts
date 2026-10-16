import { expressionBuilder } from "kysely";
import type { Expression, ExpressionBuilder, SqlBool } from "kysely";
import type { Database } from "../../db/types/db.types.ts";

/** One frame, by the two columns the strip's order is taken from. */
export type FrameSortKey = {
  itemId: string;
  /** `items.burst_index`, which is nullable and sorts last. */
  burstIndex: number | null;
};

/**
 * Whether a sibling sorts strictly before one named frame, in the strip's own
 * `(burst_index ASC NULLS LAST, id ASC)` order.
 *
 * Spelled out rather than compared as a tuple: SQLite's row values carry no
 * null-placement rule, and a null `burst_index` sorts **last** here rather
 * than first. Built from a standalone expression builder so it composes into a
 * query whose `items` arrive alongside a joined table.
 *
 * @param frame The frame every sibling is compared against.
 */
export function sortsBeforeFrame(
  frame: Readonly<FrameSortKey>,
): Expression<SqlBool> {
  const eb: ExpressionBuilder<Database, "items"> = expressionBuilder<
    Database,
    "items"
  >();

  if (frame.burstIndex === null) {
    // The frame itself sorts last, so every indexed sibling precedes it and
    // the other null-indexed ones break the tie on id.
    return eb.or([
      eb("items.burst_index", "is not", null),
      eb.and([
        eb("items.burst_index", "is", null),
        eb("items.id", "<", frame.itemId),
      ]),
    ]);
  }

  return eb.and([
    eb("items.burst_index", "is not", null),
    eb.or([
      eb("items.burst_index", "<", frame.burstIndex),
      eb.and([
        eb("items.burst_index", "=", frame.burstIndex),
        eb("items.id", "<", frame.itemId),
      ]),
    ]),
  ]);
}

/**
 * Whether a sibling sorts strictly after one named frame, in that same order.
 *
 * The resume half of the pair above, and the reason a burst's cursor encodes
 * `(burst_index, id)` rather than a bare id: `burst_index` is the order the
 * strip is read in and does not have to agree with arrival order, so `id >`
 * alone would drop frames and repeat others.
 *
 * @param frame The last frame of the previous page.
 */
export function sortsAfterFrame(
  frame: Readonly<FrameSortKey>,
): Expression<SqlBool> {
  const eb: ExpressionBuilder<Database, "items"> = expressionBuilder<
    Database,
    "items"
  >();

  if (frame.burstIndex === null) {
    // Nothing indexed can follow a null-indexed frame, so only the other
    // null-indexed siblings remain and they break the tie on id.
    return eb.and([
      eb("items.burst_index", "is", null),
      eb("items.id", ">", frame.itemId),
    ]);
  }

  return eb.or([
    // A null sorts last, so every null-indexed sibling is still to come.
    eb("items.burst_index", "is", null),
    eb("items.burst_index", ">", frame.burstIndex),
    eb.and([
      eb("items.burst_index", "=", frame.burstIndex),
      eb("items.id", ">", frame.itemId),
    ]),
  ]);
}
