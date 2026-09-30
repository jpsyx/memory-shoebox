import type { FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  setCaptureDateRequestSchema,
  type ItemDetail,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
} from "../../items/itemPermissions.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";
import { setItemCaptureDate } from "../../items/setItemCaptureDate.ts";
import { readInstanceSettings } from "../../settings/readInstanceSettings.ts";
import { getLocalDayFromInstant } from "../../time/localDayHelpers.ts";

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
  // Correcting a date is destructive, so it belongs to the item's own
  // uploader or an admin, and never to any uploader (`items.md` Ruling 1).
  // The role gate comes first for the reason given on the delete route: a
  // viewer may do none of it, whoever uploaded it.
  assertMayEditItemContent({ viewer, code: "item_capture_date_forbidden" });
  assertMayChangeItemAccess({
    viewer,
    uploadedBy: item.uploadedBy,
    code: "item_capture_date_forbidden",
  });

  const settings = await readInstanceSettings({
    database: request.server.database,
    keys: ["shoebox.timezone"],
  });
  const timezone = settings["shoebox.timezone"];

  // Today in the Shoebox's own zone, never the server's: a photograph
  // taken this evening in Madrid is not in the future, and one dated
  // tomorrow is a typo rather than a fact. Both are `YYYY-MM-DD`, so the
  // string comparison is the date comparison.
  if (
    body.capturedOn >
    getLocalDayFromInstant({ instant: now.toISOString(), timezone })
  ) {
    throw ApiError.invalidRequest({
      capturedOn: ["A photograph cannot have been taken after today."],
    });
  }

  const change = await runInImmediateTransaction({
    database: request.server.database,
    callback: (transaction) => {
      return setItemCaptureDate({
        transaction,
        viewer,
        item,
        capturedOn: body.capturedOn,
        capturedTime: body.capturedTime ?? undefined,
        timezone,
        now: now.toISOString(),
      });
    },
  });

  // Recomposed over the changed item, so the response carries the new
  // `burst` (often null, because the item has just been ejected from one)
  // and the re-armed `milestones`.
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer,
    item: {
      ...item,
      capturedAt: change.capturedAt,
      capturedOn: change.capturedOn,
      captureSource: change.captureSource,
      burstId: change.burstId,
      burstIndex: change.burstIndex,
    },
    now,
  });
}
