import type { FastifyRequest } from "fastify";

import {
  setUploadVisibilityRequestSchema,
  uploadSessionParamsSchema,
  type VisibilitySummary,
} from "@memory-shoebox/shared";

import { readVisibilitySummaries } from "../../../archive/readVisibilitySummaries.ts";

import { runInImmediateTransaction } from "../../../db/runInImmediateTransaction.ts";

import { requireViewer } from "../../../http/requestContextHelpers.ts";

import { getVisibilityRuleFromSubjects } from "../../../items/getVisibilityRuleFromSubjects.ts";

import { getOpenPlanSessionOr404 } from "./uploadPlanRouteHelpers.ts";

/**
 * `PATCH /upload-sessions/:sessionId/visibility`: one rule for the batch.
 *
 * Finds or creates the rule and sets one column. Rules are never edited in
 * place, and nothing fans out: the items do not exist yet, and ingest copies
 * the id onto each one when they do.
 */
export async function patchUploadVisibility(
  request: FastifyRequest,
): Promise<VisibilitySummary> {
  const viewer = requireViewer(request);
  const { sessionId } = uploadSessionParamsSchema.parse(request.params);
  const body = setUploadVisibilityRequestSchema.parse(request.body);
  const { database } = request.server;
  const now = request.server.clock().toISOString();

  const visibilityRuleId = await runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const session = await getOpenPlanSessionOr404({
        transaction,
        viewer,
        sessionId,
      });
      const ruleId = await getVisibilityRuleFromSubjects({
        transaction,
        mode: body.mode,
        subjects: body.subjects,
        now,
      });
      await transaction
        .updateTable("upload_sessions")
        .set({ visibility_rule_id: ruleId, last_activity_at: now })
        .where("id", "=", session.id)
        .execute();
      return ruleId;
    },
  });

  const summaries = await readVisibilitySummaries({
    database,
    ruleIds: [visibilityRuleId],
  });
  const summary = summaries.get(visibilityRuleId);
  if (summary === undefined) {
    throw new Error(`Visibility rule ${visibilityRuleId} has no summary`);
  }
  return summary;
}
