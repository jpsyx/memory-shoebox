import { expressionBuilder } from "kysely";
import type { PersonTaggingOptionsResponse } from "@memory-shoebox/shared";
import type { Database, DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";
import { visibilityExpression } from "../visibility/applyVisibilityFilter.ts";

type PersonTaggingQuery = {
  database: DatabaseExecutor;
  viewer: Viewer;
  itemId: string;
};

async function _readPersonTaggingRows(options: Readonly<PersonTaggingQuery>) {
  return options.database
    .selectFrom("people")
    .leftJoin("item_people", "item_people.person_id", "people.id")
    .leftJoin("items", (join) => {
      return join.onRef("items.id", "=", "item_people.item_id").on(
        visibilityExpression({
          eb: expressionBuilder<Database, "items">(),
          viewer: options.viewer,
        }),
      );
    })
    .select((eb) => {
      return [
        "people.id as personId",
        "people.display_name as displayName",
        "people.member_id as memberId",
        "people.created_by as createdBy",
        eb.fn.count<number>("items.id").as("itemCount"),
        eb
          .exists(
            eb
              .selectFrom("item_people as other_tags")
              .select("other_tags.id")
              .whereRef("other_tags.person_id", "=", "people.id")
              .where("other_tags.item_id", "!=", options.itemId),
          )
          .as("hasOtherItems"),
      ];
    })
    .groupBy([
      "people.id",
      "people.display_name",
      "people.member_id",
      "people.created_by",
    ])
    .orderBy("itemCount", "desc")
    .orderBy("people.display_name")
    .execute();
}

/** Visible usage and action eligibility, without exposing account links. */
export async function readPersonTaggingOptions(
  options: Readonly<PersonTaggingQuery>,
): Promise<PersonTaggingOptionsResponse> {
  const rows = await _readPersonTaggingRows(options);
  return {
    people: rows.map((row) => {
      return {
        person: { personId: row.personId, displayName: row.displayName },
        itemCount: Number(row.itemCount),
        canRename:
          row.memberId === null &&
          (options.viewer.isAdmin || row.createdBy === options.viewer.memberId),
        canDelete: row.memberId === null && !row.hasOtherItems,
      };
    }),
  };
}
