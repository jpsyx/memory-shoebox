import { LIMITS, type PersonInput } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import { getTagIdsFromNames } from "../setItemTags/getTagIdsFromNames.ts";
import { writeTagDiff } from "../setItemTags/writeTagDiff.ts";
import { getPersonIdsFromInputs, setItemPeople } from "../setItemPeople.ts";

type LabelContext = {
  transaction: DatabaseExecutor;
  itemIds: readonly string[];
  memberId: string;
  now: string;
};

/** Adds tags to each item, preserving existing joins and their attribution. */
export async function addBulkItemTags(
  options: Readonly<LabelContext & { names: readonly string[] }>,
): Promise<void> {
  const requestedIds = await getTagIdsFromNames(options);
  await options.itemIds.reduce(async (previousWrite, itemId) => {
    await previousWrite;
    const attached = await options.transaction
      .selectFrom("item_tags")
      .select("tag_id")
      .where("item_id", "=", itemId)
      .execute();
    const wantedTagIds = new Set([
      ...attached.map((row) => {
        return row.tag_id;
      }),
      ...requestedIds.values(),
    ]);
    if (wantedTagIds.size > LIMITS.itemMaxTags) {
      throw ApiError.invalidRequest({
        tags: [`An item cannot have more than ${LIMITS.itemMaxTags} tags.`],
      });
    }
    await writeTagDiff({ ...options, itemId, wantedTagIds });
  }, Promise.resolve());
}

/** Creates typed people once, then adds the same identities to every item. */
export async function addBulkItemPeople(
  options: Readonly<LabelContext & { people: readonly PersonInput[] }>,
): Promise<void> {
  const requestedIds = await getPersonIdsFromInputs(options);
  await options.itemIds.reduce(async (previousWrite, itemId) => {
    await previousWrite;
    const attached = await options.transaction
      .selectFrom("item_people")
      .select("person_id")
      .where("item_id", "=", itemId)
      .execute();
    const wantedIds = new Set([
      ...attached.map((row) => {
        return row.person_id;
      }),
      ...requestedIds,
    ]);
    if (wantedIds.size > LIMITS.itemMaxPeople) {
      throw ApiError.invalidRequest({
        people: [
          `An item cannot have more than ${LIMITS.itemMaxPeople} people.`,
        ],
      });
    }
    await setItemPeople({
      ...options,
      itemId,
      people: [...wantedIds].map((personId) => {
        return { personId };
      }),
    });
  }, Promise.resolve());
}
