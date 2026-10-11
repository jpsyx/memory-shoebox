import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { sql, type Kysely } from "kysely";
import { backupDatabase } from "../../db/backupDatabase.ts";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import type { Database } from "../../db/types/db.types.ts";

/** Original metadata captured before downloading any bytes. */
export type ChecksumCandidate = {
  itemId: string;
  itemBytes: number;
  renditionId: string | null;
  storageKey: string | null;
  renditionBytes: number | null;
};

/** Reads a bounded page, including items whose original row is missing. */
export function getChecksumCandidatesFromDatabase(
  options: Readonly<{ database: Kysely<Database>; afterId: string }>,
): Promise<ChecksumCandidate[]> {
  return options.database
    .selectFrom("items")
    .leftJoin("item_renditions", (relation) => {
      return relation
        .onRef("item_renditions.item_id", "=", "items.id")
        .on("item_renditions.purpose", "=", "original");
    })
    .select([
      "items.id as itemId",
      "items.byte_size as itemBytes",
      "item_renditions.id as renditionId",
      "item_renditions.storage_key as storageKey",
      "item_renditions.byte_size as renditionBytes",
    ])
    .where("items.checksum", "is", null)
    .where("items.id", ">", options.afterId)
    .orderBy("items.id")
    .limit(100)
    .execute();
}

/** Takes a verified WAL-aware snapshot under a brief write lock. */
export function backupChecksumDatabase(
  database: Kysely<Database>,
): Promise<void> {
  return runInImmediateTransaction({
    database,
    callback: async (transaction) => {
      const databases = await sql<{
        name: string;
        file: string;
      }>`pragma database_list`.execute(transaction);
      const path = databases.rows.find((entry) => {
        return entry.name === "main";
      })?.file;
      if (!path) {
        return;
      }
      const directory = join(dirname(path), "backups");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const destination = join(
        directory,
        `${basename(path)}.checksums.${Date.now()}.${randomUUID()}.db`,
      );
      await backupDatabase(path, destination);
      console.log(`Pre-checksum-backfill backup: ${destination}`);
    },
  });
}

/** Writes only if the item and its original still match the downloaded source. */
export async function saveBackfilledChecksum(
  options: Readonly<{
    database: Kysely<Database>;
    candidate: ChecksumCandidate;
    checksum: string;
  }>,
): Promise<boolean> {
  const { database, candidate, checksum } = options;
  const { renditionId, storageKey, renditionBytes } = candidate;
  if (renditionId === null || storageKey === null || renditionBytes === null) {
    return false;
  }
  const result = await database
    .updateTable("items")
    .set({ checksum })
    .where("items.id", "=", candidate.itemId)
    .where("items.checksum", "is", null)
    .where("items.byte_size", "=", candidate.itemBytes)
    .where((expression) => {
      return expression.exists(
        expression
          .selectFrom("item_renditions")
          .select("item_renditions.id")
          .whereRef("item_renditions.item_id", "=", "items.id")
          .where("item_renditions.id", "=", renditionId)
          .where("item_renditions.purpose", "=", "original")
          .where("item_renditions.storage_key", "=", storageKey)
          .where("item_renditions.byte_size", "=", renditionBytes),
      );
    })
    .executeTakeFirst();
  return result.numUpdatedRows === 1n;
}
