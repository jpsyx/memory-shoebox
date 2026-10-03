import {
  resolveVisibilityRuleResponseSchema,
  type ResolveVisibilityRuleRequest,
  type ResolveVisibilityRuleResponse,
} from "@memory-shoebox/shared";
import { apiFetch, jsonInit } from "@/api/client/client";

/**
 * `POST /api/visibility-rules/resolve`: a mode and subjects to a rule id.
 *
 * Named for what it does rather than for the route's verb. Rules are shared
 * and immutable from the edit path, so changing who sees an item is two
 * calls: this one, then `setItemVisibility` with the id it returns
 * (`items.md` § Visibility).
 */
export function findOrCreateVisibilityRule(
  body: Readonly<ResolveVisibilityRuleRequest>,
): Promise<ResolveVisibilityRuleResponse> {
  return apiFetch({
    path: "/visibility-rules/resolve",
    schema: resolveVisibilityRuleResponseSchema,
    init: jsonInit({ method: "POST", body }),
  });
}
