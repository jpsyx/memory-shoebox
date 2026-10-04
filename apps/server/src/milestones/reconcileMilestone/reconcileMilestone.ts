import type {
  ReconcileMilestoneRequest,
  ReconcileMilestoneResponse,
  MilestoneRef,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import type { VisibleItem } from "../../items/getVisibleItemOr404.ts";
import { setItemCaptureDates } from "../../items/setItemCaptureDates/setItemCaptureDates.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { assertMayMutateMilestones } from "../milestoneMutationHelpers/milestoneMutationHelpers.ts";
import { readMilestoneDetail } from "../milestoneReadHelpers.ts";
import { readReconciliationItems } from "./readReconciliationItems.ts";
import { readRaisedMilestoneMismatches } from "./readRaisedMilestoneMismatches.ts";
type ReconciliationOptions = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  milestoneId: string;
  body: Readonly<ReconcileMilestoneRequest>;
  now: string;
};
function _assertTargetsInsideSpan(
  options: Readonly<{
    body: Readonly<ReconcileMilestoneRequest>;
    milestone: Readonly<MilestoneRef>;
  }>,
): void {
  const { body, milestone } = options;
  if (body.mode !== "move") {
    return;
  }
  const fieldErrors: Record<string, string[]> = Object.fromEntries(
    body.moves.flatMap((move, index) => {
      return move.targetOn < milestone.startsOn ||
        move.targetOn > milestone.endsOn
        ? [
            [
              `moves.${index}.targetOn`,
              ["The target date must fall inside the milestone span."],
            ],
          ]
        : [];
    }),
  );
  if (Object.keys(fieldErrors).length > 0) {
    throw ApiError.invalidRequest(fieldErrors);
  }
}
async function _moveAttachments(
  options: Readonly<{
    readOptions: Readonly<ReconciliationOptions>;
    items: ReadonlyMap<string, VisibleItem>;
  }>,
): Promise<string[]> {
  const { readOptions, items } = options;
  if (readOptions.body.mode !== "move") {
    return [];
  }
  const settings = await readInstanceSettings({
    database: readOptions.transaction,
    keys: ["shoebox.timezone"],
  });
  const changes = await setItemCaptureDates({
    ...readOptions,
    timezone: settings["shoebox.timezone"],
    changes: readOptions.body.moves.map((move) => {
      const item = items.get(move.itemId);
      if (item === undefined) {
        throw ApiError.notFound("item_not_found");
      }
      return {
        item,
        capturedOn: move.targetOn,
        capturedTime: undefined,
        reason: "milestone_reconcile",
        milestoneId: readOptions.milestoneId,
      };
    }),
  });
  return [...changes]
    .filter(([, change]) => {
      return change.didChange;
    })
    .map(([itemId]) => {
      return itemId;
    });
}
async function _acknowledgeAttachments(
  options: Readonly<{
    readOptions: Readonly<ReconciliationOptions>;
    itemIds: readonly string[];
  }>,
): Promise<number> {
  const { readOptions, itemIds } = options;
  if (readOptions.body.mode !== "acknowledge") {
    return 0;
  }
  const result = await readOptions.transaction
    .updateTable("item_milestones")
    .set({ span_mismatch_acknowledged_at: readOptions.now })
    .where("milestone_id", "=", readOptions.milestoneId)
    .where("item_id", "in", itemIds)
    .where("span_mismatch_acknowledged_at", "is", null)
    .executeTakeFirstOrThrow();
  return Number(result.numUpdatedRows);
}
/** Reconciles attached dates atomically and returns updated mismatch counts. */
export async function reconcileMilestone(
  options: Readonly<ReconciliationOptions>,
): Promise<ReconcileMilestoneResponse> {
  assertMayMutateMilestones(options.viewer);
  const detail = await readMilestoneDetail({
    database: options.transaction,
    ...options,
  });
  const itemIds =
    options.body.mode === "move"
      ? options.body.moves.map((move) => {
          return move.itemId;
        })
      : options.body.itemIds;
  const items = await readReconciliationItems({ ...options, itemIds });
  _assertTargetsInsideSpan({
    body: options.body,
    milestone: detail.milestone,
  });
  const changedItemIds = await _moveAttachments({
    readOptions: options,
    items,
  });
  const acknowledgedCount = await _acknowledgeAttachments({
    readOptions: options,
    itemIds,
  });
  const raisedElsewhere = await readRaisedMilestoneMismatches({
    ...options,
    changedItemIds,
  });
  return {
    ...(await readMilestoneDetail({
      database: options.transaction,
      ...options,
    })),
    movedCount: changedItemIds.length,
    acknowledgedCount,
    raisedElsewhere,
  };
}
