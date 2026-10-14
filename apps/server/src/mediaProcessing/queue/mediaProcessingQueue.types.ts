import type { Kysely } from "kysely";
import type { Database } from "../../db/types/db.types.ts";

/** Attempt identity; leaseExpiresAt is a snapshot, not renewal authority. */
export type ProcessingClaim = {
  jobId: string;
  itemId: string;
  sourceRenditionId: string;
  recipe: string;
  attemptToken: string;
  leaseExpiresAt: string;
};

/** Immutable work identity with larger priority values selected first. */
export type MediaProcessingEnqueueInput = {
  itemId: string;
  sourceRenditionId: string;
  recipe: string;
  priority: number;
};

/** Result transition; errors are machine codes, never provider error messages. */
export type MediaProcessingFinishInput = {
  claim: Readonly<ProcessingClaim>;
  state: "complete" | "unavailable" | "pending";
  errorCode?: string;
  nextAttemptAt?: string;
};

/** Dependencies shared by queue transitions; no media work occurs here. */
export type MediaProcessingQueueOptions = {
  database: Kysely<Database>;
  clock: () => Date;
};

/** Catalog-only queue; workers must renew every 30 seconds while active. */
export type MediaProcessingQueue = {
  /** Inserts new identity only; duplicates preserve every existing field. */
  enqueue: (input: Readonly<MediaProcessingEnqueueInput>) => Promise<void>;
  /** Claims one due job only when no other job has a live lease. */
  claim: () => Promise<ProcessingClaim | undefined>;
  /** Extends a matching live database lease to 120 seconds from now. */
  renew: (claim: Readonly<ProcessingClaim>) => Promise<boolean>;
  /** Finishes/retries only the currently owned, unexpired running attempt. */
  finish: (input: Readonly<MediaProcessingFinishInput>) => Promise<boolean>;
};
