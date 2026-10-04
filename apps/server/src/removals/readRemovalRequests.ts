import {
  idSchema,
  type ListRemovalRequestsRequest,
  type ListRemovalRequestsResponse,
  type ListItemRemovalRequestsResponse,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import { ApiError } from "../http/ApiError.ts";
import { getVisibleItemOr404 } from "../items/getVisibleItemOr404.ts";
import { readItemSummariesByItemIds } from "../archive/readItemSummariesByItemIds.ts";
import {
  makeRemovalRequestDtosFromRows,
  type RemovalRequestRow,
} from "./makeRemovalRequestDtosFromRows.ts";
import { readRemovalGate } from "./readRemovalGate.ts";

/** Dependencies for visibility-aware removal reads. */
type ReadContext = {
  database: DatabaseExecutor;
  viewer: Viewer;
  b2: B2Client;
  now: Date;
};

function _getRequestIdFromCursor(
  cursor: string | undefined,
): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  try {
    return idSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString()),
    );
  } catch {
    throw ApiError.invalidRequest({ cursor: ["Invalid cursor."] });
  }
}

/** Queue scope uses snapshot uploader, preserving deleted history. */
export async function readRemovalRequests(
  options: Readonly<ReadContext & { query: ListRemovalRequestsRequest }>,
): Promise<ListRemovalRequestsResponse> {
  if (options.viewer.role === "viewer") {
    throw ApiError.forbidden("removal_queue_forbidden");
  }
  const all = options.database.selectFrom("removal_requests");
  const scoped = options.viewer.isAdmin
    ? all
    : all.where("item_uploader_member_id", "=", options.viewer.memberId);
  const counts = await scoped
    .select(["state"])
    .select((eb) => {
      return eb.fn.countAll<number>().as("count");
    })
    .groupBy("state")
    .execute();
  const rows = await _readQueuePage(options);
  const page = rows.slice(0, options.query.limit);
  const last = page.at(-1);
  return {
    removalRequests: await makeRemovalRequestDtosFromRows({
      ...options,
      rows: page,
    }),
    nextCursor:
      rows.length > options.query.limit && last !== undefined
        ? Buffer.from(JSON.stringify(last.id)).toString("base64url")
        : null,
    openCount:
      counts.find((row) => {
        return row.state === "open";
      })?.count ?? 0,
    settledCount: counts.reduce((total, row) => {
      return total + (row.state === "open" ? 0 : row.count);
    }, 0),
  };
}

/** Item routes check item visibility first, then scope the asks independently. */
export async function readItemRemovalRequests(
  options: Readonly<ReadContext & { itemId: string }>,
): Promise<ListItemRemovalRequestsResponse> {
  await getVisibleItemOr404(options);
  const query = options.database
    .selectFrom("removal_requests")
    .selectAll()
    .where("item_id", "=", options.itemId);
  const rows = await (
    options.viewer.isAdmin
      ? query
      : query.where((eb) => {
          return eb.or([
            eb("requested_by_member_id", "=", options.viewer.memberId),
            eb("item_uploader_member_id", "=", options.viewer.memberId),
          ]);
        })
  )
    .orderBy("id", "desc")
    .execute();
  const [gate, items] = await Promise.all([
    readRemovalGate(options),
    readItemSummariesByItemIds({ ...options, itemIds: [options.itemId] }),
  ]);
  const item = items.get(options.itemId);
  if (item === undefined) {
    throw ApiError.notFound("item_not_found");
  }
  return {
    removalRequests: await makeRemovalRequestDtosFromRows({
      ...options,
      rows,
      itemSummaries: items,
    }),
    nextCursor: null,
    item,
    canRequestRemoval: gate.isPeopleTagged && !gate.hasOpenRemovalRequest,
  };
}

async function _readQueuePage(
  options: Readonly<ReadContext & { query: ListRemovalRequestsRequest }>,
): Promise<RemovalRequestRow[]> {
  const all = options.database.selectFrom("removal_requests");
  const scoped = options.viewer.isAdmin
    ? all
    : all.where("item_uploader_member_id", "=", options.viewer.memberId);
  const selected =
    options.query.state === "open"
      ? scoped.where("state", "=", "open")
      : scoped.where("state", "!=", "open");
  const cursorId = _getRequestIdFromCursor(options.query.cursor);
  return (
    cursorId === undefined ? selected : selected.where("id", "<", cursorId)
  )
    .selectAll()
    .orderBy("id", "desc")
    .limit(options.query.limit + 1)
    .execute();
}
