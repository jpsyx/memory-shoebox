import type { CreateUploadEditRequest } from "@memory-shoebox/shared";
import { createId } from "../db/createId.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { ApiError } from "../http/ApiError.ts";
import type { UploadSessionRow } from "./uploadSessionAccessHelpers.ts";

/** Inputs for insertUploadEdit. */
type InsertUploadEditOptions = {
  transaction: DatabaseExecutor;
  sessionId: string;
  subject: UploadEditSubject;
  targetFileIds: string[];
  createdBy: string;
  now: string;
};

/** Inputs for undoUploadEdit. */
type UndoUploadEditOptions = {
  transaction: DatabaseExecutor;
  sessionId: string;
  editId: string;
  now: string;
};

/**
 * What one bulk action names, once the request's either-or rules hold.
 *
 * A union rather than the request's four optional fields, so the insert
 * cannot put a `tag_id` on a person edit or a typed name on a milestone.
 */
export type UploadEditSubject =
  | {
      kind: "tag";
      tagId: string | undefined;
      labelSnapshot: string | undefined;
    }
  | {
      kind: "person";
      personId: string | undefined;
      labelSnapshot: string | undefined;
    }
  | { kind: "milestone"; milestoneId: string };

/**
 * The name as typed, trimmed, or undefined when none was sent. Blank is
 * refused.
 */
function _getTypedLabel(labelSnapshot: string | undefined): string | undefined {
  if (labelSnapshot === undefined || labelSnapshot === null) {
    return undefined;
  }
  const trimmed = labelSnapshot.trim();
  if (trimmed === "") {
    throw ApiError.invalidRequest({
      labelSnapshot: ["A new name cannot be blank."],
    });
  }
  return trimmed;
}

/**
 * A milestone edit: chosen by id, never typed (`upload.md` § The asymmetry).
 */
function _makeMilestoneSubject(options: {
  milestoneId: string | undefined;
  labelSnapshot: string | undefined;
}): UploadEditSubject {
  if (options.labelSnapshot !== undefined) {
    throw ApiError.invalidRequest({
      labelSnapshot: ["A milestone is chosen, never typed. Create it first."],
    });
  }
  if (options.milestoneId === undefined) {
    throw ApiError.invalidRequest({ milestoneId: ["Choose the milestone."] });
  }
  return { kind: "milestone", milestoneId: options.milestoneId };
}

/**
 * The subject a bulk action names, from the flat request body.
 *
 * A tag or a person is **exactly one** of an id from the picker or a name as
 * typed: both is ambiguous, neither names nothing. A milestone is always an id
 * whose row is created by `POST /api/milestones`; upload edits never accept a
 * typed milestone name.
 *
 * @param request The parsed `POST .../edits` body.
 */
export function makeUploadEditSubjectFromRequest(
  request: Readonly<CreateUploadEditRequest>,
): UploadEditSubject {
  const labelSnapshot = _getTypedLabel(request.labelSnapshot ?? undefined);
  if (request.kind === "milestone") {
    return _makeMilestoneSubject({
      milestoneId: request.milestoneId ?? undefined,
      labelSnapshot,
    });
  }
  const chosenId =
    (request.kind === "tag" ? request.tagId : request.personId) ?? undefined;
  if ((chosenId === undefined) === (labelSnapshot === undefined)) {
    throw ApiError.invalidRequest({
      [request.kind === "tag" ? "tagId" : "personId"]: [
        "Choose one from the list or type a new name, not both.",
      ],
    });
  }
  return request.kind === "tag"
    ? { kind: "tag", tagId: chosenId ?? undefined, labelSnapshot }
    : { kind: "person", personId: chosenId ?? undefined, labelSnapshot };
}

/**
 * Refuses a write to the plan or the rule once the batch is committed.
 *
 * Commit is when the plan freezes, so every file ingests under the same one,
 * and a cancelled draft has no plan left to change. `409
 * upload_session_conflict` either way.
 *
 * @param session The session, read inside the caller's transaction.
 */
export function assertUploadPlanIsOpen(
  session: Readonly<UploadSessionRow>,
): void {
  if (session.state !== "draft" || session.committed_at !== null) {
    throw ApiError.conflict({ code: "upload_session_conflict" });
  }
}

/**
 * Every target is in this session, or the whole request is one 404.
 *
 * No `details.fileIds`: naming which ids failed would say which of them are
 * somebody else's, so a stranger's file and a nonexistent id answer alike.
 */
async function _assertTargetsInSession(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
  fileIds: readonly string[];
}): Promise<void> {
  if (options.fileIds.length === 0) {
    throw ApiError.invalidRequest({ targetFileIds: ["Choose at least one."] });
  }
  const rows = await options.transaction
    .selectFrom("upload_files")
    .select("upload_files.id as fileId")
    .where("upload_files.upload_session_id", "=", options.sessionId)
    .where("upload_files.id", "in", [...options.fileIds])
    .execute();
  if (rows.length !== options.fileIds.length) {
    throw ApiError.notFound("upload_file_not_found");
  }
}

