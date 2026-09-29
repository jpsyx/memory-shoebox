import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  makeSelectionExpressionFromFilter,
  type TimelineFilter,
} from "./selectionFilter.ts";

/**
 * What the whole selection is worth, in items.
 *
 * The filter strip's figure, and the facets route's `resultCount`. It counts
 * **items**, burst frames included, because the strip counts photographs and a
 * burst is a rendering collapse rather than fewer pictures.
 *
 * The same predicate as the rows, without the limit, which is the whole reason
 * the strip and the page cannot disagree.
 *
 * @see {@link readMilestoneItemCounts}, the other count that looks like this
 *   one: it takes the visibility predicate alone, not the whole selection.
 *
 * @param options.database The Kysely handle.
 * @param options.viewer The request's viewer.
 * @param options.filter The normalised selection.
 */
export async function countSelectedItems(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  filter: Readonly<TimelineFilter>;
}): Promise<number> {
  const row = await options.database
    .selectFrom("items")
    .select((eb) => {
      return eb.fn.countAll<number>().as("itemCount");
    })
    .where(
      makeSelectionExpressionFromFilter({
        viewer: options.viewer,
        filter: options.filter,
      }),
    )
    .executeTakeFirst();
  return Number(row?.itemCount ?? 0);
}
