import { personTaggingQueryOptions } from "@/api/items/personTagging";
import { itemQueryOptions, setItemPeople } from "@/api/items/items";
import { makePeopleQueryOptionsFromSearchScope } from "@/api/vocabularies/vocabularies";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";
import { makePeopleInputsFromChoices } from "./makePeopleInputsFromChoices";
import type { PersonChoice } from "@/system/PeopleField/PeopleField";
import type { PersonRef } from "@memory-shoebox/shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef } from "react";
/**
 * Everybody a name could mean as a people save goes out, in the order a name
 * is matched: the item's people in the cache, then everybody this editor's
 * saves have been answered with, then the people directory in the cache.
 */
function _knownPeopleNow(
  options: Readonly<{
    queryClient: QueryClient;
    itemId: string;
    answered: readonly PersonRef[];
  }>,
): PersonRef[] {
  const { queryClient, itemId } = options;
  const item = queryClient.getQueryData(itemQueryOptions(itemId).queryKey);
  const directory = queryClient.getQueryData(
    makePeopleQueryOptionsFromSearchScope({ q: undefined }).queryKey,
  );
  return [
    ...(item?.people ?? []),
    ...options.answered,
    ...(
      queryClient.getQueryData(personTaggingQueryOptions(itemId).queryKey)
        ?.people ?? []
    ).map((entry) => {
      return entry.person;
    }),
    ...(directory?.people ?? []).map((entry) => {
      return entry.person;
    }),
  ];
}

/**
 * The people set, replaced whole from the names in the field: known people
 * by id, new ones by name.
 */
export function useSetItemPeople(itemId: string): ItemWrite<
  readonly PersonChoice[]
> & {
  forgetPerson: (personId: string) => void;
} {
  const queryClient = useQueryClient();
  // The people this hook's saves were answered with. A name tagged, taken
  // off and tagged again is on neither the item nor the directory by then,
  // because nothing refetches the directory under an open editor
  // (`markPileStale`).
  const answered = useRef(new Map<string, PersonRef>());
  const write = useItemDetailWrite({
    itemId,
    mutationFn: async (choices: readonly PersonChoice[]) => {
      // Sending a known name by name would make a second person, so names
      // become people only as the request goes out, against everybody known
      // then rather than when the field changed. Writes on one item queue in
      // its scope, so an earlier save's answer is in the cache by now, and
      // the directory may have arrived since the name was typed.
      const people = makePeopleInputsFromChoices({
        choices,
        known: _knownPeopleNow({
          queryClient,
          itemId,
          answered: [...answered.current.values()],
        }),
      });
      const detail = await setItemPeople({ itemId, body: { people } });
      detail.people.forEach((person) => {
        answered.current.set(person.personId, person);
      });
      void queryClient.invalidateQueries({
        queryKey: personTaggingQueryOptions(itemId).queryKey,
      });
      return detail;
    },
  });
  return {
    ...write,
    forgetPerson: (personId) => {
      answered.current.delete(personId);
    },
  };
}
