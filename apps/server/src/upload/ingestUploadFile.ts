import { sql } from "kysely";
import type { RenditionPurpose } from "@memory-shoebox/shared";
import { makeNormalisedNameFromName } from "../archive/makeNormalisedNameFromName.ts";
import { createId } from "../db/createId.ts";
import type { PeopleTable } from "../db/types/catalog.types.ts";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import { getTagIdsFromNames } from "../items/setItemTags.ts";
import type { UploadFileRow, UploadSessionRow } from "./uploadSessionAccess.ts";

/**
 * One object Backblaze confirmed, as the `item_renditions` row it becomes.
 * A key, never a URL: a URL is a short-lived signed thing minted at render.
 */
export type IngestRendition = {
  purpose: RenditionPurpose;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
};

/** The intrinsic facts `complete` reported, post-orientation. */
export type IngestDimensions = {
  width: number;
  height: number;
  durationMs: number | null;
};

/** One live edit that targets the file being ingested. */
type PendingEdit = {
  editId: string;
  kind: string;
  tagId: string | null;
  personId: string | null;
  milestoneId: string | null;
  labelSnapshot: string | null;
};

/** A person edit of this batch that came with a typed name. */
type LabelledPersonEdit = {
  editId: string;
  label: string;
  personId: string | null;
};

/**
 * The ladder's result as the row holds it. Every row the manifest accepted
 * got one, so a missing date here is a broken invariant, not a user error.
 */
function _getIngestCapture(file: Readonly<UploadFileRow>): {
  capturedAt: string;
  captureDate: string;
  captureSource: string;
} {
  if (
    file.captured_at === null ||
    file.capture_date === null ||
    file.capture_source === null
  ) {
    throw new Error(
      `upload file ${file.id} reached ingest with no capture date`,
    );
  }
  return {
    capturedAt: file.captured_at,
    captureDate: file.capture_date,
    captureSource: file.capture_source,
  };
}

/** The `items` row, exactly as `upload.md` § Ingest step 1 lists it. */
async function _insertItem(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  file: UploadFileRow;
  dimensions: IngestDimensions;
  now: string;
}): Promise<string> {
  const { file, session } = options;
  const capture = _getIngestCapture(file);
  const itemId = createId();
  await options.transaction
    .insertInto("items")
    .values({
      id: itemId,
      // Decided at the manifest from the declared type, which presign then
      // signed into the PUT, so Backblaze cannot hold any other.
      kind: file.kind === "video" ? "video" : "photo",
      captured_at: capture.capturedAt,
      captured_at_offset_minutes: file.capture_offset_minutes,
      captured_on: capture.captureDate,
      capture_source: capture.captureSource,
      original_captured_at: file.original_captured_at ?? capture.capturedAt,
      // MAX + 1 on `UNIQUE (seq)` is one index lookup, and the caller's
      // `BEGIN IMMEDIATE` means no second writer can take the same number.
      seq: sql<number>`(SELECT COALESCE(MAX(seq), 0) + 1 FROM items)`,
      uploaded_by: session.uploaded_by,
      upload_session_id: session.id,
      // Copied, never referenced through the session.
      visibility_rule_id: session.visibility_rule_id,
      burst_id: null,
      burst_index: null,
      width: options.dimensions.width,
      height: options.dimensions.height,
      duration_ms: options.dimensions.durationMs,
      byte_size: file.declared_bytes,
      content_type: file.declared_content_type,
      checksum: file.content_hash,
      original_filename: file.original_filename,
      // Composed at render from the people and the date (Decision 9).
      alt_text: null,
      created_at: options.now,
    })
    .execute();
  return itemId;
}

/** One row per purpose that landed, `original` at minimum. */
async function _insertRenditions(options: {
  transaction: DatabaseExecutor;
  itemId: string;
  renditions: readonly IngestRendition[];
}): Promise<void> {
  await options.transaction
    .insertInto("item_renditions")
    .values(
      options.renditions.map((rendition) => {
        return {
          id: createId(),
          item_id: options.itemId,
          purpose: rendition.purpose,
          storage_key: rendition.storageKey,
          content_type: rendition.contentType,
          byte_size: rendition.byteSize,
          width: rendition.width,
          height: rendition.height,
        };
      }),
    )
    .execute();
}

/**
 * The live edits that target this file, driving from the targets table,
 * which is indexed on the file precisely because ingest runs this way round.
 */
