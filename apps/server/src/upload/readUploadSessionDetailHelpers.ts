import {
  UPLOAD_LIMITS,
  type UploadFileState,
  type UploadProgress,
  type UploadSessionDetail,
  type UploadSessionSummary,
} from "@memory-shoebox/shared";
import { readMemberRefs } from "../archive/readMemberRefs.ts";
import { readVisibilitySummaries } from "../archive/readVisibilitySummaries.ts";
import type { B2Client } from "../b2/createB2Client/createB2Client.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { readUploadBatchEdits } from "./readUploadBatchEditsHelpers/readUploadBatchEditsHelpers.ts";
import { readUploadDayGroups } from "./readUploadDayGroups.ts";
import {
  readPendingFileRefs,
  readUploadUndatedGroup,
} from "./readUploadFileListsHelpers.ts";
import { readUploadFilePage } from "./readUploadFilePage/readUploadFilePage.ts";
import { type UploadFilePageRequest } from "./readUploadFilePage/readUploadFilePage.types.ts";
import { readUploadMismatchGroups } from "./readUploadMismatchGroups.ts";
import { readUploadOutcomeSummary } from "./readUploadOutcomeSummary.ts";
import type { UploadSessionRow } from "./uploadSessionAccessHelpers.ts";
import { getUploadSessionStateFromStoredValue } from "./uploadStateHelpers.ts";

/** What the composer needs to know. */
type ReadUploadSessionDetailOptions = {
  database: DatabaseExecutor;
  b2: B2Client;
  sessionId: string;
  /** The request's clock, which every signed URL's `expiresAt` counts from. */
  now: Date;
  /** Defaults to the first page of every state. */
  page?: UploadFilePageRequest;
};

/**
 * Returns file counts by state and completed whole-file declared bytes for the
 * session.
 *
 * No cached done_count, failed_count or bytes_transferred columns are needed.
 * doneBytes counts whole done files: the server never observes a partial
 * transfer. Completion responses carry the same progress, avoiding an extra
 * read after each file.
 *
 * @param options.database The Kysely handle, or a transaction.
 * @param options.sessionId The session.
 */
export async function readUploadProgress(
  options: Readonly<{
    database: DatabaseExecutor;
    sessionId: string;
  }>,
): Promise<UploadProgress> {
  // `UploadSessionDetail.progress`: one `GROUP BY state` over the session's
  // files, on `(upload_session_id, state)`.

  const rows = await options.database
    .selectFrom("upload_files")
    .select((eb) => {
      return [
        "upload_files.state as state",
        eb.fn.countAll<number>().as("fileCount"),
        eb.fn.sum<number>("upload_files.declared_bytes").as("declaredBytes"),
      ];
    })
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .groupBy("upload_files.state")
    .execute();
  const byState = new Map(
    rows.map((row) => {
      return [row.state, row];
    }),
  );
  const countOf = (state: UploadFileState): number => {
    return Number(byState.get(state)?.fileCount ?? 0);
  };

  return {
    waitingCount: countOf("waiting"),
    sendingCount: countOf("sending"),
    doneCount: countOf("done"),
    failedCount: countOf("failed"),
    refusedCount: countOf("refused"),
    cancelledCount: countOf("cancelled"),
    doneBytes: Number(byState.get("done")?.declaredBytes ?? 0),
  };
}

/** The session's own columns, its uploader and its rule, as the summary. */
async function _readSessionSummary(options: {
  database: DatabaseExecutor;
  session: Readonly<UploadSessionRow>;
}): Promise<UploadSessionSummary> {
  const { session } = options;
  const [members, visibilities] = await Promise.all([
    readMemberRefs(options.database),
    readVisibilitySummaries({
      database: options.database,
      ruleIds: [session.visibility_rule_id],
    }),
  ]);

  return {
    sessionId: session.id,
    state: getUploadSessionStateFromStoredValue(session.state),
    uploadedBy: members.get(session.uploaded_by) ?? {
      memberId: session.uploaded_by,
      displayName: "",
    },
    visibility: visibilities.get(session.visibility_rule_id) ?? {
      visibilityRuleId: session.visibility_rule_id,
      mode: "everyone",
      label: null,
      subjects: [],
    },
    clientTimezone: session.client_timezone,
    fileCount: session.file_count,
    totalBytes: session.total_bytes,
    createdAt: session.created_at,
    committedAt: session.committed_at,
    settledAt: session.settled_at,
    lastActivityAt: session.last_activity_at,
    notifiedAt: session.notified_at,
    notifiedMemberCount: session.notified_member_count,
  };
}

