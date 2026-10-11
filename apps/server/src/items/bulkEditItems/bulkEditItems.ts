import type { BulkEditItemsRequest } from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { setMilestoneItems } from "../../milestones/milestoneMutationHelpers/milestoneMutationHelpers.ts";
import { deleteItem } from "../deleteItem/deleteItem.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
} from "../itemPermissionHelpers/itemPermissionHelpers.ts";
import { addBulkItemPeople, addBulkItemTags } from "./addBulkItemLabels.ts";
import { getBulkEditViewerFromTransaction } from "./getBulkEditViewerFromTransaction.ts";

type BulkEditContext = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  body: Readonly<BulkEditItemsRequest>;
  now: string;
};

async function _applyBulkEdit(
  options: Readonly<BulkEditContext & { items: readonly VisibleItem[] }>,
): Promise<void> {
  const { body, transaction, viewer, now } = options;
  const labels = {
    transaction,
    itemIds: body.itemIds,
    memberId: viewer.memberId,
    now,
  };
  switch (body.action) {
    case "tags":
      await addBulkItemTags({ ...labels, names: body.tags });
      return;
    case "people":
      await addBulkItemPeople({ ...labels, people: body.people });
      return;
    case "milestone":
      await setMilestoneItems({
        transaction,
        viewer,
        now,
        milestoneId: body.milestoneId,
        body: { attach: body.itemIds, detach: [] },
      });
      return;
    case "delete":
      options.items.forEach((item) => {
        assertMayChangeItemAccess({
          viewer,
          uploadedBy: item.uploadedBy,
          code: "item_delete_forbidden",
        });
      });
      await options.items.reduce(async (previousDelete, item) => {
        await previousDelete;
        await deleteItem({ transaction, viewer, now, item });
      }, Promise.resolve());
  }
}

/** Validates the entire selection inside the caller's immediate transaction. */
export async function bulkEditItems(
  options: Readonly<BulkEditContext>,
): Promise<void> {
  const viewer = await getBulkEditViewerFromTransaction(options);
  const items = await Promise.all(
    options.body.itemIds.map((itemId) => {
      return getVisibleItemOr404({
        database: options.transaction,
        viewer,
        itemId,
      });
    }),
  );
  assertMayEditItemContent({
    viewer,
    code:
      options.body.action === "delete"
        ? "item_delete_forbidden"
        : "item_edit_forbidden",
  });
  await _applyBulkEdit({ ...options, viewer, items });
}
