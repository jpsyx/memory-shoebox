import { type ManifestOutcome } from "@memory-shoebox/shared";

import { appConfig } from "../../../../../../app.config";

import { type UploadEngineFile } from "@/upload/createUploadEngine/createUploadEngine.types";

/**
 * The concurrency a harness URL asks for, from `?concurrency=N`.
 *
 * Anything that is not a whole number from 1 to 8 falls back to the
 * configured default, so a typo cannot start forty lanes.
 */
export function getConcurrencyFromSearch(search: string): number {
  const asked = Number(new URLSearchParams(search).get("concurrency"));
  return Number.isInteger(asked) && asked >= 1 && asked <= 8
    ? asked
    : appConfig.upload.maxParallelTransfers;
}

/** The hold a harness URL asks for: `?hold=before-commit`, or none. */
export function getHoldFromSearch(search: string): "before-commit" | undefined {
  return new URLSearchParams(search).get("hold") === "before-commit"
    ? "before-commit"
    : undefined;
}

/** Consecutive slices of at most `size`, in order. */
export function makeBatchesFromItems<T>(
  functionOptions: Readonly<{ items: readonly T[]; size: number }>,
): T[][] {
  const { items, size } = functionOptions;

  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => {
    return items.slice(index * size, (index + 1) * size);
  });
}

/**
 * Splits off the outcomes the engine must not be given twice.
 *
 * A resume matches by hash, so byte-identical picks share one file id, in one
 * batch or across two. Handing the engine both would send the file twice and
 * end it twice, so only the first pick of each id is sent and the rest are
 * twins. A refused file and one already up are never pending, and so never a
 * twin.
 */
export function splitPendingOutcomes(outcomes: readonly ManifestOutcome[]): {
  /** One outcome per file id: the first pick the manifest matched to it. */
  firstOutcomes: ManifestOutcome[];
  /** Later picks the manifest matched to a file id an earlier pick holds. */
  twinOutcomes: ManifestOutcome[];
} {
  const seenFileIds = new Set<string>();
  const firstOutcomes: ManifestOutcome[] = [];
  const twinOutcomes: ManifestOutcome[] = [];
  outcomes
    .filter((outcome) => {
      return (
        outcome.disposition !== "refused" &&
        outcome.disposition !== "already_done"
      );
    })
    .forEach((outcome) => {
      const isTwin = seenFileIds.has(outcome.fileId);
      seenFileIds.add(outcome.fileId);
      (isTwin ? twinOutcomes : firstOutcomes).push(outcome);
    });
  return { firstOutcomes, twinOutcomes };
}

/**
 * The files the engine should send: every declared file the manifest neither
 * refused nor reported as already landed, paired back by `clientRef`, and
 * once per file id however many identical picks the manifest matched to it.
 */
export function getPendingFilesFromOutcomes(
  options: Readonly<{
    files: readonly File[];
    outcomes: readonly ManifestOutcome[];
  }>,
): UploadEngineFile[] {
  return splitPendingOutcomes(options.outcomes).firstOutcomes.flatMap(
    (outcome) => {
      const file = options.files[Number(outcome.clientRef)];
      return file === undefined ? [] : [{ fileId: outcome.fileId, file }];
    },
  );
}
