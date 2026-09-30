import { writeArchivePlan } from "../../apps/server/scripts/archiveSeed/writeArchivePlan/writeArchivePlan.ts";
import { createDatabase } from "../../apps/server/src/db/client.ts";
import { E2E_DATABASE_PATH } from "./e2eEnvironment.ts";

/**
 * Writes the development archive into the catalog the run is using.
 *
 * A second handle on the same file rather than a route, for the same reason
 * `database.ts` takes one: nothing in the product creates an item until step
 * 7b, so there is no route to drive.
 *
 * **Objects are deliberately not uploaded.** `E2E_SERVER_ENVIRONMENT`'s B2
 * values are placeholders that could not reach Backblaze, so every `<img>`
 * fails to load and every assertion in this suite still holds: the specs read
 * the DOM, the counts and the labels, and the contrast sweep measures text.
 *
 * **It must not be called before `empty.spec.ts` has run.** Surface 5 needs an
 * archive with nothing in it, and there is one catalog and one server for the
 * whole run. Files run alphabetically under one worker, so `empty` runs before
 * `filter`, `people` and `pile`, and `empty.spec.ts` asserts the catalog is
 * empty at its start so that a change to that ordering fails there, loudly,
 * rather than somewhere confusing.
 */
export async function seedArchiveIntoE2eCatalog(options: {
  uploaderMemberId: string;
  viewerMemberId: string;
}): Promise<void> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    await writeArchivePlan({
      database,
      uploaderMemberId: options.uploaderMemberId,
      viewerMemberId: options.viewerMemberId,
    });
  } finally {
    await database.destroy();
  }
}

/** How many items the catalog holds, for the ordering assertion above. */
export async function countItemsInE2eCatalog(): Promise<number> {
  const database = createDatabase(E2E_DATABASE_PATH);
  try {
    const row = await database
      .selectFrom("items")
      .select((builder) => {
        return builder.fn.countAll<number>().as("total");
      })
      .executeTakeFirstOrThrow();
    return row.total;
  } finally {
    await database.destroy();
  }
}
