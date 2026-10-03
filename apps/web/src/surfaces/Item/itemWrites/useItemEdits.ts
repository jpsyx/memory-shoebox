import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  ItemDetail,
  PersonRef,
  ResolveVisibilityRuleRequest,
  SetCaptureDateRequest,
} from "@memory-shoebox/shared";
import {
  itemQueryOptions,
  setItemAltText,
  setItemCaptureDate,
  setItemPeople,
  setItemTags,
  setItemVisibility,
} from "@/api/items/items";
import { findOrCreateVisibilityRule } from "@/api/visibilityRules/visibilityRules";
import { peopleQueryOptions } from "@/api/vocabularies/vocabularies";
import { makePeopleInputsFromNames } from "@/surfaces/Item/InThisOne/makePeopleInputsFromNames/makePeopleInputsFromNames";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite";

/** The tag set, replaced whole: names as typed. */
export function useSetItemTags(itemId: string): ItemWrite<string[]> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (tags: string[]) => {
      return setItemTags({ itemId, body: { tags } });
    },
  });
}

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
    peopleQueryOptions(undefined).queryKey,
  );
  return [
    ...(item?.people ?? []),
    ...options.answered,
    ...(directory?.people ?? []).map((entry) => {
      return entry.person;
    }),
  ];
}

/**
 * The people set, replaced whole from the names in the field: known people
 * by id, new ones by name.
 */
export function useSetItemPeople(itemId: string): ItemWrite<readonly string[]> {
  const queryClient = useQueryClient();
  // The people this hook's saves were answered with. A name tagged, taken
  // off and tagged again is on neither the item nor the directory by then,
  // because nothing refetches the directory under an open editor
  // (`markPileStale`).
  const answered = useRef(new Map<string, PersonRef>());
  return useItemDetailWrite({
    itemId,
    mutationFn: async (names: readonly string[]) => {
      // Sending a known name by name would make a second person, so names
      // become people only as the request goes out, against everybody known
      // then rather than when the field changed. Writes on one item queue in
      // its scope, so an earlier save's answer is in the cache by now, and
      // the directory may have arrived since the name was typed.
      const people = makePeopleInputsFromNames({
        names,
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
      return detail;
    },
  });
}

/** The alt text override. Null clears it back to the composed line. */
export function useSetItemAltText(itemId: string): ItemWrite<string | null> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (altText: string | null) => {
      return setItemAltText({ itemId, body: { altText } });
    },
  });
}

/** The hand correction to the capture date. */
export function useSetItemCaptureDate(
  itemId: string,
): ItemWrite<SetCaptureDateRequest> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (body: SetCaptureDateRequest) => {
      return setItemCaptureDate({ itemId, body });
    },
  });
}

/**
 * Finds or creates the rule, then repoints the item at it, skipping the
 * repoint when the rule found is the one the item already has.
 *
 * Two round trips for one save is the contract's choice (`items.md`
 * § Visibility): choosing a rule is idempotent and shared, pointing an item
 * at one is neither.
 */
async function _repointItem(
  options: Readonly<{
    queryClient: QueryClient;
    itemId: string;
    request: ResolveVisibilityRuleRequest;
  }>,
): Promise<ItemDetail> {
  const { queryClient, itemId } = options;
  const rule = await findOrCreateVisibilityRule(options.request);
  const current = queryClient.getQueryData(itemQueryOptions(itemId).queryKey);
  return current !== undefined &&
    current.visibility.visibilityRuleId === rule.visibilityRuleId
    ? current
    : setItemVisibility({
        itemId,
        body: { visibilityRuleId: rule.visibilityRuleId },
      });
}

/** Who can see it: a mode and subjects, found as a rule and pointed at. */
export function useSetItemVisibility(
  itemId: string,
): ItemWrite<ResolveVisibilityRuleRequest> {
  const queryClient = useQueryClient();
  return useItemDetailWrite({
    itemId,
    mutationFn: (request: ResolveVisibilityRuleRequest) => {
      return _repointItem({ queryClient, itemId, request });
    },
  });
}
