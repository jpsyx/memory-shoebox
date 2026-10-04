import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import {
  insertMember,
  insertRendition,
} from "../../../helpers/seedHelpers/seedHelpers.ts";
import {
  createDeletionContext,
  requestRemoval,
} from "./deleteResolutionTestHelpers.ts";

async function _assertDeletionRollback(
  options: Readonly<{
    context: Awaited<ReturnType<typeof createDeletionContext>>;
    database: Awaited<ReturnType<typeof createDeletionContext>>["database"];
    requestsBefore: ReadonlyArray<
      import("../../../../src/removals/makeRemovalRequestDtosFromRows.ts").RemovalRequestRow
    >;
  }>,
): Promise<void> {
  const { context, database, requestsBefore } = options;
  expect(
    await database.selectFrom("removal_requests").selectAll().execute(),
  ).toEqual(requestsBefore);
  expect(await database.selectFrom("items").selectAll().execute()).toHaveLength(
    1,
  );
  expect(
    await database.selectFrom("item_renditions").selectAll().execute(),
  ).toHaveLength(2);
  expect(
    await database.selectFrom("pending_object_deletions").selectAll().execute(),
  ).toEqual([]);
  expect(
    await database.selectFrom("activity_events").selectAll().execute(),
  ).toEqual([]);
  expect(
    await database.selectFrom("outbound_emails").selectAll().execute(),
  ).toEqual([]);
  expect(context.b2.calls).toEqual([]);
}

async function _assertRollsBackALateOutboundFailureSettlementItem4(): Promise<void> {
  const context = await createDeletionContext();
  const { database, itemId, actor, close } = context;
  try {
    await requestRemoval({
      context,
      requesterId: await insertMember(database),
    });
    await requestRemoval({
      context,
      requesterId: await insertMember(database),
    });
    await insertRendition(database, { itemId, purpose: "original" });
    await insertRendition(database, { itemId, purpose: "thumb" });
    const requestsBefore = await database
      .selectFrom("removal_requests")
      .selectAll()
      .execute();
    await sql`CREATE TRIGGER tr__outbound_emails__late_failure BEFORE INSERT ON outbound_emails WHEN (SELECT COUNT(*) FROM outbound_emails) = 2 BEGIN SELECT RAISE(ABORT, 'late outbound failure'); END`.execute(
      database,
    );
    const response = await context.app.inject({
      method: "DELETE",
      url: `/api/items/${itemId}`,
      headers: { cookie: actor.cookie },
    });
    expect(response.statusCode).toBe(500);
    await _assertDeletionRollback({ context, database, requestsBefore });
  } finally {
    await close();
  }
}
describe("deletion resolution mail", (): void => {
  it(
    "rolls back a late outbound failure, settlement, item, objects, and activity without B2 I/O",
    _assertRollsBackALateOutboundFailureSettlementItem4,
  );
});
