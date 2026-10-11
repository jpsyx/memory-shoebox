import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import {
  insertBurst,
  insertItem,
  insertMember,
  insertRendition,
  insertRemovalRequest,
  insertInstanceSetting,
  insertUploadSession,
  setBurstCover,
  insertComment,
} from "../../helpers/seedHelpers/seedHelpers.ts";
import { makeBulkTestContext } from "./bulkItems.helpers.ts";

async function _makeDeletionContext(): Promise<
  Awaited<ReturnType<typeof makeBulkTestContext>> & { burstId: string }
> {
  const context = await makeBulkTestContext();
  const { database, memberId, itemIds } = context;
  const uploadSessionId = await insertUploadSession(database, {
    uploadedBy: memberId,
  });
  const burstId = await insertBurst(database, {
    uploadSessionId,
    capturedOn: "2026-09-27",
  });
  await database.updateTable("items").set({ burst_id: burstId }).execute();
  await setBurstCover(database, { burstId, coverItemId: itemIds[0]! });
  await Promise.all(
    itemIds.map((itemId) => {
      return insertRendition(database, { itemId });
    }),
  );
  await insertComment(database, {
    itemId: itemIds[0]!,
    authorMemberId: memberId,
  });
  await insertInstanceSetting(database, {
    key: "public.base_url",
    value: "https://family.example",
  });
  await insertRemovalRequest(database, {
    requestedByMemberId: await insertMember(database),
    itemUploaderMemberId: memberId,
    item_id: itemIds[1]!,
    state: "open",
    resolved_at: null,
    resolved_by_member_id: null,
    decline_reason: null,
  });
  return { ...context, burstId };
}

describe("POST /api/items/bulk-edit deletion", () => {
  it("queues objects, settles removal requests, audits each item and drops an emptied burst", async () => {
    const { database, post, itemIds, b2 } = await _makeDeletionContext();
    expect((await post({ action: "delete", itemIds })).statusCode).toBe(204);
    expect(await database.selectFrom("items").selectAll().execute()).toEqual(
      [],
    );
    expect(await database.selectFrom("bursts").selectAll().execute()).toEqual(
      [],
    );
    expect(await database.selectFrom("comments").selectAll().execute()).toEqual(
      [],
    );
    expect(
      await database.selectFrom("item_renditions").selectAll().execute(),
    ).toEqual([]);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toHaveLength(2);
    expect(
      await database
        .selectFrom("activity_events")
        .selectAll()
        .where("kind", "=", "item_deleted")
        .execute(),
    ).toHaveLength(2);
    expect(
      await database
        .selectFrom("removal_requests")
        .select(["state", "item_id"])
        .execute(),
    ).toEqual([{ state: "deleted", item_id: null }]);
    expect(
      await database
        .selectFrom("outbound_emails")
        .selectAll()
        .where("kind", "=", "removal_resolved")
        .execute(),
    ).not.toHaveLength(0);
    expect(b2.calls).toEqual([]);
  });

  it("preserves surviving burst frames and clears a deleted cover", async () => {
    const { database, post, itemIds, memberId, burstId } =
      await _makeDeletionContext();
    const survivorId = await insertItem(database, {
      uploadedBy: memberId,
      burst_id: burstId,
      seq: 2,
    });
    expect((await post({ action: "delete", itemIds })).statusCode).toBe(204);
    expect(await database.selectFrom("items").select("id").execute()).toEqual([
      { id: survivorId },
    ]);
    expect(
      await database.selectFrom("bursts").select("cover_item_id").execute(),
    ).toEqual([{ cover_item_id: null }]);
  });

  it("rolls back earlier deletion and cleanup when a later item's mail enqueue fails", async () => {
    const { database, post, itemIds } = await _makeDeletionContext();
    await sql`CREATE TRIGGER tr__outbound_emails__bulk_failure BEFORE INSERT ON outbound_emails BEGIN SELECT RAISE(ABORT, 'bulk outbound failure'); END`.execute(
      database,
    );
    expect((await post({ action: "delete", itemIds })).statusCode).toBe(500);
    expect(
      await database.selectFrom("items").selectAll().execute(),
    ).toHaveLength(2);
    expect(
      await database.selectFrom("item_renditions").selectAll().execute(),
    ).toHaveLength(2);
    expect(
      await database.selectFrom("bursts").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await database
        .selectFrom("pending_object_deletions")
        .selectAll()
        .execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("activity_events").selectAll().execute(),
    ).toEqual([]);
    expect(
      await database.selectFrom("removal_requests").select("state").execute(),
    ).toEqual([{ state: "open" }]);
  });
});
