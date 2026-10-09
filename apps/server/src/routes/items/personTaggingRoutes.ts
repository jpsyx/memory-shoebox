import type { DatabaseExecutor } from "../../db/types/db.types.ts";
import type { FastifyRequest } from "fastify";
import {
  itemIdParamsSchema,
  itemPersonParamsSchema,
  renamePersonRequestSchema,
  type ItemDetail,
  type PersonTaggingOptionsResponse,
} from "@memory-shoebox/shared";
import { runInImmediateTransaction } from "../../db/runInImmediateTransaction.ts";
import { ApiError } from "../../http/ApiError.ts";
import { requireViewer } from "../../http/requestContextHelpers.ts";
import { getVisibleItemOr404 } from "../../items/getVisibleItemOr404.ts";
import { assertMayEditItemContent } from "../../items/itemPermissionHelpers/itemPermissionHelpers.ts";
import { readItemDetail } from "../../items/readItemDetail/readItemDetail.ts";
import { getPersonActionContextFromIds } from "../../people/getPersonActionContextFromIds.ts";
import { readPersonTaggingOptions } from "../../people/readPersonTaggingOptions.ts";

/** Suggestions and permitted global actions for an editable, visible item. */
export async function getItemPeopleOptions(
  request: FastifyRequest,
): Promise<PersonTaggingOptionsResponse> {
  const viewer = requireViewer(request);
  const { itemId } = itemIdParamsSchema.parse(request.params);
  const database = request.server.database;
  await getVisibleItemOr404({ database, viewer, itemId });
  assertMayEditItemContent({ viewer, code: "item_edit_forbidden" });
  return readPersonTaggingOptions({ database, viewer, itemId });
}

/** Corrects an ad-hoc name globally while preserving person identity. */
export async function patchItemPerson(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const params = itemPersonParamsSchema.parse(request.params);
  const body = renamePersonRequestSchema.parse(request.body);
  const now = request.server.clock();
  const context = await runInImmediateTransaction({
    database: request.server.database,
    callback: async (database) => {
      const current = await getPersonActionContextFromIds({
        database,
        viewer,
        ...params,
        now: now.toISOString(),
      });
      if (
        !current.viewer.isAdmin &&
        current.person.created_by !== current.viewer.memberId
      ) {
        throw ApiError.forbidden("person_rename_forbidden");
      }
      await database
        .updateTable("people")
        .set({ display_name: body.displayName })
        .where("id", "=", params.personId)
        .execute();
      return current;
    },
  });
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer: context.viewer,
    item: context.item,
    now,
  });
}

/** Removes an unused identity and its current-item tag atomically. */
export async function deleteItemPerson(
  request: FastifyRequest,
): Promise<ItemDetail> {
  const viewer = requireViewer(request);
  const params = itemPersonParamsSchema.parse(request.params);
  const now = request.server.clock();
  const context = await runInImmediateTransaction({
    database: request.server.database,
    callback: async (database) => {
      const current = await getPersonActionContextFromIds({
        database,
        viewer,
        ...params,
        now: now.toISOString(),
      });
      await _deleteUnusedPerson({
        database,
        ...params,
        displayName: current.person.display_name,
        now: now.toISOString(),
      });
      return current;
    },
  });
  return readItemDetail({
    database: request.server.database,
    b2: request.server.b2,
    viewer: context.viewer,
    item: context.item,
    now,
  });
}

type DeleteUnusedPersonOptions = {
  database: DatabaseExecutor;
  personId: string;
  itemId: string;
  displayName: string;
  now: string;
};

async function _deleteUnusedPerson(
  options: Readonly<DeleteUnusedPersonOptions>,
): Promise<void> {
  const { database } = options;
  const otherTag = await database
    .selectFrom("item_people")
    .select("id")
    .where("person_id", "=", options.personId)
    .where("item_id", "!=", options.itemId)
    .executeTakeFirst();
  if (otherTag !== undefined) {
    throw ApiError.conflict({ code: "person_used_elsewhere" });
  }
  await database
    .deleteFrom("item_people")
    .where("person_id", "=", options.personId)
    .where("item_id", "=", options.itemId)
    .execute();
  await database
    .updateTable("upload_batch_edits")
    .set((eb) => {
      return {
        person_id: null,
        label_snapshot: eb.fn.coalesce(
          "label_snapshot",
          eb.val(options.displayName),
        ),
        undone_at: eb.fn.coalesce("undone_at", eb.val(options.now)),
      };
    })
    .where("person_id", "=", options.personId)
    .execute();
  await database
    .deleteFrom("people")
    .where("id", "=", options.personId)
    .execute();
}
