import type { GroupUsageResponse } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import { runInImmediateTransaction } from "../db/runInImmediateTransaction.ts";
import { bumpVisibilityGeneration } from "../visibility/bumpVisibilityGeneration.ts";
import { makeSubjectDigestFromSubjects } from "../visibility/makeSubjectDigestFromSubjects.ts";
import { writeActivityEvent } from "../activity/writeActivityEvent/writeActivityEvent.ts";
import { readGroupUsageSnapshot } from "./readGroupUsage.ts";
import { requireGroupAdmin } from "./readGroups.ts";
import { isGroupUsageTokenValid } from "./groupUsageTokenHelpers.ts";

type DeleteGroupOptions = {
  database: DatabaseExecutor;
  viewer: Viewer;
  groupId: string;
  confirmationToken: string | undefined;
  secret: string;
  now: string;
};

async function _rewriteGroupRules(
  options: Readonly<{
    database: DatabaseExecutor;
    groupId: string;
    usage: GroupUsageResponse;
  }>,
): Promise<void> {
  await options.database
    .deleteFrom("visibility_rule_subjects")
    .where("group_id", "=", options.groupId)
    .execute();
  await options.usage.rules.reduce(async (previousWrite, rule) => {
    await previousWrite;
    await options.database
      .updateTable("visibility_rules")
      .set({
        subject_digest: makeSubjectDigestFromSubjects(
          rule.visibilityAfter.subjects,
        ),
      })
      .where("id", "=", rule.ruleId)
      .execute();
  }, Promise.resolve());
  try {
    await options.database
      .deleteFrom("groups")
      .where("id", "=", options.groupId)
      .execute();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
        (error.code === "SQLITE_CONSTRAINT_TRIGGER" &&
          error.message === "FOREIGN KEY constraint failed"))
    ) {
      throw ApiError.conflict({ code: "groups_delete_restricted" });
    }
    throw error;
  }
}

function _requireGroupConfirmation(
  options: Readonly<
    DeleteGroupOptions & { usage: GroupUsageResponse; snapshot: string }
  >,
): void {
  const { usage, snapshot } = options;
  if (usage.rules.length > 0 && options.confirmationToken === undefined) {
    throw ApiError.conflict({
      code: "groups_confirmation_required",
      details: usage,
    });
  }
  if (
    options.confirmationToken !== undefined &&
    !isGroupUsageTokenValid({
      snapshot,
      secret: options.secret,
      now: options.now,
      token: options.confirmationToken,
    })
  ) {
    throw ApiError.conflict({
      code: "groups_usage_changed",
      details: usage,
    });
  }
}

/** Validates fresh consent and commits all access changes and audit together. */
export async function deleteGroup(
  options: Readonly<DeleteGroupOptions>,
): Promise<void> {
  requireGroupAdmin(options.viewer);
  await runInImmediateTransaction({
    database: options.database,
    callback: async (database) => {
      const { usage, snapshot } = await readGroupUsageSnapshot({
        ...options,
        database,
      });
      _requireGroupConfirmation({ ...options, usage, snapshot });
      await _rewriteGroupRules({ database, groupId: options.groupId, usage });
      await bumpVisibilityGeneration({ executor: database, now: options.now });
      await writeActivityEvent({
        transaction: database,
        viewer: options.viewer,
        kind: "group_deleted",
        subjectKind: "group",
        subjectId: options.groupId,
        subjectLabel: usage.group.name,
        detail: {
          rewrittenRuleIds: usage.rules.map((rule) => {
            return rule.ruleId;
          }),
          narrowingItemCount: usage.narrowingItemCount,
          wideningItemCount: usage.wideningItemCount,
          emptyAllowListItemCount: usage.emptyAllowListItemCount,
          membersGainingAccess: usage.membersGainingAccess,
        },
        now: options.now,
      });
    },
  });
}