async function _readPendingEdits(options: {
  transaction: DatabaseExecutor;
  fileId: string;
}): Promise<PendingEdit[]> {
  return options.transaction
    .selectFrom("upload_batch_edit_targets")
    .innerJoin(
      "upload_batch_edits",
      "upload_batch_edits.id",
      "upload_batch_edit_targets.upload_batch_edit_id",
    )
    .select([
      "upload_batch_edits.id as editId",
      "upload_batch_edits.kind as kind",
      "upload_batch_edits.tag_id as tagId",
      "upload_batch_edits.person_id as personId",
      "upload_batch_edits.milestone_id as milestoneId",
      "upload_batch_edits.label_snapshot as labelSnapshot",
    ])
    .where("upload_batch_edit_targets.upload_file_id", "=", options.fileId)
    .where("upload_batch_edits.undone_at", "is", null)
    .orderBy("upload_batch_edits.created_at", "asc")
    .orderBy("upload_batch_edits.id", "asc")
    .execute();
}

/**
 * The tag each typed tag edit names, through the shared find-or-create, with
 * the id written back so the next file's ingest finds it on the edit.
 */
async function _getTagIdsByEditId(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  edits: readonly PendingEdit[];
  now: string;
}): Promise<Map<string, string>> {
  const typed = options.edits.flatMap((edit) => {
    return edit.kind === "tag" &&
      edit.tagId === null &&
      edit.labelSnapshot !== null
      ? [{ editId: edit.editId, label: edit.labelSnapshot }]
      : [];
  });
  if (typed.length === 0) {
    return new Map();
  }
  const tagIdByName = await getTagIdsFromNames({
    transaction: options.transaction,
    names: typed.map((edit) => {
      return edit.label;
    }),
    memberId: options.session.uploaded_by,
    now: options.now,
  });
  const tagIdByEditId = new Map(
    typed.flatMap((edit) => {
      const tagId = tagIdByName.get(makeNormalisedNameFromName(edit.label));
      return tagId === undefined ? [] : [[edit.editId, tagId] as const];
    }),
  );
  await Promise.all(
    [...tagIdByEditId].map(([editId, tagId]) => {
      return options.transaction
        .updateTable("upload_batch_edits")
        .set({ tag_id: tagId })
        .where("id", "=", editId)
        .where("tag_id", "is", null)
        .execute();
    }),
  );
  return tagIdByEditId;
}

/** Every person edit of this batch that typed a name, resolved or not yet. */
async function _readLabelledPersonEdits(options: {
  transaction: DatabaseExecutor;
  sessionId: string;
}): Promise<LabelledPersonEdit[]> {
  const rows = await options.transaction
    .selectFrom("upload_batch_edits")
    .select([
      "upload_batch_edits.id as editId",
      "upload_batch_edits.label_snapshot as label",
      "upload_batch_edits.person_id as personId",
    ])
    .where("upload_batch_edits.upload_session_id", "=", options.sessionId)
    .where("upload_batch_edits.kind", "=", "person")
    .where("upload_batch_edits.label_snapshot", "is not", null)
    .where("upload_batch_edits.undone_at", "is", null)
    // Oldest first, so a name typed twice keeps the spelling typed first.
    .orderBy("upload_batch_edits.created_at", "asc")
    .orderBy("upload_batch_edits.id", "asc")
    .execute();
  return rows.flatMap((row) => {
    return row.label === null
      ? []
      : [{ editId: row.editId, label: row.label, personId: row.personId }];
  });
}

/** One new `people` row per typed name this batch has not resolved yet. */
function _makeNewPeople(options: {
  labelled: readonly LabelledPersonEdit[];
  personIdByName: ReadonlyMap<string, string>;
  createdBy: string;
  now: string;
}): PeopleTable[] {
  const byName = new Map<string, PeopleTable>();
  options.labelled.forEach((edit) => {
    const name = makeNormalisedNameFromName(edit.label);
    if (!options.personIdByName.has(name) && !byName.has(name)) {
      byName.set(name, {
        id: createId(),
        display_name: edit.label,
        member_id: null,
        preferred_face_item_id: null,
        created_by: options.createdBy,
        created_at: options.now,
      });
    }
  });
  return [...byName.values()];
}

