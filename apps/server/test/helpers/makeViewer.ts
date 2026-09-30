import { createId } from "../../src/db/createId.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import { EVERYONE_VISIBILITY_RULE_ID } from "../../src/visibility/everyoneRule.ts";

/**
 * Builds the viewer a request would carry.
 *
 * This lives outside `seedHelpers/` because it writes nothing: a viewer is
 * the request context, not a row, and a test that uses one still has to seed
 * the member it names.
 *
 * Defaults to an ordinary uploader who sees only the everyone rule, because
 * that is the viewer most tests need and the interesting cases are the
 * departures from it.
 */
export function makeViewer(
  options: { memberId: string } & Partial<Viewer>,
): Viewer {
  return {
    sessionId: createId(),
    role: "uploader",
    isAdmin: false,
    visibleRuleIds: [EVERYONE_VISIBILITY_RULE_ID],
    ...options,
  };
}
