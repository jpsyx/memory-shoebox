import {
  type ManifestEntry,
  type ManifestOutcome,
} from "@memory-shoebox/shared";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { type CaptureDateResult } from "../captureDateLadderHelpers/captureDateLadderHelpers.types.ts";

import type {
  UploadFileRow,
  UploadSessionRow,
} from "../uploadSessionAccessHelpers.ts";

/** Inputs for _planAddressedEntry. */
export type PlanAddressedEntryOptions = {
  context: PlanContext;
  plan: ManifestPlan;
  entry: ManifestEntry;
  fileId: string;
};

/** Inputs for _writePlan. */
export type WritePlanOptions = {
  transaction: DatabaseExecutor;
  plan: ManifestPlan;
  sessionId: string;
  now: string;
};

/** Inputs for reconcileManifest. */
export type ReconcileManifestOptions = {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  entries: ManifestEntry[];
  timezone: string;
  now: string;
};

/** The three refusals the manifest makes, before any byte moves. */
export type RefusalCode = "unsupported_type" | "empty_file" | "too_large";

/** Session rows and archived originals one request's entries can match. */
export type ManifestCandidates = {
  archiveIdentities: Set<string>;
  archivePhotos: Array<{
    visual_fingerprint: string | null;
    width: number;
    height: number;
  }>;
  batchPhotos: UploadFileRow[];
  rowsByPickId: Map<string, UploadFileRow>;
  rowsByHash: Map<string, UploadFileRow>;
  rowsById: Map<string, UploadFileRow>;
  unhashedRows: UploadFileRow[];
};

/** The fixed inputs every entry is planned against. */
export type PlanContext = {
  session: UploadSessionRow;
  candidates: ManifestCandidates;
  timezone: string;
  now: string;
};

/**
 * What planning a request decided, before anything is written.
 *
 * Built by mutation inside one reduce, and never seen half-built outside it.
 */
export type ManifestPlan = {
  outcomes: ManifestOutcome[];
  insertedRows: UploadFileRow[];
  checkedRows: Map<string, UploadFileRow>;
  amendments: Map<string, CaptureDateResult>;
  conflictingClientRefs: string[];
  outcomeByIdentity: Map<string, ManifestOutcome>;
  claimedRowIds: Set<string>;
  nextPosition: number;
};
