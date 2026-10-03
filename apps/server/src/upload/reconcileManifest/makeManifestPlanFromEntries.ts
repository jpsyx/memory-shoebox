import {
  type ManifestEntry,
  type ManifestOutcome,
} from "@memory-shoebox/shared";

import { ApiError } from "../../http/ApiError.ts";

import { getCaptureDateFromUploaderDate } from "../captureDateLadderHelpers/captureDateLadderHelpers.ts";

import type { UploadFileRow } from "../uploadSessionAccessHelpers.ts";

import type {
  ManifestCandidates,
  PlanAddressedEntryOptions,
  PlanContext,
  ManifestPlan,
} from "./reconcileManifest.types.ts";

import {
  makeManifestOutcomeFromRow,
  getDispositionFromRow,
  getCaptureFromRow,
  makeUploadFileRowFromEntry,
} from "./manifestRowHelpers.ts";

/**
 * The row a declared entry is, if the session already holds it: by hash
 * first, then by name and size against a row with no hash that no other entry
 * in this request has claimed, so each entry claims at most one row.
 *
 * A `refused` row matches only an entry of the same declared type as well:
 * the type is what it was refused for, and the same name and size under
 * another type is a file to judge afresh.
 */
function _findExistingRow(options: {
  candidates: ManifestCandidates;
  claimedRowIds: ReadonlySet<string>;
  entry: Readonly<ManifestEntry>;
}): UploadFileRow | undefined {
  const { candidates, entry } = options;
  const contentHash = entry.contentHash ?? undefined;
  const byHash =
    contentHash === undefined
      ? undefined
      : candidates.rowsByHash.get(contentHash);
  return byHash !== undefined
    ? byHash
    : candidates.unhashedRows.find((row) => {
        return (
          !options.claimedRowIds.has(row.id) &&
          row.original_filename === entry.originalFilename &&
          row.declared_bytes === entry.declaredBytes &&
          (row.state !== "refused" ||
            row.declared_content_type === entry.declaredContentType)
        );
      });
}

/**
 * An entry that names its row by id: a re-declaration, or an amendment.
 *
 * Returns undefined for a conflict. An amendment touches only a `waiting` row:
 * a row in flight or finished has a date the transfer is already carrying.
 */
function _planAddressedEntry(
  options: Readonly<Omit<PlanAddressedEntryOptions, "entry">> &
    Readonly<{ entry: Readonly<ManifestEntry> }>,
): ManifestOutcome | undefined {
  const { context, plan, entry } = options;
  const row = context.candidates.rowsById.get(options.fileId);
  if (row === undefined) {
    throw ApiError.notFound("upload_file_not_found");
  }
  plan.claimedRowIds.add(row.id);
  const capturedAt = entry.capturedAt ?? undefined;
  if (capturedAt === undefined) {
    return makeManifestOutcomeFromRow({
      clientRef: entry.clientRef,
      row,
      disposition: getDispositionFromRow(row),
    });
  }
  if (row.state !== "waiting") {
    return undefined;
  }
  const capture = getCaptureDateFromUploaderDate({
    capturedAt,
    previous: getCaptureFromRow(row),
    timezone: context.timezone,
  });
  plan.amendments.set(row.id, capture);
  return {
    ...makeManifestOutcomeFromRow({
      clientRef: entry.clientRef,
      row,
      disposition: "amended",
    }),
    capturedOn: capture.captureDate,
    captureSource: capture.captureSource,
  };
}

/**
 * An entry with no id: a match, or a new row. Returns undefined for a conflict,
 * which after commit is any file the batch did not already hold. A match is
 * never a conflict, a refused row included: it is reported as `refused`, with
 * the row's state and problem code, and the row is never changed.
 */
function _planDeclaration(options: {
  context: PlanContext;
  plan: ManifestPlan;
  entry: Readonly<ManifestEntry>;
}): ManifestOutcome | undefined {
  const { context, plan, entry } = options;
  const existing = _findExistingRow({
    candidates: context.candidates,
    claimedRowIds: plan.claimedRowIds,
    entry,
  });
  if (existing !== undefined) {
    plan.claimedRowIds.add(existing.id);
    return makeManifestOutcomeFromRow({
      clientRef: entry.clientRef,
      row: existing,
      disposition: getDispositionFromRow(existing),
    });
  }
  // `file_count` and `total_bytes` are what the batch committed to, so a file
  // that matches nothing after commit belongs to a new session.
  if (context.session.committed_at !== null) {
    return undefined;
  }
  const row = makeUploadFileRowFromEntry({
    context,
    entry,
    position: plan.nextPosition,
  });
  plan.nextPosition += 1;
  plan.insertedRows.push(row);
  return makeManifestOutcomeFromRow({
    clientRef: entry.clientRef,
    row,
    disposition: row.state === "refused" ? "refused" : "created",
  });
}

/** Plans one entry into the plan, which it mutates. */
function _addEntryToPlan(options: {
  context: PlanContext;
  plan: ManifestPlan;
  entry: Readonly<ManifestEntry>;
}): void {
  const { plan, entry } = options;
  const identity = ((
    sourceEntry: Readonly<ManifestEntry>,
  ): string | undefined => {
    const fileId = sourceEntry.fileId ?? undefined;
    const contentHash = sourceEntry.contentHash ?? undefined;
    return fileId === undefined && contentHash !== undefined
      ? `hash:${contentHash}`
      : undefined;
  })(entry);
  const earlier =
    identity === undefined ? undefined : plan.outcomeByIdentity.get(identity);
  if (earlier !== undefined) {
    const isSkipped =
      earlier.disposition === "already_done" ||
      earlier.disposition === "refused";
    plan.outcomes.push({
      ...earlier,
      clientRef: entry.clientRef,
      disposition: isSkipped ? earlier.disposition : "matched",
    });
    return;
  }
  const fileId = entry.fileId ?? undefined;
  const outcome =
    fileId === undefined
      ? _planDeclaration(options)
      : _planAddressedEntry({ ...options, fileId });
  if (outcome === undefined) {
    plan.conflictingClientRefs.push(entry.clientRef);
    return;
  }
  if (identity !== undefined) {
    plan.outcomeByIdentity.set(identity, outcome);
  }
  plan.outcomes.push(outcome);
}

/**
 * Plans every entry, in order, against what the session already holds.
 *
 * Writes nothing, but is not pure: it mints the new rows' ids, and throws the
 * `404` for an id that is not in this session.
 */
export function makeManifestPlanFromEntries(
  options: Readonly<{
    context: PlanContext;
    entries: readonly ManifestEntry[];
    firstPosition: number;
  }>,
): ManifestPlan {
  return options.entries.reduce<ManifestPlan>(
    (plan, entry) => {
      _addEntryToPlan({ context: options.context, plan, entry });
      return plan;
    },
    {
      outcomes: [],
      insertedRows: [],
      amendments: new Map(),
      conflictingClientRefs: [],
      outcomeByIdentity: new Map(),
      claimedRowIds: new Set(),
      nextPosition: options.firstPosition,
    },
  );
}
