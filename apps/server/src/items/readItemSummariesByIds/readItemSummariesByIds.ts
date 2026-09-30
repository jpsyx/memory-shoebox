import type { FastifyBaseLogger } from "fastify";
import type { ItemSummary } from "@memory-shoebox/shared";
import type { B2Client } from "../../b2/client/client.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { Viewer } from "../../http/requestContextHelpers.ts";
import { makeItemSummariesById } from "./makeItemSummariesById.ts";
import { readItemSummaryParts } from "./readItemSummaryParts.ts";
import { readItemSummaryRows } from "./readItemSummaryRows.ts";

/**
 * One `ItemSummary` per requested id, for a selection the client wants
 * refreshed.
 *
 * The caller is a selection on the timeline and wants its prints back, not
 * 264 comment threads, which is why this returns summaries and
 * `readItemDetail` is not called per item.
 *
 * Six queries for any number of ids: the items, their renditions, their
 * people, their rules, the members table, and the visible siblings of every
 * burst the selection touches in one `burst_id IN (...)`.
 *
 * @param options.database The Kysely handle.
 * @param options.b2 The Backblaze client.
 * @param options.viewer The request's viewer.
 * @param options.itemIds The selection, already checked.
 * @param options.now The request's clock.
 * @param options.logger Where an undrawable item is reported.
 */
export async function readItemSummariesByIds(options: {
  database: DatabaseExecutor;
  b2: B2Client;
  viewer: Viewer;
  itemIds: readonly string[];
  now: Date;
  logger?: FastifyBaseLogger;
}): Promise<ItemSummary[]> {
  if (options.itemIds.length === 0) {
    return [];
  }

  const rows = await readItemSummaryRows({
    database: options.database,
    viewer: options.viewer,
    itemIds: options.itemIds,
  });
  const parts = await readItemSummaryParts({
    database: options.database,
    b2: options.b2,
    viewer: options.viewer,
    now: options.now,
    rows,
  });
  const summariesById = makeItemSummariesById({
    rows,
    parts,
    logger: options.logger,
  });

  // In the order the caller asked for them, so a selection redraws in place.
  return options.itemIds.flatMap((itemId) => {
    const summary = summariesById.get(itemId);
    return summary === undefined ? [] : [summary];
  });
}
