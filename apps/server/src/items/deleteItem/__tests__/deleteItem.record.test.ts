import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../db/client.ts";
import { migrateToLatest } from "../../../db/migrate.ts";
import {
  NOW,
  insertItem,
  insertMember,
  insertRemovalRequest,
} from "../../../../test/helpers/seedHelpers/seedHelpers.ts";
import { runDelete } from "../../../../test/helpers/runDelete.ts";

describe("what deleteItem leaves behind", () => {
  it("closes every open removal request on the item, not only one", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const uploaderId = await insertMember(database);
    const inesId = await insertMember(database);
    const mateoId = await insertMember(database);
    const itemId = await insertItem(database, { uploadedBy: uploaderId });
    const openByInes = await insertRemovalRequest(database, {
      requestedByMemberId: inesId,
      itemUploaderMemberId: uploaderId,
      item_id: itemId,
      state: "open",
      decline_reason: null,
      resolved_at: null,
      resolved_by_member_id: null,
    });
    const openByMateo = await insertRemovalRequest(database, {
      requestedByMemberId: mateoId,
      itemUploaderMemberId: uploaderId,
      item_id: itemId,
      state: "open",
      decline_reason: null,
      resolved_at: null,
      resolved_by_member_id: null,
    });
    // Already settled, and this delete does not re-answer it.
    const alreadyDeclined = await insertRemovalRequest(database, {
      requestedByMemberId: inesId,
      itemUploaderMemberId: uploaderId,
      item_id: itemId,
    });

    const settledBefore = await database
      .selectFrom("removal_requests")
      .selectAll()
      .where("id", "=", alreadyDeclined)
      .executeTakeFirstOrThrow();
    await runDelete({ database, memberId: uploaderId, itemId });

    const rows = await database
      .selectFrom("removal_requests")
      .selectAll()
      .execute();
    const byId = new Map(
      rows.map((row) => {
        return [row.id, row];
      }),
    );

    // Two cousins asked, and one delete answered both.
    [openByInes, openByMateo].forEach((requestId) => {
      expect(byId.get(requestId)).toMatchObject({
        state: "deleted",
        resolved_at: NOW,
        resolved_by_member_id: uploaderId,
        // Nulled by the cascade afterwards, so the takedown history survives
        // the takedown.
        item_id: null,
      });
    });
    expect(byId.get(alreadyDeclined)).toEqual({
      ...settledBefore,
      item_id: null,
    });
    const emails = await database
      .selectFrom("outbound_emails")
      .selectAll()
      .execute();
    expect(
      new Set(
        emails.map((email) => {
          return email.to_member_id;
        }),
      ),
    ).toEqual(new Set([inesId, mateoId]));
    expect(emails).toHaveLength(2);
    await database.destroy();
  });

  it("writes the one audit row that is the only record the item existed", async () => {
    const database = createDatabase(":memory:");
    await migrateToLatest(database);
    const memberId = await insertMember(database);
    const itemId = await insertItem(database, {
      uploadedBy: memberId,
      kind: "video",
      duration_ms: 4200,
      captured_on: "2026-09-14",
    });

    await runDelete({ database, memberId, itemId });

    const event = await database
      .selectFrom("activity_events")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      kind: "item_deleted",
      subject_kind: "item",
      // A dangling id by design: nothing else names the photograph now.
      subject_id: itemId,
      subject_label: "A video from 2026-09-14",
      occurred_at: NOW,
      actor_member_id: memberId,
    });
    await database.destroy();
  });
});
