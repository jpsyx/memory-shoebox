import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { ApiError } from "../http/ApiError.ts";
import type { RemovalRequestRow } from "./makeRemovalRequestDtosFromRows.ts";

/** Applies three-party request scope independently of current item access. */
export async function getRemovalRequestOr404(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    requestId: string;
  }>,
): Promise<RemovalRequestRow> {
  const query = options.database
    .selectFrom("removal_requests")
    .selectAll()
    .where("id", "=", options.requestId);
  const row = await (
    options.viewer.isAdmin
      ? query
      : query.where((eb) => {
          return eb.or([
            eb("requested_by_member_id", "=", options.viewer.memberId),
            eb("item_uploader_member_id", "=", options.viewer.memberId),
          ]);
        })
  ).executeTakeFirst();
  if (row === undefined) {
    throw ApiError.notFound("removal_request_not_found");
  }
  return row;
}
