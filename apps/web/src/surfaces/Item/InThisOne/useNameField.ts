import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { itemQueryOptions } from "@/api/items/items";
import { isSameNameList } from "@/surfaces/Item/InThisOne/nameKeys/nameKeys";
import type { WriteCallbacks } from "@/surfaces/Item/itemWrites/useItemDetailWrite";

/** A field of names that saves as it changes, as its editor draws it. */
export type NameField = {
  names: string[];
  /** Whether it holds as many as one item can carry. */
  isFull: boolean;
  onChange: (nextNames: readonly string[]) => void;
};

/** What a name field is made from. */
type NameFieldOptions = {
  detail: ItemDetail;
  /** The names an item carries, which the field starts from. */
  namesOf: (detail: Readonly<ItemDetail>) => string[];
  max: number;
  save: (names: readonly string[], callbacks: Readonly<WriteCallbacks>) => void;
};

/**
 * The names in a field that saves as it changes: the tags or the people.
 *
 * A change past `max`, or one that leaves the names as they were (a repeat
 * typed with a comma), is not saved at all. A failed save puts the field
 * back to the item in the cache as it is then, not as it was when the field
 * changed: a save queued before the failed one may have landed since, and
 * the field has to show what the server has.
 */
export function useNameField(options: Readonly<NameFieldOptions>): NameField {
  const { detail, namesOf, max, save } = options;
  const queryClient = useQueryClient();
  const [names, setNames] = useState(() => {
    return namesOf(detail);
  });

  return {
    names,
    isFull: names.length >= max,
    onChange: (nextNames) => {
      if (
        nextNames.length > max ||
        isSameNameList({ names: nextNames, otherNames: names })
      ) {
        return;
      }
      setNames([...nextNames]);
      save(nextNames, {
        onError: () => {
          const cached = queryClient.getQueryData(
            itemQueryOptions(detail.itemId).queryKey,
          );
          setNames(namesOf(cached ?? detail));
        },
      });
    },
  };
}
