import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ItemDetail,
  ResolveVisibilityRuleRequest,
} from "@memory-shoebox/shared";
import { itemQueryOptions, setItemVisibility } from "@/api/items/items";
import { findOrCreateVisibilityRule } from "@/api/visibilityRules/visibilityRules";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";

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
