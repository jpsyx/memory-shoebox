import type {
  PendingEdit,
  LabelledPersonEdit,
  MakeNewPeopleOptions,
  GetPersonIdByNameOptions,
  GetPersonIdsByEditIdOptions,
} from "./ingestUploadFile.types.ts";
import { makeNormalisedNameFromName } from "../../archive/makeNormalisedNameFromName.ts";

import { createId } from "../../db/createId.ts";

import type { PeopleTable } from "../../db/types/catalog.types.ts";

import type { DatabaseExecutor } from "../../db/types/db.types.ts";

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
      : [
          {
            editId: row.editId,
            label: row.label,
            personId: row.personId ?? undefined,
          },
        ];
  });
}

/**
 * One new `people` row per typed name this file needs and the batch has not
 * resolved yet. A name only another file's edits carry gets none here: that
 * file makes it if it ever lands, so a refused, failed or cancelled file
 * leaves nobody behind (`upload.md` § The asymmetry).
 */
function _makeNewPeople(
  options: Readonly<
    Omit<MakeNewPeopleOptions, "labelled" | "neededNames" | "personIdByName">
  > &
    Readonly<{
      labelled: readonly LabelledPersonEdit[];
      neededNames: ReadonlySet<string>;
      personIdByName: ReadonlyMap<string, string>;
    }>,
): PeopleTable[] {
  const byName = new Map<string, PeopleTable>();
  options.labelled.forEach((edit) => {
    const name = makeNormalisedNameFromName(edit.label);
    if (
      options.neededNames.has(name) &&
      !options.personIdByName.has(name) &&
      !byName.has(name)
    ) {
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

/**
 * Writes each typed name's person onto every edit of the batch that typed
 * it.
 */
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
      if (edit.personId === undefined && personId !== undefined) {
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
 * Every name typed in this batch that has a person, to that person: the ones
 * an earlier ingest already resolved, and one new `people` row for each name
 * this file needs that is not yet met.
 */
async function _getPersonIdByName(
  options: Readonly<
    Omit<GetPersonIdByNameOptions, "labelled" | "neededNames">
  > &
    Readonly<{
      labelled: readonly LabelledPersonEdit[];
      neededNames: ReadonlySet<string>;
    }>,
): Promise<Map<string, string>> {
  const personIdByName = new Map(
    options.labelled.flatMap((edit) => {
      return edit.personId === undefined
        ? []
        : [[makeNormalisedNameFromName(edit.label), edit.personId] as const];
    }),
  );
  const newPeople = _makeNewPeople({
    labelled: options.labelled,
    neededNames: options.neededNames,
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
 * file's edits still needs a person, which after the batch's first ingest of
 * that name none does. The read is batch-wide, so a name an earlier file
 * resolved is reused and its id is written back to every edit that typed it;
 * only the names on this file's own edits can make a new person.
 */
export async function getPersonIdsByEditIdFromPendingEdits(
  options: Readonly<Omit<GetPersonIdsByEditIdOptions, "edits">> &
    Readonly<{ edits: readonly PendingEdit[] }>,
): Promise<Map<string, string>> {
  const { transaction } = options;
  const neededEditIds = new Set(
    options.edits.flatMap((edit) => {
      return edit.kind === "person" && edit.personId === undefined
        ? [edit.editId]
        : [];
    }),
  );
  if (neededEditIds.size === 0) {
    return new Map();
  }
  const labelled = await _readLabelledPersonEdits({
    transaction,
    sessionId: options.session.id,
  });
  const neededNames = new Set(
    labelled.flatMap((edit) => {
      return neededEditIds.has(edit.editId)
        ? [makeNormalisedNameFromName(edit.label)]
        : [];
    }),
  );
  const personIdByName = await _getPersonIdByName({
    transaction,
    session: options.session,
    labelled,
    neededNames,
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
