import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { readPeopleRefsByItemId } from "./readPeopleRefsByItemId.ts";

/**
 * Query 7 of a timeline page: who is in the items it draws.
 *
 * One batched query keyed by the drawn ids, which is what keeps alt text off
 * the per-item path. `timeline.md` § Performance lists six to eight queries
 * and none of them is this one; `items.md` requires composed alt text wherever
 * a `MediaRef` is minted. The query count gives, because a screen reader in
 * the pile deserves the names, and this is still constant in the size of the
 * page.
 *
 * **No visibility predicate belongs on this join.** A people tag inherits its
 * item's rule exactly, so on an item the viewer may see there is no partially
 * visible people set. What keeps that true is that a `MediaRef` is only ever
 * minted for an item the viewer may see, not a filter here, and filtering here
 * would put `item_people` in a visibility expression, which Decision 7
 * forbids outright.
 *
 * Ordered `tagged_at ASC, display_name ASC`, which is the order the alt text
 * and the item viewer's people list both read in.
 *
 * @param options.database The Kysely handle.
 * @param options.itemIds The ids actually drawn.
 */
export async function readPeopleNamesByItemId(options: {
  database: DatabaseExecutor;
  itemIds: readonly string[];
}): Promise<Map<string, string[]>> {
  const peopleByItemId = await readPeopleRefsByItemId(options);

  return new Map(
    [...peopleByItemId.entries()].map(([itemId, people]) => {
      return [
        itemId,
        people.map((person) => {
          return person.displayName;
        }),
      ];
    }),
  );
}
