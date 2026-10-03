import { sql } from "kysely";
import {
  CAPTURE_SOURCES,
  UPLOAD_PROBLEM_CODES,
  uploadFileStateSchema,
  type ManifestEntry,
  type ManifestOutcome,
  type PutUploadManifestResponse,
} from "@memory-shoebox/shared";
import { appConfig } from "../../../../app.config.ts";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import {
  getCaptureDateFromEvidence,
  getCaptureDateFromUploaderDate,
  type CaptureDateResult,
} from "./captureDateLadder.ts";
import type { UploadFileRow, UploadSessionRow } from "./uploadSessionAccess.ts";

/** The three refusals the manifest makes, before any byte moves. */
type RefusalCode = "unsupported_type" | "empty_file" | "too_large";

/** English for the admin's eye. Never the primary interface copy. */
const REFUSAL_DETAILS: Record<RefusalCode, string> = {
  unsupported_type: "The Shoebox does not take files of this type.",
  empty_file: "The file is empty.",
  too_large: "The file is larger than the Shoebox takes.",
};

/**
 * Rows a re-declared file may match by name. Both have sent no byte the
 * server knows of, and a `sending` row always has a hash, so in practice this
 * is the `waiting` rows that were declared without one.
 */
const UNSENT_FILE_STATES = ["waiting", "sending"] as const;

/** Everything one request's entries can match, read in three batched probes. */
type ManifestCandidates = {
  rowsByHash: Map<string, UploadFileRow>;
  rowsById: Map<string, UploadFileRow>;
  unhashedRows: UploadFileRow[];
};

