import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  resolveVisibilityRuleRequestSchema,
  type ResolveVisibilityRuleResponse,
} from "@memory-shoebox/shared";
import { readVisibilitySummaries } from "../archive/readVisibilitySummaries.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { requireViewer } from "../http/requestContextHelpers.ts";
import { getVisibilityRuleFromSubjects } from "../items/getVisibilityRuleFromSubjects.ts";
import { assertMayEditItemContent } from "../items/itemPermissionHelpers/itemPermissionHelpers.ts";

/**
 * `POST /api/visibility-rules/resolve`: `tech-specs/apis/items.md`.
 *
 * **Rules are immutable from the product's edit path.** A rule covers 264
 * files in the fixtures, so editing one in place to change one photograph
 * would change the other 263. Changing an item's visibility therefore
 * repoints it, and this route is where the id to repoint at comes from. It
 * never issues an `UPDATE visibility_rules` and never touches
 * `visibility_rule_subjects` on an existing rule.
 *
 * Nothing here is item-scoped, so there is nothing to own: the role gate is
 * the whole of the guard, and there is no `404` in this route's table.
 *
 * **`200` rather than `201`**, because the commonest outcome by far is that
 * the rule already existed and the caller cannot tell, and should not have
 * to.
 *
 * **Does not bump `visibilityGeneration`.** Creating a rule changes nobody's
 * group membership, nobody's role and no existing rule's subjects, so no
 * viewer's cached `visibleRuleIds` becomes stale.
 */
export async function visibilityRulesRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/visibility-rules/resolve",
    async (request: FastifyRequest): Promise<ResolveVisibilityRuleResponse> => {
      const viewer = requireViewer(request);
      const body = resolveVisibilityRuleRequestSchema.parse(request.body);
      const now = request.server.clock();

      assertMayEditItemContent({ viewer, code: "visibility_rule_forbidden" });

      const visibilityRuleId = await runInImmediateTransaction({
        database: request.server.database,
        callback: async (transaction) => {
          return getVisibilityRuleFromSubjects({
            transaction,
            mode: body.mode,
            subjects: body.subjects,
            now: now.toISOString(),
          });
        },
      });

      const visibilities = await readVisibilitySummaries({
        database: request.server.database,
        ruleIds: [visibilityRuleId],
      });

      return {
        visibilityRuleId,
        // The same shape an item carries, so one source feeds the
        // confirmation the client shows back.
        visibility: visibilities.get(visibilityRuleId) ?? {
          visibilityRuleId,
          mode: "everyone",
          label: null,
          subjects: [],
        },
      };
    },
  );
}
