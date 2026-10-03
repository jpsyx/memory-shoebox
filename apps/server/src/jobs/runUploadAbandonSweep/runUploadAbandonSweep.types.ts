import { type Kysely } from "kysely";

import type { Database } from "../../db/types/db.types.ts";

/** Inputs for _failIdleInFlightFiles. */
export type FailIdleInFlightFilesOptions = {
  transaction: Kysely<Database>;
  sessionId: string;
  sessionsIdleBefore: string;
  now: string;
};

/** Inputs for _abandonBatchAndSettle. */
export type AbandonBatchAndSettleOptions = {
  database: Kysely<Database>;
  sessionId: string;
  sessionsIdleBefore: string;
  now: string;
};

/** Inputs for _abandonIdleRetriedFilesOrRecord. */
export type AbandonIdleRetriedFilesOrRecordOptions = {
  database: Kysely<Database>;
  filesIdleBefore: string;
  now: string;
  failures: SweepFailure[];
};

/** What one run changed. */
export type UploadAbandonSweepSummary = {
  abandonedFileCount: number;
  cancelledDraftCount: number;
  settledSessionCount: number;
  abortedMultipartCount: number;
};

/** One part of a run that threw, named for the error the run ends with. */
export type SweepFailure = { what: string; error: unknown };

/** What the committed half did, and the batches it could not finish. */
export type CommittedHalf = {
  abandonedFileCount: number;
  settledSessionCount: number;
  failures: SweepFailure[];
};
