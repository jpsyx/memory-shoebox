import type { PersonRef } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";

/**
 * Who is in a batch of items, in the order alt text and the people list both
 * read in: `tagged_at ASC, display_name ASC`.
 *
 * One batched query keyed by the ids actually drawn, which is what keeps alt
 * text off the per-item path: every `BurstFrameRef` carries an `altText` and
 * every alt text composes from that frame's people, so composing them one
 * frame at a time is sixty queries hiding inside a `.map`.
 *
 * **No visibility predicate belongs on this join.** A people tag inherits its
 * item's rule exactly, so on an item the viewer may see there is no partially
 * visible people set. What keeps that true is that these ids only ever come
 * from rows that passed the predicate, not a filter here, and filtering here
 * would put `item_people` in a visibility expression, which Decision 7
 * forbids outright.
 *
 * @param options.database The Kysely handle.
 * @param options.itemIds The ids actually drawn.
 */
export async function readPeopleRefsByItemId(options: {
  database: DatabaseExecutor;
  itemIds: readonly string[];
}): Promise<Map<string, PersonRef[]>> {
  if (options.itemIds.length === 0) {
    return new Map();
  }

  const rows = await options.database
    .selectFrom("item_people")
    .innerJoin("people", "people.id", "item_people.person_id")
    .select([
      "item_people.item_id as itemId",
      "people.id as personId",
      "people.display_name as displayName",
    ])
    .where("item_people.item_id", "in", [...options.itemIds])
    .orderBy("item_people.tagged_at", "asc")
    .orderBy("people.display_name", "asc")
    .execute();

  return rows.reduce<Map<string, PersonRef[]>>((peopleByItemId, row) => {
    const people = peopleByItemId.get(row.itemId) ?? [];
    // `PersonRef` never carries `memberId`, here or anywhere: holding an
    // account is a permission fact and this is a family.
    people.push({ personId: row.personId, displayName: row.displayName });
    peopleByItemId.set(row.itemId, people);
    return peopleByItemId;
  }, new Map());
}
