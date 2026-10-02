import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ItemDetail,
  PersonInput,
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

/** The people set, replaced whole: known people by id, new ones by name. */
export function useSetItemPeople(itemId: string): ItemWrite<PersonInput[]> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (people: PersonInput[]) => {
      return setItemPeople({ itemId, body: { people } });
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
