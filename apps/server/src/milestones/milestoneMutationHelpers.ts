import type {
  CreateMilestoneRequest,
  DeleteMilestoneResponse,
  MilestoneDetail,
  SetMilestoneItemsRequest,
  SetMilestoneItemsResponse,
  UpdateMilestoneRequest,
} from "@memory-shoebox/shared";
import { writeActivityEvent } from "../activity/writeActivityEvent.ts";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { assertVisibleMilestoneItems } from "./assertVisibleMilestoneItems.ts";
import { readMilestoneDetail } from "./milestoneReadHelpers.ts";

/** Shared context supplied by the enclosing immediate transaction. */
type MutationContext = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  now: string;
};

/** Milestones belong to the Shoebox; author metadata never grants permission. */
export function assertMayMutateMilestones(viewer: Readonly<Viewer>): void {
  if (viewer.role === "viewer") {
    throw ApiError.forbidden("milestone_forbidden");
  }
}

async function _insertAttachments(
  options: Readonly<
    MutationContext & {
      milestoneId: string;
      itemIds: readonly string[];
    }
  >,
): Promise<number> {
  if (options.itemIds.length === 0) {
    return 0;
  }
  const result = await options.transaction
    .insertInto("item_milestones")
    .values(
      options.itemIds.map((itemId) => {
        return {
          id: createId(),
          milestone_id: options.milestoneId,
          item_id: itemId,
          attached_by: options.viewer.memberId,
          attached_at: options.now,
          span_mismatch_acknowledged_at: null,
        };
      }),
    )
    .onConflict((conflict) => {
      return conflict.columns(["item_id", "milestone_id"]).doNothing();
    })
    .executeTakeFirstOrThrow();
  return Number(result.numInsertedOrUpdatedRows);
}

/** Creates an occasion with its supplied span and validates all selected items. */
export async function insertMilestone(
  options: Readonly<
    MutationContext & { body: Readonly<CreateMilestoneRequest> }
  >,
): Promise<MilestoneDetail> {
  const { transaction, viewer, body, now } = options;
  assertMayMutateMilestones(viewer);
  await assertVisibleMilestoneItems({
    database: transaction,
    viewer,
    itemIds: body.itemIds ?? [],
  });
  const milestoneId = createId();
  await transaction
    .insertInto("milestones")
    .values({
      id: milestoneId,
      name: body.name,
      starts_on: body.startsOn,
      ends_on: body.endsOn,
      blurb: body.blurb,
      created_by: viewer.memberId,
      created_at: now,
      updated_at: now,
    })
    .execute();
  await _insertAttachments({
    ...options,
    milestoneId,
    itemIds: body.itemIds ?? [],
  });
  return readMilestoneDetail({ database: transaction, viewer, milestoneId });
}

/** Validates the merged span and resets acknowledgements only when dates change. */
export async function updateMilestone(
  options: Readonly<
    MutationContext & {
      milestoneId: string;
      body: UpdateMilestoneRequest;
    }
  >,
): Promise<MilestoneDetail> {
  const { transaction, viewer, milestoneId, body, now } = options;
  assertMayMutateMilestones(viewer);
  const detail = await readMilestoneDetail({
    database: transaction,
    viewer,
    milestoneId,
  });
  const startsOn = body.startsOn ?? detail.milestone.startsOn;
  const endsOn = body.endsOn ?? detail.milestone.endsOn;
  if (endsOn < startsOn) {
    throw ApiError.invalidRequest({
      endsOn: ["The end must not precede the start."],
    });
  }
  await transaction
    .updateTable("milestones")
    .set({
      name: body.name ?? detail.milestone.name,
      starts_on: startsOn,
      ends_on: endsOn,
      blurb: body.blurb === undefined ? detail.milestone.blurb : body.blurb,
      updated_at: now,
    })
    .where("id", "=", milestoneId)
    .execute();
  if (
    startsOn !== detail.milestone.startsOn ||
    endsOn !== detail.milestone.endsOn
  ) {
    await transaction
      .updateTable("item_milestones")
      .set({ span_mismatch_acknowledged_at: null })
      .where("milestone_id", "=", milestoneId)
      .execute();
  }
  return readMilestoneDetail({ database: transaction, viewer, milestoneId });
}

/** Deletes only the occasion and joins, auditing the true attachment count. */
export async function deleteMilestone(
  options: Readonly<MutationContext & { milestoneId: string }>,
): Promise<DeleteMilestoneResponse> {
  const { transaction, viewer, milestoneId } = options;
  assertMayMutateMilestones(viewer);
  const detail = await readMilestoneDetail({
    database: transaction,
    viewer,
    milestoneId,
  });
  const attachmentCountRow = await transaction
    .selectFrom("item_milestones")
    .select((eb) => {
      return eb.fn.countAll<number>().as("count");
    })
    .where("milestone_id", "=", milestoneId)
    .executeTakeFirstOrThrow();
  await writeActivityEvent({
    ...options,
    kind: "milestone_deleted",
    subjectKind: "milestone",
    subjectId: milestoneId,
    subjectLabel: detail.milestone.name,
    detail: {
      startsOn: detail.milestone.startsOn,
      endsOn: detail.milestone.endsOn,
      attachmentCount: Number(attachmentCountRow.count),
    },
  });
  await transaction
    .deleteFrom("milestones")
    .where("id", "=", milestoneId)
    .execute();
  return {
    milestoneId,
    name: detail.milestone.name,
    detachedItemCount: detail.itemCount,
  };
}

/** Applies a validated delta while preserving joins omitted by the viewer. */
export async function setMilestoneItems(
  options: Readonly<
    MutationContext & {
      milestoneId: string;
      body: SetMilestoneItemsRequest;
    }
  >,
): Promise<SetMilestoneItemsResponse> {
  const { transaction, viewer, milestoneId, body } = options;
  assertMayMutateMilestones(viewer);
  await readMilestoneDetail({ database: transaction, viewer, milestoneId });
  await assertVisibleMilestoneItems({
    database: transaction,
    viewer,
    itemIds: [...body.attach, ...body.detach],
  });
  const attachedCount = await _insertAttachments({
    ...options,
    itemIds: body.attach,
  });
  const deletion =
    body.detach.length === 0
      ? undefined
      : await transaction
          .deleteFrom("item_milestones")
          .where("milestone_id", "=", milestoneId)
          .where("item_id", "in", body.detach)
          .executeTakeFirstOrThrow();
  return {
    ...(await readMilestoneDetail({
      database: transaction,
      viewer,
      milestoneId,
    })),
    attachedCount,
    detachedCount: Number(deletion?.numDeletedRows ?? 0),
  };
}
