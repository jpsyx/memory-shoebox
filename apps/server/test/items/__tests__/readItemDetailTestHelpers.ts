import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import type { Viewer } from "../../../src/http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../../src/items/getVisibleItemOr404.ts";
import { readItemDetail } from "../../../src/items/readItemDetail/readItemDetail.ts";
import { createFakeB2Client } from "../../helpers/createFakeB2Client/createFakeB2Client.ts";
import { NOW } from "../../helpers/seedHelpers/seedHelpers.ts";

/**
 * Reads one permalink the way the route does: resolve the item, then compose
 * the payload from the row that came back.
 */
export async function readDetail(options: {
  database: Kysely<Database>;
  viewer: Viewer;
  itemId: string;
}): Promise<Awaited<ReturnType<typeof readItemDetail>>> {
  return readItemDetail({
    database: options.database,
    b2: createFakeB2Client(),
    viewer: options.viewer,
    item: await getVisibleItemOr404({
      database: options.database,
      viewer: options.viewer,
      itemId: options.itemId,
    }),
    now: new Date(NOW),
  });
}
