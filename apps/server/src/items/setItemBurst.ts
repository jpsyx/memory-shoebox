import type { ItemBurstHistoryTable } from "../db/types/catalog.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "./getVisibleItemOr404.ts";
import { assertMayChangeItemAccess } from "./itemPermissionHelpers/itemPermissionHelpers.ts";
import { rememberBurstMembership } from "./rememberBurstMembership.ts";

async function _removeFromBurst(options: {
  database: DatabaseExecutor;
  item: VisibleItem;
}): Promise<void> {
  if (options.item.burstId === null) {
    return;
  }
  await rememberBurstMembership({
    database: options.database,
    itemIds: [options.item.itemId],
  });
  await options.database
    .updateTable("items")
    .set({ burst_id: null, burst_index: null })
    .where("id", "=", options.item.itemId)
    .execute();
  await options.database
    .deleteFrom("bursts")
    .where("id", "=", options.item.burstId)
    .where((expression) => {
      return expression.not(
        expression.exists(
          expression
            .selectFrom("items")
            .select("items.id")
            .whereRef("items.burst_id", "=", "bursts.id"),
        ),
      );
    })
    .execute();
}

async function _readRestorableMembership(options: {
  database: DatabaseExecutor;
  item: VisibleItem;
}): Promise<ItemBurstHistoryTable> {
  const history = await options.database
    .selectFrom("item_burst_history")
    .selectAll()
    .where("item_id", "=", options.item.itemId)
    .executeTakeFirst();
  if (history === undefined) {
    throw ApiError.conflict({ code: "item_burst_unavailable" });
  }
  const activeBurst = await options.database
    .selectFrom("bursts")
    .select("captured_on")
    .where("id", "=", history.burst_id)
    .executeTakeFirst();
  if (
    history.captured_on !== options.item.capturedOn ||
    (activeBurst !== undefined &&
      activeBurst.captured_on !== options.item.capturedOn)
  ) {
    throw ApiError.conflict({ code: "item_burst_date_conflict" });
  }
  return history;
}

async function _restoreOriginalBurst(options: {
  database: DatabaseExecutor;
  item: VisibleItem;
}): Promise<void> {
  if (options.item.burstId !== null) {
    return;
  }
  const history = await _readRestorableMembership(options);
  const {
    item_id: itemId,
    burst_id: burstId,
    burst_index: burstIndex,
    ...burst
  } = history;
  await options.database
    .insertInto("bursts")
    .values({ id: burstId, ...burst })
    .onConflict((conflict) => {
      return conflict.column("id").doNothing();
    })
    .execute();
  await options.database
    .updateTable("items")
    .set({ burst_id: burstId, burst_index: burstIndex })
    .where("id", "=", itemId)
    .execute();
}

/** Changes grouping inside the caller's transaction after visibility checks. */
export async function setItemBurst(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    itemId: string;
    action: "remove" | "restore";
  }>,
): Promise<VisibleItem> {
  const item = await getVisibleItemOr404(options);
  assertMayChangeItemAccess({
    viewer: options.viewer,
    uploadedBy: item.uploadedBy,
    code: "item_burst_forbidden",
  });
  if (item.kind !== "photo") {
    throw ApiError.conflict({ code: "item_burst_unavailable" });
  }
  if (options.action === "remove") {
    await _removeFromBurst({ database: options.database, item });
  } else {
    await _restoreOriginalBurst({ database: options.database, item });
  }
  return getVisibleItemOr404(options);
}
