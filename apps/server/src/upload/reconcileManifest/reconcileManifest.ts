import {
  type ManifestEntry,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";

import { ApiError } from "../../http/ApiError.ts";

import type { ReconcileManifestOptions } from "./reconcileManifest.types.ts";

import {
  getDuplicateFileIdFieldErrorsFromEntries,
  getManifestCandidatesFromEntries,
  getNextFilePositionFromSession,
  writeUploadManifestPlan,
  getManifestTotalsFromSession,
} from "./manifestCatalogHelpers.ts";

import { makeManifestPlanFromEntries } from "./makeManifestPlanFromEntries.ts";

/**
 * Reconciles one request's entries against a session's manifest.
 *
 * **Additive, idempotent and never destructive.** A row the request does not
 * name is not read for writing, let alone changed, and sending the same body
 * twice changes nothing the second time. Matching runs in `upload.md`'s
 * order: by `content_hash` in this session (a `done` row is `already_done`,
 * anything else `matched`, a `refused` row `refused`), then by name and
 * declared bytes against a row with no hash (a refused one also by declared
 * type), or directly by `fileId` for an amendment. **Names are never
 * identity**, which is the whole of the resume promise: each entry claims at
 * most one existing row, so a body sent again matches the rows it made, and
 * two unhashed entries of one name and size stay two rows.
 *
 *
 * **All or nothing.** After commit, any entry that matches nothing, or that
 * amends a row that is not `waiting`, fails the whole request with `409
 * upload_manifest_conflict` and every such `clientRef` in `details`, and
 * nothing is written. An id that is not in this session is the byte-identical
 * `404 upload_file_not_found`. A match is never a conflict, a refused row
 * included. Two entries that name one `fileId` are `400 invalid_request`,
 * before anything is read.
 *
 * @param options.transaction The route's `BEGIN IMMEDIATE` transaction.
 * @param options.session The session, read inside that transaction.
 * @param options.entries The request's entries, at most 500.
 * @param options.timezone `shoebox.timezone`, where offset-less dates resolve.
 * @param options.now The request's instant, and rung 6 of the ladder.
 */
export async function reconcileManifest(
  options: Readonly<Omit<ReconcileManifestOptions, "entries">> &
    Readonly<{ entries: readonly ManifestEntry[] }>,
): Promise<PutUploadManifestResponse> {
  // **One multi-row insert and one multi-row update per request**, whatever
  // its size, plus three batched probes, the next position, the session's
  // `last_activity_at` and the totals. SQLite has one writer, so the batching
  // matters more than the probe count.

  const { transaction, session, now } = options;
  const duplicateFileIdErrors = getDuplicateFileIdFieldErrorsFromEntries(
    options.entries,
  );
  if (Object.keys(duplicateFileIdErrors).length > 0) {
    throw ApiError.invalidRequest(duplicateFileIdErrors);
  }
  if (session.state === "settled" || session.state === "cancelled") {
    throw ApiError.conflict({ code: "upload_session_conflict" });
  }

  const [candidates, firstPosition] = await Promise.all([
    getManifestCandidatesFromEntries({
      transaction,
      sessionId: session.id,
      entries: options.entries,
    }),
    getNextFilePositionFromSession({ transaction, sessionId: session.id }),
  ]);
  const plan = makeManifestPlanFromEntries({
    context: { session, candidates, timezone: options.timezone, now },
    entries: options.entries,
    firstPosition,
  });
  if (plan.conflictingClientRefs.length > 0) {
    throw ApiError.conflict({
      code: "upload_manifest_conflict",
      details: {
        clientRefs: plan.conflictingClientRefs,
      },
    });
  }

  await writeUploadManifestPlan({
    transaction,
    plan,
    sessionId: session.id,
    now,
  });
  const totals = await getManifestTotalsFromSession({
    transaction,
    sessionId: session.id,
  });
  return { sessionId: session.id, ...totals, outcomes: plan.outcomes };
}
