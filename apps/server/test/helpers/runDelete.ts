import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types/db.types.ts";
import { runInImmediateTransaction } from "../../src/db/runInImmediateTransaction.ts";
import { deleteItem } from "../../src/items/deleteItem/deleteItem.ts";
import { getVisibleItemOr404 } from "../../src/items/getVisibleItemOr404.ts";
import { makeViewer } from "./makeViewer.ts";
import { NOW } from "./seedHelpers/seedHelpers.ts";

/** Deletes a visible item atomically for the supplied member. */
export async function runDelete(
  options: Readonly<{
    database: Kysely<Database>;
    memberId: string;
    itemId: string;
  }>,
): Promise<void> {
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
