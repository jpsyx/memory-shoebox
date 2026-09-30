// apps/server/scripts/archiveSeed/writeArchivePlan/writeArchivePlan.ts
import type { Kysely } from "kysely";
import type { Database } from "../../../src/db/types/db.types.ts";
import {
  insertPerson,
  insertTag,
} from "../../../test/helpers/seedHelpers/archiveSeedHelpers.ts";
import { insertUploadSession } from "../../../test/helpers/seedHelpers/itemSeedHelpers.ts";
import { ARCHIVE_PLAN, type ArchivePlan } from "../archivePlan.ts";
import { clearOwnedTables } from "./clearOwnedTables.ts";
import { clearRestrictedVisibility } from "./clearRestrictedVisibility.ts";
import { writeBurstCovers } from "./writeBurstCovers.ts";
import { makeItemWriteContext, writeItems } from "./writeItems.ts";
import { writeMilestones } from "./writeMilestones.ts";
import { writeRestrictedGroup } from "./writeRestrictedGroup.ts";

/** What the seed wrote, for the line the script prints. */
export type WrittenArchive = {
  itemCount: number;
  dayCount: number;
  /** Storage keys the objects have to be uploaded to. */
  storageKeys: string[];
};

/** Writes every person and tag the plan names, keyed by display name. */
async function _writeVocabularies(options: {
  database: Kysely<Database>;
  plan: ArchivePlan;
}): Promise<{
  personIdByName: Map<string, string>;
  tagIdByName: Map<string, string>;
}> {
  const { database, plan } = options;
  const personIdByName = new Map<string, string>();
  // Both loops await each insert before the next begins, for the one writer.
  for (const name of plan.people) {
    personIdByName.set(
      name,
      await insertPerson(database, { displayName: name }),
    );
  }
  const tagIdByName = new Map<string, string>();
  for (const name of plan.tags) {
    tagIdByName.set(name, await insertTag(database, { name }));
  }
  return { personIdByName, tagIdByName };
}

/**
 * Writes one archive into a catalog, replacing whatever the seed wrote before.
 *
 * Idempotent by deletion rather than by upsert: the seed owns every row in
 * `clearOwnedTables`'s list, plus the restricted group and its visibility rule
 * (see `clearRestrictedVisibility`), and clearing them is both simpler and
 * honest about that. It refuses nothing: a development catalog is assumed to
 * hold only what this seed wrote.
 *
 * **The `for` loops in this directory are deliberate**, and each one says so
 * where it stands. `docs/rules/typescript.md` says to avoid them, and
 * everywhere it can be avoided here it is. Every loop left standing awaits a
 * write on the way round, and a `map` over an async function starts all of
 * them at once: better-sqlite3 has a single writer, and this seed's own order
 * depends on each write finishing before the next begins (a burst before its
 * frames, a milestone after the items it attaches, every table cleared in
 * foreign-key order). Sequential `for await` is that shape. `Promise.all` over
 * a `map` is a different program, and a slower one against one writer.
 *
 * @returns What was written, including the storage keys the objects belong at.
 */
export async function writeArchivePlan(options: {
  database: Kysely<Database>;
  plan?: ArchivePlan;
  uploaderMemberId: string;
  viewerMemberId: string;
}): Promise<WrittenArchive> {
  const { database, uploaderMemberId, viewerMemberId } = options;
  const plan = options.plan ?? ARCHIVE_PLAN;

  await clearOwnedTables(database);
  await clearRestrictedVisibility(database);

  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: uploaderMemberId,
  });
  const { restrictedRuleId } = await writeRestrictedGroup(database);
  const { personIdByName, tagIdByName } = await _writeVocabularies({
    database,
    plan,
  });

  const context = makeItemWriteContext({
    uploadSessionId,
    uploaderMemberId,
    viewerMemberId,
    restrictedRuleId,
    personIdByName,
    tagIdByName,
  });

  await writeItems({ database, plan, context });
  await writeBurstCovers({
    database,
    burstIdByKey: context.burstIdByKey,
    burstFrames: context.burstFrames,
  });
  await writeMilestones({ database, plan, uploaderMemberId });

  return {
    itemCount: plan.items.length,
    dayCount: plan.days.length,
    storageKeys: context.storageKeys,
  };
}
