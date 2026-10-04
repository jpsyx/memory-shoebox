import type {
  CreateRemovalRequestRequest,
  RemovalRequestDto,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import { createId } from "../db/createId.ts";
import { ApiError } from "../http/ApiError.ts";
import { getVisibleItemOr404 } from "../items/getVisibleItemOr404.ts";
import { getRemovalRequestOr404 } from "./getRemovalRequestOr404.ts";
import { makeRemovalRequestDtosFromRows } from "./makeRemovalRequestDtosFromRows.ts";
import { readRemovalGate } from "./readRemovalGate.ts";
import { enqueueRemovalEmails } from "./enqueueRemovalEmails.ts";

/** Dependencies bound to the route's immediate transaction. */
type MutationContext = {
  transaction: DatabaseExecutor;
  viewer: Viewer;
  b2: B2Client;
  now: string;
};

async function _readResponse(
  options: Readonly<MutationContext & { requestId: string }>,
): Promise<RemovalRequestDto> {
  const row = await getRemovalRequestOr404({
    ...options,
    database: options.transaction,
  });
  const [dto] = await makeRemovalRequestDtosFromRows({
    ...options,
    database: options.transaction,
    rows: [row],
    now: new Date(options.now),
  });
  if (dto === undefined) {
    throw new Error("Removal response missing.");
  }
  return dto;
}

async function _insertRequestSnapshot(
  options: Readonly<
    MutationContext & {
      itemId: string;
      requestId: string;
      body: CreateRemovalRequestRequest;
      item: Awaited<ReturnType<typeof getVisibleItemOr404>>;
    }
  >,
): Promise<void> {
  const database = options.transaction;
  const { item, requestId } = options;
  const original = await database
    .selectFrom("item_renditions")
    .select("storage_key")
    .where("item_id", "=", options.itemId)
    .where("purpose", "=", "original")
    .executeTakeFirst();

  try {
    await database
      .insertInto("removal_requests")
      .values({
        id: requestId,
        item_id: options.itemId,
        requested_by_member_id: options.viewer.memberId,
        reason: options.body.reason,
        state: "open",
        decline_reason: null,
        created_at: options.now,
        resolved_at: null,
        resolved_by_member_id: null,
        item_uploader_member_id: item.uploadedBy,
        item_captured_at: item.capturedAt,
        item_storage_key: original?.storage_key ?? null,
      })
      .execute();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "UNIQUE constraint failed: removal_requests.item_id, removal_requests.requested_by_member_id",
      )
    ) {
      throw ApiError.conflict({ code: "removal_already_requested" });
    }
    throw error;
  }
}

/** Inserts a tagged visible ask and queues mail atomically. */
export async function insertRemovalRequest(
  options: Readonly<
    MutationContext & { itemId: string; body: CreateRemovalRequestRequest }
  >,
): Promise<RemovalRequestDto> {
  const database = options.transaction;
  const item = await getVisibleItemOr404({ ...options, database });
  const gate = await readRemovalGate({ ...options, database });
  if (!gate.isPeopleTagged) {
    throw ApiError.forbidden("removal_request_forbidden");
  }
  const requestId = createId();
  await _insertRequestSnapshot({ ...options, requestId, item });
  const row = await getRemovalRequestOr404({
    database,
    viewer: options.viewer,
    requestId,
  });
  await enqueueRemovalEmails({
    transaction: database,
    requests: [row],
    event: "requested",
    actorMemberId: options.viewer.memberId,
    now: options.now,
  });
  return _readResponse({ ...options, requestId });
}

/** Permissions precede open-state conflicts; updates cannot settle twice. */
export async function settleRemovalRequest(
  options: Readonly<
    MutationContext & {
      requestId: string;
      event: "declined" | "withdrawn";
      declineReason?: string;
    }
  >,
): Promise<RemovalRequestDto> {
  const database = options.transaction;
  const row = await getRemovalRequestOr404({ ...options, database });
  const mayAct =
    options.event === "withdrawn"
      ? row.requested_by_member_id === options.viewer.memberId
      : options.viewer.isAdmin ||
        row.item_uploader_member_id === options.viewer.memberId;
  if (!mayAct) {
    throw ApiError.forbidden("removal_request_forbidden");
  }
  const result = await database
    .updateTable("removal_requests")
    .set({
      state: options.event,
      resolved_at: options.now,
      resolved_by_member_id: options.viewer.memberId,
      decline_reason:
        options.event === "declined" ? options.declineReason : null,
    })
    .where("id", "=", row.id)
    .where("state", "=", "open")
    .executeTakeFirstOrThrow();
  if (Number(result.numUpdatedRows) !== 1) {
    throw ApiError.conflict({ code: "removal_request_not_open" });
  }
  const settled = await getRemovalRequestOr404({ ...options, database });
  await enqueueRemovalEmails({
    transaction: database,
    requests: [settled],
    event: options.event,
    actorMemberId: options.viewer.memberId,
    now: options.now,
  });
  return _readResponse(options);
}
