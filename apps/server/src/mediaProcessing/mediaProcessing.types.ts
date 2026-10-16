import type { Kysely } from "kysely";
import type { Database } from "../db/types/db.types.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { JobLogger } from "../jobs/createJobRunner.ts";
import type { MediaDecodeCoordinator } from "./createMediaDecodeCoordinator.ts";
import type { MediaRuntimeCapabilities } from "./runtime/mediaRuntime.types.ts";
import type { ProcessedRendition } from "./recipes/mediaRecipes.types.ts";

/**
 * Catalog source snapshot; actual original identity is fenced again at commit.
 */
export type MediaProcessingSource = {
  key: string;
  byteSize: number;
  kind: "photo" | "video";
};
/**
 * Runtime keeps owned files alive through upload/publication, then disposes
 * them.
 */
export type MediaProcessingSourceOptions = {
  b2: B2Client;
  source: MediaProcessingSource;
  signal: AbortSignal;
  publish: (outputs: readonly ProcessedRendition[]) => Promise<void>;
};
/** The production implementation uses only mandatory OS-isolated runners. */
export type MediaProcessingRuntime = {
  /** Cached per runtime instance; caller must own the shared decode lane. */
  getCapabilities: (signal: AbortSignal) => Promise<MediaRuntimeCapabilities>;
  /** Caller retains the lane until readers, children and uploads settle. */
  processSource: (
    options: Readonly<MediaProcessingSourceOptions>,
  ) => Promise<void>;
  /** Automatic fingerprint decoding uses the same mandatory isolated runner. */
  makeFingerprint: ({
    bytes,
    signal,
  }: Readonly<{ bytes: Uint8Array; signal: AbortSignal }>) => Promise<
    string | undefined
  >;
};
/**
 * Existing scheduler owns ticks and drain; this job owns one durable attempt.
 */
export type MediaProcessingJobOptions = {
  database: Kysely<Database>;
  b2: B2Client;
  clock: () => Date;
  logger: JobLogger;
  signal: AbortSignal;
  coordinator: MediaDecodeCoordinator;
  runtime: MediaProcessingRuntime;
};