/** The plan half: days, edits, mismatches, undated and pending. */
async function _readSessionPlan(options: {
  database: DatabaseExecutor;
  session: Readonly<UploadSessionRow>;
}): Promise<
  Pick<
    UploadSessionDetail,
    "days" | "edits" | "mismatches" | "undated" | "pendingFiles"
  >
> {
  const scope = { database: options.database, sessionId: options.session.id };
  const [days, edits, mismatches, undated, pendingFiles] = await Promise.all([
    readUploadDayGroups(scope),
    readUploadBatchEdits({
      ...scope,
      isPlanOpen: options.session.committed_at === null,
    }),
    readUploadMismatchGroups(scope),
    readUploadUndatedGroup(scope),
    readPendingFileRefs(scope),
  ]);
  return { days, edits, mismatches, undated: undated ?? null, pendingFiles };
}

/**
 * The composer behind `GET /api/upload-sessions/:sessionId`,
 * `GET /api/upload-sessions/current` and `POST .../commit`.
 *
 * **A function of the session id alone**, never of the viewer: a session is
 * only ever read by its uploader or an admin, both of whom see all of it, so
 * there is nothing a viewer could change (`upload.md` § GET). The caller
 * resolves the session through `uploadSessionAccess.ts` first; a missing id
 * here is a bug, not a 404, and throws.
 *
 *
 * **It signs URLs.** `presignGet` is local HMAC work and never reaches the
 * network, but it is a B2 client call, so a route that also writes calls
 * this after its transaction has closed.
 *
 * @param options.database The Kysely handle, never a transaction: this signs
 *   URLs, so it runs after any transaction has closed.
 * @param options.b2 The Backblaze client, for signing.
 * @param options.sessionId The session, already resolved for the viewer.
 * @param options.now The request's clock.
 * @param options.page Which page of files; the first of every state if omitted.
 */
export async function readUploadSessionDetail(
  options: Readonly<Omit<ReadUploadSessionDetailOptions, "page">> &
    Readonly<{
      page?: Readonly<UploadFilePageRequest>;
    }>,
): Promise<UploadSessionDetail> {
  // Every part is a batched read keyed by the session id: one aggregate for
  // progress, one for the days plus one per milestone source, two for the edit
  // plan, one for the mismatches, one each for undated and pending, four for
  // the summary once settled, and the page with its one renditions query.

  const session = await options.database
    .selectFrom("upload_sessions")
    .selectAll()
    .where("id", "=", options.sessionId)
    .executeTakeFirstOrThrow();
  const scope = { database: options.database, sessionId: session.id };

  const {
    page = {
      limit: UPLOAD_LIMITS.detailPageDefault,
      cursor: undefined,
      states: undefined,
    } satisfies UploadFilePageRequest,
  } = options;
  const [summary, progress, plan, outcome, filePage] = await Promise.all([
    _readSessionSummary({ database: options.database, session }),
    readUploadProgress(scope),
    _readSessionPlan({ database: options.database, session }),
    session.settled_at === null
      ? Promise.resolve(null)
      : readUploadOutcomeSummary({
          ...scope,
          notifiedMemberCount: session.notified_member_count ?? undefined,
        }),
    readUploadFilePage({
      ...scope,
      b2: options.b2,
      now: options.now,
      page: page,
    }),
  ]);

  return {
    ...summary,
    progress,
    ...plan,
    summary: outcome,
    files: filePage.files,
    nextCursor: filePage.nextCursor ?? null,
  };
}
