import type { PersonInput } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";

/**
 * Replaces one item's people set, by diff.
 *
 * A `{ displayName }` entry creates a `people` row with `created_by` set. It
 * **never** sets `member_id`: the link between a person and an account is
 * made elsewhere, and a person record may never get one.
 *
 * Removing somebody deletes the join row only. `item_people.person_id` is
 * `RESTRICT` against deleting the **person**, which is a different act and is
 * not this route: deleting a person would silently strip them from hundreds
 * of photographs with no undo, and the removal-request flow depends on
 * knowing who is in a picture.
 *
 * **A people tag is not a key.** Adding somebody grants them nothing they
 * could not already see, and `item_people` must not appear in any visibility
 * expression (Decision 7).
 *
 * @param options.transaction The caller's transaction.
 * @param options.itemId The item.
 * @param options.memberId Who is tagging.
 * @param options.people Existing people by id, new ones by name.
 * @param options.now The instant new rows carry.
 */
export async function setItemPeople(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  people: readonly PersonInput[];
  now: string;
}): Promise<void> {
  const requestedIds = options.people.flatMap((person) => {
    return "personId" in person ? [person.personId] : [];
  });

  const known =
    requestedIds.length === 0
      ? []
      : await options.transaction
          .selectFrom("people")
          .select("people.id as personId")
          .where("people.id", "in", requestedIds)
          .execute();

  if (known.length !== new Set(requestedIds).size) {
    throw ApiError.invalidRequest({
      people: ["One of those people is not in the archive."],
    });
  }

  const created = options.people.flatMap((person) => {
    return "displayName" in person
      ? [
          {
            id: createId(),
            display_name: person.displayName,
            member_id: null,
            preferred_face_item_id: null,
            created_by: options.memberId,
            created_at: options.now,
          },
        ]
      : [];
  });

  if (created.length > 0) {
    await options.transaction.insertInto("people").values(created).execute();
  }

  const wanted = new Set([
    ...requestedIds,
    ...created.map((row) => {
      return row.id;
    }),
  ]);

  const attached = await options.transaction
    .selectFrom("item_people")
    .select("item_people.person_id as personId")
    .where("item_people.item_id", "=", options.itemId)
    .execute();
  const attachedIds = new Set(
    attached.map((row) => {
      return row.personId;
    }),
  );

  const removed = [...attachedIds].filter((personId) => {
    return !wanted.has(personId);
  });
  if (removed.length > 0) {
    // The join row only. `item_people.person_id` is RESTRICT against
    // deleting the person, which is a different act and is not this route.
    await options.transaction
      .deleteFrom("item_people")
      .where("item_id", "=", options.itemId)
      .where("person_id", "in", removed)
      .execute();
  }

  const added = [...wanted].filter((personId) => {
    return !attachedIds.has(personId);
  });
  if (added.length > 0) {
    await options.transaction
      .insertInto("item_people")
      .values(
        added.map((personId) => {
          return {
            id: createId(),
            item_id: options.itemId,
            person_id: personId,
            tagged_by: options.memberId,
            // One shared instant, because that is when they were tagged.
            // Spacing these apart to force the request's order into the read
            // would be inventing provenance: the documented read order is
            // `tagged_at ASC, display_name ASC`, so people added together tie
            // and sort by name, and only a genuinely later tag sorts later.
            tagged_at: options.now,
          };
        }),
      )
      .execute();
  }
}