/**
 * Checks that the subject id names an existing row. A missing milestone is 404;
 * a missing tag or person is a request-field error and is 400.
 */
async function _assertSubjectExists(options: {
  transaction: DatabaseExecutor;
  subject: UploadEditSubject;
}): Promise<void> {
  const { transaction, subject } = options;
  if (subject.kind === "milestone") {
    const milestone = await transaction
      .selectFrom("milestones")
      .select("milestones.id as milestoneId")
      .where("milestones.id", "=", subject.milestoneId)
      .executeTakeFirst();
    if (milestone === undefined) {
      throw ApiError.notFound("milestone_not_found");
    }
    return;
  }
  if (subject.kind === "tag" && subject.tagId !== undefined) {
    const tag = await transaction
      .selectFrom("tags")
      .select("tags.id as tagId")
      .where("tags.id", "=", subject.tagId)
      .executeTakeFirst();
    if (tag === undefined) {
      throw ApiError.invalidRequest({
        tagId: ["That tag is not in the archive."],
      });
    }
  }
  if (subject.kind === "person" && subject.personId !== undefined) {
    const person = await transaction
      .selectFrom("people")
      .select("people.id as personId")
      .where("people.id", "=", subject.personId)
      .executeTakeFirst();
    if (person === undefined) {
      throw ApiError.invalidRequest({
        personId: ["That person is not in the archive."],
      });
    }
  }
}

/** The edit's targets, as one multi-row insert, never one per file. */
async function _insertEditTargets(options: {
  transaction: DatabaseExecutor;
  editId: string;
  fileIds: readonly string[];
}): Promise<void> {
  await options.transaction
    .insertInto("upload_batch_edit_targets")
    .values(
      options.fileIds.map((fileId) => {
        return {
          id: createId(),
          upload_batch_edit_id: options.editId,
          upload_file_id: fileId,
        };
      }),
    )
    .execute();
}

/**
 * Records a batch edit and its distinct target files, returning its id.
 *
 * **Nothing is written to `tags` or `people`.** A typed name rides in
 * `label_snapshot` until ingest creates its row. The targets are deduplicated
 * first, which is what `UNIQUE (upload_batch_edit_id, upload_file_id)` would
 * otherwise reject a double-submitted selection with.
 *
 * @param options.transaction The route's transaction.
 * @param options.sessionId The session the edit belongs to.
 * @param options.subject What the edit names.
 * @param options.targetFileIds The files it applies to, all in this session.
 * @param options.createdBy The uploader.
 * @param options.now The instant the row carries.
 * @returns The new edit's id.
 */
export async function insertUploadEdit(
  options: Readonly<Omit<InsertUploadEditOptions, "targetFileIds">> &
    Readonly<{ targetFileIds: readonly string[] }>,
): Promise<string> {
  // One bulk action: one `upload_batch_edits` row and one multi-row insert of
  // its targets, never a statement per file.

  const { transaction, subject } = options;
  const fileIds = [...new Set(options.targetFileIds)];
  await _assertTargetsInSession({
    transaction,
    sessionId: options.sessionId,
    fileIds,
  });
  await _assertSubjectExists({ transaction, subject });

  const editId = createId();
  await transaction
    .insertInto("upload_batch_edits")
    .values({
      id: editId,
      upload_session_id: options.sessionId,
      kind: subject.kind,
      tag_id: subject.kind === "tag" ? (subject.tagId ?? null) : null,
      person_id: subject.kind === "person" ? (subject.personId ?? null) : null,
      milestone_id: subject.kind === "milestone" ? subject.milestoneId : null,
      label_snapshot:
        subject.kind === "milestone" ? null : (subject.labelSnapshot ?? null),
      created_by: options.createdBy,
      created_at: options.now,
      undone_at: null,
      applied_at: null,
    })
    .execute();
  await _insertEditTargets({ transaction, editId, fileIds });
  return editId;
}

/**
 * Undo: sets `undone_at`, and the row and its targets stay, so the record of
 * what was undone survives. Ingest skips any edit carrying it.
 *
 * @param options.transaction The route's transaction.
 * @param options.sessionId The session the edit must belong to.
 * @param options.editId The edit.
 * @param options.now The instant it was undone.
 */
export async function undoUploadEdit(
  options: Readonly<UndoUploadEditOptions>,
): Promise<void> {
  const edit = await options.transaction
    .selectFrom("upload_batch_edits")
    .select([
      "upload_batch_edits.undone_at as undoneAt",
      "upload_batch_edits.applied_at as appliedAt",
    ])
    .where("upload_batch_edits.id", "=", options.editId)
    .where("upload_batch_edits.upload_session_id", "=", options.sessionId)
    .executeTakeFirst();
  if (edit === undefined) {
    throw ApiError.notFound("upload_edit_not_found");
  }
  if (edit.undoneAt !== null || edit.appliedAt !== null) {
    throw ApiError.conflict({ code: "upload_edit_conflict" });
  }
  await options.transaction
    .updateTable("upload_batch_edits")
    .set({ undone_at: options.now })
    .where("id", "=", options.editId)
    .execute();
}
