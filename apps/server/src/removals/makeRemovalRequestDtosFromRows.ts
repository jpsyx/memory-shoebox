import type { Selectable } from "kysely";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { removalRequestStateSchema } from "@memory-shoebox/shared";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { readItemSummariesByItemIds } from "../archive/readItemSummariesByItemIds.ts";

/** Stored removal facts, including private snapshots never served verbatim. */
export type RemovalRequestRow = Selectable<Database["removal_requests"]>;

/** Composes cards in batches and signs media only after normal visibility. */
export async function makeRemovalRequestDtosFromRows(
  options: Readonly<{
    database: DatabaseExecutor;
    b2: B2Client;
    viewer: Viewer;
    rows: readonly RemovalRequestRow[];
    now: Date;
    itemSummaries?: ReadonlyMap<
      string,
      import("@memory-shoebox/shared").ItemSummary
    >;
  }>,
): Promise<RemovalRequestDto[]> {
  if (options.rows.length === 0) {
    return [];
  }
  const [members, items] = await Promise.all([
    readMemberRefs(options.database),
    options.itemSummaries ??
      readItemSummariesByItemIds({
        ...options,
        itemIds: _getItemIdsFromRequestRows(options.rows),
      }),
  ]);
  const member = (memberId: string) => {
    return members.get(memberId) ?? { memberId, displayName: "" };
  };
  return options.rows.map((row) => {
    const isOpen = row.state === "open";
    const mayDecide =
      options.viewer.isAdmin ||
      row.item_uploader_member_id === options.viewer.memberId;
    return {
      requestId: row.id,
      state: removalRequestStateSchema.parse(row.state),
      itemId: row.item_id,
      requestedBy: member(row.requested_by_member_id),
      reason: row.reason,
      declineReason: row.decline_reason,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolvedBy:
        row.resolved_by_member_id === null
          ? null
          : member(row.resolved_by_member_id),
      uploadedBy: member(row.item_uploader_member_id),
      itemCapturedAt: row.item_captured_at,
      media:
        row.item_id === null ? null : (items.get(row.item_id)?.media ?? null),
      canWithdraw:
        isOpen && row.requested_by_member_id === options.viewer.memberId,
      canDecline: isOpen && mayDecide,
      canDeleteItem: isOpen && mayDecide && row.item_id !== null,
    };
  });
}

function _getItemIdsFromRequestRows(
  rows: readonly RemovalRequestRow[],
): string[] {
  return [
    ...new Set(
      rows.flatMap((row) => {
        return row.item_id === null ? [] : [row.item_id];
      }),
    ),
  ];
}
