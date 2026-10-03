import { sql } from "kysely";
import type { DatabaseExecutor } from "../db/types/db.types.ts";
import type { Viewer } from "../http/requestContextHelpers.ts";

/** The linked tag and outstanding request facts for a visible item. */
export type RemovalGate = {
  isPeopleTagged: boolean;
  hasOpenRemovalRequest: boolean;
};

/**
 * Reads the request gate after the caller has checked item visibility.
 * Tags never grant visibility.
 * @param options The visible item and authenticated viewer.
 */
export async function readRemovalGate(
  options: Readonly<{
    database: DatabaseExecutor;
    viewer: Viewer;
    itemId: string;
  }>,
): Promise<RemovalGate> {
  const row = await options.database
    .selectNoFrom((eb) => {
      return [
        eb
          .exists(
            eb
              .selectFrom("item_people")
              .innerJoin("people", "people.id", "item_people.person_id")
              .select(sql<number>`1`.as("one"))
              .where("item_people.item_id", "=", options.itemId)
              .where("people.member_id", "=", options.viewer.memberId),
          )
          .as("isPeopleTagged"),
        eb
          .exists(
            eb
              .selectFrom("removal_requests")
              .select(sql<number>`1`.as("one"))
              .where("removal_requests.item_id", "=", options.itemId)
              .where(
                "removal_requests.requested_by_member_id",
                "=",
                options.viewer.memberId,
              )
              .where("removal_requests.state", "=", "open"),
          )
          .as("hasOpenRemovalRequest"),
      ];
    })
    .executeTakeFirstOrThrow();

  return {
    isPeopleTagged: Boolean(row.isPeopleTagged),
    hasOpenRemovalRequest: Boolean(row.hasOpenRemovalRequest),
  };
}