/** Writes each typed name's person onto every edit of the batch that typed it. */
async function _writeBackPersonIds(options: {
  transaction: DatabaseExecutor;
  labelled: readonly LabelledPersonEdit[];
  personIdByName: ReadonlyMap<string, string>;
}): Promise<void> {
  const editIdsByPersonId = options.labelled.reduce<Map<string, string[]>>(
    (grouped, edit) => {
      const personId = options.personIdByName.get(
        makeNormalisedNameFromName(edit.label),
      );
      if (edit.personId === null && personId !== undefined) {
        grouped.set(personId, [...(grouped.get(personId) ?? []), edit.editId]);
      }
      return grouped;
    },
    new Map(),
  );
  await Promise.all(
    [...editIdsByPersonId].map(([personId, editIds]) => {
      return options.transaction
        .updateTable("upload_batch_edits")
        .set({ person_id: personId })
        .where("id", "in", editIds)
        .where("person_id", "is", null)
        .execute();
    }),
  );
}

/**
 * Every name typed in this batch, to the person it names: the ones an earlier
 * ingest already created, and one new `people` row for each name not yet met.
 */
async function _getPersonIdByName(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  labelled: readonly LabelledPersonEdit[];
  now: string;
}): Promise<Map<string, string>> {
  const personIdByName = new Map(
    options.labelled.flatMap((edit) => {
      return edit.personId === null
        ? []
        : [[makeNormalisedNameFromName(edit.label), edit.personId] as const];
    }),
  );
  const newPeople = _makeNewPeople({
    labelled: options.labelled,
    personIdByName,
    createdBy: options.session.uploaded_by,
    now: options.now,
  });
  if (newPeople.length > 0) {
    await options.transaction.insertInto("people").values(newPeople).execute();
  }
  newPeople.forEach((person) => {
    personIdByName.set(
      makeNormalisedNameFromName(person.display_name),
      person.id,
    );
  });
  return personIdByName;
}

/**
 * The person each typed person edit names. Read only when one of this
 * file's edits still needs a person, which after the batch's first ingest
 * none does.
 */
async function _getPersonIdsByEditId(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  edits: readonly PendingEdit[];
  now: string;
}): Promise<Map<string, string>> {
  const { transaction } = options;
  const needsPerson = options.edits.some((edit) => {
    return edit.kind === "person" && edit.personId === null;
  });
  if (!needsPerson) {
    return new Map();
  }
  const labelled = await _readLabelledPersonEdits({
    transaction,
    sessionId: options.session.id,
  });
  const personIdByName = await _getPersonIdByName({
    transaction,
    session: options.session,
    labelled,
    now: options.now,
  });
  await _writeBackPersonIds({ transaction, labelled, personIdByName });
  return new Map(
    labelled.flatMap((edit) => {
      const personId = personIdByName.get(
        makeNormalisedNameFromName(edit.label),
      );
      return personId === undefined ? [] : [[edit.editId, personId] as const];
    }),
  );
}

/** The distinct ids among the values, nulls and gaps dropped. */
function _getUniqueIds(
  values: ReadonlyArray<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        return value === null || value === undefined ? [] : [value];
      }),
    ),
  ];
}

/** One new item's links, and who made them when. */
type ItemLinks = {
  transaction: DatabaseExecutor;
  itemId: string;
  memberId: string;
  now: string;
  tagIds: readonly string[];
  personIds: readonly string[];
  milestoneIds: readonly string[];
};

/** `item_tags`, one multi-row insert, idempotent on `(item_id, tag_id)`. */
async function _insertItemTags(links: Readonly<ItemLinks>): Promise<void> {
  if (links.tagIds.length === 0) {
    return;
  }
  await links.transaction
    .insertInto("item_tags")
    .values(
      links.tagIds.map((tagId) => {
        return {
          id: createId(),
          item_id: links.itemId,
          tag_id: tagId,
          tagged_by: links.memberId,
          tagged_at: links.now,
        };
      }),
    )
    .onConflict((conflict) => {
      return conflict.columns(["item_id", "tag_id"]).doNothing();
    })
    .execute();
}

/** `item_people`, the same shape on `(item_id, person_id)`. */
async function _insertItemPeople(links: Readonly<ItemLinks>): Promise<void> {
  if (links.personIds.length === 0) {
    return;
  }
  await links.transaction
    .insertInto("item_people")
    .values(
      links.personIds.map((personId) => {
        return {
          id: createId(),
          item_id: links.itemId,
          person_id: personId,
          tagged_by: links.memberId,
          tagged_at: links.now,
        };
      }),
    )
    .onConflict((conflict) => {
      return conflict.columns(["item_id", "person_id"]).doNothing();
    })
    .execute();
}

