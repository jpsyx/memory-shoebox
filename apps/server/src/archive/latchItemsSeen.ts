import { expressionBuilder, sql } from "kysely";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

/**
 * The one statement that records a view: `INSERT ... ON CONFLICT DO
 * NOTHING`, with the visibility predicate **inside the `SELECT` that feeds
 * it**.
 *
 * That placement is the whole design, and it is a security property rather
 * than a style: the filtering happens inside the statement rather than in a
 * pre-check, so there is no branch anybody can later add a log line to and no
 * shape in which this route can report on the ids it was given.
 *
 * `first_seen_at` is set once and never updated, and there is no
 * `last_seen_at` by design: maintaining one would reintroduce a write on every
 * impression, which is the entire cost the collapse avoids. `first_opened_at`,
 * `last_opened_at` and `open_count` belong to the item viewer and are not
 * touched here.
 *
 * Scrolling a 212-item day therefore writes 212 rows the first time and
 * nothing ever again.
 */
async function _insertItemViews(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemIds: readonly string[];
  burstIds: readonly string[];
  now: string;
}): Promise<void> {
  await options.database
    .insertInto("item_views")
    .columns(["id", "member_id", "item_id", "first_seen_at"])
    .expression((eb) => {
      return eb
        .selectFrom("items")
        .select([
          // `create_id()` is `createId()` itself, registered on the
          // connection, so one statement mints a uuid per row rather than the
          // application minting hundreds and sending them.
          sql<string>`create_id()`.as("id"),
          eb.val(options.viewer.memberId).as("member_id"),
          "items.id as item_id",
          eb.val(options.now).as("first_seen_at"),
        ])
        .where((inner) => {
          return inner.or([
            ...(options.itemIds.length === 0
              ? []
              : [inner("items.id", "in", [...options.itemIds])]),
            ...(options.burstIds.length === 0
              ? []
              : [inner("items.burst_id", "in", [...options.burstIds])]),
          ]);
        })
        .where(
          visibilityExpression({
            eb: expressionBuilder<Database, "items">(),
            viewer: options.viewer,
          }),
        );
    })
    .onConflict((onConflict) => {
      return onConflict.columns(["member_id", "item_id"]).doNothing();
    })
    .execute();
}

/**
 * Marks what the viewer has had on screen, once and only once.
 *
 * The guard below is what keeps this cheap. Everything else about the write
 * is documented on {@link _insertItemViews}, which holds the actual
 * statement.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.itemIds Items the viewer has had on screen.
 * @param options.burstIds Stacks, expanded to their visible frames here.
 * @param options.now The instant written as `first_seen_at`.
 */
export async function latchItemsSeen(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemIds: readonly string[];
  burstIds: readonly string[];
  now: string;
}): Promise<void> {
  // Skip before the statement runs, not just before the write: SQLite has a
  // single writer, uploads queue behind it too, and a no-op INSERT would
  // still take that lock for nothing.
  if (options.itemIds.length === 0 && options.burstIds.length === 0) {
    return;
  }

  await _insertItemViews(options);
}
