import type { PersonInput } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";

/**
 * Checks every requested existing person is actually in the archive.
 *
 * Throws rather than silently dropping an unknown id, so a stale client
 * cannot untag somebody it merely failed to resolve.
 */
async function _assertRequestedPeopleExist(options: {
  transaction: DatabaseExecutor;
  requestedIds: readonly string[];
}): Promise<void> {
  const known =
    options.requestedIds.length === 0
      ? []
      : await options.transaction
          .selectFrom("people")
          .select("people.id as personId")
          .where("people.id", "in", options.requestedIds)
          .execute();

  if (known.length !== new Set(options.requestedIds).size) {
    throw ApiError.invalidRequest({
      people: ["One of those people is not in the archive."],
    });
  }
}

/**
 * Creates a `people` row for every `{ displayName }` entry, and returns
 * their new ids.
 *
 * `member_id` is never set here: the link between a person and an account is
 * made elsewhere, and a person record may never get one.
 */
async function _createNewPeople(options: {
  transaction: DatabaseExecutor;
  people: readonly PersonInput[];
  memberId: string;
  now: string;
}): Promise<string[]> {
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

  return created.map((row) => {
    return row.id;
  });
}

/**
 * The person ids the item should end up with: every existing id requested,
 * checked against the archive, plus a fresh id for every new name.
 */
async function _getWantedPersonIds(options: {
  transaction: DatabaseExecutor;
  people: readonly PersonInput[];
  memberId: string;
  now: string;
}): Promise<Set<string>> {
  const requestedIds = options.people.flatMap((person) => {
    return "personId" in person ? [person.personId] : [];
  });

  await _assertRequestedPeopleExist({
    transaction: options.transaction,
    requestedIds,
  });

  const createdIds = await _createNewPeople({
    transaction: options.transaction,
    people: options.people,
    memberId: options.memberId,
    now: options.now,
  });

  return new Set([...requestedIds, ...createdIds]);
}

/** The person ids currently attached to the item. */
async function _getAttachedPersonIds(options: {
  transaction: DatabaseExecutor;
  itemId: string;
}): Promise<Set<string>> {
  const attached = await options.transaction
    .selectFrom("item_people")
    .select("item_people.person_id as personId")
    .where("item_people.item_id", "=", options.itemId)
    .execute();

  return new Set(
    attached.map((row) => {
      return row.personId;
    }),
  );
}

/**
 * Attaches the newly wanted people, one shared instant for all of them.
 *
 * Spacing these apart to force the request's order into the read would be
 * inventing provenance: the documented read order is
 * `tagged_at ASC, display_name ASC`, so people added together tie and sort
 * by name, and only a genuinely later tag sorts later.
 */
async function _attachNewPeople(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  now: string;
  personIds: readonly string[];
}): Promise<void> {
  if (options.personIds.length === 0) {
    return;
  }

  await options.transaction
    .insertInto("item_people")
    .values(
      options.personIds.map((personId) => {
        return {
          id: createId(),
          item_id: options.itemId,
          person_id: personId,
          tagged_by: options.memberId,
          tagged_at: options.now,
        };
      }),
    )
    .execute();
}

/**
 * Attaches and detaches join rows so the item ends up with exactly the
 * wanted set.
 *
 * Removing somebody deletes the join row only. `item_people.person_id` is
 * `RESTRICT` against deleting the **person**, which is a different act and is
 * not this route.
 */
async function _writePeopleDiff(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  now: string;
  wantedPersonIds: ReadonlySet<string>;
}): Promise<void> {
  const attachedIds = await _getAttachedPersonIds({
    transaction: options.transaction,
    itemId: options.itemId,
  });

  const removed = [...attachedIds].filter((personId) => {
    return !options.wantedPersonIds.has(personId);
  });
  if (removed.length > 0) {
    await options.transaction
      .deleteFrom("item_people")
      .where("item_id", "=", options.itemId)
      .where("person_id", "in", removed)
      .execute();
  }

  await _attachNewPeople({
    transaction: options.transaction,
    itemId: options.itemId,
    memberId: options.memberId,
    now: options.now,
    personIds: [...options.wantedPersonIds].filter((personId) => {
      return !attachedIds.has(personId);
    }),
  });
}

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
  const wantedPersonIds = await _getWantedPersonIds({
    transaction: options.transaction,
    people: options.people,
    memberId: options.memberId,
    now: options.now,
  });

  await _writePeopleDiff({
    transaction: options.transaction,
    itemId: options.itemId,
    memberId: options.memberId,
    now: options.now,
    wantedPersonIds,
  });
}
