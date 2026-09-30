import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import { runInImmediateTransaction } from "../../../src/db/runInImmediateTransaction.ts";
import { deleteItem } from "../../../src/items/deleteItem.ts";
import { getVisibleItemOr404 } from "../../../src/items/getVisibleItemOr404.ts";
import { makeViewer } from "../../helpers/makeViewer.ts";
import { NOW } from "../../helpers/seedHelpers/seedHelpers.ts";

/**
 * Deletes one item the way the route does: resolve it, then run the whole
 * transaction over the row that came back.
 */
export async function runDelete(options: {
  database: Kysely<Database>;
  memberId: string;
  itemId: string;
}): Promise<void> {
  const viewer = makeViewer({ memberId: options.memberId });
  const item = await getVisibleItemOr404({
    database: options.database,
    viewer,
    itemId: options.itemId,
  });
  await runInImmediateTransaction({
    database: options.database,
    callback: (transaction) => {
      return deleteItem({ transaction, viewer, item, now: NOW });
    },
  });
}