/** `item_milestones`, the same shape on `(item_id, milestone_id)`. */
async function _insertItemMilestones(
  links: Readonly<ItemLinks>,
): Promise<void> {
  if (links.milestoneIds.length === 0) {
    return;
  }
  await links.transaction
    .insertInto("item_milestones")
    .values(
      links.milestoneIds.map((milestoneId) => {
        return {
          id: createId(),
          item_id: links.itemId,
          milestone_id: milestoneId,
          attached_by: links.memberId,
          attached_at: links.now,
          span_mismatch_acknowledged_at: null,
        };
      }),
    )
    .onConflict((conflict) => {
      return conflict.columns(["item_id", "milestone_id"]).doNothing();
    })
    .execute();
}

/** The three join tables, each one multi-row insert, idempotent on its unique. */
async function _insertItemLinks(links: Readonly<ItemLinks>): Promise<void> {
  await _insertItemTags(links);
  await _insertItemPeople(links);
  await _insertItemMilestones(links);
}

/** What this file's edits link the item to, each id once. */
function _getLinkIdsFromEdits(options: {
  edits: readonly PendingEdit[];
  tagIdByEditId: ReadonlyMap<string, string>;
  personIdByEditId: ReadonlyMap<string, string>;
}): { tagIds: string[]; personIds: string[]; milestoneIds: string[] } {
  const { edits } = options;
  return {
    tagIds: _getUniqueIds(
      edits.map((edit) => {
        return edit.kind === "tag"
          ? (edit.tagId ?? options.tagIdByEditId.get(edit.editId))
          : null;
      }),
    ),
    personIds: _getUniqueIds(
      edits.map((edit) => {
        return edit.kind === "person"
          ? (edit.personId ?? options.personIdByEditId.get(edit.editId))
          : null;
      }),
    ),
    milestoneIds: _getUniqueIds(
      edits.map((edit) => {
        return edit.kind === "milestone" ? edit.milestoneId : null;
      }),
    ),
  };
}

/** The edit fan-out: subjects found or created, `applied_at`, the links. */
async function _applyEditPlan(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  fileId: string;
  itemId: string;
  now: string;
}): Promise<void> {
  const { transaction, session, now } = options;
  const edits = await _readPendingEdits({
    transaction,
    fileId: options.fileId,
  });
  if (edits.length === 0) {
    return;
  }
  const tagIdByEditId = await _getTagIdsByEditId({
    transaction,
    session,
    edits,
    now,
  });
  const personIdByEditId = await _getPersonIdsByEditId({
    transaction,
    session,
    edits,
    now,
  });
  const editIds = edits.map((edit) => {
    return edit.editId;
  });
  await transaction
    .updateTable("upload_batch_edits")
    .set({ applied_at: now })
    .where("id", "in", editIds)
    .where("applied_at", "is", null)
    .execute();
  await _insertItemLinks({
    transaction,
    itemId: options.itemId,
    memberId: session.uploaded_by,
    now,
    ..._getLinkIdsFromEdits({ edits, tagIdByEditId, personIdByEditId }),
  });
}

/**
 * Turns one verified file into an item, inside the caller's transaction.
 *
 * In order: the `items` row (kind, the ladder's date, the frozen original,
 * `seq`, the copied visibility rule, the post-orientation dimensions, the
 * declared size and type, the hash as `checksum`), one `item_renditions`
 * row per verified purpose, `upload_files.item_id`, then the edit fan-out
 * for every live edit targeting this file. **It calls no Backblaze
 * operation**: everything it needs was verified before the transaction
 * opened (design decision 2). Because the plan froze at commit, every file of
 * a batch ingests under the same one.
 *
 * @param options.transaction The `complete` route's `BEGIN IMMEDIATE`
 *   transaction.
 * @param options.session The file's session.
 * @param options.file The file row, read inside that transaction.
 * @param options.dimensions What `complete` reported, post-orientation.
 * @param options.renditions What Backblaze confirmed, original included.
 * @param options.now The landing instant.
 * @returns The new item's id.
 */
export async function ingestUploadFile(options: {
  transaction: DatabaseExecutor;
  session: UploadSessionRow;
  file: UploadFileRow;
  dimensions: IngestDimensions;
  renditions: readonly IngestRendition[];
  now: string;
}): Promise<{ itemId: string }> {
  const { transaction, file, now } = options;
  const itemId = await _insertItem(options);
  await _insertRenditions({
    transaction,
    itemId,
    renditions: options.renditions,
  });
  await transaction
    .updateTable("upload_files")
    .set({ item_id: itemId, updated_at: now })
    .where("id", "=", file.id)
    .execute();
  await _applyEditPlan({
    transaction,
    session: options.session,
    fileId: file.id,
    itemId,
    now,
  });
  return { itemId };
}