/** The fixed inputs every entry is planned against. */
type PlanContext = {
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
type ManifestPlan = {
  outcomes: ManifestOutcome[];
  insertedRows: UploadFileRow[];
  amendments: Map<string, CaptureDateResult>;
  conflictingClientRefs: string[];
  outcomeByIdentity: Map<string, ManifestOutcome>;
  claimedRowIds: Set<string>;
  nextPosition: number;
};

/** Why a declared file is refused, in the contract's order, or null. */
function _getRefusalCode(entry: Readonly<ManifestEntry>): RefusalCode | null {
  const accepted: readonly string[] = appConfig.upload.acceptedContentTypes;
  if (!accepted.includes(entry.declaredContentType.toLowerCase())) {
    return "unsupported_type";
  }
  if (entry.declaredBytes === 0) {
    return "empty_file";
  }
  if (entry.declaredBytes > appConfig.upload.maxFileBytes) {
    return "too_large";
  }
  return null;
}

/** `items.kind` from the declared type, which presign later signs into the PUT. */
function _getKindFromContentType(contentType: string): "photo" | "video" {
  return contentType.toLowerCase().startsWith("video/") ? "video" : "photo";
}

/**
 * What makes two entries in one request the same file: the id it amends, else
 * its hash, else its name and size. The same file picked twice (by drag and by
 * the picker) has the same identity and collapses to one row.
 */
function _getEntryIdentity(entry: Readonly<ManifestEntry>): string {
  const fileId = entry.fileId ?? null;
  if (fileId !== null) {
    return `file:${fileId}`;
  }
  const contentHash = entry.contentHash ?? null;
  return contentHash === null
    ? `name:${entry.declaredBytes}:${entry.originalFilename}`
    : `hash:${contentHash}`;
}

/** How an existing row answers an entry that names it. */
function _getDispositionFromRow(
  row: Readonly<UploadFileRow>,
): ManifestOutcome["disposition"] {
  if (row.state === "done") {
    return "already_done";
  }
  return row.state === "refused" ? "refused" : "matched";
}

/** One entry's outcome, read off the row it now names. */
function _makeOutcomeFromRow(options: {
  clientRef: string;
  row: Readonly<UploadFileRow>;
  disposition: ManifestOutcome["disposition"];
}): ManifestOutcome {
  const { row } = options;
  return {
    clientRef: options.clientRef,
    fileId: row.id,
    disposition: options.disposition,
    state: uploadFileStateSchema.parse(row.state),
    capturedOn: row.capture_date,
    captureSource:
      CAPTURE_SOURCES.find((source) => {
        return source === row.capture_source;
      }) ?? null,
    problemCode:
      UPLOAD_PROBLEM_CODES.find((code) => {
        return code === row.problem_code;
      }) ?? null,
  };
}

/** The ladder's result as a row holds it, for an amendment to build on. */
function _getCaptureFromRow(
  row: Readonly<UploadFileRow>,
): CaptureDateResult | null {
  const captureSource = CAPTURE_SOURCES.find((source) => {
    return source === row.capture_source;
  });
  if (
    row.captured_at === null ||
    row.capture_date === null ||
    captureSource === undefined
  ) {
    return null;
  }
  return {
    capturedAt: row.captured_at,
    captureDate: row.capture_date,
    captureOffsetMinutes: row.capture_offset_minutes,
    captureSource,
  };
}

/**
 * What the file said (`declared`, frozen into `original_captured_at`), and the
 * date the row carries (`current`), which is the uploader's when the entry
 * already amends it.
 */
function _getDeclaredCapture(options: {
  context: PlanContext;
  entry: Readonly<ManifestEntry>;
}): { declared: CaptureDateResult; current: CaptureDateResult } {
  const { context, entry } = options;
  // Rung 6 is the declaration time, not the commit time (design decision
  // 12): the ladder runs now and the column freezes now.
  const declared = getCaptureDateFromEvidence({
    evidence: entry.capture,
    originalFilename: entry.originalFilename,
    timezone: context.timezone,
    declaredAt: context.now,
  });
  const capturedAt = entry.capturedAt ?? null;
  return {
    declared,
    current:
      capturedAt === null
        ? declared
        : getCaptureDateFromUploaderDate({
            capturedAt,
            previous: declared,
            timezone: context.timezone,
          }),
  };
}

/** The row a new entry becomes: `waiting` with its ladder, or `refused`. */
function _makeNewFileRow(options: {
  context: PlanContext;
  entry: Readonly<ManifestEntry>;
  position: number;
}): UploadFileRow {
  const { context, entry } = options;
  const refusal = _getRefusalCode(entry);
  // A refused file is never an item, so it gets no kind and no date: either
  // would be a fact the server does not have.
  const capture =
    refusal === null ? _getDeclaredCapture({ context, entry }) : null;
  return {
    id: createId(),
    upload_session_id: context.session.id,
    item_id: null,
    position: options.position,
    original_filename: entry.originalFilename,
    declared_content_type: entry.declaredContentType,
    declared_bytes: entry.declaredBytes,
    content_hash: entry.contentHash ?? null,
    kind:
      refusal === null
        ? _getKindFromContentType(entry.declaredContentType)
        : null,
    storage_key: null,
    state: refusal === null ? "waiting" : "refused",
    attempt_count: 0,
    presigned_until: null,
    multipart_upload_id: null,
    problem_code: refusal,
    problem_detail: refusal === null ? null : REFUSAL_DETAILS[refusal],
    captured_at: capture?.current.capturedAt ?? null,
    capture_date: capture?.current.captureDate ?? null,
    capture_offset_minutes: capture?.current.captureOffsetMinutes ?? null,
    capture_source: capture?.current.captureSource ?? null,
    original_captured_at: capture?.declared.capturedAt ?? null,
    width: entry.width ?? null,
    height: entry.height ?? null,
    duration_ms: entry.durationMs ?? null,
    created_at: context.now,
    updated_at: context.now,
  };
}

/**
 * The row a declared entry is, if the session already holds it: by hash
 * first, then by name and size against a row that has never sent a byte and
 * that no other entry in this request has claimed.
 */
function _findExistingRow(options: {
  candidates: ManifestCandidates;
  claimedRowIds: ReadonlySet<string>;
  entry: Readonly<ManifestEntry>;
}): UploadFileRow | undefined {
  const { candidates, entry } = options;
  const contentHash = entry.contentHash ?? null;
  const byHash =
    contentHash === null ? undefined : candidates.rowsByHash.get(contentHash);
  if (byHash !== undefined) {
    return byHash;
  }
  return candidates.unhashedRows.find((row) => {
    return (
      !options.claimedRowIds.has(row.id) &&
      row.original_filename === entry.originalFilename &&
      row.declared_bytes === entry.declaredBytes
    );
  });
}

/**
 * An entry that names its row by id: a re-declaration, or an amendment.
 *
 * Returns null for a conflict. An amendment touches only a `waiting` row: a
 * row in flight or finished has a date the transfer is already carrying.
 */
function _planAddressedEntry(options: {
  context: PlanContext;
  plan: ManifestPlan;
  entry: Readonly<ManifestEntry>;
  fileId: string;
}): ManifestOutcome | null {
  const { context, plan, entry } = options;
  const row = context.candidates.rowsById.get(options.fileId);
  if (row === undefined) {
    throw ApiError.notFound("upload_file_not_found");
  }
  plan.claimedRowIds.add(row.id);
  const capturedAt = entry.capturedAt ?? null;
  if (capturedAt === null) {
    return _makeOutcomeFromRow({
      clientRef: entry.clientRef,
      row,
      disposition: _getDispositionFromRow(row),
    });
  }
  if (row.state !== "waiting") {
    return null;
  }
  const capture = getCaptureDateFromUploaderDate({
    capturedAt,
    previous: _getCaptureFromRow(row),
    timezone: context.timezone,
  });
  plan.amendments.set(row.id, capture);
  return {
    ..._makeOutcomeFromRow({
      clientRef: entry.clientRef,
      row,
      disposition: "amended",
    }),
    capturedOn: capture.captureDate,
    captureSource: capture.captureSource,
  };
}

/**
 * An entry with no id: a match, or a new row. Returns null for a conflict,
 * which after commit is any file the batch did not already hold.
 */
function _planDeclaration(options: {
  context: PlanContext;
  plan: ManifestPlan;
  entry: Readonly<ManifestEntry>;
}): ManifestOutcome | null {
  const { context, plan, entry } = options;
  const existing = _findExistingRow({
    candidates: context.candidates,
    claimedRowIds: plan.claimedRowIds,
    entry,
  });
  if (existing !== undefined) {
    plan.claimedRowIds.add(existing.id);
    return _makeOutcomeFromRow({
      clientRef: entry.clientRef,
      row: existing,
      disposition: _getDispositionFromRow(existing),
    });
  }
  // `file_count` and `total_bytes` are what the batch committed to, so a file
  // that matches nothing after commit belongs to a new session.
  if (context.session.committed_at !== null) {
    return null;
  }
  const row = _makeNewFileRow({ context, entry, position: plan.nextPosition });
  plan.nextPosition += 1;
  plan.insertedRows.push(row);
  return _makeOutcomeFromRow({
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
  const identity = _getEntryIdentity(entry);
  const earlier = plan.outcomeByIdentity.get(identity);
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
  const fileId = entry.fileId ?? null;
  const outcome =
    fileId === null
      ? _planDeclaration(options)
      : _planAddressedEntry({ ...options, fileId });
  if (outcome === null) {
    plan.conflictingClientRefs.push(entry.clientRef);
    return;
  }
  plan.outcomeByIdentity.set(identity, outcome);
  plan.outcomes.push(outcome);
}

/** Every entry, in order, against what the session already holds. Pure. */
function _planManifest(options: {
  context: PlanContext;
  entries: readonly ManifestEntry[];
  firstPosition: number;
}): ManifestPlan {
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

/** The values one request is probed by: its hashes, its ids, its names. */
function _getProbeValues(entries: readonly ManifestEntry[]): {
  hashes: string[];
  fileIds: string[];
  filenames: string[];
} {
  return {
    hashes: entries.flatMap((entry) => {
      const contentHash = entry.contentHash ?? null;
      return contentHash === null ? [] : [contentHash];
    }),
    fileIds: entries.flatMap((entry) => {
      const fileId = entry.fileId ?? null;
      return fileId === null ? [] : [fileId];
    }),
    filenames: entries.map((entry) => {
      return entry.originalFilename;
    }),
  };
}

/**
 * The rows this request can match, in three batched probes: by hash on the
 * partial unique index, by id, and by name among the unsent rows with no
 * hash. Never one probe per entry.
 */
async function _readCandidates(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
  entries: readonly ManifestEntry[];
}): Promise<ManifestCandidates> {
  const { hashes, fileIds, filenames } = _getProbeValues(options.entries);
  const query = options.transaction
    .selectFrom("upload_files")
    .selectAll()
    .where("upload_session_id", "=", options.sessionId);

  const [hashed, addressed, unhashed] = await Promise.all([
    hashes.length === 0
      ? []
      : query.where("content_hash", "in", hashes).execute(),
    fileIds.length === 0 ? [] : query.where("id", "in", fileIds).execute(),
    filenames.length === 0
      ? []
      : query
          .where("content_hash", "is", null)
          .where("state", "in", [...UNSENT_FILE_STATES])
          .where("original_filename", "in", filenames)
          .execute(),
  ]);

  return {
    rowsByHash: new Map(
      hashed.flatMap((row) => {
        return row.content_hash === null
          ? []
          : [[row.content_hash, row] as const];
      }),
    ),
    rowsById: new Map(
      addressed.map((row) => {
        return [row.id, row] as const;
      }),
    ),
    unhashedRows: unhashed,
  };
}

/** The next free ordinal on `UNIQUE (upload_session_id, position)`. 1-based. */
async function _readNextPosition(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
}): Promise<number> {
  const row = await options.transaction
    .selectFrom("upload_files")
    .select(sql<number | null>`MAX(position)`.as("lastPosition"))
    .where("upload_session_id", "=", options.sessionId)
    .executeTakeFirst();
  return (row?.lastPosition ?? 0) + 1;
}

/**
 * Every amendment in one statement.
 *
 * `original_captured_at` is not in the column list and cannot be: it froze
 * when the ladder first ran, which is what keeps "revert to what the file
 * said" reverting to the file rather than to what a person typed. The
 * `state = 'waiting'` clause repeats the planner's rule where the write is.
 */
async function _writeAmendments(options: {
  transaction: DatabaseExecutor;
  amendments: ReadonlyMap<string, CaptureDateResult>;
  now: string;
}): Promise<void> {
  if (options.amendments.size === 0) {
    return;
  }
  const rows = sql.join(
    [...options.amendments].map(([fileId, capture]) => {
      return sql`(${fileId}, ${capture.capturedAt}, ${capture.captureDate}, ${capture.captureOffsetMinutes}, ${capture.captureSource})`;
    }),
  );
  await sql`
    WITH amended (id, captured_at, capture_date, capture_offset_minutes, capture_source)
      AS (VALUES ${rows})
    UPDATE upload_files
       SET captured_at = amended.captured_at,
           capture_date = amended.capture_date,
           capture_offset_minutes = amended.capture_offset_minutes,
           capture_source = amended.capture_source,
           updated_at = ${options.now}
      FROM amended
     WHERE upload_files.id = amended.id
       AND upload_files.state = 'waiting'
  `.execute(options.transaction);
}

/** The manifest's own figures: every row counted, refused bytes not summed. */
async function _readManifestTotals(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
}): Promise<{ fileCount: number; totalBytes: number }> {
  const row = await options.transaction
    .selectFrom("upload_files")
    .select([
      sql<number>`COUNT(*)`.as("fileCount"),
      sql<number>`COALESCE(SUM(CASE WHEN state <> 'refused' THEN declared_bytes ELSE 0 END), 0)`.as(
        "totalBytes",
      ),
    ])
    .where("upload_session_id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  return { fileCount: row.fileCount, totalBytes: row.totalBytes };
}

/**
 * The plan's writes: one multi-row insert of the new rows, one multi-row
 * update of the amended ones, and the session's `last_activity_at`.
 */
async function _writePlan(options: {
  transaction: DatabaseExecutor;
  plan: ManifestPlan;
  sessionId: string;
  now: string;
}): Promise<void> {
  const { transaction, plan, now } = options;
  if (plan.insertedRows.length > 0) {
    await transaction
      .insertInto("upload_files")
      .values(plan.insertedRows)
      .execute();
  }
  await _writeAmendments({ transaction, amendments: plan.amendments, now });
  await transaction
    .updateTable("upload_sessions")
    .set({ last_activity_at: now })
    .where("id", "=", options.sessionId)
    .execute();
}

/**
 * Reconciles one request's entries against a session's manifest.
 *
 * **Additive, idempotent and never destructive.** A row the request does not
 * name is not read for writing, let alone changed, and sending the same body
 * twice changes nothing the second time. Matching runs in `upload.md`'s
 * order: by `content_hash` in this session (a `done` row is `already_done`,
 * anything else `matched`), then by name and declared bytes against an unsent
 * row with no hash, or directly by `fileId` for an amendment. **Names are
 * never identity**, which is the whole of the resume promise.
 *
 * **One multi-row insert and one multi-row update per request**, whatever
 * its size, plus three batched probes, the next position, the session's
 * `last_activity_at` and the totals. SQLite has one writer, so the batching
 * matters more than the probe count.
 *
 * **All or nothing.** After commit, any entry that matches nothing, or that
 * amends a row that is not `waiting`, fails the whole request with `409
 * upload_manifest_conflict` and every such `clientRef` in `details`, and
 * nothing is written. An id that is not in this session is the byte-identical
 * `404 upload_file_not_found`.
 *
 * @param options.transaction The route's `BEGIN IMMEDIATE` transaction.
 * @param options.session The session, read inside that transaction.
 * @param options.entries The request's entries, at most 500.
 * @param options.timezone `shoebox.timezone`, where offset-less dates resolve.
 * @param options.now The request's instant, and rung 6 of the ladder.
 */
export async function reconcileManifest(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  entries: readonly ManifestEntry[];
  timezone: string;
  now: string;
}): Promise<PutUploadManifestResponse> {
  const { transaction, session, now } = options;
  if (session.state === "settled" || session.state === "cancelled") {
    throw ApiError.conflict("upload_session_conflict");
  }

  const [candidates, firstPosition] = await Promise.all([
    _readCandidates({
      transaction,
      sessionId: session.id,
      entries: options.entries,
    }),
    _readNextPosition({ transaction, sessionId: session.id }),
  ]);
  const plan = _planManifest({
    context: { session, candidates, timezone: options.timezone, now },
    entries: options.entries,
    firstPosition,
  });
  if (plan.conflictingClientRefs.length > 0) {
    throw ApiError.conflict("upload_manifest_conflict", {
      clientRefs: plan.conflictingClientRefs,
    });
  }

  await _writePlan({ transaction, plan, sessionId: session.id, now });
  const totals = await _readManifestTotals({
    transaction,
    sessionId: session.id,
  });
  return { sessionId: session.id, ...totals, outcomes: plan.outcomes };
}
