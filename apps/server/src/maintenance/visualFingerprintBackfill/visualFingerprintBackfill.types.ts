import type { MediaDecodeCoordinator } from "../../mediaProcessing/createMediaDecodeCoordinator.ts";
import type { MediaProcessingRuntime } from "../../mediaProcessing/mediaProcessing.types.ts";
import type { Kysely } from "kysely";
import type { B2Client } from "../../b2/createB2Client/createB2Client.types.ts";
import type { Database } from "../../db/types/db.types.ts";
import type { JobLogger } from "../../jobs/createJobRunner.ts";

/** Dependencies for bounded, restart-safe automatic photo maintenance. */
export type VisualFingerprintBackfillOptions = {
  database: Kysely<Database>;
  b2: Pick<B2Client, "presignGet">;
  clock: () => Date;
  logger?: Pick<JobLogger, "info">;
  signal?: AbortSignal;
  coordinator?: MediaDecodeCoordinator;
  runtime?: MediaProcessingRuntime;
  fetch?: typeof fetch;
  makeFingerprint?: (bytes: Uint8Array) => Promise<string | undefined>;
};

/** Safe outcomes never include exception messages or signed storage URLs. */
export type FingerprintReadResult =
  | { fingerprint: string | undefined }
  | {
      problem:
        | "download_failed"
        | "byte_size_mismatch"
        | "source_too_large"
        | "decode_failed"
        | "missing_source";
    };
