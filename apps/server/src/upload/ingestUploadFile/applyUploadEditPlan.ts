import { makeNormalisedNameFromName } from "../../archive/makeNormalisedNameFromName.ts";

import { createId } from "../../db/createId.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

import { getTagIdsFromNames } from "../../items/setItemTags/getTagIdsFromNames.ts";

import { getUploadEditKindFromStoredValue } from "../uploadStateHelpers.ts";

import type {
  PendingEdit,
  GetTagIdsByEditIdOptions,
  ItemLinks,
  ApplyEditPlanOptions,
} from "./ingestUploadFile.types.ts";

import { getPersonIdsByEditIdFromPendingEdits } from "./getPersonIdsByEditIdFromPendingEdits.ts";

/**
 * The live edits that target this file, driving from the targets table,
 * which is indexed on the file precisely because ingest runs this way round.
 */
async function _readPendingEdits(options: {
  transaction: DatabaseExecutor;
  fileId: string;
}): Promise<PendingEdit[]> {
  const rows = await options.transaction
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
  return rows.map((row) => {
    return {
      ...row,
      kind: getUploadEditKindFromStoredValue(row.kind),
      tagId: row.tagId ?? undefined,
      personId: row.personId ?? undefined,
      milestoneId: row.milestoneId ?? undefined,
      labelSnapshot: row.labelSnapshot ?? undefined,
    };
  });
}

/**
 * The tag each typed tag edit names, through the shared find-or-create, with
 * the id written back so the next file's ingest finds it on the edit.
 */
async function _getTagIdsByEditId(
  options: Readonly<Omit<GetTagIdsByEditIdOptions, "edits">> &
    Readonly<{ edits: readonly PendingEdit[] }>,
): Promise<Map<string, string>> {
  const typed = options.edits.flatMap((edit) => {
    return edit.kind === "tag" &&
      edit.tagId === undefined &&
      edit.labelSnapshot !== undefined
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

/** The distinct ids among the values, nulls and gaps dropped. */
function _getUniqueIds(values: ReadonlyArray<string | undefined>): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        return value === undefined ? [] : [value];
      }),
    ),
  ];
}

/** `item_tags`, one multi-row insert, idempotent on `(item_id, tag_id)`. */
async function _insertItemTags(
  links: Readonly<Omit<ItemLinks, "tagIds" | "personIds" | "milestoneIds">> &
    Readonly<{
      tagIds: readonly string[];
      personIds: readonly string[];
      milestoneIds: readonly string[];
    }>,
): Promise<void> {
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
async function _insertItemPeople(
  links: Readonly<Omit<ItemLinks, "tagIds" | "personIds" | "milestoneIds">> &
    Readonly<{
      tagIds: readonly string[];
      personIds: readonly string[];
      milestoneIds: readonly string[];
    }>,
): Promise<void> {
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
  links: Readonly<Omit<ItemLinks, "tagIds" | "personIds" | "milestoneIds">> &
    Readonly<{
      tagIds: readonly string[];
      personIds: readonly string[];
      milestoneIds: readonly string[];
    }>,
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
          : undefined;
      }),
    ),
    personIds: _getUniqueIds(
      edits.map((edit) => {
        return edit.kind === "person"
          ? (edit.personId ?? options.personIdByEditId.get(edit.editId))
          : undefined;
      }),
    ),
    milestoneIds: _getUniqueIds(
      edits.map((edit) => {
        return edit.kind === "milestone" ? edit.milestoneId : undefined;
      }),
    ),
  };
}

/** The edit fan-out: subjects found or created, `applied_at`, the links. */
export async function applyUploadEditPlan(
  options: Readonly<ApplyEditPlanOptions>,
): Promise<void> {
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
  const personIdByEditId = await getPersonIdsByEditIdFromPendingEdits({
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
  const links = {
    transaction,
    itemId: options.itemId,
    memberId: session.uploaded_by,
    now,
    ..._getLinkIdsFromEdits({ edits, tagIdByEditId, personIdByEditId }),
  };
  await _insertItemTags(links);
  await _insertItemPeople(links);
  await _insertItemMilestones(links);
}
