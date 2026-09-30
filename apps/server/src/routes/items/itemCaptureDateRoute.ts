import type { FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  setCaptureDateRequestSchema,
  type ItemDetail,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import { ApiError } from "../../http/ApiError.ts";
import {
  requireViewer,
  type Viewer,
} from "../../http/requestContextHelpers.ts";
import {
  getVisibleItemOr404,
  type VisibleItem,
} from "../../items/getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
} from "../../items/itemPermissions.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";
import {
  setItemCaptureDate,
  type CaptureDateChange,
} from "../../items/setItemCaptureDate.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";

/**
 * The two guards, in the order they must run in.
 *
 * Correcting a date is destructive, so it belongs to the item's own uploader
 * or an admin, and never to any uploader (`items.md` Ruling 1). The role gate
 * comes first for the reason given on the delete route: a viewer may do none
 * of it, whoever uploaded it.
 */
function _assertMayFixCaptureDate(options: {
  viewer: Viewer;
  uploadedBy: string;
}): void {
  assertMayEditItemContent({
    viewer: options.viewer,
    code: "item_capture_date_forbidden",
  });
  assertMayChangeItemAccess({
    viewer: options.viewer,
    uploadedBy: options.uploadedBy,
    code: "item_capture_date_forbidden",
  });
}

/** The zone every date on this route is read and compared in. */
async function _readShoeboxTimezone(
  database: DatabaseExecutor,
): Promise<string> {
  const settings = await readInstanceSettings({
    database,
    keys: ["shoebox.timezone"],
  });
  return settings["shoebox.timezone"];
}

/**
 * Refuses a day that has not happened yet.
 *
 * Today in the Shoebox's own zone, never the server's: a photograph taken
 * this evening in Madrid is not in the future, and one dated tomorrow is a
 * typo rather than a fact. Both are `YYYY-MM-DD`, so the string comparison is
 * the date comparison.
 */
function _assertCapturedOnHasHappened(options: {
  capturedOn: string;
  timezone: string;
  now: Date;
}): void {
  const today = getLocalDayFromInstant({
    instant: options.now.toISOString(),
    timezone: options.timezone,
  });
  if (options.capturedOn > today) {
    throw ApiError.invalidRequest({
      capturedOn: ["A photograph cannot have been taken after today."],
    });
  }
}

/** The correction and its three consequences, in one transaction. */
async function _applyCaptureDateCorrection(options: {
  database: DatabaseExecutor;
  viewer: Viewer;
  item: VisibleItem;
  capturedOn: string;
  capturedTime: string | undefined;
  timezone: string;
  now: Date;
}): Promise<CaptureDateChange> {
  return runInImmediateTransaction({
    database: options.database,
    callback: (transaction) => {
      return setItemCaptureDate({
        transaction,
        viewer: options.viewer,
        item: options.item,
        capturedOn: options.capturedOn,
        capturedTime: options.capturedTime,
        timezone: options.timezone,
        now: options.now.toISOString(),
      });
    },
  });
}

/**
 * The item as the correction left it, without reading it back.
 *
 * Every column the change touched is one the write already returned, so the
 * response recomposes from the row in hand rather than costing a second read
 * of a row this request has just written.
 */
function _makeCorrectedItemFromChange(options: {
  item: VisibleItem;
  change: Readonly<CaptureDateChange>;
}): VisibleItem {
  return {
    ...options.item,
    capturedAt: options.change.capturedAt,
    capturedOn: options.change.capturedOn,
    captureSource: options.change.captureSource,
    burstId: options.change.burstId,
    burstIndex: options.change.burstIndex,
  };
}

/**
 * `POST /items/:itemId/capture-date`: the hand correction.
 *
 * The one edit in the product that destroys a fact the file carried, which
 * is why it is the one edit with a table of its own. A `POST` to a noun
 * sub-resource, because REST cannot express "correct this".
 *
 * **No `activity_events` row.** `item_capture_date_changes` is the audit
 * trail for this edit, and the log records only what the state tables
 * cannot answer later.
 */
export async function postItemCaptureDate(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const body = setCaptureDateRequestSchema.parse(request.body);
  const now = request.server.clock();

  const item = await getVisibleItemOr404({
    database: request.server.database,
    viewer,
    itemId,
  });
  _assertMayFixCaptureDate({ viewer, uploadedBy: item.uploadedBy });

  const timezone = await _readShoeboxTimezone(request.server.database);
  _assertCapturedOnHasHappened({
    capturedOn: body.capturedOn,
    timezone,
    now,
  });

  const change = await _applyCaptureDateCorrection({
    database: request.server.database,
    viewer,
    item,
    capturedOn: body.capturedOn,
    capturedTime: body.capturedTime ?? undefined,
    timezone,
    now,
  });

  // Recomposed over the changed item, so the response carries the new
  // `burst` (often null, because the item has just been ejected from one)
  // and the re-armed `milestones`.
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item: _makeCorrectedItemFromChange({ item, change }),
    now,
  });
}
