import { sql } from "kysely";
import {
  areVisualFingerprintsMatching,
  getVisualFingerprintBandsFromFingerprint,
  type ManifestEntry,
} from "@memory-shoebox/shared";
import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type {
  ManifestCandidates,
  PlanContext,
} from "./reconcileManifest.types.ts";

/** Indexed hash-band candidates, fetched once per manifest rather than per file. */
export async function getArchivePhotosFromEntries(
  options: Readonly<{
    transaction: DatabaseExecutor;
    entries: readonly ManifestEntry[];
  }>,
): Promise<ManifestCandidates["archivePhotos"]> {
  const fingerprints = options.entries.flatMap((entry) => {
    return entry.visualFingerprint &&
      entry.declaredContentType.startsWith("image/")
      ? [getVisualFingerprintBandsFromFingerprint(entry.visualFingerprint)]
      : [];
  });
  if (fingerprints.length === 0) {
    return [];
  }
  const bands = [0, 1, 2, 3].map((band) => {
    const values = [
      ...new Set(
        fingerprints.map((fingerprint) => {
          return fingerprint[band]!;
        }),
      ),
    ];
    return sql<boolean>`substr(visual_fingerprint, ${sql.lit(4 + 4 * band)}, 4) in (${sql.join(values)})`;
  });
  const query = options.transaction
    .selectFrom("items")
    .select(["visual_fingerprint", "width", "height"])
    .where(sql<boolean>`kind = 'photo'`)
    .where("visual_fingerprint", "is not", null);
  // SQLite scans a partial index for the combined OR shape. UNION preserves
  // four index searches and removes candidates sharing more than one band.
  return query
    .where(bands[0]!)
    .union(
      bands.slice(1).map((band) => {
        return query.where(band);
      }),
    )
    .execute();
}

function _isMatchingPhoto(
  options: Readonly<{
    entry: ManifestEntry;
    photo: {
      visual_fingerprint: string | null;
      width: number | null;
      height: number | null;
    };
  }>,
): boolean {
  const { entry, photo } = options;
  return Boolean(
    entry.visualFingerprint &&
    photo.visual_fingerprint &&
    entry.width &&
    entry.height &&
    photo.width &&
    photo.height &&
    Math.abs((entry.width * photo.height) / (entry.height * photo.width) - 1) <=
      0.01 &&
    areVisualFingerprintsMatching({
      first: entry.visualFingerprint,
      second: photo.visual_fingerprint,
    }),
  );
}

/** Chooses durable duplicate feedback without exposing the matching item. */
export function getDuplicateReasonFromEntry(
  options: Readonly<{
    context: PlanContext;
    entry: ManifestEntry;
    excludeFileId?: string;
  }>,
): "archive" | "batch" | undefined {
  const { context, entry, excludeFileId } = options;
  const isPhoto = entry.declaredContentType.toLowerCase().startsWith("image/");
  if (
    context.candidates.archiveIdentities.has(
      `${entry.contentHash}:${entry.declaredBytes}`,
    ) ||
    (isPhoto &&
      context.candidates.archivePhotos.some((photo) => {
        return _isMatchingPhoto({ entry, photo });
      }))
  ) {
    return "archive";
  }
  const exact = entry.contentHash
    ? context.candidates.rowsByHash.get(entry.contentHash)
    : undefined;
  if (
    exact &&
    exact.id !== excludeFileId &&
    exact.declared_bytes === entry.declaredBytes &&
    (exact.state === "waiting" ||
      exact.state === "sending" ||
      exact.state === "done")
  ) {
    return "batch";
  }
  return isPhoto &&
    context.candidates.batchPhotos.some((photo) => {
      return photo.id !== excludeFileId && _isMatchingPhoto({ entry, photo });
    })
    ? "batch"
    : undefined;
}
