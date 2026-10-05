import type { ListMemberSuggestionsResponse } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";

async function _readSuggestionCounts(
  database: DatabaseExecutor,
  matchedIds: readonly string[],
): Promise<ListMemberSuggestionsResponse> {
  const rows = await database
    .selectFrom("people")
    .leftJoin("item_people", "item_people.person_id", "people.id")
    .select(["people.id as personId", "people.display_name as displayName"])
    .select((eb) => {
      return eb.fn.count<number>("item_people.item_id").as("itemCount");
    })
    .where("people.id", "in", matchedIds)
    .groupBy(["people.id", "people.display_name"])
    .orderBy("itemCount", "desc")
    .orderBy("people.id")
    .limit(5)
    .execute();
  return {
    suggestions: rows.map(({ personId, displayName, itemCount }) => {
      return {
        person: { personId, displayName },
        itemCount,
      };
    }),
    nextCursor: null,
  };
}

/** Matches email local-part words against the canonical person name folding. */
export async function readMemberSuggestions(
  options: Readonly<{ database: DatabaseExecutor; email: string }>,
): Promise<ListMemberSuggestionsResponse> {
  const localPart = options.email.split("@")[0]?.split("+")[0] ?? "";
  const tokens = makeNormalisedNameFromName(localPart)
    .split(/[._\-\d]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return { suggestions: [], nextCursor: null };
  }
  const people = await options.database
    .selectFrom("people")
    .select(["id", "display_name"])
    .execute();
  const matchedIds = people
    .filter((person) => {
      const words = makeNormalisedNameFromName(person.display_name).split(" ");
      return tokens.some((token) => {
        return words.includes(token);
      });
    })
    .map((person) => {
      return person.id;
    });
  if (matchedIds.length === 0) {
    return { suggestions: [], nextCursor: null };
  }
  return _readSuggestionCounts(options.database, matchedIds);
}
