import type { Kysely } from "kysely";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";
import type { Database } from "../../db/types/db.types.ts";
import {
  backupChecksumDatabase,
  getChecksumCandidatesFromDatabase,
  saveBackfilledChecksum,
  type ChecksumCandidate,
} from "./checksumCatalog.ts";
import { getChecksumFromOriginal } from "./getChecksumFromOriginal.ts";

/** Storage reads run outside transactions; only completed hashes are written. */
type BackfillDependencies = {
  database: Kysely<Database>;
  b2: Pick<B2Client, "presignGet">;
};

async function _backfillCandidate(
  options: Readonly<BackfillDependencies & { candidate: ChecksumCandidate }>,
): Promise<string | undefined> {
  const { database, b2, candidate } = options;
  if (candidate.storageKey === null || candidate.renditionId === null) {
    return "missing_original";
  }
  if (
    !Number.isSafeInteger(candidate.itemBytes) ||
    candidate.itemBytes < 0 ||
    candidate.itemBytes !== candidate.renditionBytes
  ) {
    return "byte_size_mismatch";
  }
  const result = await getChecksumFromOriginal({
    b2,
    storageKey: candidate.storageKey,
    expectedBytes: candidate.itemBytes,
  });
  if ("problem" in result) {
    return result.problem;
  }
  try {
    return (await saveBackfilledChecksum({
      database,
      candidate,
      checksum: result.checksum,
    }))
      ? undefined
      : "source_changed";
  } catch {
    return "database_write_failed";
  }
}

/** Backfills null hashes, preserving completed work and every existing item. */
export async function backfillChecksums(
  options: Readonly<BackfillDependencies>,
): Promise<{ updated: number; failed: number }> {
  let candidates = await getChecksumCandidatesFromDatabase({
    database: options.database,
    afterId: "",
  });
  if (candidates.length > 0) {
    await backupChecksumDatabase(options.database);
  }
  const counts = { updated: 0, failed: 0 };
  // Sequential bounded pages avoid retaining the archive or pending downloads.
  while (candidates.length > 0) {
    for (const candidate of candidates) {
      const problem = await _backfillCandidate({ ...options, candidate });
      if (problem) {
        counts.failed += 1;
        console.error(
          `Checksum failed for item ${JSON.stringify(candidate.itemId)}: ${problem}`,
        );
      } else {
        counts.updated += 1;
        console.log(
          `Checksum saved for item ${JSON.stringify(candidate.itemId)}`,
        );
      }
    }
    candidates = await getChecksumCandidatesFromDatabase({
      database: options.database,
      afterId: candidates.at(-1)!.itemId,
    });
  }
  return counts;
}
